// src/server/notification-utils.ts
import webPush from "web-push";
import { env } from "@/env";

let vapidConfigurationError: Error | null = null;

try {
	if (!env.VAPID_PRIVATE_KEY) {
		throw new Error("VAPID_PRIVATE_KEY is not configured.");
	}
	if (!env.VAPID_SUBJECT) {
		throw new Error("VAPID_SUBJECT is not configured.");
	}
	webPush.setVapidDetails(
		env.VAPID_SUBJECT,
		env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
		env.VAPID_PRIVATE_KEY,
	);
} catch {
	vapidConfigurationError = new Error(
		"Web Push is unavailable because the VAPID settings are missing or invalid.",
	);
}

export function assertWebPushConfigured() {
	if (vapidConfigurationError) throw vapidConfigurationError;
}

export { webPush };
