import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  assertGroupInHousehold,
  assertGroupMembership,
  ensureActiveHouseholdForUser,
} from "~/server/finance/household-context";
import { budgets, expenses, incomeSources } from "~/server/db/schema";

const currency = z.enum(["USD", "EUR", "BTC"]);
const frequency = z.enum(["daily", "weekly", "biweekly", "monthly"]);

async function validateScope(userId: string, householdId: string, groupId?: string) {
  if (groupId) {
    await assertGroupInHousehold(groupId, householdId);
    await assertGroupMembership(userId, groupId);
  }
}

export const budgetRouter = createTRPCRouter({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
    const [budgetRows, incomeRows, spentRows] = await Promise.all([
      ctx.db.select().from(budgets).where(eq(budgets.householdId, householdId)).orderBy(desc(budgets.createdAt)),
      ctx.db.select().from(incomeSources).where(eq(incomeSources.householdId, householdId)).orderBy(desc(incomeSources.createdAt)),
      ctx.db
        .select({ budgetId: expenses.budgetId, spent: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` })
        .from(expenses)
        .where(eq(expenses.householdId, householdId))
        .groupBy(expenses.budgetId),
    ]);

    const spentByBudget = new Map(spentRows.map((row) => [row.budgetId, Number(row.spent ?? 0)]));
    return {
      budgets: budgetRows.map((budget) => ({
        ...budget,
        spent: Number((spentByBudget.get(budget.id) ?? 0).toFixed(2)),
        remaining: Number((Number(budget.amount) - (spentByBudget.get(budget.id) ?? 0)).toFixed(2)),
      })),
      incomes: incomeRows,
    };
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().trim().max(80).optional(),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
      currency,
      groupId: z.string().uuid().optional(),
      period: z.enum(["monthly", "weekly", "daily"]).default("monthly"),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await ensureActiveHouseholdForUser(userId);
      await validateScope(userId, householdId, input.groupId);
      const name = input.name && input.name.length > 0 ? input.name : "Budget";
      return ctx.db.insert(budgets).values({ ...input, name, householdId, ownerUserId: userId, groupId: input.groupId ?? null }).returning({ id: budgets.id });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);

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
      name: z.string().trim().min(1).max(80),
      category: z.string().trim().min(1).max(80),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
      currency,
      frequency,
      recurrenceDay: z.number().int().min(0).max(31).optional(),
      startDate: z.date().optional(),
      groupId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await ensureActiveHouseholdForUser(userId);
      await validateScope(userId, householdId, input.groupId);
      return ctx.db.insert(incomeSources).values({ ...input, startDate: input.startDate ?? new Date(), householdId, ownerUserId: userId, groupId: input.groupId ?? null }).returning({ id: incomeSources.id });
    }),

  deleteIncome: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const householdId = await ensureActiveHouseholdForUser(ctx.session.user.id);
      const [deleted] = await ctx.db
        .delete(incomeSources)
        .where(and(eq(incomeSources.id, input.id), eq(incomeSources.householdId, householdId)))
        .returning({ id: incomeSources.id });

      if (!deleted) throw new Error("Income source not found or unavailable.");
      return deleted;
    }),
});
