import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "~/server/better-auth";
import { db } from "~/server/db";
import { agendaItems, agendaOccurrences } from "~/server/db/schema";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await request.json() as { occurrenceId?: string };
  if (!body.occurrenceId) return Response.json({ error: "Occurrence is required" }, { status: 400 });

  const ownedOccurrence = await db
    .select({ id: agendaOccurrences.id })
    .from(agendaOccurrences)
    .innerJoin(agendaItems, eq(agendaItems.id, agendaOccurrences.agendaItemId))
    .where(and(eq(agendaOccurrences.id, body.occurrenceId), eq(agendaItems.userId, session.user.id)))
    .limit(1);

  if (!ownedOccurrence[0]) return Response.json({ error: "Occurrence not found" }, { status: 404 });

  await db
    .update(agendaOccurrences)
    .set({ isCompleted: true, completedAt: new Date() })
    .where(eq(agendaOccurrences.id, body.occurrenceId));

  return Response.json({ ok: true });
}
