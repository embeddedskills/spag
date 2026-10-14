import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "~/server/better-auth";

const inputSchema = z.object({
	apiKey: z.string().trim().min(1).max(512),
	provider: z.enum(["openai", "anthropic", "xai", "venice"]),
	model: z.string().trim().min(1).max(128),
	imageBase64: z
		.string()
		.min(1)
		.max(2_000_000)
		.regex(/^\/9j\/[A-Za-z0-9+/]*={0,2}$/)
		.refine((image) => image.length % 4 === 0),
	categories: z.array(z.string().trim().min(1).max(80)).max(50),
	defaultCurrency: z.enum(["USD", "EUR", "BTC"]),
});
const completionSchema = z.object({
	choices: z
		.array(
			z.object({
				message: z
					.object({ content: z.string().nullable().optional() })
					.optional(),
			}),
		)
		.optional(),
	content: z
		.array(
			z.object({
				type: z.string().optional(),
				text: z.string().optional(),
			}),
		)
		.optional(),
});
const receiptSchema = z.object({
	description: z.string().trim().min(1).max(160),
	amount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
	currency: z.enum(["USD", "EUR", "BTC"]).nullable().optional(),
	date: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.nullable()
		.optional(),
	category: z.string().trim().max(80).nullable().optional(),
});

const responseHeaders = {
	"Cache-Control": "no-store",
	"Content-Type": "application/json",
};
const providerNames = {
	openai: "OpenAI",
	anthropic: "Claude",
	xai: "Grok",
	venice: "Venice AI",
} as const;
const receiptPrompt =
	'Read this receipt and return JSON only with keys {"description":"merchant or short receipt description","amount":"final total as a decimal string","currency":"USD, EUR, BTC, or null","date":"YYYY-MM-DD or null","category":"one exact category from the supplied list or null"}. Use the final amount charged, not subtotal, tax, tendered cash, or change. Do not guess missing or unreadable values; if the total cannot be read, return an empty amount. Choose only a currency supported by the app; use null for other currencies. Never create or infer a date that is not printed. The user will review every field before saving.';

function jsonResponse(body: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: responseHeaders,
	});
}

function isValidDate(value: string) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match?.[1] || !match[2] || !match[3]) return false;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	return (
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	);
}

async function readBoundedJson(
	request: Request,
	maxBytes: number,
): Promise<unknown> {
	const reader = request.body?.getReader();
	if (!reader) throw new Error("Request body is missing.");
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		totalBytes += value.byteLength;
		if (totalBytes > maxBytes) {
			await reader.cancel();
			throw new RangeError("Receipt upload is too large.");
		}
		chunks.push(value);
	}
	const body = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder().decode(body)) as unknown;
}

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session)
		return jsonResponse({ error: "Sign in to use AI receipt scanning." }, 401);

	const contentLength = Number(request.headers.get("content-length") ?? 0);
	if (contentLength > 2_200_000) {
		return jsonResponse(
			{ error: "Compressed receipt image is too large. Try a smaller image." },
			413,
		);
	}

	let body: unknown;
	try {
		body = await readBoundedJson(request, 2_200_000);
	} catch (error) {
		if (error instanceof RangeError) {
			return jsonResponse(
				{
					error: "Compressed receipt image is too large. Try a smaller image.",
				},
				413,
			);
		}
		return jsonResponse({ error: "Request body must be valid JSON." }, 400);
	}

	const input = inputSchema.safeParse(body);
	if (!input.success) {
		return jsonResponse(
			{
				error:
					"Enter a valid provider key and upload a compressed receipt image.",
			},
			400,
		);
	}

	const userPrompt = `${receiptPrompt}\nAvailable categories: ${JSON.stringify(input.data.categories)}.\nDefault currency if the receipt does not identify one: ${input.data.defaultCurrency}.`;
	let response: Response;
	try {
		if (input.data.provider === "anthropic") {
			response = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					"x-api-key": input.data.apiKey,
					"anthropic-version": "2023-06-01",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: input.data.model,
					max_tokens: 240,
					temperature: 0,
					messages: [
						{
							role: "user",
							content: [
								{ type: "text", text: userPrompt },
								{
									type: "image",
									source: {
										type: "base64",
										media_type: "image/jpeg",
										data: input.data.imageBase64,
									},
								},
							],
						},
					],
				}),
				signal: AbortSignal.timeout(30_000),
			});
		} else {
			const endpoint =
				input.data.provider === "xai"
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
					model: input.data.model,
					temperature: 0,
					max_tokens: 240,
					response_format: { type: "json_object" },
					messages: [
						{ role: "system", content: userPrompt },
						{
							role: "user",
							content: [
								{ type: "text", text: "Extract the receipt details." },
								{
									type: "image_url",
									image_url: {
										url: `data:image/jpeg;base64,${input.data.imageBase64}`,
									},
								},
							],
						},
					],
				}),
				signal: AbortSignal.timeout(30_000),
			});
		}
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError") {
			return jsonResponse(
				{
					error: `${providerNames[input.data.provider]} took too long to read the receipt. Try again.`,
				},
				504,
			);
		}
		return jsonResponse(
			{
				error: `Could not reach ${providerNames[input.data.provider]}. Check your connection and try again.`,
			},
			502,
		);
	}

	if (!response.ok) {
		const message =
			response.status === 401
				? `${providerNames[input.data.provider]} rejected this API key. Check the key and try again.`
				: `${providerNames[input.data.provider]} could not read this image or model. Check that the selected model supports vision (HTTP ${response.status}).`;
		return jsonResponse({ error: message }, 502);
	}

	let result: unknown;
	try {
		result = await response.json();
	} catch {
		return jsonResponse(
			{
				error: `${providerNames[input.data.provider]} returned an unreadable response.`,
			},
			502,
		);
	}
	const completion = completionSchema.safeParse(result);
	if (!completion.success) {
		return jsonResponse(
			{
				error: `${providerNames[input.data.provider]} returned an invalid response.`,
			},
			502,
		);
	}
	const content =
		input.data.provider === "anthropic"
			? completion.data.content
					?.filter((item) => item.type === "text")
					.map((item) => item.text ?? "")
					.join("")
			: completion.data.choices?.[0]?.message?.content;
	if (!content) {
		return jsonResponse(
			{
				error: `${providerNames[input.data.provider]} returned no receipt details.`,
			},
			502,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch {
		return jsonResponse(
			{
				error: `${providerNames[input.data.provider]} returned unreadable receipt details.`,
			},
			502,
		);
	}
	const receipt = receiptSchema.safeParse(parsed);
	if (
		!receipt.success ||
		!receipt.data.amount ||
		Number(receipt.data.amount) <= 0 ||
		Number(receipt.data.amount) > 99_999_999.99 ||
		(receipt.data.date && !isValidDate(receipt.data.date))
	) {
		return jsonResponse(
			{
				error:
					"Could not confidently read the receipt total. Try OCR or enter the expense manually.",
			},
			422,
		);
	}
	const category =
		input.data.categories.find(
			(item) => item.toLowerCase() === receipt.data.category?.toLowerCase(),
		) ??
		input.data.categories[0] ??
		"Other";

	return jsonResponse({
		description: receipt.data.description,
		amount: Number(receipt.data.amount).toFixed(2),
		currency: receipt.data.currency ?? input.data.defaultCurrency,
		date: receipt.data.date ?? null,
		category,
	});
}
