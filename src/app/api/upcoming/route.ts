import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { agendaItems, agendaOccurrences } from "~/server/db/schema";
import { and, asc, eq, gte, lt, lte, ne, inArray } from "drizzle-orm";
import { getOccurrenceDates } from "~/server/agenda/schedule";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(JSON.stringify({ error: "Unauthenticated" }), { status: 401, headers: { "Content-Type": "application/json" } });

  const now = new Date();
  const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  endOfToday.setDate(endOfToday.getDate() + 1);

  const scheduledItems = await db
    .select({
      id: agendaItems.id,
      type: agendaItems.type,
      isCompleted: agendaItems.isCompleted,
      targetDate: agendaItems.targetDate,
      repeatInterval: agendaItems.repeatInterval,
      scheduleMode: agendaItems.scheduleMode,
      scheduleTimes: agendaItems.scheduleTimes,
      intervalMinutes: agendaItems.intervalMinutes,
      durationMode: agendaItems.durationMode,
      durationDays: agendaItems.durationDays,
      endDate: agendaItems.endDate,
    })
    .from(agendaItems)
    .where(and(
      eq(agendaItems.userId, session.user.id),
      eq(agendaItems.type, "reminder"),
      ne(agendaItems.scheduleMode, "legacy"),
      eq(agendaItems.isCompleted, false),
      lte(agendaItems.targetDate, threeHoursFromNow),
    ));
  const occurrenceFrom = new Date(now.getTime() - 5 * 60 * 1000);
  const occurrenceRows = scheduledItems.flatMap((item) =>
    getOccurrenceDates(item, occurrenceFrom, threeHoursFromNow).map((scheduledAt) => ({
      agendaItemId: item.id,
      scheduledAt,
    })),
  );
  for (let offset = 0; offset < occurrenceRows.length; offset += 500) {
    await db
      .insert(agendaOccurrences)
      .values(occurrenceRows.slice(offset, offset + 500))
      .onConflictDoNothing();
  }

  const scheduledOccurrences = scheduledItems.length === 0
    ? []
    : await db
      .select({
        occurrenceId: agendaOccurrences.id,
        id: agendaItems.id,
        title: agendaItems.title,
        content: agendaItems.content,
        targetDate: agendaOccurrences.scheduledAt,
        type: agendaItems.type,
        sticky: agendaItems.sticky,
        category: agendaItems.category,
      })
      .from(agendaOccurrences)
      .innerJoin(agendaItems, eq(agendaItems.id, agendaOccurrences.agendaItemId))
      .where(and(
        inArray(agendaOccurrences.agendaItemId, scheduledItems.map((item) => item.id)),
        eq(agendaOccurrences.isCompleted, false),
        eq(agendaOccurrences.notified, false),
        gte(agendaOccurrences.scheduledAt, occurrenceFrom),
        lte(agendaOccurrences.scheduledAt, threeHoursFromNow),
      ))
      .orderBy(asc(agendaOccurrences.scheduledAt));

  const agenda = await db
    .select({
      id: agendaItems.id,
      title: agendaItems.title,
      content: agendaItems.content,
      targetDate: agendaItems.targetDate,
      type: agendaItems.type,
      sticky: agendaItems.sticky,
      category: agendaItems.category,
    })
    .from(agendaItems)
    .where(
      and(
        eq(agendaItems.userId, session.user.id),
        ne(agendaItems.type, "note"),
        eq(agendaItems.isCompleted, false),
        eq(agendaItems.notified, false),
        lte(agendaItems.targetDate, threeHoursFromNow),
      ),
    )
    .orderBy(asc(agendaItems.targetDate));

  const pendingTodayItems = await db
    .select({
      id: agendaItems.id,
      title: agendaItems.title,
      content: agendaItems.content,
      targetDate: agendaItems.targetDate,
      type: agendaItems.type,
      sticky: agendaItems.sticky,
      category: agendaItems.category,
    })
    .from(agendaItems)
    .where(
      and(
        eq(agendaItems.userId, session.user.id),
        ne(agendaItems.type, "note"),
        eq(agendaItems.isCompleted, false),
        gte(agendaItems.targetDate, now),
        lt(agendaItems.targetDate, endOfToday),
      ),
    )
    .orderBy(asc(agendaItems.targetDate));

  const expiredItems = await db
    .select({
      id: agendaItems.id,
      title: agendaItems.title,
      content: agendaItems.content,
      targetDate: agendaItems.targetDate,
      type: agendaItems.type,
      sticky: agendaItems.sticky,
      category: agendaItems.category,
    })
    .from(agendaItems)
    .where(
      and(
        eq(agendaItems.userId, session.user.id),
        ne(agendaItems.type, "note"),
        eq(agendaItems.isCompleted, false),
        eq(agendaItems.notified, false),
        lt(agendaItems.targetDate, now),
      ),
    )
    .orderBy(asc(agendaItems.targetDate));

  return new Response(
    JSON.stringify({
      serverTime: now.toISOString(),
      dueTodayCount: pendingTodayItems.length,
      pendingTodayItems,
      expiredItems,
      agenda,
      scheduledOccurrences,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
