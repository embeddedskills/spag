/// <reference lib="webworker" />
import { env, pipeline } from "@huggingface/transformers";

type Request = { id: number; audio: Float32Array };

env.allowLocalModels = false;

const MODEL_ID = "onnx-community/whisper-base.en";
type Transcriber = (audio: Float32Array) => Promise<unknown>;
let transcriberPromise: Promise<Transcriber> | null = null;

function loadTranscriber() {
	transcriberPromise ??= (async () => {
		const options = {
			dtype: "q8" as const,
			progress_callback: (info: { status?: string; progress?: number }) => {
				if (info.status === "progress" && typeof info.progress === "number") {
					self.postMessage({ type: "progress", progress: info.progress });
				}
			},
		};
		const load = (device: "webgpu" | "wasm") =>
			pipeline("automatic-speech-recognition", MODEL_ID, {
				...options,
				device,
			}) as unknown as Promise<Transcriber>;
		try {
			return await load("wasm");
		} catch (error) {
			transcriberPromise = null;
			throw error;
		}
	})();
	return transcriberPromise;
}

self.onmessage = async (event: MessageEvent<Request>) => {
	const { id, audio } = event.data;
	try {
		const transcriber = await loadTranscriber();
		self.postMessage({ type: "status", status: "transcribing" });
		const result = (await transcriber(audio)) as { text?: string };
		self.postMessage({ type: "result", id, text: result.text ?? "" });
	} catch (error) {
		transcriberPromise = null;
		self.postMessage({
			type: "error",
			id,
			message:
				error instanceof Error ? error.message : "Voice transcription failed.",
		});
	}
};
