import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc"; // 1. Use protectedProcedure
import { agendaItems, agendaOccurrences, groupMembers } from "~/server/db/schema";
import { eq, and, asc, desc, gte, inArray, like, lt, or, sql } from "drizzle-orm";
import { getOccurrenceDates } from "~/server/agenda/schedule";
import {
  assertGroupInHousehold,
  assertGroupMembership,
  ensureActiveHouseholdForUser,
} from "~/server/finance/household-context";

const encryptedPayloadSchema = z.object({
  version: z.literal(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
  encryptedKeys: z.record(z.string(), z.string().min(1)),
});

const scheduleSchema = z.object({
  scheduleMode: z.enum(["legacy", "fixedTimes", "interval"]).default("legacy"),
  scheduleTimes: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(12).default([]),
  intervalMinutes: z.number().int().min(15).max(24 * 60).optional(),
  durationMode: z.enum(["ongoing", "days", "untilDate"]).default("ongoing"),
  durationDays: z.number().int().min(1).max(3650).optional(),
  endDate: z.date().optional(),
});

function validateSchedule(input: z.infer<typeof scheduleSchema>, type: string, startTime?: Date) {
  if (type !== "reminder") return;
  if (input.scheduleMode === "fixedTimes" && input.scheduleTimes.length === 0) {
    throw new Error("Fixed-time reminders need at least one time of day.");
  }
  if (input.scheduleMode === "interval" && !input.intervalMinutes) {
    throw new Error("Interval reminders need an interval between 15 minutes and 24 hours.");
  }
  if (input.durationMode === "days" && !input.durationDays) {
    throw new Error("Choose how many days the reminder should continue.");
  }
  if (input.durationMode === "untilDate" && (!input.endDate || (startTime && input.endDate < startTime))) {
    throw new Error("The reminder end date must be after its start time.");
  }
}

function assertPayloadRecipients(
  encryptedKeys: Record<string, string>,
  expectedUserIds: string[],
) {
  const actual = Object.keys(encryptedKeys).sort();
  const expected = Array.from(new Set(expectedUserIds)).sort();
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error("The encrypted payload recipients do not match the selected sharing settings.");
  }
}

export const agendaRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ 
      id: z.string().uuid(),
      encryptedPayload: encryptedPayloadSchema,
      type: z.string(),
      category: z.string().optional(),
      repeatInterval: z.string().optional(),
      startTime: z.date().optional(),
      pinned: z.boolean().optional(),
      sticky: z.boolean().optional(),
      ...scheduleSchema.shape,
      groupId: z.string().uuid().optional(),
      visibility: z.enum(["personal", "group", "participants"]).default("personal"),
      participantUserIds: z.array(z.string()).default([])
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.type !== "note" && !input.startTime) {
        throw new Error("Tasks and reminders require a target date/time.");
      }
      validateSchedule(input, input.type, input.startTime);

      const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
      if (input.groupId) {
        await assertGroupInHousehold(input.groupId, householdId);
        await assertGroupMembership(ctx.session.user.id, input.groupId);
        for (const participantUserId of input.participantUserIds) {
          await assertGroupMembership(participantUserId, input.groupId);
        }
      }

      const groupRecipientIds = input.groupId
        ? (await ctx.db
            .select({ userId: groupMembers.userId })
            .from(groupMembers)
            .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active"))))
            .map((member) => member.userId)
        : [];
      const expectedRecipientIds = !input.groupId || input.visibility === "personal"
        ? [ctx.session.user.id]
        : input.visibility === "participants"
          ? [...input.participantUserIds, ctx.session.user.id]
          : [...groupRecipientIds, ctx.session.user.id];
      assertPayloadRecipients(input.encryptedPayload.encryptedKeys, expectedRecipientIds);

      return await ctx.db.insert(agendaItems).values({
        id: input.id,
        title: null,
        encryptedPayload: JSON.stringify(input.encryptedPayload),
        content: null,
        type: input.type,
        category: input.category ?? "Other",
        targetDate: input.type === "note" ? new Date() : input.startTime!,
        repeatInterval: input.repeatInterval ?? "none",
        pinned: input.pinned ?? false,
        sticky: input.sticky ?? false,
        scheduleMode: input.type === "reminder" ? input.scheduleMode : "legacy",
        scheduleTimes: input.type === "reminder" ? input.scheduleTimes.join(",") : "",
        intervalMinutes: input.type === "reminder" ? input.intervalMinutes ?? null : null,
        durationMode: input.type === "reminder" ? input.durationMode : "ongoing",
        durationDays: input.type === "reminder" ? input.durationDays ?? null : null,
        endDate: input.type === "reminder" ? input.endDate ?? null : null,
        groupId: input.groupId ?? null,
        visibility: input.groupId ? input.visibility : "personal",
        participantUserIds: `,${Array.from(new Set(input.participantUserIds)).join(",")},`,
        userId: ctx.session.user.id, // 3. Use actual user ID
      });
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
    const memberships = await ctx.db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, ctx.session.user.id), eq(groupMembers.status, "active")));
    const groupIds = memberships.map((membership) => membership.groupId);

    return await ctx.db
      .select()
      .from(agendaItems)
      .where(
        and(
          or(
            and(
              eq(agendaItems.userId, ctx.session.user.id),
              eq(agendaItems.visibility, "personal"),
            ),
            and(
              eq(agendaItems.visibility, "group"),
              groupIds.length > 0 ? inArray(agendaItems.groupId, groupIds) : sql`false`,
            ),
            and(
              eq(agendaItems.visibility, "participants"),
              or(
                eq(agendaItems.userId, ctx.session.user.id),
                like(agendaItems.participantUserIds, `%,${ctx.session.user.id},%`),
              ),
            ),
          ),
        ),
      )
      .orderBy(desc(agendaItems.createdAt));
  }),

  getOccurrences: protectedProcedure
    .input(z.object({ itemIds: z.array(z.string().uuid()).max(100) }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db
        .select({
          id: agendaItems.id,
          type: agendaItems.type,
          isCompleted: agendaItems.isCompleted,
          targetDate: agendaItems.targetDate,
          repeatInterval: agendaItems.repeatInterval,
          scheduleMode: agendaItems.scheduleMode,
          scheduleTimes: agendaItems.scheduleTimes,
          intervalMinutes: agendaItems.intervalMinutes,
          durationMode: agendaItems.durationMode,
          durationDays: agendaItems.durationDays,
          endDate: agendaItems.endDate,
        })
        .from(agendaItems)
        .where(and(eq(agendaItems.userId, ctx.session.user.id), inArray(agendaItems.id, input.itemIds)));
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 14);

      const occurrenceRows = items.flatMap((item) =>
        getOccurrenceDates(item, from, to).map((scheduledAt) => ({
          agendaItemId: item.id,
          scheduledAt,
        })),
      );
      for (let offset = 0; offset < occurrenceRows.length; offset += 500) {
        const batch = occurrenceRows.slice(offset, offset + 500);
        await ctx.db
          .insert(agendaOccurrences)
          .values(batch)
          .onConflictDoNothing();
      }

      return ctx.db
        .select()
        .from(agendaOccurrences)
        .where(and(
          inArray(agendaOccurrences.agendaItemId, items.map((item) => item.id)),
          gte(agendaOccurrences.scheduledAt, from),
          lt(agendaOccurrences.scheduledAt, to),
        ))
        .orderBy(asc(agendaOccurrences.scheduledAt));
    }),

  toggleOccurrence: protectedProcedure
    .input(z.object({ id: z.string().uuid(), isCompleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const occurrence = await ctx.db
        .select({ occurrenceId: agendaOccurrences.id })
        .from(agendaOccurrences)
        .innerJoin(agendaItems, eq(agendaItems.id, agendaOccurrences.agendaItemId))
        .where(and(eq(agendaOccurrences.id, input.id), eq(agendaItems.userId, ctx.session.user.id)))
        .limit(1);
      if (!occurrence[0]) throw new Error("Occurrence not found.");

      return ctx.db
        .update(agendaOccurrences)
        .set({ isCompleted: input.isCompleted, completedAt: input.isCompleted ? new Date() : null })
        .where(eq(agendaOccurrences.id, input.id));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // 5. Check userId for security so people can't delete other users' items
      return await ctx.db
        .delete(agendaItems)
        .where(
          and(
            eq(agendaItems.id, input.id),
            eq(agendaItems.userId, ctx.session.user.id)
          )
        );
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db
        .delete(agendaItems)
        .where(
          and(
            eq(agendaItems.userId, ctx.session.user.id),
            inArray(agendaItems.id, input.ids)
          )
        );
    }),

  toggleComplete: protectedProcedure
    .input(z.object({ id: z.string(), isCompleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db
        .update(agendaItems)
        .set({ isCompleted: input.isCompleted })
        .where(
          and(
            eq(agendaItems.id, input.id),
            eq(agendaItems.userId, ctx.session.user.id)
          )
        );
    }),

  bulkSetComplete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1), isCompleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db
        .update(agendaItems)
        .set({ isCompleted: input.isCompleted })
        .where(
          and(
            eq(agendaItems.userId, ctx.session.user.id),
            inArray(agendaItems.id, input.ids)
          )
        );
    }),

  bulkSetSticky: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1), sticky: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db
        .update(agendaItems)
        .set({ sticky: input.sticky })
        .where(
          and(
            eq(agendaItems.userId, ctx.session.user.id),
            inArray(agendaItems.id, input.ids)
          )
        );
    }),

  bulkSetCategory: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1), category: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db
        .update(agendaItems)
        .set({ category: input.category })
        .where(
          and(
            eq(agendaItems.userId, ctx.session.user.id),
            inArray(agendaItems.id, input.ids)
          )
        );
    }),

  update: protectedProcedure
    .input(z.object({ 
      id: z.string(),
      encryptedPayload: encryptedPayloadSchema,
      type: z.string(),
      category: z.string().optional(),
      repeatInterval: z.string().optional(),
      startTime: z.date().optional(),
      pinned: z.boolean().optional(),
      sticky: z.boolean().optional(),
      isCompleted: z.boolean().optional(),
      ...scheduleSchema.shape
      ,groupId: z.string().uuid().optional(),
      visibility: z.enum(["personal", "group", "participants"]).default("personal"),
      participantUserIds: z.array(z.string()).default([])
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.type !== "note" && !input.startTime) {
        throw new Error("Tasks and reminders require a target date/time.");
      }
      validateSchedule(input, input.type, input.startTime);

      const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
      if (input.groupId) {
        await assertGroupInHousehold(input.groupId, householdId);
        await assertGroupMembership(ctx.session.user.id, input.groupId);
        for (const participantUserId of input.participantUserIds) {
          await assertGroupMembership(participantUserId, input.groupId);
        }
      }

      const groupRecipientIds = input.groupId
        ? (await ctx.db
            .select({ userId: groupMembers.userId })
            .from(groupMembers)
            .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active"))))
            .map((member) => member.userId)
        : [];
      const expectedRecipientIds = !input.groupId || input.visibility === "personal"
        ? [ctx.session.user.id]
        : input.visibility === "participants"
          ? [...input.participantUserIds, ctx.session.user.id]
          : [...groupRecipientIds, ctx.session.user.id];
      assertPayloadRecipients(input.encryptedPayload.encryptedKeys, expectedRecipientIds);

      return await ctx.db
        .update(agendaItems)
        .set({
          title: null,
          encryptedPayload: JSON.stringify(input.encryptedPayload),
          content: null,
          type: input.type,
          category: input.category ?? "Other",
          targetDate: input.type === "note" ? new Date() : input.startTime!,
          repeatInterval: input.repeatInterval ?? "none",
          pinned: input.pinned ?? false,
          sticky: input.sticky ?? false,
          scheduleMode: input.type === "reminder" ? input.scheduleMode : "legacy",
          scheduleTimes: input.type === "reminder" ? input.scheduleTimes.join(",") : "",
          intervalMinutes: input.type === "reminder" ? input.intervalMinutes ?? null : null,
          durationMode: input.type === "reminder" ? input.durationMode : "ongoing",
          durationDays: input.type === "reminder" ? input.durationDays ?? null : null,
          endDate: input.type === "reminder" ? input.endDate ?? null : null,
          isCompleted: input.isCompleted ?? false,
          groupId: input.groupId ?? null,
          visibility: input.groupId ? input.visibility : "personal",
          participantUserIds: `,${Array.from(new Set(input.participantUserIds)).join(",")},`,
        })
        .where(
          and(
            eq(agendaItems.id, input.id),
            eq(agendaItems.userId, ctx.session.user.id)
          )
        );
    }),
});


// import { z } from "zod";
// import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
// import { agendaItems } from "~/server/db/schema";
// import { eq } from "drizzle-orm"; // Needed for .where()

// export const agendaRouter = createTRPCRouter({
//   create: publicProcedure
//     .input(z.object({ 
//       title: z.string(), 
//       content: z.string().optional(),
//       type: z.string(),
//       repeatInterval: z.string().optional(),
//       startTime: z.date() 
//     }))
//     .mutation(async ({ ctx, input }) => {
//       return await ctx.db.insert(agendaItems).values({
//         title: input.title,
//         content: input.content,
//         type: input.type,
//         targetDate: input.startTime,
//         repeatInterval: input.repeatInterval ?? "none",
//         userId: "local-user", 
//       });
//     }),

//   getAll: publicProcedure.query(async ({ ctx }) => {
//     // Select all items for the user
//     return await ctx.db.select().from(agendaItems);
//   }),

//   delete: publicProcedure
//     .input(z.object({ id: z.string() })) // UUID is a string in TypeScript
//     .mutation(async ({ ctx, input }) => {
//       return await ctx.db.delete(agendaItems).where(eq(agendaItems.id, input.id));
//     }),

//   toggleComplete: publicProcedure
//     .input(z.object({ id: z.string(), isCompleted: z.boolean() }))
//     .mutation(async ({ ctx, input }) => {
//       return await ctx.db
//         .update(agendaItems)
//         .set({ isCompleted: input.isCompleted })
//         .where(eq(agendaItems.id, input.id));
//     }),
// });