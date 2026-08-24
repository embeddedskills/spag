// import { z } from "zod";
// import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
// import { expenses } from "~/server/db/schema";

// export const spendingRouter = createTRPCRouter({
//   // Action to add an expense
//   addExpense: publicProcedure
//     .input(
//       z.object({
//         description: z.string().min(1),
//         amount: z.number().positive(),
//         category: z.string(),
//       })
//     )
//     .mutation(async ({ ctx, input }) => {
//       return await ctx.db.insert(expenses).values({
//         description: input.description,
//         amount: input.amount.toString(), // Drizzle decimal is often handled as string
//         category: input.category,
//         userId: "local-user", // We'll link this to Better Auth later
//       });
//     }),

//   // Action to get all expenses
//   getAll: publicProcedure.query(async ({ ctx }) => {
//     return await ctx.db.select().from(expenses);
//   }),
// });

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { budgets, expenses, user } from "~/server/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import {
  assertGroupInHousehold,
  assertGroupMembership,
  assertHouseholdMembership,
  ensureActiveHouseholdForUser,
} from "~/server/finance/household-context";
import { groupMembers } from "~/server/db/schema";

const paidByUser = alias(user, "paid_by_user");
const createdByUser = alias(user, "created_by_user");

const expenseTypeSchema = z.enum(["fixed", "variable", "one-off", "recurring"]);
const expenseGroupSchema = z.enum(["family", "work", "friends", "personal", "other"]);

type ExchangeRates = {
  USD: number;
  EUR: number;
  BTC: number;
};

const DEFAULT_RATES: ExchangeRates = { USD: 1, EUR: 0.92, BTC: 65000 };
const EXCHANGE_RATE_CACHE_TTL_MS = 5 * 60 * 1000;
let exchangeRateCache: { value: ExchangeRates; expiresAt: number } | null = null;

async function fetchExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();
  if (exchangeRateCache && exchangeRateCache.expiresAt > now) {
    return exchangeRateCache.value;
  }

  const [eurResponse, btcResponse] = await Promise.all([
    fetch("https://api.exchangerate.host/latest?base=USD&symbols=EUR"),
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"),
  ]);

  if (!eurResponse.ok || !btcResponse.ok) {
    const fallback = { ...DEFAULT_RATES };
    exchangeRateCache = {
      value: fallback,
      expiresAt: now + EXCHANGE_RATE_CACHE_TTL_MS,
    };
    return fallback;
  }

  const eurData = (await eurResponse.json()) as { rates?: { EUR?: number } };
  const btcData = (await btcResponse.json()) as { bitcoin?: { usd?: number } };

  const euroQuote = Number(eurData.rates?.EUR ?? 0.92);
  const btcUsd = Number(btcData.bitcoin?.usd ?? 65000);

  const rates: ExchangeRates = {
    USD: 1,
    EUR: Number.isFinite(euroQuote) && euroQuote > 0 ? euroQuote : 0.92,
    BTC: Number.isFinite(btcUsd) && btcUsd > 0 ? btcUsd : 65000,
  };

  exchangeRateCache = {
    value: rates,
    expiresAt: now + EXCHANGE_RATE_CACHE_TTL_MS,
  };

  return rates;
}

async function resolveHouseholdId(userId: string, requestedHouseholdId?: string) {
  if (requestedHouseholdId) {
    await assertHouseholdMembership(userId, requestedHouseholdId);
    return requestedHouseholdId;
  }

  return ensureActiveHouseholdForUser(userId);
}

export const spendingRouter = createTRPCRouter({
  getExchangeRates: protectedProcedure.query(async () => {
    return fetchExchangeRates();
  }),
  add: protectedProcedure
    .input(
      z.object({
        description: z.string().trim().min(1),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a valid decimal value."),
        category: z.string().trim().min(1),
        group: expenseGroupSchema.default("personal"),
        currency: z.enum(["USD", "EUR", "BTC"]),
        createdAt: z.date(),
        expenseType: expenseTypeSchema.default("one-off"),
        recurrenceFrequency: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
        recurrenceDay: z.number().int().min(0).max(31).optional(),
        paidByUserId: z.string().optional(),
        splitWithUserIds: z.array(z.string()).default([]),
        groupId: z.string().uuid().optional(),
        visibility: z.enum(["personal", "group"]).default("personal"),
        householdId: z.string().uuid().optional(),
        budgetId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await resolveHouseholdId(userId, input.householdId);
      if (input.groupId) {
        await assertGroupInHousehold(input.groupId, householdId);
        await assertGroupMembership(userId, input.groupId);
      }
      if (input.budgetId) {
        const [budget] = await ctx.db.select({ id: budgets.id, groupId: budgets.groupId }).from(budgets).where(and(eq(budgets.id, input.budgetId), eq(budgets.householdId, householdId))).limit(1);
        if (!budget || budget.groupId !== (input.groupId ?? null)) throw new Error("Choose a budget matching this expense scope.");
      }
      const normalizedExpenseType =
        input.expenseType === "fixed"
          ? "recurring"
          : input.expenseType === "variable"
            ? "one-off"
            : input.expenseType;

      return ctx.db.insert(expenses).values({
        description: input.description,
        amount: input.amount,
        category: input.category,
        group: input.group,
        currency: input.currency,
        createdAt: input.createdAt,
        expenseType: normalizedExpenseType,
        recurrenceFrequency: input.expenseType === "recurring" ? input.recurrenceFrequency : "none",
        recurrenceDay: input.expenseType === "recurring" ? input.recurrenceDay ?? null : null,
        groupId: input.groupId ?? null,
        visibility: input.groupId ? input.visibility : "personal",
        splitWithUserIds: Array.from(new Set(input.splitWithUserIds)).join(","),
        paidByUserId: input.paidByUserId ?? userId,
        householdId,
        createdByUserId: userId,
        userId,
        budgetId: input.budgetId ?? null,
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        description: z.string().trim().min(1),
        amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a valid decimal value."),
        category: z.string().trim().min(1),
        group: expenseGroupSchema.default("personal"),
        currency: z.enum(["USD", "EUR", "BTC"]),
        createdAt: z.date(),
        expenseType: expenseTypeSchema.default("one-off"),
        recurrenceFrequency: z.enum(["none", "daily", "weekly", "monthly"]).default("none"),
        recurrenceDay: z.number().int().min(0).max(31).optional(),
        paidByUserId: z.string().optional(),
        groupId: z.string().uuid().optional(),
        visibility: z.enum(["personal", "group"]).default("personal"),
        budgetId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await resolveHouseholdId(userId);

      if (input.groupId) {
        await assertGroupInHousehold(input.groupId, householdId);
        await assertGroupMembership(userId, input.groupId);
      }
      if (input.budgetId) {
        const [budget] = await ctx.db.select({ id: budgets.id, groupId: budgets.groupId }).from(budgets).where(and(eq(budgets.id, input.budgetId), eq(budgets.householdId, householdId))).limit(1);
        if (!budget || budget.groupId !== (input.groupId ?? null)) throw new Error("Choose a budget matching this expense scope.");
      }

      const [updated] = await ctx.db
        .update(expenses)
        .set({
          description: input.description,
          amount: input.amount,
          category: input.category,
          group: input.group,
          currency: input.currency,
          createdAt: input.createdAt,
          expenseType: input.expenseType === "fixed" ? "recurring" : input.expenseType === "variable" ? "one-off" : input.expenseType,
          recurrenceFrequency: input.expenseType === "recurring" ? input.recurrenceFrequency : "none",
          recurrenceDay: input.expenseType === "recurring" ? input.recurrenceDay ?? null : null,
          paidByUserId: input.paidByUserId ?? userId,
          groupId: input.groupId ?? null,
          visibility: input.groupId ? input.visibility : "personal",
          budgetId: input.budgetId ?? null,
        })
        .where(and(eq(expenses.id, input.id), eq(expenses.householdId, householdId)))
        .returning({ id: expenses.id });

      if (!updated) throw new Error("Expense not found or unavailable.");
      return updated;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await resolveHouseholdId(userId);

      const [deleted] = await ctx.db
        .delete(expenses)
        .where(and(eq(expenses.id, input.id), eq(expenses.householdId, householdId)))
        .returning({ id: expenses.id });

      if (!deleted) throw new Error("Expense not found or unavailable.");
      return deleted;
    }),

  getAll: protectedProcedure
    .input(
      z
        .object({
          householdId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await resolveHouseholdId(userId, input?.householdId);
      const memberships = await ctx.db
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(and(eq(groupMembers.userId, userId), eq(groupMembers.status, "active")));
      const groupIds = memberships.map((membership) => membership.groupId);

      return ctx.db
        .select({
          id: expenses.id,
          description: expenses.description,
          amount: expenses.amount,
          category: expenses.category,
          group: expenses.group,
          currency: expenses.currency,
          expenseType: expenses.expenseType,
          recurrenceFrequency: expenses.recurrenceFrequency,
          recurrenceDay: expenses.recurrenceDay,
          createdAt: expenses.createdAt,
          householdId: expenses.householdId,
          createdByUserId: expenses.createdByUserId,
          paidByUserId: expenses.paidByUserId,
          splitWithUserIds: expenses.splitWithUserIds,
          budgetId: expenses.budgetId,
          groupId: expenses.groupId,
          visibility: expenses.visibility,
          userId: expenses.userId,
          payerName: paidByUser.name,
          creatorName: createdByUser.name,
        })
        .from(expenses)
        .leftJoin(paidByUser, eq(expenses.paidByUserId, paidByUser.id))
        .leftJoin(createdByUser, eq(expenses.createdByUserId, createdByUser.id))
        .where(
          and(
            eq(expenses.householdId, householdId),
            or(
              eq(expenses.visibility, "personal"),
              groupIds.length > 0 ? inArray(expenses.groupId, groupIds) : sql`false`,
            ),
          ),
        )
        .orderBy(desc(expenses.createdAt));
    }),

  getSummary: protectedProcedure
    .input(
      z
        .object({
          householdId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await resolveHouseholdId(userId, input?.householdId);

      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const startOfTomorrow = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const [todaySummary] = await ctx.db
        .select({
          total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
          fixed: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.expenseType} IN ('fixed', 'recurring') THEN ${expenses.amount} ELSE 0 END), 0)`,
          variable: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.expenseType} IN ('variable', 'one-off') THEN ${expenses.amount} ELSE 0 END), 0)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.householdId, householdId),
            gte(expenses.createdAt, startOfToday),
            lt(expenses.createdAt, startOfTomorrow),
          ),
        );

      const [monthSummary] = await ctx.db
        .select({
          total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
          fixed: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.expenseType} IN ('fixed', 'recurring') THEN ${expenses.amount} ELSE 0 END), 0)`,
          variable: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.expenseType} IN ('variable', 'one-off') THEN ${expenses.amount} ELSE 0 END), 0)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.householdId, householdId),
            gte(expenses.createdAt, startOfMonth),
            lt(expenses.createdAt, startOfNextMonth),
          ),
        );

      return {
        householdId,
        today: {
          total: Number(todaySummary?.total ?? "0"),
          fixed: Number(todaySummary?.fixed ?? "0"),
          variable: Number(todaySummary?.variable ?? "0"),
        },
        month: {
          total: Number(monthSummary?.total ?? "0"),
          fixed: Number(monthSummary?.fixed ?? "0"),
          variable: Number(monthSummary?.variable ?? "0"),
        },
      };
    }),
});