import { auth } from "~/server/better-auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth.handler);

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Allow-Credentials": "true",
};

export const OPTIONS = async () => {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const GET = async (req: Request) => {
	const res = await handler.GET(req as any);
	const headers = new Headers(res.headers);
	Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, String(v)));
	return new Response(res.body, { status: res.status, headers });
};

export const POST = async (req: Request) => {
	const res = await handler.POST(req as any);
	const headers = new Headers(res.headers);
	Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, String(v)));
	return new Response(res.body, { status: res.status, headers });
};
