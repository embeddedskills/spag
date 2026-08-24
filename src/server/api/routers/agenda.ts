import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc"; // 1. Use protectedProcedure
import { agendaItems, groupMembers } from "~/server/db/schema";
import { eq, and, desc, inArray, like, or, sql } from "drizzle-orm";
import {
  assertGroupInHousehold,
  assertGroupMembership,
  ensureActiveHouseholdForUser,
} from "~/server/finance/household-context";

export const agendaRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ 
      title: z.string(), 
      content: z.string().optional(),
      type: z.string(),
      category: z.string().optional(),
      repeatInterval: z.string().optional(),
      startTime: z.date().optional(),
      pinned: z.boolean().optional(),
      sticky: z.boolean().optional(),
      groupId: z.string().uuid().optional(),
      visibility: z.enum(["personal", "group", "participants"]).default("personal"),
      participantUserIds: z.array(z.string()).default([])
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.type !== "note" && !input.startTime) {
        throw new Error("Tasks and reminders require a target date/time.");
      }

      const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
      if (input.groupId) {
        await assertGroupInHousehold(input.groupId, householdId);
        await assertGroupMembership(ctx.session.user.id, input.groupId);
        for (const participantUserId of input.participantUserIds) {
          await assertGroupMembership(participantUserId, input.groupId);
        }
      }

      return await ctx.db.insert(agendaItems).values({
        title: input.title,
        content: input.content,
        type: input.type,
        category: input.category ?? "Other",
        targetDate: input.type === "note" ? new Date() : input.startTime!,
        repeatInterval: input.repeatInterval ?? "none",
        pinned: input.pinned ?? false,
        sticky: input.sticky ?? false,
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
      title: z.string(), 
      content: z.string().optional(),
      type: z.string(),
      category: z.string().optional(),
      repeatInterval: z.string().optional(),
      startTime: z.date().optional(),
      pinned: z.boolean().optional(),
      sticky: z.boolean().optional(),
      isCompleted: z.boolean().optional()
      ,groupId: z.string().uuid().optional(),
      visibility: z.enum(["personal", "group", "participants"]).default("personal"),
      participantUserIds: z.array(z.string()).default([])
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.type !== "note" && !input.startTime) {
        throw new Error("Tasks and reminders require a target date/time.");
      }

      const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
      if (input.groupId) {
        await assertGroupInHousehold(input.groupId, householdId);
        await assertGroupMembership(ctx.session.user.id, input.groupId);
        for (const participantUserId of input.participantUserIds) {
          await assertGroupMembership(participantUserId, input.groupId);
        }
      }

      return await ctx.db
        .update(agendaItems)
        .set({
          title: input.title,
          content: input.content,
          type: input.type,
          category: input.category ?? "Other",
          targetDate: input.type === "note" ? new Date() : input.startTime!,
          repeatInterval: input.repeatInterval ?? "none",
          pinned: input.pinned ?? false,
          sticky: input.sticky ?? false,
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