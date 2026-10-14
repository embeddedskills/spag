import type { SmartCurrency } from "~/lib/spending-nlp";

export const MAX_RECEIPT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_COMPRESSED_RECEIPT_BYTES = 1_500_000;
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ReceiptDraft = {
	description: string;
	amount: string;
	currency: SmartCurrency;
	category: string;
	date: string;
};

export async function getReceiptMimeType(
	file: File,
): Promise<(typeof ACCEPTED_MIME_TYPES)[number]> {
	if (file.size > MAX_RECEIPT_FILE_BYTES) {
		throw new Error("Choose a receipt image smaller than 10 MB.");
	}
	if (file.size === 0) throw new Error("The selected receipt image is empty.");

	const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	const isPng =
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47;
	const isWebp =
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50;

	if (isJpeg) return "image/jpeg";
	if (isPng) return "image/png";
	if (isWebp) return "image/webp";
	throw new Error("Use a JPEG, PNG, or WebP receipt image.");
}

function canvasToJpeg(
	canvas: HTMLCanvasElement,
	quality: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error("Could not compress the receipt image."));
			},
			"image/jpeg",
			quality,
		);
	});
}

export async function compressReceiptImage(file: File): Promise<Blob> {
	await getReceiptMimeType(file);
	const bitmap = await createImageBitmap(file);
	try {
		let scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
		for (let attempt = 0; attempt < 7; attempt += 1) {
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.round(bitmap.width * scale));
			canvas.height = Math.max(1, Math.round(bitmap.height * scale));
			const context = canvas.getContext("2d");
			if (!context)
				throw new Error("Image compression is not available in this browser.");
			context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

			for (const quality of [0.88, 0.78, 0.68]) {
				const compressed = await canvasToJpeg(canvas, quality);
				if (compressed.size <= MAX_COMPRESSED_RECEIPT_BYTES) return compressed;
			}
			scale *= 0.8;
		}
		throw new Error(
			"Could not compress this receipt image to a safe upload size.",
		);
	} finally {
		bitmap.close();
	}
}

export async function blobToBase64(blob: Blob): Promise<string> {
	const dataUrl = await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result !== "string") {
				reject(new Error("Could not prepare the compressed receipt image."));
				return;
			}
			resolve(reader.result);
		};
		reader.onerror = () =>
			reject(new Error("Could not read the compressed receipt image."));
		reader.readAsDataURL(blob);
	});
	return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function normalizeMoney(value: string) {
	const compact = value.replace(/\s/g, "");
	if (compact.includes(",") && compact.includes(".")) {
		return compact.lastIndexOf(",") > compact.lastIndexOf(".")
			? compact.replace(/\./g, "").replace(",", ".")
			: compact.replace(/,/g, "");
	}
	if (compact.includes(",")) {
		const parts = compact.split(",");
		if (parts.length === 2 && (parts[1]?.length ?? 0) <= 2) {
			return `${parts[0]}.${parts[1]}`;
		}
		return compact.replace(/,/g, "");
	}
	return compact;
}

function extractAmount(
	line: string,
): { amount: string; currency: SmartCurrency | null } | null {
	const amountPattern =
		/([$€₿]|USD|EUR|BTC)?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)\s*([$€₿]|USD|EUR|BTC)?/gi;
	let lastMatch: { amount: string; currency: SmartCurrency | null } | null =
		null;
	while (true) {
		const result = amountPattern.exec(line);
		if (!result) break;
		const amount = normalizeMoney(result[2] ?? "");
		if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0)
			continue;
		const token = `${result[1] ?? ""}${result[3] ?? ""}`.toUpperCase();
		const currency =
			token.includes("€") || token.includes("EUR")
				? "EUR"
				: token.includes("₿") || token.includes("BTC")
					? "BTC"
					: token.includes("$") || token.includes("USD")
						? "USD"
						: null;
		lastMatch = { amount: Number(amount).toFixed(2), currency };
	}
	return lastMatch;
}

function getReceiptDate(text: string, now: Date): string {
	const isoDate = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
	if (isoDate?.[1] && isoDate[2] && isoDate[3]) {
		const date = new Date(
			Number(isoDate[1]),
			Number(isoDate[2]) - 1,
			Number(isoDate[3]),
		);
		if (
			date.getFullYear() === Number(isoDate[1]) &&
			date.getMonth() === Number(isoDate[2]) - 1 &&
			date.getDate() === Number(isoDate[3])
		) {
			return `${isoDate[1]}-${isoDate[2].padStart(2, "0")}-${isoDate[3].padStart(2, "0")}`;
		}
	}

	const localDate = /\b(\d{1,2})[/. -](\d{1,2})[/. -](20\d{2}|\d{2})\b/.exec(
		text,
	);
	if (localDate?.[1] && localDate[2] && localDate[3]) {
		const month = Number(localDate[1]);
		const day = Number(localDate[2]);
		const yearValue = Number(localDate[3]);
		const year = yearValue < 100 ? 2000 + yearValue : yearValue;
		const date = new Date(year, month - 1, day);
		if (
			date.getFullYear() === year &&
			date.getMonth() === month - 1 &&
			date.getDate() === day
		) {
			return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		}
	}

	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function parseReceiptText(
	text: string,
	categories: string[],
	defaultCurrency: SmartCurrency,
	now = new Date(),
): ReceiptDraft {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean);
	const totalLines = lines
		.map((line, index) => ({ line, index, amount: extractAmount(line) }))
		.filter(
			(entry) =>
				entry.amount &&
				/\b(grand\s+total|total\s+due|amount\s+due|balance\s+due|total|paid)\b/i.test(
					entry.line,
				) &&
				!/\b(subtotal|tax|change)\b/i.test(entry.line),
		);
	const fallbackLines = lines
		.map((line, index) => ({ line, index, amount: extractAmount(line) }))
		.filter(
			(entry) =>
				entry.amount &&
				(/[.,]\d{2}\b/.test(entry.line) ||
					/[$€₿]|\b(?:USD|EUR|BTC)\b/i.test(entry.line)),
		);
	const selected = (totalLines.length > 0 ? totalLines : fallbackLines).sort(
		(left, right) => {
			const leftPriority =
				/\b(grand\s+total|total\s+due|amount\s+due|balance\s+due)\b/i.test(
					left.line,
				)
					? 1
					: 0;
			const rightPriority =
				/\b(grand\s+total|total\s+due|amount\s+due|balance\s+due)\b/i.test(
					right.line,
				)
					? 1
					: 0;
			return rightPriority - leftPriority || right.index - left.index;
		},
	)[0];
	if (!selected?.amount || Number(selected.amount.amount) > 99_999_999.99) {
		throw new Error(
			"Could not find the receipt total. Try another image or enter the expense manually.",
		);
	}

	const description =
		lines.find(
			(line) =>
				line.length >= 2 &&
				!/\b(receipt|invoice|tax|subtotal|total|amount due|balance due|cashier|transaction|thank you|www\.|http)\b/i.test(
					line,
				) &&
				!/\b\d{1,2}[/. -]\d{1,2}[/. -]\d{2,4}\b/.test(line) &&
				!/^[\d\s\-+()#.]+$/.test(line),
		) ?? "Receipt expense";
	const categoryText = `${description} ${lines.join(" ")}`;
	const categoryHints = [
		{
			category: /coffee|cafe|espresso|latte|tea|bakery/i,
			hints: ["coffee", "cafe", "food", "drink"],
		},
		{
			category: /restaurant|dining|food|meal|burger|pizza|sandwich/i,
			hints: ["dining", "food", "fast food"],
		},
		{ category: /grocery|market|supermarket/i, hints: ["grocer", "food"] },
		{
			category: /gas|fuel|petrol|parking|transit|bus|train|taxi/i,
			hints: ["transport", "travel"],
		},
		{ category: /pharmacy|medical|clinic|health/i, hints: ["health"] },
		{ category: /hotel|airline|flight|travel/i, hints: ["travel"] },
	];
	const hintedCategory = categoryHints.find((hint) =>
		hint.category.test(categoryText),
	);
	const category = hintedCategory
		? categories.find((item) =>
				hintedCategory.hints.some((hint) => item.toLowerCase().includes(hint)),
			)
		: undefined;

	return {
		description: description.slice(0, 160),
		amount: selected.amount.amount,
		currency: selected.amount.currency ?? defaultCurrency,
		category: category ?? categories[0] ?? "Other",
		date: getReceiptDate(text, now),
	};
}

export async function recognizeReceiptText(
	file: File,
	onProgress?: (status: string, progress: number) => void,
): Promise<string> {
	const { createWorker } = await import("tesseract.js");
	const worker = await createWorker("eng", undefined, {
		logger: ({ status, progress }) => onProgress?.(status, progress),
	});
	try {
		const result = await worker.recognize(file);
		if (!result.data.text.trim()) {
			throw new Error(
				"Could not read text from this receipt. Try a clearer, well-lit image.",
			);
		}
		return result.data.text;
	} finally {
		await worker.terminate();
	}
}
