// Deterministic, rule-based parsing for expense entry and search. Optional AI
// interpretation is handled separately before commands reach these parsers.

export type SmartCurrency = "USD" | "EUR" | "BTC";

export type SmartGroupOption = {
	id: string;
	name: string;
};

export type SmartGroupCategories = {
	groupId: string;
	groupName: string;
	categories: string[];
};

export type SmartExpenseParseContext = {
	personalCategories: string[];
	groupCategories: SmartGroupCategories[];
	groups: SmartGroupOption[];
	defaultCurrency: SmartCurrency;
};

export type SmartExpenseParseResult = {
	amount: string;
	currency: SmartCurrency;
	category: string;
	groupId: string | null;
	description: string;
	notes: string;
};

export type SmartFindDateRange = {
	from: Date;
	to: Date;
	label: string;
};

export type SmartFindParseContext = {
	personalCategories: string[];
	groupCategories: SmartGroupCategories[];
	groups: SmartGroupOption[];
	now?: Date;
};

export type SmartFindParseResult = {
	categories: string[];
	groupIds: string[];
	personalOnly: boolean;
	range: SmartFindDateRange | null;
	rawQuery: string;
};

const CURRENCY_TOKENS: Record<string, SmartCurrency> = {
	$: "USD",
	us$: "USD",
	usd: "USD",
	"€": "EUR",
	eur: "EUR",
	"₿": "BTC",
	btc: "BTC",
};

const AMOUNT_PATTERN =
	/([$€₿]|usd|eur|btc)?\s*(\d{1,12}(?:[.,]\d{1,8})?)\s*([$€₿]|usd|eur|btc)?/i;

const CATEGORY_KEYWORD_GROUPS: Array<{ hints: string[]; keywords: string[] }> =
	[
		{
			hints: ["coffee", "cafe"],
			keywords: [
				"starbucks",
				"costa",
				"dunkin",
				"peet",
				"tim hortons",
				"coffee",
				"cafe",
				"espresso",
				"latte",
			],
		},
		{
			hints: ["fast food", "dining", "food"],
			keywords: [
				"mcdonald",
				"burger king",
				"kfc",
				"wendy",
				"taco bell",
				"subway",
				"chipotle",
				"pizza",
				"domino",
				"fast food",
			],
		},
		{
			hints: ["dining", "food"],
			keywords: [
				"restaurant",
				"dinner",
				"lunch",
				"breakfast",
				"brunch",
				"diner",
				"bistro",
				"eatery",
			],
		},
		{
			hints: ["groceries", "food"],
			keywords: [
				"walmart",
				"whole foods",
				"kroger",
				"aldi",
				"trader joe",
				"grocery",
				"groceries",
				"supermarket",
				"costco",
			],
		},
		{
			hints: ["transport", "travel"],
			keywords: [
				"uber",
				"lyft",
				"taxi",
				"bus fare",
				"train",
				"metro",
				"gas station",
				"fuel",
				"parking",
				"toll",
			],
		},
		{
			hints: ["subscriptions", "bills"],
			keywords: [
				"netflix",
				"spotify",
				"hulu",
				"disney+",
				"subscription",
				"prime",
			],
		},
		{
			hints: ["health"],
			keywords: [
				"pharmacy",
				"doctor",
				"dentist",
				"clinic",
				"hospital",
				"medicine",
				"medical",
			],
		},
		{ hints: ["shopping"], keywords: ["amazon", "target", "mall", "shopping"] },
		{
			hints: ["entertainment"],
			keywords: ["movie", "cinema", "concert", "theatre", "theater", "arcade"],
		},
		{
			hints: ["travel"],
			keywords: ["flight", "hotel", "airbnb", "airline", "vacation", "trip"],
		},
		{
			hints: ["cash", "atm"],
			keywords: ["atm", "cash withdrawal", "withdrawal"],
		},
		{
			hints: ["fees", "taxes"],
			keywords: ["late fee", "fine", "tax", "penalty", "fee"],
		},
		{
			hints: ["education"],
			keywords: [
				"tuition",
				"school",
				"course",
				"textbook",
				"university",
				"college",
			],
		},
		{
			hints: ["personal care", "personal"],
			keywords: ["salon", "haircut", "spa", "gym", "barber"],
		},
		{ hints: ["gifts", "charity"], keywords: ["gift", "charity", "donation"] },
		{
			hints: ["bills", "utilities", "housing"],
			keywords: [
				"rent",
				"mortgage",
				"electricity",
				"water bill",
				"internet bill",
				"utility",
				"utilities",
			],
		},
	];

const MONTH_NAMES = [
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
];

export function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeAmount(raw: string): string {
	if (raw.includes(",") && raw.includes(".")) {
		return raw.replace(/,/g, "");
	}
	if (raw.includes(",")) {
		const parts = raw.split(",");
		const lastPart = parts[parts.length - 1];
		if (parts.length === 2 && lastPart && lastPart.length <= 2) {
			return `${parts[0]}.${lastPart}`;
		}
		return raw.replace(/,/g, "");
	}
	return raw;
}

export type SmartAmountMatch = {
	amount: string;
	currency: SmartCurrency;
	remainder: string;
};

export function extractAmount(
	text: string,
	defaultCurrency: SmartCurrency,
): SmartAmountMatch | null {
	const match = AMOUNT_PATTERN.exec(text);
	if (!match || match.index === undefined || !match[2]) return null;

	const amountNumber = Number(normalizeAmount(match[2]));
	if (!Number.isFinite(amountNumber) || amountNumber <= 0) return null;

	const currencyToken = (match[1] ?? match[3] ?? "").toLowerCase();
	const currency = CURRENCY_TOKENS[currencyToken] ?? defaultCurrency;
	const remainder =
		`${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
			.replace(/\s+/g, " ")
			.trim();

	return { amount: amountNumber.toFixed(2), currency, remainder };
}

export function matchGroupByName<T extends { name: string }>(
	text: string,
	groups: T[],
): T | undefined {
	return groups.find((group) =>
		new RegExp(`\\b${escapeRegExp(group.name)}\\b`, "i").test(text),
	);
}

export function findCategoryByHints(
	categories: string[],
	hints: string[],
): string | undefined {
	for (const hint of hints) {
		const found = categories.find((category) =>
			category.toLowerCase().includes(hint),
		);
		if (found) return found;
	}
	return undefined;
}

export function guessCategory(text: string, categories: string[]): string {
	const lower = text.toLowerCase();
	for (const group of CATEGORY_KEYWORD_GROUPS) {
		if (group.keywords.some((keyword) => lower.includes(keyword))) {
			const match = findCategoryByHints(categories, group.hints);
			if (match) return match;
		}
	}
	return categories[0] ?? "Other";
}

export function parseSmartExpenseText(
	input: string,
	context: SmartExpenseParseContext,
): SmartExpenseParseResult | null {
	const text = input.trim();
	if (!text) return null;

	const extracted = extractAmount(text, context.defaultCurrency);
	if (!extracted) return null;

	const [description, notes = ""] = extracted.remainder
		.split(/\s*[|;]\s*/, 2)
		.map((part) => part.trim());
	const expenseDescription = description || "Expense";
	const groupMatch = matchGroupByName(expenseDescription, context.groups);

	const groupCategoryList = groupMatch
		? context.groupCategories.find((entry) => entry.groupId === groupMatch.id)
				?.categories
		: undefined;
	const availableCategories =
		groupCategoryList && groupCategoryList.length > 0
			? groupCategoryList
			: context.personalCategories;

	return {
		amount: extracted.amount,
		currency: extracted.currency,
		category: guessCategory(expenseDescription, availableCategories),
		groupId: groupMatch?.id ?? null,
		description: expenseDescription,
		notes,
	};
}

function startOfDay(date: Date) {
	const result = new Date(date);
	result.setHours(0, 0, 0, 0);
	return result;
}

function endOfDay(date: Date) {
	const result = new Date(date);
	result.setHours(23, 59, 59, 999);
	return result;
}

function startOfWeek(date: Date) {
	const result = startOfDay(date);
	const offset = (result.getDay() + 6) % 7;
	result.setDate(result.getDate() - offset);
	return result;
}

function capitalize(word: string) {
	return `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;
}

function parseDateRange(text: string, now: Date): SmartFindDateRange | null {
	const lower = text.toLowerCase();
	const yearMatch = /\b(20\d{2})\b/.exec(lower);
	const year = yearMatch?.[1] ? Number(yearMatch[1]) : now.getFullYear();

	const mentionedMonths = MONTH_NAMES.map((name, index) => ({
		name,
		index,
	})).filter(({ name }) => new RegExp(`\\b${name}\\b`).test(lower));

	if (mentionedMonths.length > 0) {
		const indices = mentionedMonths
			.map((month) => month.index)
			.sort((a, b) => a - b);
		const firstIndex = indices[0] ?? 0;
		const lastIndex = indices[indices.length - 1] ?? firstIndex;
		return {
			from: new Date(year, firstIndex, 1),
			to: new Date(year, lastIndex + 1, 1),
			label: `${mentionedMonths.map((month) => capitalize(month.name)).join(" & ")} ${year}`,
		};
	}

	if (/\btoday\b/.test(lower)) {
		return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
	}

	if (/\byesterday\b/.test(lower)) {
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		return {
			from: startOfDay(yesterday),
			to: endOfDay(yesterday),
			label: "Yesterday",
		};
	}

	const lastNDaysMatch = /last (\d+) days?/.exec(lower);
	if (lastNDaysMatch?.[1]) {
		const days = Number(lastNDaysMatch[1]);
		const from = startOfDay(
			new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
		);
		return { from, to: endOfDay(now), label: `Last ${days} days` };
	}

	if (/\blast week\b/.test(lower)) {
		const thisWeekStart = startOfWeek(now);
		const from = new Date(thisWeekStart);
		from.setDate(from.getDate() - 7);
		const to = new Date(thisWeekStart);
		to.setMilliseconds(-1);
		return { from, to, label: "Last week" };
	}

	if (/\bthis week\b/.test(lower)) {
		return { from: startOfWeek(now), to: endOfDay(now), label: "This week" };
	}

	if (/\blast month\b/.test(lower)) {
		return {
			from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
			to: new Date(now.getFullYear(), now.getMonth(), 1),
			label: "Last month",
		};
	}

	if (/\bthis month\b/.test(lower)) {
		return {
			from: new Date(now.getFullYear(), now.getMonth(), 1),
			to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
			label: "This month",
		};
	}

	if (/\blast year\b/.test(lower)) {
		return {
			from: new Date(now.getFullYear() - 1, 0, 1),
			to: new Date(now.getFullYear(), 0, 1),
			label: String(now.getFullYear() - 1),
		};
	}

	if (/\bthis year\b/.test(lower)) {
		return {
			from: new Date(now.getFullYear(), 0, 1),
			to: new Date(now.getFullYear() + 1, 0, 1),
			label: String(now.getFullYear()),
		};
	}

	if (yearMatch) {
		return {
			from: new Date(year, 0, 1),
			to: new Date(year + 1, 0, 1),
			label: String(year),
		};
	}

	return null;
}

export function parseSmartFindQuery(
	input: string,
	context: SmartFindParseContext,
): SmartFindParseResult {
	const now = context.now ?? new Date();
	const text = input.trim();
	const lower = text.toLowerCase();

	const allCategories = Array.from(
		new Set([
			...context.personalCategories,
			...context.groupCategories.flatMap((entry) => entry.categories),
		]),
	);
	const matchedCategories = allCategories.filter((category) => {
		const tokens = category
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length >= 3);
		return tokens.some((token) => lower.includes(token));
	});

	const matchedGroups = context.groups.filter((group) =>
		new RegExp(`\\b${escapeRegExp(group.name.toLowerCase())}\\b`).test(lower),
	);

	return {
		categories: matchedCategories,
		groupIds: matchedGroups.map((group) => group.id),
		personalOnly: /\bpersonal\b/.test(lower),
		range: parseDateRange(text, now),
		rawQuery: text,
	};
}
