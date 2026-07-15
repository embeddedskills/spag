// src/server/notification-utils.ts
import webPush from "web-push";
import { env } from "@/env";

// Identify your application server uniquely to Apple and Google gateways
webPush.setVapidDetails(
  "mailto:your-email@example.com", // Replace with your actual email address
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  env.VAPID_PRIVATE_KEY!
);

export { webPush };
