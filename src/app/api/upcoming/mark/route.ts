import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { agendaItems, agendaOccurrences } from "~/server/db/schema";
import { getNextMonthlyOccurrence } from "~/server/agenda/schedule";

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
		return getNextMonthlyOccurrence(targetDate, now);
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
		const occurrenceIds: string[] = body.occurrenceIds || [];
		if (occurrenceIds.length) {
			const ownedOccurrences = await db
				.select({ id: agendaOccurrences.id })
				.from(agendaOccurrences)
				.innerJoin(agendaItems, eq(agendaItems.id, agendaOccurrences.agendaItemId))
				.where(and(
					eq(agendaItems.userId, session.user.id),
					inArray(agendaOccurrences.id, occurrenceIds),
				));
			await db
				.update(agendaOccurrences)
				.set({ notified: true })
				.where(inArray(agendaOccurrences.id, ownedOccurrences.map((occurrence) => occurrence.id)));
		}
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
