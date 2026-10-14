import { randomUUID } from "crypto";

import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";

import {
  assertHouseholdMembership,
  ensureActiveHouseholdForUser,
  getInviteByToken,
} from "~/server/finance/household-context";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  expenses,
  budgets,
  incomeSources,
  groupMembers,
  groups,
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
          userId: expenses.userId,
          paidByUserId: expenses.paidByUserId,
          splitWithUserIds: expenses.splitWithUserIds,
          amount: expenses.amount,
          currency: expenses.currency,
        })
        .from(expenses)
        .where(eq(expenses.householdId, householdId));

      const settlementRows = await ctx.db
        .select({
          fromUserId: settlements.fromUserId,
          toUserId: settlements.toUserId,
          amount: settlements.amount,
          currency: settlements.currency,
        })
        .from(settlements)
        .where(eq(settlements.householdId, householdId));

      const balances = new Map<string, number>();
      const userSet = new Set<string>();
      const balanceKey = (memberId: string, currency: string) =>
        `${currency}\u0000${memberId}`;

      for (const row of rows) {
        const payerId = row.paidByUserId ?? row.userId;
        const splitUserIds = Array.from(
          new Set((row.splitWithUserIds ?? "").split(",").filter(Boolean)),
        ).filter((splitUserId) => splitUserId !== payerId);

        userSet.add(payerId);
        for (const splitUserId of splitUserIds) {
          userSet.add(splitUserId);
        }

        const total = Number(row.amount ?? 0);
        const members = splitUserIds.length > 0 ? splitUserIds.length + 1 : 1;
        const share = total / members;

        const payerKey = balanceKey(payerId, row.currency);
        balances.set(payerKey, (balances.get(payerKey) ?? 0) + total - share);

        for (const splitUserId of splitUserIds) {
          const splitKey = balanceKey(splitUserId, row.currency);
          balances.set(splitKey, (balances.get(splitKey) ?? 0) - share);
        }
      }

      for (const settlement of settlementRows) {
        const amount = Number(settlement.amount ?? 0);
        const fromKey = balanceKey(settlement.fromUserId, settlement.currency);
        const toKey = balanceKey(settlement.toUserId, settlement.currency);
        balances.set(
          fromKey,
          (balances.get(fromKey) ?? 0) + amount,
        );
        balances.set(
          toKey,
          (balances.get(toKey) ?? 0) - amount,
        );
        userSet.add(settlement.fromUserId);
        userSet.add(settlement.toUserId);
      }

      return Array.from(userSet)
        .flatMap((memberId) =>
          (["USD", "EUR", "BTC"] as const).map((currency) => ({
            userId: memberId,
            currency,
            balance: Number(
              (balances.get(balanceKey(memberId, currency)) ?? 0).toFixed(
                currency === "BTC" ? 8 : 2,
              ),
            ),
          })),
        )
        .filter((entry) =>
          Math.abs(entry.balance) > (entry.currency === "BTC" ? 0.00000001 : 0.01),
        )
        .sort(
          (left, right) =>
            left.currency.localeCompare(right.currency) ||
            right.balance - left.balance,
        );
    }),

  settle: protectedProcedure
    .input(
      z.object({
        fromUserId: z.string().min(1),
        toUserId: z.string().min(1),
        amount: z.number().positive().finite(),
        currency: z.enum(["USD", "EUR", "BTC"]).default("USD"),
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
          amount: input.amount.toFixed(input.currency === "BTC" ? 8 : 2),
          currency: input.currency,
          createdByUserId: userId,
        })
        .returning({ id: settlements.id });

      return created;
    }),

  prepareAccountDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    await ctx.db.transaction(async (tx) => {
      const ownedHouseholds = await tx
        .select({ id: households.id })
        .from(households)
        .where(eq(households.createdByUserId, userId));
      const ownerHouseholds = await tx
        .select({ householdId: householdMembers.householdId })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.userId, userId),
            eq(householdMembers.role, "owner"),
          ),
        );
      const householdOwnershipIds = new Set([
        ...ownedHouseholds.map((household) => household.id),
        ...ownerHouseholds.map((membership) => membership.householdId),
      ]);
      const householdMemberships = await tx
        .select({ householdId: householdMembers.householdId })
        .from(householdMembers)
        .where(eq(householdMembers.userId, userId));
      const householdIds = new Set([
        ...householdOwnershipIds,
        ...householdMemberships.map((membership) => membership.householdId),
      ]);
      const householdSuccessors = new Map<string, string>();

      for (const householdId of householdIds) {
        const [successor] = await tx
          .select({ userId: householdMembers.userId })
          .from(householdMembers)
          .where(
            and(
              eq(householdMembers.householdId, householdId),
              ne(householdMembers.userId, userId),
            ),
          )
          .orderBy(asc(householdMembers.createdAt))
          .limit(1);
        if (!successor) continue;
        householdSuccessors.set(householdId, successor.userId);

        if (householdOwnershipIds.has(householdId)) {
          await tx
            .update(households)
            .set({ createdByUserId: successor.userId })
            .where(
              and(
                eq(households.id, householdId),
                eq(households.createdByUserId, userId),
              ),
            );
          await tx
            .update(householdMembers)
            .set({ role: "owner" })
            .where(
              and(
                eq(householdMembers.householdId, householdId),
                eq(householdMembers.userId, successor.userId),
              ),
            );
        }
      }

      const ownedGroups = await tx
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.createdByUserId, userId));
      const ownerGroups = await tx
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.userId, userId),
            eq(groupMembers.role, "owner"),
            eq(groupMembers.status, "active"),
          ),
        );
      const groupOwnershipIds = new Set([
        ...ownedGroups.map((group) => group.id),
        ...ownerGroups.map((membership) => membership.groupId),
      ]);
      const groupMemberships = await tx
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.userId, userId),
            eq(groupMembers.status, "active"),
          ),
        );
      const groupIds = new Set([
        ...groupOwnershipIds,
        ...groupMemberships.map((membership) => membership.groupId),
      ]);
      const groupSuccessors = new Map<string, string>();

      for (const groupId of groupIds) {
        const [successor] = await tx
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, groupId),
              eq(groupMembers.status, "active"),
              ne(groupMembers.userId, userId),
            ),
          )
          .orderBy(asc(groupMembers.createdAt))
          .limit(1);
        if (!successor) continue;
        groupSuccessors.set(groupId, successor.userId);

        if (groupOwnershipIds.has(groupId)) {
          await tx
            .update(groups)
            .set({ createdByUserId: successor.userId })
            .where(
              and(
                eq(groups.id, groupId),
                eq(groups.createdByUserId, userId),
              ),
            );
          await tx
            .update(groupMembers)
            .set({ role: "owner" })
            .where(
              and(
                eq(groupMembers.groupId, groupId),
                eq(groupMembers.userId, successor.userId),
              ),
            );
        }
      }

      const departingExpenses = await tx
        .select({
          id: expenses.id,
          householdId: expenses.householdId,
          groupId: expenses.groupId,
        })
        .from(expenses)
        .where(
          or(
            eq(expenses.userId, userId),
            eq(expenses.createdByUserId, userId),
          ),
        );
      for (const expense of departingExpenses) {
        if (!expense.householdId) continue;
        const successor = expense.groupId
          ? groupSuccessors.get(expense.groupId)
          : householdSuccessors.get(expense.householdId);
        if (!successor) continue;
        await tx
          .update(expenses)
          .set({ userId: successor, createdByUserId: successor })
          .where(eq(expenses.id, expense.id));
      }

      const ownedBudgets = await tx
        .select({ id: budgets.id, householdId: budgets.householdId, groupId: budgets.groupId })
        .from(budgets)
        .where(eq(budgets.ownerUserId, userId));
      for (const budget of ownedBudgets) {
        const successor = budget.groupId
          ? groupSuccessors.get(budget.groupId)
          : householdSuccessors.get(budget.householdId);
        if (successor) {
          await tx
            .update(budgets)
            .set({ ownerUserId: successor })
            .where(eq(budgets.id, budget.id));
        }
      }

      const ownedIncomeSources = await tx
        .select({
          id: incomeSources.id,
          householdId: incomeSources.householdId,
          groupId: incomeSources.groupId,
        })
        .from(incomeSources)
        .where(eq(incomeSources.ownerUserId, userId));
      for (const incomeSource of ownedIncomeSources) {
        const successor = incomeSource.groupId
          ? groupSuccessors.get(incomeSource.groupId)
          : householdSuccessors.get(incomeSource.householdId);
        if (successor) {
          await tx
            .update(incomeSources)
            .set({ ownerUserId: successor })
            .where(eq(incomeSources.id, incomeSource.id));
        }
      }
    });

    return { ok: true };
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
