// Deterministic parsing for explicit Smart Bar commands. Optional AI fallback is
// handled separately by the Smart Bar API route.

import {
	extractAmount,
	escapeRegExp,
	matchGroupByName,
	parseSmartExpenseText,
	parseSmartFindQuery,
	type SmartCurrency,
	type SmartGroupCategories,
	type SmartGroupOption,
	type SmartFindParseResult,
} from "./spending-nlp";

export type { SmartCurrency, SmartGroupCategories, SmartGroupOption };

export type SmartBarContext = {
	personalCategories: string[];
	groupCategories: SmartGroupCategories[];
	groups: SmartGroupOption[];
	defaultCurrency: SmartCurrency;
	now?: Date;
};

export type SmartBarExpenseDraft = {
	kind: "expense";
	amount: string;
	currency: SmartCurrency;
	category: string;
	groupId: string | null;
	description: string;
	notes: string;
};

export type SmartBarIncomeDraft = {
	kind: "income";
	amount: string;
	currency: SmartCurrency;
	category: string;
	name: string;
	groupId: string | null;
	frequency: "daily" | "weekly" | "biweekly" | "monthly";
	recurrenceDay: number;
};

export type SmartBarBudgetDraft = {
	kind: "budget";
	amount: string;
	currency: SmartCurrency;
	name: string;
	groupId: string | null;
	period: "daily" | "weekly" | "monthly";
};

export type SmartBarGroupDraft = {
	kind: "group";
	name: string;
	category: "family" | "friends" | "work" | "other";
};

export type SmartBarAgendaType = "task" | "reminder" | "note";

export type SmartBarAgendaDraft = {
	kind: "agenda";
	agendaType: SmartBarAgendaType;
	title: string;
	startTime: Date;
	repeatInterval: "none" | "daily" | "weekly" | "monthly";
	scheduleMode: "legacy" | "fixedTimes" | "interval";
	scheduleTimes: string[];
	intervalMinutes: number | null;
};

export type SmartBarSearchDraft = {
	kind: "search";
	query: string;
	scope: "all" | "expenses" | "agenda";
	filters: SmartFindParseResult;
};

export type SmartBarDraft =
	| SmartBarExpenseDraft
	| SmartBarIncomeDraft
	| SmartBarBudgetDraft
	| SmartBarGroupDraft
	| SmartBarAgendaDraft
	| SmartBarSearchDraft;

const INCOME_KEYWORDS: Array<{ hints: string[]; keywords: string[] }> = [
	{ hints: ["salary"], keywords: ["salary", "paycheck", "wages"] },
	{ hints: ["freelance"], keywords: ["freelance", "contract work", "gig"] },
	{ hints: ["bonus"], keywords: ["bonus"] },
	{ hints: ["refund"], keywords: ["refund", "reimbursement"] },
	{ hints: ["gift"], keywords: ["gift"] },
	{ hints: ["interest", "dividend"], keywords: ["interest", "dividend"] },
	{ hints: ["rent"], keywords: ["rent received", "tenant"] },
];
const INCOME_CUES = /\b(salary|paycheck|wages|freelance|contract work|gig|bonus|refund|reimbursement|interest|dividend|rent received|tenant)\b/i;

const WEEKDAYS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
];

function capitalize(word: string) {
	return `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;
}

function stripMatch(text: string, match: RegExpExecArray) {
	return `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
		.replace(/\s+/g, " ")
		.trim();
}

function cleanTitle(text: string, fallback: string) {
	const cleaned = text
		.replace(/\b(starting|beginning|from|at|on|by)\b/gi, " ")
		.replace(/[,.;:]+$/g, "")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned ? capitalize(cleaned) : fallback;
}

function guessIncomeCategory(text: string): string {
	const lower = text.toLowerCase();
	for (const group of INCOME_KEYWORDS) {
		if (group.keywords.some((keyword) => lower.includes(keyword))) {
			return capitalize(group.hints[0] ?? "Other");
		}
	}
	return "Other";
}

function getFrequency(text: string) {
	if (/\bbiweekly|every other week\b/i.test(text)) return "biweekly" as const;
	if (/\bweekly|every week\b/i.test(text)) return "weekly" as const;
	if (/\bdaily|every day\b/i.test(text)) return "daily" as const;
	return "monthly" as const;
}

function removeFrequency(text: string) {
	return text
		.replace(/\bbiweekly|every other week|weekly|every week|daily|every day|monthly|every month\b/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function removeMatchedGroup(text: string, group: SmartGroupOption | undefined) {
	if (!group) return text;
	return text
		.replace(
			new RegExp(`\\b(?:in|for|with)\\s+${escapeRegExp(group.name)}\\b|\\b${escapeRegExp(group.name)}\\b`, "i"),
			" ",
		)
		.replace(/\s+/g, " ")
		.trim();
}

function guessGroupCategory(text: string): SmartBarGroupDraft["category"] {
	const category = /\b(family|friends|work|other)\b/i.exec(text)?.[1]?.toLowerCase();
	if (category === "family" || category === "friends" || category === "work") {
		return category;
	}
	return "other";
}

function cleanGroupName(text: string) {
	return text
		.replace(/\b(family|friends|work|other)\b/gi, " ")
		.replace(/\b(with|for|category)\b/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function extractTimeOfDay(
	text: string,
): { hours: number; minutes: number; match: RegExpExecArray } | null {
	const withMeridiem = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(
		text,
	);
	if (withMeridiem?.[1]) {
		let hours = Number(withMeridiem[1]) % 12;
		if (withMeridiem[3]?.toLowerCase() === "pm") hours += 12;
		return {
			hours,
			minutes: Number(withMeridiem[2] ?? 0),
			match: withMeridiem,
		};
	}

	const with24h = /\bat\s+(\d{1,2})(?::(\d{2}))?\b/i.exec(text);
	if (with24h?.[1]) {
		const hours = Number(with24h[1]);
		if (hours >= 0 && hours <= 23) {
			return { hours, minutes: Number(with24h[2] ?? 0), match: with24h };
		}
	}

	return null;
}

function nextWeekdayDate(
	now: Date,
	weekdayIndex: number,
	hasExplicitTime: boolean,
) {
	const result = new Date(now);
	result.setHours(0, 0, 0, 0);
	let daysToAdd = (weekdayIndex - result.getDay() + 7) % 7;
	if (daysToAdd === 0 && !hasExplicitTime) daysToAdd = 7;
	result.setDate(result.getDate() + daysToAdd);
	return result;
}

function parseAgendaFields(
	remainder: string,
	agendaType: SmartBarAgendaType,
	fallbackTitle: string,
	now: Date,
): Omit<SmartBarAgendaDraft, "kind"> {
	if (agendaType === "note") {
		return {
			agendaType,
			title: cleanTitle(remainder, fallbackTitle),
			startTime: now,
			repeatInterval: "none",
			scheduleMode: "legacy",
			scheduleTimes: [],
			intervalMinutes: null,
		};
	}

	let text = remainder;
	let repeatInterval: "none" | "daily" | "weekly" | "monthly" = "none";
	let scheduleMode: "legacy" | "fixedTimes" | "interval" = "legacy";
	let intervalMinutes: number | null = null;

	const timesPerDay = /\b(\d+)\s*times?\s*(?:a|per)\s*day\b/i.exec(text);
	if (timesPerDay?.[1]) {
		const count = Number(timesPerDay[1]);
		if (count > 0) {
			intervalMinutes = Math.max(15, Math.round((24 * 60) / count));
			scheduleMode = "interval";
			text = stripMatch(text, timesPerDay);
		}
	} else {
		const daily = /\bevery\s*day\b|\bdaily\b/i.exec(text);
		const weekly = /\bevery\s*week\b|\bweekly\b/i.exec(text);
		const monthly = /\bevery\s*month\b|\bmonthly\b/i.exec(text);
		const recurrenceMatch = daily ?? weekly ?? monthly;
		if (recurrenceMatch) {
			repeatInterval = daily ? "daily" : weekly ? "weekly" : "monthly";
			text = stripMatch(text, recurrenceMatch);
		}
	}

	const time = extractTimeOfDay(text);
	if (time) text = stripMatch(text, time.match);
	const hours = time?.hours ?? 9;
	const minutes = time?.minutes ?? 0;

	let targetDate: Date | null = null;
	const weekdayMatch = WEEKDAYS.map((name, index) => ({ name, index }))
		.map((entry) => ({
			...entry,
			match: new RegExp(`\\b${entry.name}\\b`, "i").exec(text),
		}))
		.find((entry) => entry.match);
	if (weekdayMatch?.match) {
		targetDate = nextWeekdayDate(now, weekdayMatch.index, Boolean(time));
		text = stripMatch(text, weekdayMatch.match);
	} else {
		const tomorrowMatch = /\btomorrow\b/i.exec(text);
		const todayMatch = /\btoday\b/i.exec(text);
		const tonightMatch = /\btonight\b/i.exec(text);
		if (tomorrowMatch) {
			targetDate = new Date(now);
			targetDate.setDate(targetDate.getDate() + 1);
			targetDate.setHours(0, 0, 0, 0);
			text = stripMatch(text, tomorrowMatch);
		} else if (todayMatch) {
			targetDate = new Date(now);
			targetDate.setHours(0, 0, 0, 0);
			text = stripMatch(text, todayMatch);
		} else if (tonightMatch) {
			targetDate = new Date(now);
			targetDate.setHours(0, 0, 0, 0);
			text = stripMatch(text, tonightMatch);
		}
	}

	if (!targetDate) {
		targetDate = new Date(now);
		targetDate.setHours(0, 0, 0, 0);
	}
	targetDate.setHours(hours, minutes, 0, 0);

	const isSingleOccurrence =
		repeatInterval === "none" && scheduleMode === "legacy";
	if (isSingleOccurrence && targetDate.getTime() <= now.getTime()) {
		targetDate.setDate(targetDate.getDate() + 1);
	}

	return {
		agendaType,
		title: cleanTitle(text, fallbackTitle),
		startTime: targetDate,
		repeatInterval,
		scheduleMode,
		scheduleTimes: scheduleMode === "interval" ? [] : [],
		intervalMinutes,
	};
}

export function parseSmartBarCommand(
	input: string,
	context: SmartBarContext,
): SmartBarDraft | null {
	const now = context.now ?? new Date();
	const withoutLeadingVerb = input
		.trim()
		.replace(/^(add|create|new|log|set|track)\s+/i, "");
	if (!withoutLeadingVerb) return null;

	const incomeKeyword = /^income\b/i.exec(withoutLeadingVerb);
	const budgetKeyword = /^budget\b/i.exec(withoutLeadingVerb);
	const groupKeyword = /^(?:a\s+)?(?:group|team|shared space)\b/i.exec(withoutLeadingVerb);
	const expenseKeyword = /^expense\b/i.exec(withoutLeadingVerb);
	const reminderKeyword = /^(reminder|remind(?:\s+me)?(?:\s+to)?)\b/i.exec(
		withoutLeadingVerb,
	);
	const noteKeyword = /^note\b/i.exec(withoutLeadingVerb);
	const taskKeyword = /^(task|todo|appointment|meeting)\b/i.exec(
		withoutLeadingVerb,
	);
	const searchKeyword = /^(find|search|lookup|show)\b/i.exec(withoutLeadingVerb);

	const groupOptions = context.groups.map((group) => ({
		id: group.id,
		name: group.name,
	}));

	if (searchKeyword) {
		const remainder = stripMatch(withoutLeadingVerb, searchKeyword);
		const scopeMatch = /^(expenses?|spending|agendas?|tasks?|reminders?|notes?)\b/i.exec(remainder);
		const scopeText = scopeMatch?.[1]?.toLowerCase() ?? "";
		const scope = /^(agendas?|tasks?|reminders?|notes?)$/.test(scopeText)
			? "agenda"
			: /^(expenses?|spending)$/.test(scopeText)
				? "expenses"
				: "all";
		const query = scopeMatch
			? stripMatch(remainder, scopeMatch)
			: remainder;
		return {
			kind: "search",
			query,
			scope,
			filters: parseSmartFindQuery(query, context),
		};
	}

	if (incomeKeyword) {
		const remainder = stripMatch(withoutLeadingVerb, incomeKeyword);
		const extracted = extractAmount(remainder, context.defaultCurrency);
		if (!extracted) return null;
		const groupMatch = matchGroupByName(extracted.remainder, groupOptions);
		const nameText = removeMatchedGroup(extracted.remainder, groupMatch)
			.replace(/\b(of|for)\b/gi, " ")
			.replace(/\s+/g, " ")
			.trim();
		const frequency = getFrequency(withoutLeadingVerb);
		const nowDate = now.getDate();
		return {
			kind: "income",
			amount: extracted.amount,
			currency: extracted.currency,
			category: guessIncomeCategory(nameText),
			name: cleanTitle(removeFrequency(nameText), "Income"),
			groupId: groupMatch?.id ?? null,
			frequency,
			recurrenceDay: frequency === "weekly" || frequency === "biweekly"
				? ((now.getDay() + 6) % 7) + 1
				: nowDate > 28 ? 0 : nowDate,
		};
	}

	if (budgetKeyword || /\bbudget\b/i.test(withoutLeadingVerb)) {
		const remainder = budgetKeyword
			? stripMatch(withoutLeadingVerb, budgetKeyword)
			: withoutLeadingVerb;
		const extracted = extractAmount(remainder, context.defaultCurrency);
		if (!extracted) return null;
		const groupMatch = matchGroupByName(extracted.remainder, groupOptions);
		const period = getFrequency(withoutLeadingVerb);
		const nameText = removeMatchedGroup(extracted.remainder, groupMatch)
			.replace(/\bbudget\b/gi, " ")
			.replace(/\b(of|for|on|a|an|to|is|limit)\b/gi, " ")
			.replace(/\b(daily|every day|weekly|every week|biweekly|every other week|monthly|every month)\b/gi, " ")
			.replace(/\s+/g, " ")
			.trim();
		return {
			kind: "budget",
			amount: extracted.amount,
			currency: extracted.currency,
			name: cleanTitle(nameText, "Budget"),
			groupId: groupMatch?.id ?? null,
			period: period === "biweekly" ? "weekly" : period,
		};
	}

	if (groupKeyword) {
		const remainder = stripMatch(withoutLeadingVerb, groupKeyword);
		const name = cleanGroupName(remainder);
		if (name.length < 2) return null;
		return { kind: "group", name: cleanTitle(name, "Group"), category: guessGroupCategory(remainder) };
	}

	if (!incomeKeyword && INCOME_CUES.test(withoutLeadingVerb)) {
		const extracted = extractAmount(withoutLeadingVerb, context.defaultCurrency);
		if (extracted) {
			const groupMatch = matchGroupByName(extracted.remainder, groupOptions);
			const frequency = getFrequency(withoutLeadingVerb);
			return {
				kind: "income",
				amount: extracted.amount,
				currency: extracted.currency,
				category: guessIncomeCategory(extracted.remainder),
				name: cleanTitle(removeFrequency(extracted.remainder), "Income"),
				groupId: groupMatch?.id ?? null,
				frequency,
				recurrenceDay: frequency === "weekly" || frequency === "biweekly"
					? ((now.getDay() + 6) % 7) + 1
					: now.getDate() > 28 ? 0 : now.getDate(),
			};
		}
	}

	if (expenseKeyword) {
		const parsed = parseSmartExpenseText(
			stripMatch(withoutLeadingVerb, expenseKeyword),
			context,
		);
		return parsed ? { kind: "expense", ...parsed } : null;
	}

	if (reminderKeyword) {
		const remainder = stripMatch(withoutLeadingVerb, reminderKeyword);
		return {
			kind: "agenda",
			...parseAgendaFields(remainder, "reminder", "Reminder", now),
		};
	}

	if (noteKeyword) {
		const remainder = stripMatch(withoutLeadingVerb, noteKeyword);
		return {
			kind: "agenda",
			...parseAgendaFields(remainder, "note", "Note", now),
		};
	}

	if (taskKeyword) {
		const remainder = stripMatch(withoutLeadingVerb, taskKeyword);
		const fallbackTitle = capitalize(taskKeyword[1] ?? "Task");
		return {
			kind: "agenda",
			...parseAgendaFields(remainder, "task", fallbackTitle, now),
		};
	}

	const expenseFallback = parseSmartExpenseText(withoutLeadingVerb, context);
	if (expenseFallback) return { kind: "expense", ...expenseFallback };

	const hasDateCue =
		/\b(today|tomorrow|tonight|at\s+\d|\d(am|pm)|every\s*(day|week|month)|daily|weekly|monthly|times?\s*(a|per)\s*day)\b/i.test(
			withoutLeadingVerb,
		) ||
		WEEKDAYS.some((day) =>
			new RegExp(`\\b${day}\\b`, "i").test(withoutLeadingVerb),
		);

	if (hasDateCue) {
		return {
			kind: "agenda",
			...parseAgendaFields(withoutLeadingVerb, "task", "Task", now),
		};
	}

	return {
		kind: "agenda",
		...parseAgendaFields(withoutLeadingVerb, "note", "Note", now),
	};
}
