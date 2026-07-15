// src/server/api/routers/notification.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { pushSubscriptions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { sendPushNotificationToUser } from "~/server/web/notification";

export const notificationRouter = createTRPCRouter({
  saveSubscription: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Check if this exact device endpoint already exists
      const existing = await ctx.db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, input.endpoint))
        .limit(1);

      if (existing[0]) {
        return { success: true, message: "Subscription already synchronized." };
      }

      // 2. If it's a new device, insert it into PostgreSQL
      await ctx.db.insert(pushSubscriptions).values({
        userId: ctx.session.user.id, // Linked to the logged-in user session
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      });

      return { success: true, message: "Device registered for pushes successfully!" };
    }),

    sendTestNotification: protectedProcedure.mutation(async ({ ctx }) => {
    await   sendPushNotificationToUser(ctx.session.user.id, {
        title: "🔔 Agenda Sync Test",
        body: "Your T3 background service worker is fully operational!",
        url: "/agenda", // Deep links the user straight to their agenda page when tapped
    });

    return { success: true };
    }),
});
