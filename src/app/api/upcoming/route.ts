import { auth } from "~/server/better-auth";
import { toNextJsHandler } from "better-auth/next-js";
import { headers } from "next/headers";
import { db } from "~/server/db";
import { agendaItems } from "~/server/db/schema";
import { lte, eq, and, ne } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response(JSON.stringify({ error: "Unauthenticated" }), { status: 401, headers: { "Content-Type": "application/json" } });

  const now = new Date();
  const items = await db.select().from(agendaItems).where(
    and(
      eq(agendaItems.userId, session.user.id),
      lte(agendaItems.targetDate, now),
      eq(agendaItems.notified, false),
      ne(agendaItems.type, 'note') // Exclude notes from notifications
    )
  );

  return new Response(JSON.stringify(items), { status: 200, headers: { "Content-Type": "application/json" } });
}
