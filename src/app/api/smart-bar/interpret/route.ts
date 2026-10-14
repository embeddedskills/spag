import { z } from "zod";
import { auth } from "~/server/better-auth";
import { headers } from "next/headers";

const inputSchema = z.object({
	apiKey: z.string().trim().min(1).max(512),
	provider: z.enum(["openai", "anthropic", "xai", "venice"]).default("openai"),
	model: z.string().trim().min(1).max(128).optional(),
	text: z.string().trim().min(1).max(500),
});
const completionSchema = z.object({
	choices: z.array(z.object({
		message: z.object({ content: z.string().nullable().optional() }).optional(),
	})).optional(),
	content: z.array(z.object({
		type: z.string().optional(),
		text: z.string().optional(),
	})).optional(),
});

const responseHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const defaultModels = {
	openai: "gpt-4o-mini",
	anthropic: "claude-3-5-haiku-latest",
	xai: "grok-3-mini",
	venice: "llama-3.3-70b",
} as const;
const providerNames = {
	openai: "OpenAI",
	anthropic: "Claude",
	xai: "Grok",
	venice: "Venice AI",
} as const;
const systemPrompt =
	'Translate the user request into one concise explicit command for a personal finance and agenda app. Return JSON only: {"command":"..."}. Supported commands: "expense <amount> <description>", "budget <amount> <name> [monthly|weekly|daily]", "income <amount> <name> [monthly|weekly|biweekly|daily]", "group <name> [family|friends|work|other]", "task <title> [date/time]", "reminder <title> [date/time]", "note <title>", or "find <query>". Preserve the user intent, currency, and details. Never invent amounts, dates, names, or sharing groups. If intent or required details are unclear, return {"command":""}.';

function jsonResponse(body: { command?: string; error?: string }, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) return jsonResponse({ error: "Sign in to use AI interpretation." }, 401);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonResponse({ error: "Request body must be valid JSON." }, 400);
	}

	const input = inputSchema.safeParse(body);
	if (!input.success) {
		return jsonResponse({ error: "Enter a valid API key and a command under 500 characters." }, 400);
	}

	let response: Response;
	try {
		const model = input.data.model ?? defaultModels[input.data.provider];
		if (input.data.provider === "anthropic") {
			response = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"x-api-key": input.data.apiKey,
					"anthropic-version": "2023-06-01",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					max_tokens: 160,
					temperature: 0,
					system: systemPrompt,
					messages: [{ role: "user", content: input.data.text }],
				}),
				signal: AbortSignal.timeout(20_000),
			});
		} else {
			const endpoint = input.data.provider === "xai"
				? "https://api.x.ai/v1/chat/completions"
				: input.data.provider === "venice"
					? "https://api.venice.ai/api/v1/chat/completions"
					: "https://api.openai.com/v1/chat/completions";
			response = await fetch(endpoint, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${input.data.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					temperature: 0,
					max_tokens: 160,
					response_format: { type: "json_object" },
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: input.data.text },
					],
				}),
				signal: AbortSignal.timeout(20_000),
			});
		}
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError") {
			return jsonResponse({ error: `${providerNames[input.data.provider]} took too long to respond. Try again.` }, 504);
		}
		return jsonResponse({ error: `Could not reach ${providerNames[input.data.provider]}. Check your connection and try again.` }, 502);
	}

	if (!response.ok) {
		const message =
			response.status === 401
				? `${providerNames[input.data.provider]} rejected this API key. Check the key and try again.`
				: `${providerNames[input.data.provider]} interpretation failed (HTTP ${response.status}).`;
		return jsonResponse({ error: message }, 502);
	}

	let result: unknown;
	try {
		result = await response.json();
	} catch {
		return jsonResponse({ error: `${providerNames[input.data.provider]} returned an unreadable response.` }, 502);
	}
	const completion = completionSchema.safeParse(result);
	if (!completion.success) {
		return jsonResponse({ error: `${providerNames[input.data.provider]} returned an invalid response.` }, 502);
	}
	const content = input.data.provider === "anthropic"
		? completion.data.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("")
		: completion.data.choices?.[0]?.message?.content;
	if (!content) {
		return jsonResponse({ error: `${providerNames[input.data.provider]} returned no interpretation.` }, 502);
	}

	let command: unknown;
	try {
		command = JSON.parse(content);
	} catch {
		return jsonResponse({ error: `${providerNames[input.data.provider]} returned an invalid interpretation.` }, 502);
	}
	const interpretation = z.object({ command: z.string().max(500) }).safeParse(command);
	if (!interpretation.success) {
		return jsonResponse({ error: `${providerNames[input.data.provider]} returned an invalid command.` }, 502);
	}
	if (!interpretation.data.command.trim()) {
		return jsonResponse({ error: "The request was ambiguous. Please make it more specific." }, 422);
	}

	return jsonResponse({ command: interpretation.data.command.trim() });
}
