import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "~/server/better-auth";

const MAX_AUDIO_BYTES = 1_500_000;
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 8192;
const providers = {
	openai: {
		name: "OpenAI",
		url: "https://api.openai.com/v1/audio/transcriptions",
		model: "whisper-1",
	},
	venice: {
		name: "Venice AI",
		url: "https://api.venice.ai/api/v1/audio/transcriptions",
		model: "openai/whisper-large-v3",
	},
} as const;
const providerSchema = z.enum(["openai", "venice"]);
const keySchema = z.string().trim().min(1).max(512);
const responseSchema = z.object({ text: z.string() });
const responseHeaders = {
	"Cache-Control": "no-store",
	"Content-Type": "application/json",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: responseHeaders,
	});
}

export async function POST(request: Request) {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session)
		return jsonResponse({ error: "Sign in to use cloud transcription." }, 401);

	const contentLength = request.headers.get("content-length");
	if (contentLength && Number(contentLength) > MAX_REQUEST_BYTES) {
		return jsonResponse({ error: "Recording is too long." }, 413);
	}

	let form: FormData;
	try {
		const reader = request.body?.getReader();
		if (!reader) return jsonResponse({ error: "Request body is missing." }, 400);
		const chunks: Uint8Array[] = [];
		let requestSize = 0;
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			requestSize += value.byteLength;
			if (requestSize > MAX_REQUEST_BYTES) {
				await reader.cancel();
				return jsonResponse({ error: "Recording is too long." }, 413);
			}
			chunks.push(value);
		}
		const boundedRequest = new Request(request.url, {
			method: request.method,
			headers: request.headers,
			body: new Blob(chunks),
		});
		form = await boundedRequest.formData();
	} catch {
		return jsonResponse({ error: "Request must be multipart form data." }, 400);
	}

	const apiKey = keySchema.safeParse(form.get("apiKey"));
	const audio = form.get("audio");
	const providerId = providerSchema.safeParse(form.get("provider"));
	if (!apiKey.success || !providerId.success) {
		return jsonResponse(
			{
				error: "Cloud transcription requires an OpenAI or Venice AI API key.",
			},
			400,
		);
	}
	const provider = providers[providerId.data];
	if (!(audio instanceof Blob) || audio.size === 0) {
		return jsonResponse({ error: "No audio was received." }, 400);
	}
	if (audio.size > MAX_AUDIO_BYTES) {
		return jsonResponse({ error: "Recording is too long." }, 413);
	}

	const upstream = new FormData();
	upstream.set("file", new File([audio], "voice.wav", { type: "audio/wav" }));
	upstream.set("model", provider.model);
	upstream.set("response_format", "json");
	upstream.set("language", "en");
	upstream.set("temperature", "0");

	let response: Response;
	try {
		response = await fetch(provider.url, {
			method: "POST",
			headers: { Authorization: `Bearer ${apiKey.data}` },
			body: upstream,
			signal: AbortSignal.timeout(30_000),
		});
	} catch (error) {
		if (error instanceof Error && error.name === "TimeoutError") {
			return jsonResponse(
				{ error: `${provider.name} took too long. Try again.` },
				504,
			);
		}
		return jsonResponse(
			{ error: `Could not reach ${provider.name}. Try again.` },
			502,
		);
	}

	if (!response.ok) {
		return jsonResponse(
			{
				error:
					response.status === 401
						? `${provider.name} rejected this API key. Check the key and try again.`
						: response.status === 429
							? `${provider.name} rate limit or quota reached. Try again later.`
							: `${provider.name} could not transcribe this recording.`,
			},
			response.status === 401 || response.status === 429
				? response.status
				: 502,
		);
	}

	const parsed = responseSchema.safeParse(
		await response.json().catch(() => null),
	);
	if (!parsed.success) {
		return jsonResponse(
			{ error: `${provider.name} returned an unexpected response.` },
			502,
		);
	}
	return jsonResponse({ text: parsed.data.text });
}
