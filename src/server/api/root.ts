import { agendaRouter } from "~/server/api/routers/agenda";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { householdRouter } from "~/server/api/routers/household";
import { postRouter } from "~/server/api/routers/post";
import { groupRouter } from "~/server/api/routers/group";
import { spendingRouter } from "./routers/spending";
import { notificationRouter } from "./routers/notification";
import { budgetRouter } from "./routers/budget";
import { encryptionRouter } from "~/server/api/routers/encryption";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  spending: spendingRouter,
  household: householdRouter,
  group: groupRouter,
  agenda: agendaRouter,
  post: postRouter,
  notification: notificationRouter,
  budget: budgetRouter,
  encryption: encryptionRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);