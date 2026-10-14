export const MAX_RECORDING_SECONDS = 30;
const TARGET_SAMPLE_RATE = 16_000;

export function isVoiceRecordingSupported() {
	return (
		typeof window !== "undefined" &&
		typeof MediaRecorder !== "undefined" &&
		!!navigator.mediaDevices?.getUserMedia
	);
}

export type VoiceRecorder = {
	stop: () => Promise<Float32Array>;
	cancel: () => void;
};

/** Starts recording the microphone; `stop` resolves to 16 kHz mono PCM. */
export async function startVoiceRecording(): Promise<VoiceRecorder> {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
	});
	const recorder = new MediaRecorder(stream);
	const chunks: Blob[] = [];
	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) chunks.push(event.data);
	};
	const releaseMic = () => {
		for (const track of stream.getTracks()) track.stop();
	};
	recorder.start();

	return {
		cancel: () => {
			recorder.ondataavailable = null;
			if (recorder.state !== "inactive") recorder.stop();
			releaseMic();
		},
		stop: () =>
			new Promise<Float32Array>((resolve, reject) => {
				recorder.onstop = () => {
					releaseMic();
					decodeToMono16k(new Blob(chunks, { type: recorder.mimeType })).then(
						resolve,
						reject,
					);
				};
				if (recorder.state === "inactive") recorder.onstop(new Event("stop"));
				else recorder.stop();
			}),
	};
}

async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
	const context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
	try {
		const buffer = await context.decodeAudioData(await blob.arrayBuffer());
		const channels = buffer.numberOfChannels;
		const mono = new Float32Array(buffer.length);
		for (let channel = 0; channel < channels; channel++) {
			const data = buffer.getChannelData(channel);
			for (let index = 0; index < data.length; index++) {
				mono[index] = (mono[index] ?? 0) + (data[index] ?? 0) / channels;
			}
		}
		return mono;
	} finally {
		void context.close();
	}
}

export function pcmToWavBlob(samples: Float32Array): Blob {
	const buffer = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(buffer);
	const write = (offset: number, text: string) => {
		for (let index = 0; index < text.length; index++) {
			view.setUint8(offset + index, text.charCodeAt(index));
		}
	};
	write(0, "RIFF");
	view.setUint32(4, 36 + samples.length * 2, true);
	write(8, "WAVEfmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, TARGET_SAMPLE_RATE, true);
	view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	write(36, "data");
	view.setUint32(40, samples.length * 2, true);
	for (let index = 0; index < samples.length; index++) {
		const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
		view.setInt16(
			44 + index * 2,
			sample < 0 ? sample * 0x8000 : sample * 0x7fff,
			true,
		);
	}
	return new Blob([buffer], { type: "audio/wav" });
}

export function hasSpeech(samples: Float32Array) {
	if (samples.length < TARGET_SAMPLE_RATE * 0.3) return false;
	let sum = 0;
	for (const sample of samples) sum += sample * sample;
	return Math.sqrt(sum / samples.length) > 0.003;
}

type WorkerMessage =
	| { type: "progress"; progress: number }
	| { type: "status"; status: "transcribing" }
	| { type: "result"; id: number; text: string }
	| { type: "error"; id: number; message: string };

let worker: Worker | null = null;
let nextRequestId = 1;

export function transcribeLocally(
	samples: Float32Array,
	onStatus: (status: string) => void,
): Promise<string> {
	worker ??= new Worker(new URL("./voice-worker.ts", import.meta.url), {
		type: "module",
	});
	const activeWorker = worker;
	const id = nextRequestId++;
	onStatus("Loading voice model…");
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			activeWorker.removeEventListener("message", handleMessage);
			activeWorker.removeEventListener("error", handleError);
		};
		const handleMessage = (event: MessageEvent<WorkerMessage>) => {
			const data = event.data;
			if (data.type === "progress") {
				onStatus(`Downloading voice model… ${Math.round(data.progress)}%`);
			} else if (data.type === "status") {
				onStatus("Transcribing…");
			} else if (data.id === id) {
				cleanup();
				if (data.type === "result") resolve(data.text);
				else reject(new Error(data.message));
			}
		};
		const handleError = () => {
			cleanup();
			worker?.terminate();
			worker = null;
			reject(new Error("The voice model could not be loaded."));
		};
		activeWorker.addEventListener("message", handleMessage);
		activeWorker.addEventListener("error", handleError);
		activeWorker.postMessage({ id, audio: samples });
	});
}

const SMALL_NUMBERS: Record<string, number> = {
	zero: 0,
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	thirteen: 13,
	fourteen: 14,
	fifteen: 15,
	sixteen: 16,
	seventeen: 17,
	eighteen: 18,
	nineteen: 19,
};
const TENS: Record<string, number> = {
	twenty: 20,
	thirty: 30,
	forty: 40,
	fifty: 50,
	sixty: 60,
	seventy: 70,
	eighty: 80,
	ninety: 90,
};
const NUMBER_TOKEN = `(?:${[...Object.keys(SMALL_NUMBERS), ...Object.keys(TENS), "hundred", "thousand", "and"].join("|")})`;
const NUMBER_PHRASE = `${NUMBER_TOKEN}(?:[\\s-]+${NUMBER_TOKEN})*`;
const CURRENCY_WORD = "(?:dollars?|bucks?|euros?|usd|eur)";
const AMOUNT_BEFORE_CURRENCY = new RegExp(
	`\\b(${NUMBER_PHRASE})\\s+(?=${CURRENCY_WORD}\\b)`,
	"gi",
);
const AMOUNT_AFTER_COMMAND = new RegExp(
	`^((?:(?:add|create|new|log|track)\\s+)?(?:(?:expense|income|budget)\\s+)?)(${NUMBER_PHRASE})(?=\\s)`,
	"i",
);

function wordsToNumber(phrase: string): number | null {
	let total = 0;
	let current = 0;
	let hasNumber = false;
	for (const word of phrase.toLowerCase().split(/[\s-]+/)) {
		if (word === "and") continue;
		hasNumber = true;
		if (word in SMALL_NUMBERS) current += SMALL_NUMBERS[word] as number;
		else if (word in TENS) current += TENS[word] as number;
		else if (word === "hundred") current = (current || 1) * 100;
		else if (word === "thousand") {
			total += (current || 1) * 1000;
			current = 0;
		} else return null;
	}
	return hasNumber ? total + current : null;
}

/** Turns a spoken transcript into text the Smart Bar parser understands. */
export function normalizeTranscript(raw: string): string {
	let text = raw
		.replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[.!?]+$/, "");
	// Spell numbers out only where they are the amount, so notes keep their words.
	const toDigits = (phrase: string) => {
		const value = wordsToNumber(phrase);
		return value === null ? phrase : String(value);
	};
	text = text
		.replace(
			AMOUNT_BEFORE_CURRENCY,
			(_match, phrase: string) => `${toDigits(phrase)} `,
		)
		.replace(
			AMOUNT_AFTER_COMMAND,
			(_match, prefix: string, phrase: string) =>
				`${prefix}${toDigits(phrase)}`,
		);
	text = text
		.replace(/(\d)\s+(?:dollars?|bucks?)\b/gi, "$1 USD")
		.replace(/(\d)\s+euros?\b/gi, "$1 EUR")
		.replace(/(\d),(?=\d{3}\b)/g, "$1");
	return text;
}
