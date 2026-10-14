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
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { budgets, expenses, groups, householdMembers, user } from "~/server/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  assertGroupInHousehold,
  assertGroupMembership,
  assertGroupOwner,
  assertHouseholdMembership,
  ensureActiveHouseholdForUser,
} from "~/server/finance/household-context";
import { groupMembers } from "~/server/db/schema";
import {
  type ExchangeRates,
  type Currency,
} from "~/lib/currency";

const paidByUser = alias(user, "paid_by_user");
const createdByUser = alias(user, "created_by_user");

const expenseTypeSchema = z.enum(["fixed", "variable", "one-off", "recurring"]);
const expenseGroupSchema = z.enum(["family", "work", "friends", "personal", "other"]);
const encryptedPayloadSchema = z.object({
  version: z.literal(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
  encryptedKeys: z.record(z.string(), z.string().min(1)),
});

const amountSchema = z
  .string()
  .regex(/^\d{1,16}(?:\.\d{1,8})?$/, "Enter an amount with up to 8 decimal places.")
  .refine((amount) => Number(amount) > 0, "Amount must be greater than zero.");
const DEFAULT_PERSONAL_CATEGORIES = [
  "Groceries",
  "Food & drinks",
  "Housing",
  "Bills & utilities",
  "Transport",
  "Shopping",
  "Health",
  "Entertainment",
  "Travel",
  "Cash & ATM",
  "Fees & taxes",
  "Education",
  "Personal care",
  "Gifts & charity",
  "Other",
];
const EXCHANGE_RATE_CACHE_TTL_MS = 5 * 60 * 1000;
let exchangeRateCache: { value: ExchangeRates; expiresAt: number } | null = null;
let exchangeRateRequest: Promise<ExchangeRates> | null = null;

async function fetchExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();
  if (exchangeRateCache && exchangeRateCache.expiresAt > now) {
    return exchangeRateCache.value;
  }

  exchangeRateRequest ??= (async () => {
    const [eurResponse, btcResponse] = await Promise.all([
      fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", {
        signal: AbortSignal.timeout(5_000),
      }),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", {
        signal: AbortSignal.timeout(5_000),
      }),
    ]);
    if (!eurResponse.ok || !btcResponse.ok) {
      throw new Error("Exchange-rate providers returned an unsuccessful response.");
    }

    const eurData = (await eurResponse.json()) as { rates?: { EUR?: number } };
    const btcData = (await btcResponse.json()) as { bitcoin?: { usd?: number } };
    const euroPerUsd = Number(eurData.rates?.EUR);
    const usdPerBtc = Number(btcData.bitcoin?.usd);
    if (
      !Number.isFinite(euroPerUsd) ||
      euroPerUsd <= 0 ||
      !Number.isFinite(usdPerBtc) ||
      usdPerBtc <= 0
    ) {
      throw new Error("Exchange-rate providers returned invalid rate data.");
    }

    const rates: ExchangeRates = {
      USD: 1,
      EUR: euroPerUsd,
      BTC: 1 / usdPerBtc,
    };
    exchangeRateCache = {
      value: rates,
      expiresAt: Date.now() + EXCHANGE_RATE_CACHE_TTL_MS,
    };
    return rates;
  })();

  try {
    return await exchangeRateRequest;
  } finally {
    exchangeRateRequest = null;
  }
}

function assertCurrencyPrecision(amount: string, currency: Currency) {
  if (currency !== "BTC" && (amount.split(".")[1]?.length ?? 0) > 2) {
    throw new Error(`${currency} amounts can have at most 2 decimal places.`);
  }
}

async function resolveHouseholdId(userId: string, requestedHouseholdId?: string) {
  if (requestedHouseholdId) {
    await assertHouseholdMembership(userId, requestedHouseholdId);
    return requestedHouseholdId;
  }

  return ensureActiveHouseholdForUser(userId);
}

function parseCategoryList(value: string | null, fallback: string[]) {
  if (!value) return fallback;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback;
    return Array.from(new Set(parsed.filter(
      (category): category is string => typeof category === "string" && category.trim().length > 0,
    ).map((category) => category.trim())));
  } catch {
    return fallback;
  }
}

const categoryListSchema = z.array(z.string().trim().min(1).max(80)).max(50)
  .superRefine((categories, context) => {
    const normalized = categories.map((category) => category.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({ code: "custom", message: "Category names must be unique." });
    }
  });

export const spendingRouter = createTRPCRouter({
  categories: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const householdId = await resolveHouseholdId(userId);
    const [account] = await ctx.db.select({ categories: user.expenseCategories })
      .from(user).where(eq(user.id, userId)).limit(1);
    const legacyCategories = account?.categories
      ? []
      : (await ctx.db.selectDistinct({ category: expenses.category }).from(expenses).where(and(
          eq(expenses.householdId, householdId),
          eq(expenses.userId, userId),
          isNull(expenses.groupId),
        ))).map((row) => row.category);
    const personalDefaults = Array.from(new Set([...DEFAULT_PERSONAL_CATEGORIES, ...legacyCategories]));
    const memberships = await ctx.db.select({
      id: groups.id,
      name: groups.name,
      categories: groups.expenseCategories,
      role: groupMembers.role,
      canManageCategories: groupMembers.canManageCategories,
    })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(and(
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
        eq(groups.householdId, householdId),
      ));

    return {
      personal: parseCategoryList(account?.categories ?? null, personalDefaults),
      groups: memberships.map((group) => ({
        id: group.id,
        name: group.name,
        role: group.role,
        canManageCategories: group.canManageCategories,
        categories: parseCategoryList(group.categories, []),
      })),
    };
  }),
  saveCategories: protectedProcedure
    .input(z.discriminatedUnion("type", [
      z.object({ type: z.literal("personal"), categories: categoryListSchema }),
      z.object({ type: z.literal("group"), groupId: z.string().uuid(), categories: categoryListSchema }),
    ]))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await resolveHouseholdId(userId);
      if (input.type === "personal") {
        if (input.categories.length === 0) {
          throw new Error("Keep at least one personal expense category.");
        }
        await ctx.db.update(user)
          .set({ expenseCategories: JSON.stringify(input.categories) })
          .where(eq(user.id, userId));
        return { categories: input.categories };
      }

      await assertGroupInHousehold(input.groupId, householdId);
      const [membership] = await ctx.db.select({
        role: groupMembers.role,
        canManageCategories: groupMembers.canManageCategories,
      }).from(groupMembers).where(and(
        eq(groupMembers.groupId, input.groupId),
        eq(groupMembers.userId, userId),
        eq(groupMembers.status, "active"),
      )).limit(1);
      if (membership?.role !== "owner" && !membership?.canManageCategories) {
        throw new Error("Only a group owner or category manager can edit group categories.");
      }

      await ctx.db.update(groups)
        .set({ expenseCategories: JSON.stringify(input.categories) })
        .where(and(eq(groups.id, input.groupId), eq(groups.householdId, householdId)));
      return { categories: input.categories };
    }),
  getExchangeRates: protectedProcedure.query(async () => {
    return fetchExchangeRates();
  }),
  add: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        encryptedPayload: encryptedPayloadSchema,
        amount: amountSchema,
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
      }).superRefine(({ amount, currency }, context) => {
        if (currency !== "BTC" && (amount.split(".")[1]?.length ?? 0) > 2) {
          context.addIssue({
            code: "custom",
            path: ["amount"],
            message: `${currency} amounts can have at most 2 decimal places.`,
          });
        }
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await resolveHouseholdId(userId, input.householdId);
      assertCurrencyPrecision(input.amount, input.currency);
      if (input.groupId) {
        await assertGroupInHousehold(input.groupId, householdId);
        await assertGroupMembership(userId, input.groupId);
      }
      if (input.budgetId) {
        const [budget] = await ctx.db.select({
          id: budgets.id,
          groupId: budgets.groupId,
          ownerUserId: budgets.ownerUserId,
          currency: budgets.currency,
        }).from(budgets).where(and(eq(budgets.id, input.budgetId), eq(budgets.householdId, householdId))).limit(1);
        if (!budget || budget.groupId !== (input.groupId ?? null)) throw new Error("Choose a budget matching this expense scope.");
        if (!budget.groupId && budget.ownerUserId !== userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the budget creator can assign expenses to this budget.",
          });
        }
        if (budget.currency !== input.currency) throw new Error("Expense and budget currencies must match.");
      }
      const normalizedExpenseType =
        input.expenseType === "fixed"
          ? "recurring"
          : input.expenseType === "variable"
            ? "one-off"
            : input.expenseType;

      const recipientIds = input.groupId && input.visibility === "group"
        ? (await ctx.db
            .select({ userId: groupMembers.userId })
            .from(groupMembers)
            .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active"))))
            .map((member) => member.userId)
        : (await ctx.db
            .select({ userId: householdMembers.userId })
            .from(householdMembers)
            .where(eq(householdMembers.householdId, householdId)))
            .map((member) => member.userId);
      const expectedRecipients = Array.from(new Set([...recipientIds, userId])).sort();
      const actualRecipients = Object.keys(input.encryptedPayload.encryptedKeys).sort();
      if (actualRecipients.length !== expectedRecipients.length || actualRecipients.some((id, index) => id !== expectedRecipients[index])) {
        throw new Error("The encrypted payload recipients do not match the selected sharing settings.");
      }
      const allowedParticipantIds = new Set(expectedRecipients);
      if (
        (input.paidByUserId && !allowedParticipantIds.has(input.paidByUserId)) ||
        input.splitWithUserIds.some((participantId) => !allowedParticipantIds.has(participantId))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Expense participants must belong to the selected sharing scope.",
        });
      }

      return ctx.db.insert(expenses).values({
        id: input.id,
        description: null,
        encryptedPayload: JSON.stringify(input.encryptedPayload),
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
        encryptedPayload: encryptedPayloadSchema,
        amount: amountSchema,
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
      }).superRefine(({ amount, currency }, context) => {
        if (currency !== "BTC" && (amount.split(".")[1]?.length ?? 0) > 2) {
          context.addIssue({
            code: "custom",
            path: ["amount"],
            message: `${currency} amounts can have at most 2 decimal places.`,
          });
        }
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await resolveHouseholdId(userId);
      assertCurrencyPrecision(input.amount, input.currency);

      const [existing] = await ctx.db
        .select({
          userId: expenses.userId,
          createdByUserId: expenses.createdByUserId,
          groupId: expenses.groupId,
        })
        .from(expenses)
        .where(and(eq(expenses.id, input.id), eq(expenses.householdId, householdId)))
        .limit(1);
      if (!existing) throw new Error("Expense not found or unavailable.");
      if (existing.groupId) {
        await assertGroupInHousehold(existing.groupId, householdId);
        await assertGroupMembership(userId, existing.groupId);
        if (
          existing.userId !== userId &&
          existing.createdByUserId !== userId
        ) {
          await assertGroupOwner(userId, existing.groupId);
        }
      } else if (existing.userId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the expense creator can edit this personal expense.",
        });
      }

      if (input.groupId) {
        await assertGroupInHousehold(input.groupId, householdId);
        await assertGroupMembership(userId, input.groupId);
      }
      if (input.budgetId) {
        const [budget] = await ctx.db.select({
          id: budgets.id,
          groupId: budgets.groupId,
          ownerUserId: budgets.ownerUserId,
          currency: budgets.currency,
        }).from(budgets).where(and(eq(budgets.id, input.budgetId), eq(budgets.householdId, householdId))).limit(1);
        if (!budget || budget.groupId !== (input.groupId ?? null)) throw new Error("Choose a budget matching this expense scope.");
        if (!budget.groupId && budget.ownerUserId !== userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the budget creator can assign expenses to this budget.",
          });
        }
        if (budget.currency !== input.currency) throw new Error("Expense and budget currencies must match.");
      }

      const recipientIds = input.groupId && input.visibility === "group"
        ? (await ctx.db
            .select({ userId: groupMembers.userId })
            .from(groupMembers)
            .where(and(eq(groupMembers.groupId, input.groupId), eq(groupMembers.status, "active"))))
            .map((member) => member.userId)
        : (await ctx.db
            .select({ userId: householdMembers.userId })
            .from(householdMembers)
            .where(eq(householdMembers.householdId, householdId)))
            .map((member) => member.userId);
      const expectedRecipients = Array.from(new Set([...recipientIds, userId])).sort();
      const actualRecipients = Object.keys(input.encryptedPayload.encryptedKeys).sort();
      if (actualRecipients.length !== expectedRecipients.length || actualRecipients.some((id, index) => id !== expectedRecipients[index])) {
        throw new Error("The encrypted payload recipients do not match the selected sharing settings.");
      }
      if (input.paidByUserId && !expectedRecipients.includes(input.paidByUserId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The payer must belong to the selected sharing scope.",
        });
      }

      const [updated] = await ctx.db
        .update(expenses)
        .set({
          description: null,
          encryptedPayload: JSON.stringify(input.encryptedPayload),
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

      const [existing] = await ctx.db
        .select({
          userId: expenses.userId,
          createdByUserId: expenses.createdByUserId,
          groupId: expenses.groupId,
        })
        .from(expenses)
        .where(and(eq(expenses.id, input.id), eq(expenses.householdId, householdId)))
        .limit(1);
      if (!existing) throw new Error("Expense not found or unavailable.");
      if (existing.groupId) {
        await assertGroupInHousehold(existing.groupId, householdId);
        await assertGroupMembership(userId, existing.groupId);
        if (
          existing.userId !== userId &&
          existing.createdByUserId !== userId
        ) {
          await assertGroupOwner(userId, existing.groupId);
        }
      } else if (existing.userId !== userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the expense creator can delete this personal expense.",
        });
      }

      const [deleted] = await ctx.db
        .delete(expenses)
        .where(and(eq(expenses.id, input.id), eq(expenses.householdId, householdId)))
        .returning({ id: expenses.id });

      if (!deleted) throw new Error("Expense not found or unavailable.");
      return deleted;
    }),
  clearExpenses: protectedProcedure
    .input(z.discriminatedUnion("type", [
      z.object({ type: z.literal("all") }),
      z.object({ type: z.literal("personalCategory"), category: z.string().trim().min(1).max(80) }),
      z.object({ type: z.literal("group"), groupId: z.string().uuid() }),
    ]))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const householdId = await resolveHouseholdId(userId);

      if (input.type === "group") {
        await assertGroupInHousehold(input.groupId, householdId);
        await assertGroupOwner(userId, input.groupId);
      }

      const whereCondition = input.type === "all"
        ? and(eq(expenses.householdId, householdId), eq(expenses.userId, userId))
        : input.type === "personalCategory"
          ? and(
              eq(expenses.householdId, householdId),
              eq(expenses.userId, userId),
              isNull(expenses.groupId),
              eq(expenses.category, input.category),
            )
          : and(
              eq(expenses.householdId, householdId),
              eq(expenses.groupId, input.groupId),
            );

      const deleted = await ctx.db.delete(expenses)
        .where(whereCondition)
        .returning({ id: expenses.id });
      return { deletedCount: deleted.length };
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
          encryptedPayload: expenses.encryptedPayload,
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

      const summaryByCurrency = () =>
        ctx.db
          .select({
            currency: expenses.currency,
            total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
            fixed: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.expenseType} IN ('fixed', 'recurring') THEN ${expenses.amount} ELSE 0 END), 0)`,
            variable: sql<string>`COALESCE(SUM(CASE WHEN ${expenses.expenseType} IN ('variable', 'one-off') THEN ${expenses.amount} ELSE 0 END), 0)`,
          })
          .from(expenses);
      const [todaySummary, monthSummary] = await Promise.all([
        summaryByCurrency()
          .where(
            and(
              eq(expenses.householdId, householdId),
              gte(expenses.createdAt, startOfToday),
              lt(expenses.createdAt, startOfTomorrow),
            ),
          )
          .groupBy(expenses.currency),
        summaryByCurrency()
          .where(
            and(
              eq(expenses.householdId, householdId),
              gte(expenses.createdAt, startOfMonth),
              lt(expenses.createdAt, startOfNextMonth),
            ),
          )
          .groupBy(expenses.currency),
      ]);

      return {
        householdId,
        today: todaySummary.map((summary) => ({
          currency: summary.currency,
          total: Number(summary.total ?? "0"),
          fixed: Number(summary.fixed ?? "0"),
          variable: Number(summary.variable ?? "0"),
        })),
        month: monthSummary.map((summary) => ({
          currency: summary.currency,
          total: Number(summary.total ?? "0"),
          fixed: Number(summary.fixed ?? "0"),
          variable: Number(summary.variable ?? "0"),
        })),
      };
    }),
});