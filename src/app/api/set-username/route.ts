import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, username } = body;
    if (!email || !username) {
      return new Response(JSON.stringify({ error: "Missing email or username" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    await db.update(user).set({ username }).where(eq(user.email, email));

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
