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
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { expenses } from "~/server/db/schema";
import { desc } from "drizzle-orm";

export const spendingRouter = createTRPCRouter({
  add: publicProcedure
    .input(z.object({
      description: z.string(),
      amount: z.string(),
      category: z.string(),
      currency: z.enum(["USD", "EUR", "BTC"]),
      createdAt: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Use ctx.session.user.id if session is integrated
      return await ctx.db.insert(expenses).values({ ...input, userId: "local-user" });
    }),

  getAll: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db.select().from(expenses).orderBy(desc(expenses.createdAt));
  }),
});