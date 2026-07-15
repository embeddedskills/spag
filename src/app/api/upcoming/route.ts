import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { agendaItems } from "~/server/db/schema";
import { and, asc, eq, gte, lt, lte, ne } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(JSON.stringify({ error: "Unauthenticated" }), { status: 401, headers: { "Content-Type": "application/json" } });

  const now = new Date();
  const threeHoursFromNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  endOfToday.setDate(endOfToday.getDate() + 1);

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
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
