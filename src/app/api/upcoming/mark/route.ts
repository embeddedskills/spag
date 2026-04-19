import { auth } from "~/server/better-auth";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { agendaItems } from "~/server/db/schema";
import { inArray, eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(JSON.stringify({ error: "Unauthenticated" }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const ids: string[] = body.ids || [];
    if (!ids.length) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });

    // First, get the items to check for recurrence
    const items = await db.select().from(agendaItems).where(and(
      eq(agendaItems.userId, session.user.id),
      inArray(agendaItems.id, ids)
    ));

    // Mark as notified
    await db.update(agendaItems).set({ notified: true }).where(and(eq(agendaItems.userId, session.user.id), inArray(agendaItems.id, ids)));

    // Handle recurring items
    for (const item of items) {
      if (item.repeatInterval !== 'none' && !item.isCompleted) {
        const newTargetDate = new Date(item.targetDate);
        if (item.repeatInterval === 'daily') {
          newTargetDate.setDate(newTargetDate.getDate() + 1);
        } else if (item.repeatInterval === 'weekly') {
          newTargetDate.setDate(newTargetDate.getDate() + 7);
        }
        // Create new item
        await db.insert(agendaItems).values({
          title: item.title,
          content: item.content,
          type: item.type,
          targetDate: newTargetDate,
          repeatInterval: item.repeatInterval,
          userId: item.userId,
          isCompleted: false,
          notified: false,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
