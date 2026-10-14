import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  assertGroupInHousehold,
  assertGroupMembership,
  assertGroupOwner,
  ensureActiveHouseholdForUser,
} from "~/server/finance/household-context";
import { budgets, expenses, groupMembers, householdMembers, incomeSources } from "~/server/db/schema";

const currency = z.enum(["USD", "EUR", "BTC"]);
const frequency = z.enum(["daily", "weekly", "biweekly", "monthly"]);
const amountSchema = z
  .string()
  .regex(/^\d{1,16}(?:\.\d{1,8})?$/, "Enter an amount with up to 8 decimal places.")
  .refine((amount) => Number(amount) > 0, "Amount must be greater than zero.");

function assertCurrencyPrecision(amount: string, value: string) {
  if (value !== "BTC" && (amount.split(".")[1]?.length ?? 0) > 2) {
    throw new Error(`${value} amounts can have at most 2 decimal places.`);
  }
}

async function validateScope(userId: string, householdId: string, groupId?: string) {
  if (groupId) {
    await assertGroupInHousehold(groupId, householdId);
    await assertGroupMembership(userId, groupId);
  }
}

export const budgetRouter = createTRPCRouter({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
    const memberships = await ctx.db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, ctx.session.user.id), eq(groupMembers.status, "active")));
    const groupIds = memberships.map((membership) => membership.groupId);
    const [budgetRows, incomeRows, spentRows] = await Promise.all([
      ctx.db.select().from(budgets).where(and(
        eq(budgets.householdId, householdId),
        or(isNull(budgets.groupId), groupIds.length > 0 ? inArray(budgets.groupId, groupIds) : sql`false`),
      )).orderBy(desc(budgets.createdAt)),
      ctx.db.select().from(incomeSources).where(and(
        eq(incomeSources.householdId, householdId),
        or(isNull(incomeSources.groupId), groupIds.length > 0 ? inArray(incomeSources.groupId, groupIds) : sql`false`),
      )).orderBy(desc(incomeSources.createdAt)),
      ctx.db
        .select({
          budgetId: expenses.budgetId,
          currency: expenses.currency,
          spent: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
        })
        .from(expenses)
        .where(eq(expenses.householdId, householdId))
        .groupBy(expenses.budgetId, expenses.currency),
    ]);

    const spentByBudgetCurrency = new Map<string, number>();
    for (const row of spentRows) {
      if (!row.budgetId) continue;
      const key = `${row.budgetId}:${row.currency}`;
      spentByBudgetCurrency.set(
        key,
        (spentByBudgetCurrency.get(key) ?? 0) + Number(row.spent ?? 0),
      );
    }

    return {
      budgets: budgetRows.map((budget) => ({
        ...budget,
        spent: Number(
          (spentByBudgetCurrency.get(`${budget.id}:${budget.currency}`) ?? 0)
            .toFixed(budget.currency === "BTC" ? 8 : 2),
        ),
        remaining: Number(
          (
            Number(budget.amount) -
            (spentByBudgetCurrency.get(`${budget.id}:${budget.currency}`) ?? 0)
          ).toFixed(budget.currency === "BTC" ? 8 : 2),
        ),
      })),
      incomes: incomeRows,
    };
  }),

  create: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      encryptedPayload: z.object({
        version: z.literal(1),
        iv: z.string().min(1),
        ciphertext: z.string().min(1),
        encryptedKeys: z.record(z.string(), z.string().min(1)),
      }),
      amount: amountSchema,
      currency,
      groupId: z.string().uuid().optional(),
      period: z.enum(["monthly", "weekly", "daily"]).default("monthly"),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await ensureActiveHouseholdForUser(userId);
      assertCurrencyPrecision(input.amount, input.currency);
      await validateScope(userId, householdId, input.groupId);
      const recipientIds = input.groupId
        ? (await ctx.db.select({ userId: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")))).map((member) => member.userId)
        : (await ctx.db.select({ userId: householdMembers.userId }).from(householdMembers).where(eq(householdMembers.householdId, householdId))).map((member) => member.userId);
      const expectedRecipients = Array.from(new Set([...recipientIds, userId])).sort();
      const actualRecipients = Object.keys(input.encryptedPayload.encryptedKeys).sort();
      if (actualRecipients.length !== expectedRecipients.length || actualRecipients.some((id, index) => id !== expectedRecipients[index])) {
        throw new Error("The encrypted payload recipients do not match the selected sharing settings.");
      }
      return ctx.db.insert(budgets).values({
        id: input.id,
        name: null,
        encryptedPayload: JSON.stringify(input.encryptedPayload),
        amount: input.amount,
        currency: input.currency,
        groupId: input.groupId ?? null,
        period: input.period,
        householdId,
        ownerUserId: userId,
      }).returning({ id: budgets.id });
    }),

  migrateName: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      encryptedPayload: z.object({
        version: z.literal(1),
        iv: z.string().min(1),
        ciphertext: z.string().min(1),
        encryptedKeys: z.record(z.string(), z.string().min(1)),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await ensureActiveHouseholdForUser(userId);
      const [budget] = await ctx.db
        .select({
          groupId: budgets.groupId,
          ownerUserId: budgets.ownerUserId,
        })
        .from(budgets)
        .where(and(eq(budgets.id, input.id), eq(budgets.householdId, householdId), isNotNull(budgets.name)))
        .limit(1);
      if (!budget) throw new Error("Plaintext budget name not found or unavailable.");
      if (budget.groupId) {
        await assertGroupInHousehold(budget.groupId, householdId);
        await assertGroupOwner(userId, budget.groupId);
      } else if (budget.ownerUserId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the budget creator can migrate this budget.",
        });
      }
      const recipientIds = budget.groupId
        ? (await ctx.db.select({ userId: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.groupId, budget.groupId), eq(groupMembers.status, "active")))).map((member) => member.userId)
        : (await ctx.db.select({ userId: householdMembers.userId }).from(householdMembers).where(eq(householdMembers.householdId, householdId))).map((member) => member.userId);
      const expected = Array.from(new Set([...recipientIds, userId])).sort();
      const actual = Object.keys(input.encryptedPayload.encryptedKeys).sort();
      if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
        throw new Error("The encrypted payload recipients do not match this budget's sharing scope.");
      }
      await ctx.db.update(budgets)
        .set({ name: null, encryptedPayload: JSON.stringify(input.encryptedPayload) })
        .where(and(eq(budgets.id, input.id), eq(budgets.householdId, householdId), isNotNull(budgets.name)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
      const [budget] = await ctx.db
        .select({
          groupId: budgets.groupId,
          ownerUserId: budgets.ownerUserId,
        })
        .from(budgets)
        .where(
          and(
            eq(budgets.id, input.id),
            eq(budgets.householdId, householdId),
          ),
        )
        .limit(1);
      if (!budget) throw new Error("Budget not found or unavailable.");
      if (budget.groupId) {
        await assertGroupInHousehold(budget.groupId, householdId);
        await assertGroupOwner(ctx.session.user.id, budget.groupId);
      } else if (budget.ownerUserId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the budget creator can delete a personal budget.",
        });
      }

      return ctx.db.transaction(async (tx) => {
        await tx
          .update(expenses)
          .set({ budgetId: null })
          .where(and(eq(expenses.budgetId, input.id), eq(expenses.householdId, householdId)));

        const [deleted] = await tx
          .delete(budgets)
          .where(and(eq(budgets.id, input.id), eq(budgets.householdId, householdId)))
          .returning({ id: budgets.id });

        if (!deleted) throw new Error("Budget not found or unavailable.");
        return deleted;
      });
    }),

  addIncome: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      encryptedPayload: z.object({
        version: z.literal(1),
        iv: z.string().min(1),
        ciphertext: z.string().min(1),
        encryptedKeys: z.record(z.string(), z.string().min(1)),
      }),
      category: z.string().trim().min(1).max(80),
      amount: amountSchema,
      currency,
      frequency,
      recurrenceDay: z.number().int().min(0).max(31).optional(),
      startDate: z.date().optional(),
      groupId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await ensureActiveHouseholdForUser(userId);
      assertCurrencyPrecision(input.amount, input.currency);
      await validateScope(userId, householdId, input.groupId);
      const recipientIds = input.groupId
        ? (await ctx.db.select({ userId: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active")))).map((member) => member.userId)
        : (await ctx.db.select({ userId: householdMembers.userId }).from(householdMembers).where(eq(householdMembers.householdId, householdId))).map((member) => member.userId);
      const expectedRecipients = Array.from(new Set([...recipientIds, userId])).sort();
      const actualRecipients = Object.keys(input.encryptedPayload.encryptedKeys).sort();
      if (actualRecipients.length !== expectedRecipients.length || actualRecipients.some((id, index) => id !== expectedRecipients[index])) {
        throw new Error("The encrypted payload recipients do not match the selected sharing settings.");
      }
      return ctx.db.insert(incomeSources).values({
        id: input.id,
        name: null,
        encryptedPayload: JSON.stringify(input.encryptedPayload),
        category: input.category,
        amount: input.amount,
        currency: input.currency,
        frequency: input.frequency,
        recurrenceDay: input.recurrenceDay ?? null,
        startDate: input.startDate ?? new Date(),
        householdId,
        ownerUserId: userId,
        groupId: input.groupId ?? null,
      }).returning({ id: incomeSources.id });
    }),

  migrateIncomeName: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      encryptedPayload: z.object({
        version: z.literal(1),
        iv: z.string().min(1),
        ciphertext: z.string().min(1),
        encryptedKeys: z.record(z.string(), z.string().min(1)),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await ensureActiveHouseholdForUser(userId);
      const [income] = await ctx.db
        .select({
          groupId: incomeSources.groupId,
          ownerUserId: incomeSources.ownerUserId,
        })
        .from(incomeSources)
        .where(and(eq(incomeSources.id, input.id), eq(incomeSources.householdId, householdId), isNotNull(incomeSources.name)))
        .limit(1);
      if (!income) throw new Error("Plaintext income name not found or unavailable.");
      if (income.groupId) {
        await assertGroupInHousehold(income.groupId, householdId);
        await assertGroupOwner(userId, income.groupId);
      } else if (income.ownerUserId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the income source creator can migrate this source.",
        });
      }
      const recipientIds = income.groupId
        ? (await ctx.db.select({ userId: groupMembers.userId }).from(groupMembers).where(and(eq(groupMembers.groupId, income.groupId), eq(groupMembers.status, "active")))).map((member) => member.userId)
        : (await ctx.db.select({ userId: householdMembers.userId }).from(householdMembers).where(eq(householdMembers.householdId, householdId))).map((member) => member.userId);
      const expected = Array.from(new Set([...recipientIds, userId])).sort();
      const actual = Object.keys(input.encryptedPayload.encryptedKeys).sort();
      if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
        throw new Error("The encrypted payload recipients do not match this income source's sharing scope.");
      }
      await ctx.db.update(incomeSources)
        .set({ name: null, encryptedPayload: JSON.stringify(input.encryptedPayload) })
        .where(and(eq(incomeSources.id, input.id), eq(incomeSources.householdId, householdId), isNotNull(incomeSources.name)));
      return { success: true };
    }),

  deleteIncome: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
      const [income] = await ctx.db
        .select({
          groupId: incomeSources.groupId,
          ownerUserId: incomeSources.ownerUserId,
        })
        .from(incomeSources)
        .where(
          and(
            eq(incomeSources.id, input.id),
            eq(incomeSources.householdId, householdId),
          ),
        )
        .limit(1);
      if (!income) throw new Error("Income source not found or unavailable.");
      if (income.groupId) {
        await assertGroupInHousehold(income.groupId, householdId);
        await assertGroupOwner(ctx.session.user.id, income.groupId);
      } else if (income.ownerUserId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the income source creator can delete a personal income source.",
        });
      }
      const [deleted] = await ctx.db
        .delete(incomeSources)
        .where(and(eq(incomeSources.id, input.id), eq(incomeSources.householdId, householdId)))
        .returning({ id: incomeSources.id });

      if (!deleted) throw new Error("Income source not found or unavailable.");
      return deleted;
    }),

  wipe: protectedProcedure
    .input(z.object({
      kind: z.enum(["budgets", "income"]),
      scope: z.discriminatedUnion("type", [
        z.object({ type: z.literal("all") }),
        z.object({ type: z.literal("personal") }),
        z.object({ type: z.literal("group"), groupId: z.string().uuid() }),
      ]),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await ensureActiveHouseholdForUser(userId);

      if (input.scope.type === "group") {
        await validateScope(userId, householdId, input.scope.groupId);
        await assertGroupOwner(userId, input.scope.groupId);
      }

      const groupIds = input.scope.type === "all"
        ? (await ctx.db.select({ groupId: groupMembers.groupId }).from(groupMembers)
          .where(and(
            eq(groupMembers.userId, userId),
            eq(groupMembers.status, "active"),
            eq(groupMembers.role, "owner"),
          )))
          .map((membership) => membership.groupId)
        : [];

      if (input.kind === "budgets") {
        const scopeCondition = input.scope.type === "all"
          ? or(
              and(
                isNull(budgets.groupId),
                eq(budgets.ownerUserId, userId),
              ),
              groupIds.length > 0
                ? inArray(budgets.groupId, groupIds)
                : sql`false`,
            )
          : input.scope.type === "personal"
            ? and(
                isNull(budgets.groupId),
                eq(budgets.ownerUserId, userId),
              )
            : eq(budgets.groupId, input.scope.groupId);

        return ctx.db.transaction(async (tx) => {
          const matchingBudgets = await tx.select({ id: budgets.id }).from(budgets)
            .where(and(eq(budgets.householdId, householdId), scopeCondition));
          const budgetIds = matchingBudgets.map((budget) => budget.id);
          if (budgetIds.length === 0) return { deletedCount: 0 };

          await tx.update(expenses)
            .set({ budgetId: null })
            .where(and(eq(expenses.householdId, householdId), inArray(expenses.budgetId, budgetIds)));

          const deleted = await tx.delete(budgets)
            .where(and(eq(budgets.householdId, householdId), inArray(budgets.id, budgetIds)))
            .returning({ id: budgets.id });
          return { deletedCount: deleted.length };
        });
      }

      const scopeCondition = input.scope.type === "all"
        ? or(
            and(
              isNull(incomeSources.groupId),
              eq(incomeSources.ownerUserId, userId),
            ),
            groupIds.length > 0
              ? inArray(incomeSources.groupId, groupIds)
              : sql`false`,
          )
        : input.scope.type === "personal"
          ? and(
              isNull(incomeSources.groupId),
              eq(incomeSources.ownerUserId, userId),
            )
          : eq(incomeSources.groupId, input.scope.groupId);
      const deleted = await ctx.db.delete(incomeSources)
        .where(and(eq(incomeSources.householdId, householdId), scopeCondition))
        .returning({ id: incomeSources.id });
      return { deletedCount: deleted.length };
    }),
});
