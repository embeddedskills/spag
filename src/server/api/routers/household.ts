import { randomUUID } from "crypto";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  assertHouseholdMembership,
  ensureActiveHouseholdForUser,
  getInviteByToken,
} from "~/server/finance/household-context";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  expenses,
  householdInvites,
  householdMembers,
  households,
  settlements,
  user,
} from "~/server/db/schema";

const createInviteToken = () => randomUUID();

export const householdRouter = createTRPCRouter({
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const householdsForUser = await ctx.db
      .select({
        householdId: households.id,
        householdName: households.name,
        role: householdMembers.role,
        createdAt: households.createdAt,
      })
      .from(householdMembers)
      .innerJoin(households, eq(households.id, householdMembers.householdId))
      .where(eq(householdMembers.userId, userId));

    return householdsForUser;
  }),

  getActive: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const activeHouseholdId = await ensureActiveHouseholdForUser(userId);

    const [active] = await ctx.db
      .select({ id: households.id, name: households.name })
      .from(households)
      .where(eq(households.id, activeHouseholdId))
      .limit(1);

    return active;
  }),

  getMembers: protectedProcedure
    .input(
      z
        .object({
          householdId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = input?.householdId ?? (await ensureActiveHouseholdForUser(userId));

      await assertHouseholdMembership(userId, householdId);

      return ctx.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          role: householdMembers.role,
        })
        .from(householdMembers)
        .innerJoin(user, eq(user.id, householdMembers.userId))
        .where(eq(householdMembers.householdId, householdId))
        .orderBy(user.name);
    }),

  getBalances: protectedProcedure
    .input(
      z
        .object({
          householdId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = input?.householdId ?? (await ensureActiveHouseholdForUser(userId));

      await assertHouseholdMembership(userId, householdId);

      const rows = await ctx.db
        .select({
          paidByUserId: expenses.paidByUserId,
          splitWithUserIds: expenses.splitWithUserIds,
          amount: expenses.amount,
        })
        .from(expenses)
        .where(eq(expenses.householdId, householdId));

      const settlementRows = await ctx.db
        .select({
          fromUserId: settlements.fromUserId,
          toUserId: settlements.toUserId,
          amount: settlements.amount,
        })
        .from(settlements)
        .where(eq(settlements.householdId, householdId));

      const balances = new Map<string, number>();
      const userSet = new Set<string>();

      for (const row of rows) {
        const payerId = row.paidByUserId ?? userId;
        const splitUserIds = row.splitWithUserIds
          ? row.splitWithUserIds.split(",").filter(Boolean)
          : [];

        userSet.add(payerId);
        for (const splitUserId of splitUserIds) {
          userSet.add(splitUserId);
        }

        const total = Number(row.amount ?? 0);
        const members = splitUserIds.length > 0 ? splitUserIds.length + 1 : 1;
        const share = total / members;

        balances.set(payerId, (balances.get(payerId) ?? 0) + total - share);

        for (const splitUserId of splitUserIds) {
          balances.set(splitUserId, (balances.get(splitUserId) ?? 0) - share);
        }
      }

      for (const settlement of settlementRows) {
        const amount = Number(settlement.amount ?? 0);
        balances.set(
          settlement.fromUserId,
          (balances.get(settlement.fromUserId) ?? 0) + amount,
        );
        balances.set(
          settlement.toUserId,
          (balances.get(settlement.toUserId) ?? 0) - amount,
        );
        userSet.add(settlement.fromUserId);
        userSet.add(settlement.toUserId);
      }

      return Array.from(userSet)
        .map((memberId) => ({
          userId: memberId,
          balance: Number((balances.get(memberId) ?? 0).toFixed(2)),
        }))
        .filter((entry) => Math.abs(entry.balance) > 0.01)
        .sort((left, right) => right.balance - left.balance);
    }),

  settle: protectedProcedure
    .input(
      z.object({
        fromUserId: z.string().min(1),
        toUserId: z.string().min(1),
        amount: z.number().positive().finite(),
        householdId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromUserId === input.toUserId) {
        throw new Error("A settlement needs two different household members.");
      }

      const userId = ctx.session.user.id;
      const householdId = input.householdId ?? (await ensureActiveHouseholdForUser(userId));

      await assertHouseholdMembership(userId, householdId);
      await assertHouseholdMembership(input.fromUserId, householdId);
      await assertHouseholdMembership(input.toUserId, householdId);

      const [created] = await ctx.db
        .insert(settlements)
        .values({
          householdId,
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          amount: input.amount.toFixed(2),
          createdByUserId: userId,
        })
        .returning({ id: settlements.id });

      return created;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(64),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [created] = await ctx.db
        .insert(households)
        .values({
          name: input.name,
          createdByUserId: userId,
        })
        .returning({ id: households.id, name: households.name });

      if (!created) {
        throw new Error("Unable to create household.");
      }

      await ctx.db.insert(householdMembers).values({
        householdId: created.id,
        userId,
        role: "owner",
      });

      await ctx.db
        .update(user)
        .set({ activeHouseholdId: created.id })
        .where(eq(user.id, userId));

      return created;
    }),

  setActive: protectedProcedure
    .input(z.object({ householdId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertHouseholdMembership(ctx.session.user.id, input.householdId);

      await ctx.db
        .update(user)
        .set({ activeHouseholdId: input.householdId })
        .where(eq(user.id, ctx.session.user.id));

      return { ok: true };
    }),

  createInvite: protectedProcedure
    .input(
      z.object({
        householdId: z.string().uuid(),
        email: z.string().email(),
        expiresInDays: z.number().min(1).max(30).default(7),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertHouseholdMembership(ctx.session.user.id, input.householdId);

      const token = createInviteToken();
      const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

      const [invite] = await ctx.db
        .insert(householdInvites)
        .values({
          householdId: input.householdId,
          invitedEmail: input.email.toLowerCase(),
          invitedByUserId: ctx.session.user.id,
          token,
          expiresAt,
        })
        .returning({
          token: householdInvites.token,
          expiresAt: householdInvites.expiresAt,
          householdId: householdInvites.householdId,
        });

      return invite;
    }),

  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await getInviteByToken(input.token);
      if (!invite) {
        throw new Error("Invite is invalid or already used.");
      }

      if (invite.expiresAt.getTime() < Date.now()) {
        throw new Error("Invite has expired.");
      }

      if (invite.invitedEmail.toLowerCase() !== ctx.session.user.email.toLowerCase()) {
        throw new Error("Invite email does not match your account.");
      }

      const [existing] = await ctx.db
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, invite.householdId),
            eq(householdMembers.userId, ctx.session.user.id),
          ),
        )
        .limit(1);

      if (!existing) {
        await ctx.db.insert(householdMembers).values({
          householdId: invite.householdId,
          userId: ctx.session.user.id,
          role: "member",
        });
      }

      await ctx.db
        .update(householdInvites)
        .set({ acceptedAt: new Date() })
        .where(
          and(
            eq(householdInvites.token, input.token),
            isNull(householdInvites.acceptedAt),
          ),
        );

      await ctx.db
        .update(user)
        .set({ activeHouseholdId: invite.householdId })
        .where(eq(user.id, ctx.session.user.id));

      return { ok: true, householdId: invite.householdId };
    }),
});
