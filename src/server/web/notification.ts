// src/server/services/notification.ts
import { db } from "@/server/db";
import { pushSubscriptions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { webPush } from "./notification-utils";

interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
}

export async function sendPushNotificationToUser(userId: string, payload: NotificationPayload) {
  // 1. Fetch all registered mobile/desktop devices for this specific user via Drizzle
  const devices = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (devices.length === 0) {
    console.log(`No registered push devices found for User: ${userId}`);
    return;
  }

  // 2. Loop through every device (e.g., their iPhone and their Laptop) and dispatch the message
  const pushPromises = devices.map(async (device) => {
    // Reconstruct the exact format the web-push engine expects
    const subscriptionConfig = {
      endpoint: device.endpoint,
      keys: {
        p256dh: device.p256dh,
        auth: device.auth,
      },
    };

    try {
      await webPush.sendNotification(
        subscriptionConfig,
        JSON.stringify(payload) // This JSON lands directly inside your public/sw.js listener
      );
    } catch (error: any) {
      // 3. Clean up: If a user uninstalled the PWA, Google/Apple returns a 410 Gone status code
      if (error.statusCode === 410 || error.statusCode === 404) {
        console.log(`Removing expired device endpoint for user ${userId}`);
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, device.endpoint));
      } else {
        console.error("Failed executing push delivery to device:", error);
      }
    }
  });

  // Execute all push operations concurrently
  await Promise.allSettled(pushPromises);
}
