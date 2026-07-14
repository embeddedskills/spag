import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { agendaItems } from "~/server/db/schema";

function addMonthsPreservingDay(date: Date, monthCount: number) {
	const nextDate = new Date(date);
	const originalDay = nextDate.getDate();

	nextDate.setDate(1);
	nextDate.setMonth(nextDate.getMonth() + monthCount);

	const lastDayOfTargetMonth = new Date(
		nextDate.getFullYear(),
		nextDate.getMonth() + 1,
		0,
	).getDate();

	nextDate.setDate(Math.min(originalDay, lastDayOfTargetMonth));

	return nextDate;
}

function getNextRecurringDate(
	targetDate: Date,
	repeatInterval: string,
	now: Date,
) {
	const nextTargetDate = new Date(targetDate);

	if (repeatInterval === "daily") {
		do {
			nextTargetDate.setDate(nextTargetDate.getDate() + 1);
		} while (nextTargetDate <= now);

		return nextTargetDate;
	}

	if (repeatInterval === "weekly") {
		do {
			nextTargetDate.setDate(nextTargetDate.getDate() + 7);
		} while (nextTargetDate <= now);

		return nextTargetDate;
	}

	if (repeatInterval === "monthly") {
		do {
			const advancedDate = addMonthsPreservingDay(nextTargetDate, 1);
			nextTargetDate.setTime(advancedDate.getTime());
		} while (nextTargetDate <= now);

		return nextTargetDate;
	}

	return null;
}

export async function POST(req: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session)
		return new Response(JSON.stringify({ error: "Unauthenticated" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});

	try {
		const body = await req.json();
		const ids: string[] = body.ids || [];
		if (!ids.length)
			return new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		const now = new Date();

		// First, get the items to check for recurrence
		const items = await db
			.select()
			.from(agendaItems)
			.where(
				and(
					eq(agendaItems.userId, session.user.id),
					inArray(agendaItems.id, ids),
				),
			);

		// Mark as notified
		await db
			.update(agendaItems)
			.set({ notified: true })
			.where(
				and(
					eq(agendaItems.userId, session.user.id),
					inArray(agendaItems.id, ids),
				),
			);

		// Handle recurring items
		for (const item of items) {
			const nextTargetDate = getNextRecurringDate(
				new Date(item.targetDate),
				item.repeatInterval ?? "none",
				now,
			);

			if (nextTargetDate) {
				await db
					.update(agendaItems)
					.set({
						targetDate: nextTargetDate,
						isCompleted: false,
						notified: false,
					})
					.where(
						and(
							eq(agendaItems.id, item.id),
							eq(agendaItems.userId, session.user.id),
						),
					);
			}
		}

		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		return new Response(JSON.stringify({ error: String(err) }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
