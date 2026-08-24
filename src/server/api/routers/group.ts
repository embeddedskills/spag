import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  assertGroupInHousehold,
  assertGroupMembership,
  ensureActiveHouseholdForUser,
} from "~/server/finance/household-context";
import { db } from "~/server/db";
import {
  groupMemberRequests,
  groupMembers,
  groups,
  householdMembers,
  user,
} from "~/server/db/schema";

const groupCategory = z.enum(["family", "friends", "work", "other"]);

async function assertGroupOwner(userId: string, groupId: string) {
  const [member] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      ),
    )
    .limit(1);

  if (member?.role !== "owner") {
    throw new Error("Only the group owner can approve members.");
  }
}

export const groupRouter = createTRPCRouter({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);

    return ctx.db
      .select({
        id: groups.id,
        name: groups.name,
        category: groups.category,
        role: groupMembers.role,
        memberStatus: groupMembers.status,
        createdAt: groups.createdAt,
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(
        and(
          eq(groupMembers.userId, ctx.session.user.id),
          eq(groups.householdId, householdId),
        ),
      )
      .orderBy(groups.name);
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(64),
        category: groupCategory,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await ensureActiveHouseholdForUser(userId);

      const [created] = await ctx.db
        .insert(groups)
        .values({
          householdId,
          name: input.name,
          category: input.category,
          createdByUserId: userId,
        })
        .returning({ id: groups.id, name: groups.name, category: groups.category });

      if (!created) throw new Error("Unable to create group.");

      await ctx.db.insert(groupMembers).values({
        groupId: created.id,
        userId,
        role: "owner",
        status: "active",
        approvedAt: new Date(),
        approvedByUserId: userId,
      });

      return created;
    }),

  getMembers: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertGroupMembership(ctx.session.user.id, input.groupId);

      return ctx.db
        .select({
          id: user.id,
          name: user.name,
          username: user.username,
          role: groupMembers.role,
          status: groupMembers.status,
        })
        .from(groupMembers)
        .innerJoin(user, eq(user.id, groupMembers.userId))
        .where(eq(groupMembers.groupId, input.groupId))
        .orderBy(user.name);
    }),

  requestMember: protectedProcedure
    .input(
      z.object({
        groupId: z.string().uuid(),
        username: z.string().trim().min(2).max(32),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const requesterId = ctx.session.user.id;
      await assertGroupMembership(requesterId, input.groupId);
      const householdId = await ensureActiveHouseholdForUser(requesterId);
      await assertGroupInHousehold(input.groupId, householdId);

      const [target] = await ctx.db
        .select({ id: user.id })
        .from(user)
        .innerJoin(householdMembers, eq(householdMembers.userId, user.id))
        .where(
          and(
            eq(user.username, input.username),
            eq(householdMembers.householdId, householdId),
          ),
        )
        .limit(1);

      if (!target) throw new Error("No household user found with that username.");
      if (target.id === requesterId) throw new Error("You are already in this group.");

      const [existingMember] = await ctx.db
        .select({ id: groupMembers.id, status: groupMembers.status })
        .from(groupMembers)
        .where(
          and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.userId, target.id)),
        )
        .limit(1);

      if (existingMember?.status === "active") throw new Error("That user is already a group member.");

      const [request] = await ctx.db
        .insert(groupMemberRequests)
        .values({
          groupId: input.groupId,
          requestedByUserId: requesterId,
          targetUserId: target.id,
        })
        .returning({ id: groupMemberRequests.id });

      return request;
    }),

  getRequests: protectedProcedure
    .input(z.object({ groupId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertGroupOwner(ctx.session.user.id, input.groupId);

      return ctx.db
        .select({
          id: groupMemberRequests.id,
          username: user.username,
          name: user.name,
          status: groupMemberRequests.status,
          createdAt: groupMemberRequests.createdAt,
        })
        .from(groupMemberRequests)
        .innerJoin(user, eq(user.id, groupMemberRequests.targetUserId))
        .where(
          and(
            eq(groupMemberRequests.groupId, input.groupId),
            eq(groupMemberRequests.status, "pending"),
          ),
        )
        .orderBy(desc(groupMemberRequests.createdAt));
    }),

  reviewRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        approve: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [request] = await ctx.db
        .select()
        .from(groupMemberRequests)
        .where(eq(groupMemberRequests.id, input.requestId))
        .limit(1);

      if (!request || request.status !== "pending") throw new Error("This request is no longer pending.");
      await assertGroupOwner(ctx.session.user.id, request.groupId);

      await ctx.db
        .update(groupMemberRequests)
        .set({
          status: input.approve ? "approved" : "rejected",
          reviewedAt: new Date(),
          reviewedByUserId: ctx.session.user.id,
        })
        .where(eq(groupMemberRequests.id, input.requestId));

      if (input.approve) {
        await ctx.db
          .insert(groupMembers)
          .values({
            groupId: request.groupId,
            userId: request.targetUserId,
            role: "member",
            status: "active",
            approvedAt: new Date(),
            approvedByUserId: ctx.session.user.id,
          })
          .onConflictDoUpdate({
            target: [groupMembers.groupId, groupMembers.userId],
            set: { status: "active", approvedAt: new Date(), approvedByUserId: ctx.session.user.id },
          });
      }

      return { ok: true };
    }),
});
