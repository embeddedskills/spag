"use client";

import {
	Camera,
	Loader2,
	Mic,
	Search,
	Sparkles,
	Square,
	Undo2,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useEncryptionVault } from "~/components/auth/encryption-vault-provider";
import { DateInputUs } from "~/components/ui/date-input-us";
import {
	decryptPayload,
	type EncryptedPayload,
	encryptPayload,
	type RecipientPublicKey,
} from "~/lib/e2ee";
import {
	blobToBase64,
	compressReceiptImage,
	getReceiptMimeType,
	parseReceiptText,
	type ReceiptDraft,
	recognizeReceiptText,
} from "~/lib/receipt";
import {
	parseSmartBarCommand,
	type SmartBarSearchDraft,
} from "~/lib/smart-bar-nlp";
import type { SmartCurrency } from "~/lib/spending-nlp";
import {
	hasSpeech,
	isVoiceRecordingSupported,
	MAX_RECORDING_SECONDS,
	normalizeTranscript,
	pcmToWavBlob,
	startVoiceRecording,
	transcribeLocally,
	type VoiceRecorder,
} from "~/lib/voice";
import { api } from "~/trpc/react";

type LastAction =
	| { kind: "expense"; id: string; summary: string }
	| { kind: "income"; id: string; summary: string }
	| { kind: "budget"; id: string; summary: string }
	| { kind: "group"; summary: string }
	| { kind: "agenda"; id: string; summary: string };

type SearchResult = {
	id: string;
	kind: "expense" | "agenda";
	title: string;
	details: string;
	preview: string;
	date: Date;
	href: string;
};

type ReceiptExpenseDraft = ReceiptDraft;

const AI_PROVIDERS = [
	{
		id: "openai",
		name: "OpenAI",
		model: "gpt-4o-mini",
		keyPlaceholder: "sk-...",
	},
	{
		id: "anthropic",
		name: "Claude",
		model: "claude-3-5-haiku-latest",
		keyPlaceholder: "sk-ant-...",
	},
	{ id: "xai", name: "Grok", model: "grok-3-mini", keyPlaceholder: "xai-..." },
	{
		id: "venice",
		name: "Venice AI",
		model: "mistral-small-3-2-24b-instruct",
		keyPlaceholder: "Venice API key",
	},
] as const;

type AiProvider = (typeof AI_PROVIDERS)[number]["id"];

function getStoredDisplayCurrency(): "USD" | "EUR" | "BTC" {
	if (typeof window === "undefined") return "USD";
	const value = window.localStorage.getItem("spag-spending-display-currency");
	return value === "EUR" || value === "BTC" ? value : "USD";
}

function formatAmount(amount: string, currency: string) {
	const symbol = currency === "EUR" ? "€" : currency === "BTC" ? "₿" : "$";
	return `${symbol}${amount}`;
}

function getLocalDateInputValue(date = new Date()) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function isSmartCurrency(value: string): value is SmartCurrency {
	return value === "USD" || value === "EUR" || value === "BTC";
}

function isValidDateInput(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	if (!year || !month || !day) return false;
	const date = new Date(year, month - 1, day);
	return (
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	);
}

export default function SmartBar() {
	const { keys: encryptionKeys, privateKey } = useEncryptionVault();
	const router = useRouter();
	const utils = api.useUtils();
	const inputRef = useRef<HTMLInputElement>(null);
	const receiptInputRef = useRef<HTMLInputElement>(null);
	const recorderRef = useRef<VoiceRecorder | null>(null);
	const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const [text, setText] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [message, setMessage] = useState("");
	const [lastAction, setLastAction] = useState<LastAction | null>(null);
	const [searchResults, setSearchResults] = useState<SearchResult[] | null>(
		null,
	);
	const [searchResultCount, setSearchResultCount] = useState(0);
	const [selectedResult, setSelectedResult] = useState<SearchResult | null>(
		null,
	);
	const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
	const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
	const [aiModel, setAiModel] = useState("gpt-4o-mini");
	const [aiApiKeys, setAiApiKeys] = useState<
		Partial<Record<AiProvider, string>>
	>({});
	const aiApiKey = aiApiKeys[aiProvider] ?? "";
	const setAiApiKey = (value: string) =>
		setAiApiKeys((keys) => ({ ...keys, [aiProvider]: value }));
	const [useAiVisionForReceipts, setUseAiVisionForReceipts] = useState(false);
	const [useCloudVoice, setUseCloudVoice] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [isTranscribing, setIsTranscribing] = useState(false);
	const [voiceStatus, setVoiceStatus] = useState("");
	const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
	const [receiptStatus, setReceiptStatus] = useState("");
	const [receiptDraft, setReceiptDraft] = useState<ReceiptExpenseDraft | null>(
		null,
	);

	const { data: sharedGroups = [] } = api.group.listMine.useQuery();
	const { data: categorySettings } = api.spending.categories.useQuery();
	const activeGroups = sharedGroups.filter(
		(group) => group.memberStatus === "active",
	);

	const addExpense = api.spending.add.useMutation();
	const deleteExpense = api.spending.delete.useMutation();
	const addIncome = api.budget.addIncome.useMutation();
	const deleteIncome = api.budget.deleteIncome.useMutation();
	const addBudget = api.budget.create.useMutation();
	const deleteBudget = api.budget.delete.useMutation();
	const createGroup = api.group.create.useMutation();
	const addAgendaItem = api.agenda.create.useMutation();
	const deleteAgendaItem = api.agenda.delete.useMutation();

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const isTyping =
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.isContentEditable;
			if (!isTyping && event.key === "/") {
				event.preventDefault();
				inputRef.current?.focus();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		if (!selectedResult) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setSelectedResult(null);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [selectedResult]);

	// Personal expenses/income are shared with the whole household by default, matching the Spending/Budgets pages.
	const getFinanceRecipients = async (
		groupId: string | null,
	): Promise<RecipientPublicKey[]> => {
		const members = groupId
			? await utils.encryption.getGroupRecipients.fetch({ groupId })
			: await utils.encryption.getHouseholdRecipients.fetch();
		return members.map((member) => {
			if (member.userId === encryptionKeys.userId) {
				return { userId: member.userId, key: encryptionKeys.publicKey };
			}
			if (!member.publicKey) {
				throw new Error(
					"Every household or group member must set up encryption before sharing this item.",
				);
			}
			return { userId: member.userId, key: member.publicKey };
		});
	};

	const handleReceiptFile = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = "";
		if (!file) return;

		setReceiptDraft(null);
		setMessage("");
		setReceiptStatus("");
		setIsProcessingReceipt(true);
		try {
			await getReceiptMimeType(file);
			if (useAiVisionForReceipts && aiApiKey.trim()) {
				setReceiptStatus("Compressing receipt image…");
				const compressedImage = await compressReceiptImage(file);
				const imageBase64 = await blobToBase64(compressedImage);
				setReceiptStatus(
					"Sending compressed image to the selected AI provider…",
				);
				const response = await fetch("/api/smart-bar/receipt", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						apiKey: aiApiKey.trim(),
						provider: aiProvider,
						model: aiModel.trim(),
						imageBase64,
						categories: categorySettings?.personal ?? ["Other"],
						defaultCurrency: getStoredDisplayCurrency(),
					}),
					signal: AbortSignal.timeout(35_000),
				});
				const result: unknown = await response.json();
				const resultObject =
					typeof result === "object" && result !== null ? result : null;
				if (!response.ok) {
					const errorMessage =
						resultObject &&
						"error" in resultObject &&
						typeof resultObject.error === "string"
							? resultObject.error
							: "AI receipt scanning failed.";
					throw new Error(errorMessage);
				}
				if (
					!resultObject ||
					!("description" in resultObject) ||
					typeof resultObject.description !== "string" ||
					!("amount" in resultObject) ||
					typeof resultObject.amount !== "string"
				) {
					throw new Error(
						"The AI provider returned incomplete receipt details.",
					);
				}
				const currency =
					"currency" in resultObject &&
					(resultObject.currency === "USD" ||
						resultObject.currency === "EUR" ||
						resultObject.currency === "BTC")
						? resultObject.currency
						: getStoredDisplayCurrency();
				const categories = categorySettings?.personal ?? ["Other"];
				const category =
					"category" in resultObject &&
					typeof resultObject.category === "string" &&
					categories.includes(resultObject.category)
						? resultObject.category
						: (categories[0] ?? "Other");
				const date =
					"date" in resultObject &&
					typeof resultObject.date === "string" &&
					isValidDateInput(resultObject.date)
						? resultObject.date
						: getLocalDateInputValue();
				setReceiptDraft({
					description: resultObject.description,
					amount: resultObject.amount,
					currency,
					category,
					date,
				});
				setMessage(
					"Receipt scanned with AI. Review every field before saving.",
				);
			} else {
				setReceiptStatus(
					"Reading receipt on this device. First use may download OCR language data…",
				);
				const text = await recognizeReceiptText(file, (status, progress) => {
					const percentage = Number.isFinite(progress)
						? ` ${Math.round(progress * 100)}%`
						: "";
					setReceiptStatus(`${status}${percentage}`);
				});
				const draft = parseReceiptText(
					text,
					categorySettings?.personal ?? ["Other"],
					getStoredDisplayCurrency(),
				);
				setReceiptDraft(draft);
				setMessage(
					"Receipt read on this device. Review every field before saving.",
				);
			}
		} catch (error) {
			setMessage(
				error instanceof Error ? error.message : "Unable to read this receipt.",
			);
		} finally {
			setIsProcessingReceipt(false);
			setReceiptStatus("");
		}
	};

	const saveReceiptExpense = async () => {
		if (!receiptDraft) return;
		const amount = Number(receiptDraft.amount);
		if (!Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99) {
			setMessage("Enter a valid receipt total before saving.");
			return;
		}
		const [year, month, day] = receiptDraft.date.split("-").map(Number);
		if (!year || !month || !day) {
			setMessage("Choose a valid receipt date before saving.");
			return;
		}
		const createdAt = new Date(year, month - 1, day, 12);
		if (
			createdAt.getFullYear() !== year ||
			createdAt.getMonth() !== month - 1 ||
			createdAt.getDate() !== day
		) {
			setMessage("Choose a valid receipt date before saving.");
			return;
		}

		setIsSubmitting(true);
		setMessage("");
		try {
			const id = crypto.randomUUID();
			const recipients = await getFinanceRecipients(null);
			const encryptedPayload = await encryptPayload(
				{ description: receiptDraft.description.trim(), notes: "" },
				`expense:${id}:text:v1`,
				recipients,
			);
			await addExpense.mutateAsync({
				id,
				encryptedPayload,
				amount: amount.toFixed(2),
				category: receiptDraft.category,
				group: "personal",
				currency: receiptDraft.currency,
				createdAt,
				expenseType: "one-off",
				recurrenceFrequency: "none",
				visibility: "personal",
			});
			await utils.spending.getAll.invalidate();
			setLastAction({
				kind: "expense",
				id,
				summary: `Added ${formatAmount(amount.toFixed(2), receiptDraft.currency)} expense · ${receiptDraft.category}`,
			});
			setReceiptDraft(null);
			setMessage("");
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: "Unable to save this receipt expense.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSearch = async (draft: SmartBarSearchDraft) => {
		const [expenseRows, agendaRows] = await Promise.all([
			utils.spending.getAll.fetch(),
			utils.agenda.getAll.fetch(),
		]);
		const filters = draft.filters;
		const ignoredWords = new Set([
			"a",
			"an",
			"all",
			"agenda",
			"agendas",
			"at",
			"by",
			"during",
			"expense",
			"expenses",
			"find",
			"for",
			"from",
			"in",
			"item",
			"items",
			"last",
			"lookup",
			"me",
			"month",
			"my",
			"note",
			"notes",
			"of",
			"on",
			"paid",
			"personal",
			"reminder",
			"reminders",
			"search",
			"show",
			"since",
			"spend",
			"spending",
			"task",
			"tasks",
			"the",
			"this",
			"to",
			"week",
			"with",
			"year",
			"today",
			"yesterday",
			"group",
			"january",
			"february",
			"march",
			"april",
			"may",
			"june",
			"july",
			"august",
			"september",
			"october",
			"november",
			"december",
		]);
		const filterWords = [
			...filters.categories,
			...activeGroups
				.filter((group) => filters.groupIds.includes(group.id))
				.map((group) => group.name),
		].flatMap((value) => value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
		const filterWordSet = new Set(filterWords);
		const terms = (draft.query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
			(word) =>
				!ignoredWords.has(word) &&
				!/^\d{4}$/.test(word) &&
				!filterWordSet.has(word),
		);
		const matchesTerms = (value: string) => {
			const searchable = value.toLowerCase();
			return terms.every((term) => searchable.includes(term));
		};
		const matchesDate = (date: Date) =>
			!filters.range || (date >= filters.range.from && date < filters.range.to);
		const matchesGroup = (groupId: string | null) => {
			if (filters.personalOnly) return !groupId;
			if (filters.groupIds.length > 0) {
				return Boolean(groupId && filters.groupIds.includes(groupId));
			}
			return true;
		};
		const results: SearchResult[] = [];

		if (draft.scope !== "agenda") {
			const expenseResults = await Promise.all(
				expenseRows.map(async (item) => {
					const payload = item.encryptedPayload
						? await decryptPayload<{ description: string; notes?: string }>(
								JSON.parse(item.encryptedPayload) as EncryptedPayload,
								`expense:${item.id}:text:v1`,
								encryptionKeys.userId,
								privateKey,
							)
						: { description: item.description ?? "", notes: "" };
					const date = new Date(item.createdAt);
					const matchesCategory =
						filters.categories.length === 0 ||
						filters.categories.some(
							(category) =>
								category.toLowerCase() === item.category.toLowerCase(),
						);
					if (
						!matchesDate(date) ||
						!matchesGroup(item.groupId ?? null) ||
						!matchesCategory ||
						!matchesTerms(
							`${payload.description} ${payload.notes ?? ""} ${item.category} ${item.amount}`,
						)
					)
						return null;
					return {
						id: item.id,
						kind: "expense" as const,
						title: payload.description || "Expense",
						details: `${item.category} · ${formatAmount(item.amount, item.currency)}`,
						preview: payload.notes ?? "",
						date,
						href: `/spending?edit=${encodeURIComponent(item.id)}`,
					};
				}),
			);
			for (const result of expenseResults) {
				if (result) results.push(result);
			}
		}

		if (draft.scope !== "expenses") {
			const agendaResults = await Promise.all(
				agendaRows.map(async (item) => {
					const payload = item.encryptedPayload
						? await decryptPayload<{ title: string; content: string }>(
								JSON.parse(item.encryptedPayload) as EncryptedPayload,
								`agenda:${item.id}:text:v1`,
								encryptionKeys.userId,
								privateKey,
							)
						: { title: item.title ?? "", content: item.content ?? "" };
					const date = new Date(item.targetDate ?? item.createdAt);
					const matchesCategory =
						filters.categories.length === 0 ||
						filters.categories.some(
							(category) =>
								category.toLowerCase() === item.category.toLowerCase(),
						);
					if (
						!matchesDate(date) ||
						!matchesGroup(item.groupId ?? null) ||
						!matchesCategory ||
						!matchesTerms(
							`${payload.title} ${payload.content ?? ""} ${item.type} ${item.category}`,
						)
					)
						return null;
					return {
						id: item.id,
						kind: "agenda" as const,
						title: payload.title || item.type,
						details: `${item.type} · ${date.toLocaleDateString()}`,
						preview: payload.content ?? "",
						date,
						href: `/agenda?edit=${encodeURIComponent(item.id)}`,
					};
				}),
			);
			for (const result of agendaResults) {
				if (result) results.push(result);
			}
		}

		results.sort((left, right) => right.date.getTime() - left.date.getTime());
		setSearchResultCount(results.length);
		setSearchResults(results.slice(0, 12));
		setText("");
	};

	useEffect(
		() => () => {
			if (recordingTimeoutRef.current)
				clearTimeout(recordingTimeoutRef.current);
			recorderRef.current?.cancel();
		},
		[],
	);

	const stopVoiceRecording = async () => {
		const recorder = recorderRef.current;
		if (!recorder) return;
		recorderRef.current = null;
		if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
		setIsRecording(false);
		setIsTranscribing(true);
		try {
			const samples = await recorder.stop();
			if (!hasSpeech(samples)) {
				setVoiceStatus("I didn't hear anything. Tap the mic and try again.");
				return;
			}
			let transcript: string;
			if (
				useCloudVoice &&
				aiApiKey.trim() &&
				(aiProvider === "openai" || aiProvider === "venice")
			) {
				setVoiceStatus("Transcribing…");
				const form = new FormData();
				form.set("audio", pcmToWavBlob(samples), "voice.wav");
				form.set("apiKey", aiApiKey.trim());
				form.set("provider", aiProvider);
				const response = await fetch("/api/smart-bar/transcribe", {
					method: "POST",
					body: form,
				});
				const data = (await response.json().catch(() => null)) as {
					text?: string;
					error?: string;
				} | null;
				if (!response.ok || typeof data?.text !== "string") {
					throw new Error(data?.error ?? "Cloud transcription failed.");
				}
				transcript = data.text;
			} else {
				transcript = await transcribeLocally(samples, setVoiceStatus);
			}
			const normalized = normalizeTranscript(transcript);
			if (!normalized) {
				setVoiceStatus("I couldn't make out any words. Try again.");
				return;
			}
			setText(normalized);
			setVoiceStatus("Check the text, then press Go.");
			inputRef.current?.focus();
		} catch (error) {
			setVoiceStatus(
				error instanceof Error ? error.message : "Voice transcription failed.",
			);
		} finally {
			setIsTranscribing(false);
		}
	};

	const handleVoiceClick = async () => {
		if (isRecording) {
			await stopVoiceRecording();
			return;
		}
		if (!isVoiceRecordingSupported()) {
			setVoiceStatus("This browser can't record audio (HTTPS is required).");
			return;
		}
		try {
			recorderRef.current = await startVoiceRecording();
			setIsRecording(true);
			setVoiceStatus("Listening… tap again when done.");
			recordingTimeoutRef.current = setTimeout(
				() => void stopVoiceRecording(),
				MAX_RECORDING_SECONDS * 1000,
			);
		} catch (error) {
			setVoiceStatus(
				error instanceof DOMException && error.name === "NotAllowedError"
					? "Microphone access was blocked. Allow it in your browser settings."
					: "Could not start the microphone.",
			);
		}
	};

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!text.trim() || isSubmitting) return;

		const context = {
			personalCategories: categorySettings?.personal ?? ["Other"],
			groupCategories: (categorySettings?.groups ?? []).map((group) => ({
				groupId: group.id,
				groupName: group.name,
				categories: group.categories,
			})),
			groups: activeGroups.map((group) => ({ id: group.id, name: group.name })),
			defaultCurrency: getStoredDisplayCurrency(),
		};
		const draft = parseSmartBarCommand(text, context);
		const isImplicitNote =
			draft?.kind === "agenda" &&
			draft.agendaType === "note" &&
			!/^(?:add\s+)?note\b/i.test(text.trim());
		const isNaturalLanguageExpense =
			draft?.kind === "expense" &&
			!/^(?:(?:add|create|new|log|set|track)\s+)?(?:expense\b|[$€₿]|\d|(?:usd|eur|btc)\b)/i.test(
				text.trim(),
			);
		if (
			aiApiKey.trim() &&
			(!draft || isImplicitNote || isNaturalLanguageExpense)
		) {
			setIsSubmitting(true);
			setMessage("");
			setLastAction(null);
			setSearchResults(null);
			try {
				const response = await fetch("/api/smart-bar/interpret", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						apiKey: aiApiKey.trim(),
						provider: aiProvider,
						model: aiModel.trim(),
						text: text.trim(),
					}),
				});
				const result: unknown = await response.json();
				const resultObject =
					typeof result === "object" && result !== null ? result : null;
				if (!response.ok) {
					const errorMessage =
						resultObject &&
						"error" in resultObject &&
						typeof resultObject.error === "string"
							? resultObject.error
							: "AI interpretation failed.";
					throw new Error(errorMessage);
				}
				const command =
					resultObject &&
					"command" in resultObject &&
					typeof resultObject.command === "string"
						? resultObject.command
						: null;
				if (!command)
					throw new Error("The AI did not return a usable command.");
				const interpretedDraft = parseSmartBarCommand(command, context);
				if (!interpretedDraft)
					throw new Error("The AI suggestion could not be understood.");
				setText(command);
				setMessage(
					"AI suggestion ready. Review the command, then press Go to confirm.",
				);
				return;
			} catch (error) {
				setMessage(
					error instanceof Error
						? error.message
						: "Unable to interpret that command.",
				);
				return;
			} finally {
				setIsSubmitting(false);
			}
		}

		if (!draft) {
			setMessage(
				'Couldn\'t understand that. Try "expense 10 coffee", "budget 1000 groceries", "income 3000 salary", or "group family trip".',
			);
			return;
		}
		if (
			draft.kind === "search" &&
			draft.scope === "all" &&
			!draft.query.trim() &&
			!draft.filters.range &&
			draft.filters.categories.length === 0 &&
			draft.filters.groupIds.length === 0 &&
			!draft.filters.personalOnly
		) {
			setMessage('Try "find expenses coffee" or "find agenda dentist".');
			return;
		}
		if (draft.kind === "expense" && draft.notes.length > 160) {
			setMessage("Expense comments can be up to 160 characters.");
			return;
		}

		setIsSubmitting(true);
		setMessage("");
		setLastAction(null);
		setSearchResults(null);
		setSelectedResult(null);

		try {
			if (draft.kind === "search") {
				await handleSearch(draft);
			} else if (draft.kind === "expense") {
				const id = crypto.randomUUID();
				const matchedGroup = draft.groupId
					? activeGroups.find((group) => group.id === draft.groupId)
					: undefined;
				const recipients = await getFinanceRecipients(draft.groupId);
				const encryptedPayload = await encryptPayload(
					{ description: draft.description, notes: draft.notes },
					`expense:${id}:text:v1`,
					recipients,
				);
				await addExpense.mutateAsync({
					id,
					encryptedPayload,
					amount: draft.amount,
					category: draft.category,
					group:
						(matchedGroup?.category as
							| "family"
							| "work"
							| "friends"
							| "other"
							| undefined) ?? "personal",
					currency: draft.currency,
					createdAt: new Date(),
					expenseType: "one-off",
					recurrenceFrequency: "none",
					groupId: draft.groupId ?? undefined,
					visibility: draft.groupId ? "group" : "personal",
				});
				await utils.spending.getAll.invalidate();
				setLastAction({
					kind: "expense",
					id,
					summary: `Added ${formatAmount(draft.amount, draft.currency)} expense · ${draft.category}${matchedGroup ? ` · ${matchedGroup.name}` : ""}`,
				});
			} else if (draft.kind === "budget") {
				const id = crypto.randomUUID();
				const matchedGroup = draft.groupId
					? activeGroups.find((group) => group.id === draft.groupId)
					: undefined;
				const recipients = await getFinanceRecipients(draft.groupId);
				const encryptedPayload = await encryptPayload(
					{ name: draft.name },
					`budget:${id}:text:v1`,
					recipients,
				);
				await addBudget.mutateAsync({
					id,
					encryptedPayload,
					amount: draft.amount,
					currency: draft.currency,
					groupId: draft.groupId ?? undefined,
					period: draft.period,
				});
				await utils.budget.overview.invalidate();
				setLastAction({
					kind: "budget",
					id,
					summary: `Added ${formatAmount(draft.amount, draft.currency)} ${draft.period} budget · ${draft.name}${matchedGroup ? ` · ${matchedGroup.name}` : ""}`,
				});
			} else if (draft.kind === "income") {
				const id = crypto.randomUUID();
				const matchedGroup = draft.groupId
					? activeGroups.find((group) => group.id === draft.groupId)
					: undefined;
				const recipients = await getFinanceRecipients(draft.groupId);
				const encryptedPayload = await encryptPayload(
					{ name: draft.name },
					`income:${id}:text:v1`,
					recipients,
				);
				const today = new Date();
				await addIncome.mutateAsync({
					id,
					encryptedPayload,
					category: draft.category,
					amount: draft.amount,
					currency: draft.currency,
					frequency: draft.frequency,
					startDate: today,
					recurrenceDay: draft.recurrenceDay,
					groupId: draft.groupId ?? undefined,
				});
				await utils.budget.overview.invalidate();
				setLastAction({
					kind: "income",
					id,
					summary: `Added ${formatAmount(draft.amount, draft.currency)} income · ${draft.name}${matchedGroup ? ` · ${matchedGroup.name}` : ""}`,
				});
			} else if (draft.kind === "group") {
				const group = await createGroup.mutateAsync({
					name: draft.name,
					category: draft.category,
				});
				await utils.group.listMine.invalidate();
				setLastAction({
					kind: "group",
					summary: `Created ${draft.category} group · ${group.name}`,
				});
			} else {
				const id = crypto.randomUUID();
				// Agenda items from the smart bar are personal-only, so only the creator can decrypt them.
				const recipients: RecipientPublicKey[] = [
					{ userId: encryptionKeys.userId, key: encryptionKeys.publicKey },
				];
				const encryptedPayload = await encryptPayload(
					{ title: draft.title, content: "" },
					`agenda:${id}:text:v1`,
					recipients,
				);
				await addAgendaItem.mutateAsync({
					id,
					encryptedPayload,
					type: draft.agendaType,
					category: "Other",
					repeatInterval: draft.repeatInterval,
					startTime: draft.agendaType === "note" ? undefined : draft.startTime,
					scheduleMode:
						draft.agendaType === "reminder" ? draft.scheduleMode : "legacy",
					scheduleTimes: [],
					intervalMinutes:
						draft.agendaType === "reminder" && draft.scheduleMode === "interval"
							? (draft.intervalMinutes ?? undefined)
							: undefined,
					visibility: "personal",
				});
				await utils.agenda.getAll.invalidate();
				const whenLabel =
					draft.agendaType === "note"
						? ""
						: ` · ${draft.startTime.toLocaleString("en-US", {
								weekday: "short",
								month: "short",
								day: "numeric",
								hour: "numeric",
								minute: "2-digit",
							})}`;
				setLastAction({
					kind: "agenda",
					id,
					summary: `Added ${draft.agendaType} · ${draft.title}${whenLabel}`,
				});
			}
			setText("");
		} catch (error) {
			setMessage(
				error instanceof Error ? error.message : "Unable to save that item.",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const undoLastAction = async () => {
		if (!lastAction || lastAction.kind === "group") return;
		try {
			if (lastAction.kind === "expense")
				await deleteExpense.mutateAsync({ id: lastAction.id });
			if (lastAction.kind === "income")
				await deleteIncome.mutateAsync({ id: lastAction.id });
			if (lastAction.kind === "budget")
				await deleteBudget.mutateAsync({ id: lastAction.id });
			if (lastAction.kind === "agenda")
				await deleteAgendaItem.mutateAsync({ id: lastAction.id });
			await Promise.all([
				utils.spending.getAll.invalidate(),
				utils.budget.overview.invalidate(),
				utils.agenda.getAll.invalidate(),
			]);
			setLastAction(null);
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Unable to undo.");
		}
	};

	return (
		<div className="border-slate-200/70 border-b bg-white/70 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/70">
			<div className="mx-auto max-w-6xl px-3 py-2 sm:px-6 lg:px-8">
				<div className="mb-2 flex items-start justify-between gap-3">
					<div className="flex min-w-0 items-start gap-2">
						<Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
						<div>
							<h2 className="font-black text-slate-900 text-sm dark:text-white">
								Smart Bar
							</h2>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<button
							className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 font-semibold text-[11px] text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950"
							disabled={isProcessingReceipt || isSubmitting}
							onClick={() => receiptInputRef.current?.click()}
							type="button"
						>
							{isProcessingReceipt ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<Camera className="h-3.5 w-3.5" />
							)}
							{isProcessingReceipt ? "Reading…" : "Scan receipt"}
						</button>
						<button
							aria-label={isRecording ? "Stop recording" : "Voice command"}
							aria-pressed={isRecording}
							className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-semibold text-[11px] transition disabled:opacity-50 ${
								isRecording
									? "animate-pulse border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
									: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950"
							}`}
							disabled={isTranscribing || isProcessingReceipt || isSubmitting}
							onClick={() => void handleVoiceClick()}
							type="button"
						>
							{isTranscribing ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : isRecording ? (
								<Square className="h-3.5 w-3.5" />
							) : (
								<Mic className="h-3.5 w-3.5" />
							)}
							{isRecording ? "Stop" : isTranscribing ? "Working…" : "Voice"}
						</button>
						<button
							aria-expanded={isAiSettingsOpen}
							className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-[11px] text-slate-600 transition hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
							onClick={() => setIsAiSettingsOpen((open) => !open)}
							type="button"
						>
							{isAiSettingsOpen ? "Hide AI assist" : "Optional AI assist"}
						</button>
					</div>
				</div>
				<input
					accept="image/jpeg,image/png,image/webp"
					capture="environment"
					className="hidden"
					onChange={(event) => void handleReceiptFile(event)}
					ref={receiptInputRef}
					type="file"
				/>
				{voiceStatus && (
					<output className="mb-2 block text-[11px] text-slate-500 dark:text-gray-400">
						{voiceStatus}
					</output>
				)}
				{receiptStatus && (
					<output className="mb-2 block text-[11px] text-slate-500 dark:text-gray-400">
						{receiptStatus}
					</output>
				)}
				{receiptDraft && (
					<section
						aria-label="Review scanned receipt"
						className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900 dark:bg-emerald-950/20"
					>
						<p className="mb-2 font-bold text-slate-800 text-xs dark:text-gray-100">
							Review receipt details before saving
						</p>
						<div className="grid grid-cols-2 gap-2">
							<label className="col-span-2 font-semibold text-[11px] text-slate-600 dark:text-gray-300">
								Merchant or description
								<input
									className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-900 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									maxLength={160}
									onChange={(event) =>
										setReceiptDraft((draft) =>
											draft
												? { ...draft, description: event.target.value }
												: draft,
										)
									}
									value={receiptDraft.description}
								/>
							</label>
							<label className="font-semibold text-[11px] text-slate-600 dark:text-gray-300">
								Total
								<input
									className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-900 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									inputMode="decimal"
									min="0.01"
									onChange={(event) =>
										setReceiptDraft((draft) =>
											draft ? { ...draft, amount: event.target.value } : draft,
										)
									}
									step="0.01"
									type="number"
									value={receiptDraft.amount}
								/>
							</label>
							<label className="font-semibold text-[11px] text-slate-600 dark:text-gray-300">
								Currency
								<select
									className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-900 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									onChange={(event) => {
										const currency = event.target.value;
										if (isSmartCurrency(currency)) {
											setReceiptDraft((draft) =>
												draft ? { ...draft, currency } : draft,
											);
										}
									}}
									value={receiptDraft.currency}
								>
									<option value="USD">USD</option>
									<option value="EUR">EUR</option>
									<option value="BTC">BTC</option>
								</select>
							</label>
							<label className="font-semibold text-[11px] text-slate-600 dark:text-gray-300">
								Category
								<select
									className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-900 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									onChange={(event) =>
										setReceiptDraft((draft) =>
											draft
												? { ...draft, category: event.target.value }
												: draft,
										)
									}
									value={receiptDraft.category}
								>
									{(categorySettings?.personal ?? ["Other"]).map((category) => (
										<option key={category} value={category}>
											{category}
										</option>
									))}
								</select>
							</label>
							<label
								className="font-semibold text-[11px] text-slate-600 dark:text-gray-300"
								htmlFor="receipt-date"
							>
								Date
								<DateInputUs
									className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-slate-900 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white"
									id="receipt-date"
									onChange={(date) =>
										setReceiptDraft((draft) =>
											draft ? { ...draft, date } : draft,
										)
									}
									value={receiptDraft.date}
								/>
							</label>
						</div>
						<div className="mt-2 flex justify-end gap-2">
							<button
								className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 text-xs hover:bg-white dark:text-gray-300 dark:hover:bg-gray-900"
								onClick={() => {
									setReceiptDraft(null);
									setMessage("");
								}}
								type="button"
							>
								Discard
							</button>
							<button
								className="rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white text-xs hover:bg-emerald-800 disabled:opacity-50"
								disabled={
									isSubmitting ||
									!receiptDraft.description.trim() ||
									!receiptDraft.amount ||
									!receiptDraft.date
								}
								onClick={() => void saveReceiptExpense()}
								type="button"
							>
								{isSubmitting ? "Saving…" : "Add expense"}
							</button>
						</div>
						<p className="mt-2 text-[10px] text-slate-500 dark:text-gray-400">
							The receipt image is discarded after scanning and is never
							attached to the expense.
						</p>
					</section>
				)}
				<form
					className="flex items-center gap-2"
					onSubmit={(event) => void handleSubmit(event)}
				>
					<input
						aria-label="Ask the Smart Bar"
						className="min-w-0 flex-1 bg-transparent text-slate-900 text-sm outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-gray-600"
						onChange={(event) => {
							setText(event.target.value);
							setMessage("");
							setSearchResults(null);
							setSelectedResult(null);
						}}
						placeholder='Try: "budget 1000 groceries", "income 3000 salary", or "group family trip"'
						ref={inputRef}
						value={text}
					/>
					<button
						className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white text-xs transition hover:bg-emerald-800 disabled:opacity-50"
						disabled={!text.trim() || isSubmitting}
						type="submit"
					>
						{isSubmitting ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							"Go"
						)}
					</button>
				</form>
				{isAiSettingsOpen && (
					<div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-gray-900">
						<div className="flex items-center justify-between gap-2">
							<label
								className="block font-bold text-slate-700 text-xs dark:text-gray-200"
								htmlFor="smart-bar-provider"
							>
								AI provider
							</label>
							<select
								className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-900 text-xs dark:border-gray-700 dark:bg-gray-950 dark:text-white"
								id="smart-bar-provider"
								onChange={(event) => {
									const provider = AI_PROVIDERS.find(
										(item) => item.id === event.target.value,
									);
									if (!provider) return;
									setAiProvider(provider.id);
									setAiModel(provider.model);
								}}
								value={aiProvider}
							>
								{AI_PROVIDERS.map((provider) => (
									<option key={provider.id} value={provider.id}>
										{provider.name}
									</option>
								))}
							</select>
						</div>
						<div className="mt-2 flex items-center justify-between gap-2">
							<label
								className="block font-bold text-slate-700 text-xs dark:text-gray-200"
								htmlFor="smart-bar-api-key"
							>
								{
									AI_PROVIDERS.find((provider) => provider.id === aiProvider)
										?.name
								}{" "}
								API key
							</label>
							{aiApiKey && (
								<button
									className="font-semibold text-[11px] text-slate-500 underline dark:text-gray-400"
									onClick={() => {
										setAiApiKey("");
									}}
									type="button"
								>
									Clear key
								</button>
							)}
						</div>
						<input
							autoComplete="off"
							className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 text-xs outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							id="smart-bar-api-key"
							onChange={(event) => {
								setAiApiKey(event.target.value);
							}}
							placeholder={
								AI_PROVIDERS.find((provider) => provider.id === aiProvider)
									?.keyPlaceholder
							}
							type="password"
							value={aiApiKey}
						/>
						<label
							className="mt-2 block font-bold text-slate-700 text-xs dark:text-gray-200"
							htmlFor="smart-bar-ai-model"
						>
							Model
						</label>
						<input
							autoComplete="off"
							className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-slate-900 text-xs outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
							id="smart-bar-ai-model"
							onChange={(event) => setAiModel(event.target.value)}
							value={aiModel}
						/>
						<p className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">
							Use a model ID available from the selected provider; receipt
							scanning requires a vision-capable model.
						</p>
						{
							<label className="mt-2 flex items-start gap-2 text-slate-700 text-xs dark:text-gray-200">
								<input
									checked={useAiVisionForReceipts && !!aiApiKey.trim()}
									className="mt-0.5 accent-emerald-700"
									disabled={!aiApiKey.trim()}
									onChange={(event) =>
										setUseAiVisionForReceipts(event.target.checked)
									}
									type="checkbox"
								/>
								<span>
									<span className="block font-semibold">
										Use AI vision for receipt scanning
										{!aiApiKey.trim() && " (enter a key above)"}
									</span>
									<span className="mt-0.5 block text-[11px] text-slate-500 leading-4 dark:text-gray-400">
										Only enabled when selected. A compressed receipt image is
										sent to{" "}
										{
											AI_PROVIDERS.find(
												(provider) => provider.id === aiProvider,
											)?.name
										}
										; provider charges and data handling may apply.
									</span>
								</span>
							</label>
						}
						{(aiProvider === "openai" || aiProvider === "venice") && (
							<label className="mt-2 flex items-start gap-2 text-slate-700 text-xs dark:text-gray-200">
								<input
									checked={useCloudVoice && !!aiApiKey.trim()}
									className="mt-0.5 accent-emerald-700"
									disabled={!aiApiKey.trim()}
									onChange={(event) => setUseCloudVoice(event.target.checked)}
									type="checkbox"
								/>
								<span>
									<span className="block font-semibold">
										Use cloud transcription for voice
										{!aiApiKey.trim() && " (enter a key above)"}
									</span>
									<span className="mt-0.5 block text-[11px] text-slate-500 leading-4 dark:text-gray-400">
										Only enabled when selected. Your recording is sent to{" "}
										{
											AI_PROVIDERS.find(
												(provider) => provider.id === aiProvider,
											)?.name
										}{" "}
										and not stored; provider charges and data handling may
										apply. Otherwise voice is transcribed on this device.
									</span>
								</span>
							</label>
						)}
						<p className="mt-1.5 text-[11px] text-slate-500 leading-4 dark:text-gray-400">
							Used only in this tab for ambiguous commands. The key and request
							are sent to this app&apos;s server for interpretation and are not
							stored; the request is sent to the selected provider and may incur
							charges. Review AI suggestions before saving.
						</p>
					</div>
				)}
				{message && (
					<output
						className={`mt-1 text-xs ${message.startsWith("AI suggestion") || message.startsWith("Receipt scanned") || message.startsWith("Receipt read") ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}
					>
						{message}
					</output>
				)}
				{searchResults && (
					<section
						aria-label="Search results"
						aria-live="polite"
						className="mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-gray-800 dark:bg-gray-950"
					>
						<div className="flex items-center justify-between gap-3 px-2 py-1">
							<p className="font-bold text-slate-700 text-xs dark:text-gray-200">
								{searchResultCount === 0
									? "No matches found"
									: `${searchResultCount} ${searchResultCount === 1 ? "match" : "matches"} · select one to preview`}
							</p>
							<button
								aria-label="Close search results"
								className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-900"
								onClick={() => setSearchResults(null)}
								type="button"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
						{searchResults.map((result) => (
							<button
								className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
								key={`${result.kind}-${result.id}`}
								onClick={() => setSelectedResult(result)}
								type="button"
							>
								<Search className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
								<span className="min-w-0 flex-1">
									<span className="block truncate font-semibold text-slate-900 text-sm dark:text-white">
										{result.title}
									</span>
									<span className="block truncate text-slate-500 text-xs dark:text-gray-400">
										{result.kind === "expense" ? "Expense" : "Agenda"} ·{" "}
										{result.details}
									</span>
								</span>
								<span className="shrink-0 text-slate-400 text-xs dark:text-gray-500">
									{result.date.toLocaleDateString()}
								</span>
							</button>
						))}
						{searchResultCount > searchResults.length && (
							<p className="px-3 py-2 text-slate-500 text-xs dark:text-gray-400">
								Showing the 12 most recent matches.
							</p>
						)}
					</section>
				)}
				{lastAction && (
					<div className="mt-1 flex items-center justify-between gap-2 text-xs">
						<span className="text-emerald-700 dark:text-emerald-400">
							{lastAction.summary}
						</span>
						{lastAction.kind !== "group" && (
							<button
								className="inline-flex items-center gap-1 font-bold text-slate-500 transition hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-100"
								onClick={() => void undoLastAction()}
								type="button"
							>
								<Undo2 className="h-3 w-3" /> Undo
							</button>
						)}
					</div>
				)}
			</div>
			{selectedResult && (
				<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
					<button
						aria-label="Close preview"
						className="absolute inset-0 h-full w-full cursor-default"
						onClick={() => setSelectedResult(null)}
						type="button"
					/>
					<section
						aria-labelledby="smart-bar-preview-title"
						aria-modal="true"
						className="relative z-10 max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-950"
						role="dialog"
					>
						<p className="font-black text-[10px] text-emerald-700 uppercase tracking-[0.24em] dark:text-emerald-400">
							{selectedResult.kind === "expense" ? "Expense" : "Agenda item"}
						</p>
						<h2
							className="mt-2 font-bold text-lg text-slate-950 dark:text-white"
							id="smart-bar-preview-title"
						>
							{selectedResult.title}
						</h2>
						<p className="mt-1 text-slate-500 text-sm dark:text-gray-400">
							{selectedResult.details}
						</p>
						<p className="mt-1 text-slate-500 text-xs dark:text-gray-500">
							{selectedResult.date.toLocaleString()}
						</p>
						{selectedResult.preview && (
							<p className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-slate-700 text-sm dark:bg-gray-900 dark:text-gray-300">
								{selectedResult.preview}
							</p>
						)}
						<div className="mt-5 flex justify-end gap-2">
							<button
								className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-700 text-sm hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
								onClick={() => setSelectedResult(null)}
								type="button"
							>
								Close
							</button>
							<button
								className="rounded-xl bg-emerald-700 px-4 py-2 font-bold text-sm text-white hover:bg-emerald-800"
								onClick={() => {
									const { href } = selectedResult;
									setSelectedResult(null);
									setSearchResults(null);
									router.push(href);
								}}
								type="button"
							>
								Edit {selectedResult.kind === "expense" ? "expense" : "item"}
							</button>
						</div>
					</section>
				</div>
			)}
		</div>
	);
}
