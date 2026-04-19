import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc"; // 1. Use protectedProcedure
import { agendaItems } from "~/server/db/schema";
import { eq, and, desc } from "drizzle-orm"; // 2. Add 'and' and 'desc'

export const agendaRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({ 
      title: z.string(), 
      content: z.string().optional(),
      type: z.string(),
      repeatInterval: z.string().optional(),
      startTime: z.date().optional(),
      pinned: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.insert(agendaItems).values({
        title: input.title,
        content: input.content,
        type: input.type,
        targetDate: input.startTime ?? new Date(),
        repeatInterval: input.repeatInterval ?? "none",
        pinned: input.pinned ?? false,
        userId: ctx.session.user.id, // 3. Use actual user ID
      });
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    // 4. Filter by userId so users don't see each other's data
    return await ctx.db
      .select()
      .from(agendaItems)
      .where(eq(agendaItems.userId, ctx.session.user.id))
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

  update: protectedProcedure
    .input(z.object({ 
      id: z.string(),
      title: z.string(), 
      content: z.string().optional(),
      type: z.string(),
      repeatInterval: z.string().optional(),
      startTime: z.date().optional(),
      pinned: z.boolean().optional(),
      isCompleted: z.boolean().optional()
    }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db
        .update(agendaItems)
        .set({
          title: input.title,
          content: input.content,
          type: input.type,
          targetDate: input.startTime ?? new Date(),
          repeatInterval: input.repeatInterval ?? "none",
          pinned: input.pinned ?? false,
          isCompleted: input.isCompleted ?? false,
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