"use client";

import { ArrowLeft, ArrowRight, Banknote, Calendar, Check, CreditCard, Grid2x2, List, Loader2, Pencil, Plus, Tag, Trash2, UsersRound, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEncryptionVault } from "~/components/auth/encryption-vault-provider";
import { DateInputUs } from "~/components/ui/date-input-us";
import { decryptPayload, type EncryptedPayload, encryptPayload, type RecipientPublicKey } from "~/lib/e2ee";
import {
  convertCurrencyAmount,
  DEFAULT_EXCHANGE_RATES,
  getCurrencyMinorDigits,
  type Currency,
  type ExchangeRates,
} from "~/lib/currency";
import { authClient } from "~/server/better-auth/client";
import { api } from "~/trpc/react";

type ExpenseType = "one-off" | "recurring";
type ExpenseGroup = "family" | "work" | "friends" | "personal" | "other";
type ViewMode = "list" | "grid";

type CreditEntry = {
  id: string;
  kind: "income" | "deposit";
  label: string;
  subtitle?: string | null;
  amount: number;
  currency: Currency;
  date: Date;
  groupId?: string | null;
  groupName?: string | null;
};

const DEFAULT_CATEGORIES = ["Groceries", "Food & drinks", "Housing", "Bills & utilities", "Transport", "Shopping", "Health", "Entertainment", "Travel", "Cash & ATM", "Fees & taxes", "Education", "Personal care", "Gifts & charity", "Other"];
const CURRENCIES: Currency[] = ["USD", "EUR", "BTC"];
const MONTH_NAMES = Array.from({ length: 12 }, (_, index) => new Date(2020, index, 1).toLocaleDateString(undefined, { month: "short" }));

function getCurrentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;

  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function getMonthKeyFromDate(value: Date | string) {
  const date = new Date(value);
  return getCurrentMonthKey(date);
}

function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return getCurrentMonthKey();

  return getCurrentMonthKey(new Date(year, month - 1 + delta, 1));
}

function normalizeCurrency(value?: string | null): Currency {
  if (value === "EUR" || value === "BTC") return value;
  return "USD";
}

function getCurrencySymbol(currency: Currency) {
  switch (currency) {
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "BTC":
      return "₿";
  }
}

function formatCurrencyAmount(amount: number, currency: Currency) {
  if (currency === "BTC") {
    return `${amount.toFixed(8)} BTC`;
  }

  return `${getCurrencySymbol(currency)}${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function getCurrencyTone(currency: Currency) {
  switch (currency) {
    case "USD":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "EUR":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "BTC":
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function getCurrencyAccent(currency: Currency) {
  switch (currency) {
    case "USD":
      return "text-blue-600";
    case "EUR":
      return "text-emerald-600";
    case "BTC":
      return "text-amber-600";
  }
}

function getExpenseGroupMeta(group?: string | null) {
  switch (group) {
    case "family":
      return {
        label: "Family",
        tone: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200",
      };
    case "work":
      return {
        label: "Work",
        tone: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200",
      };
    case "friends":
      return {
        label: "Friends",
        tone: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200",
      };
    case "other":
      return {
        label: "Other",
        tone: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
      };
    case "personal":
    default:
      return {
        label: "Personal",
        tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
      };
  }
}

function normalizeExpenseType(expenseType?: string | null): ExpenseType {
  switch (expenseType) {
    case "recurring":
      return "recurring";
    case "fixed":
      return "recurring";
    case "variable":
      return "one-off";
    case "one-off":
    default:
      return "one-off";
  }
}

function getExpenseTypeMeta(expenseType: string | null | undefined) {
  const normalizedExpenseType = normalizeExpenseType(expenseType);

  switch (normalizedExpenseType) {
    case "recurring":
      return {
        label: "Recurring",
        tone: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200",
      };
    case "one-off":
    default:
      return {
        label: "One-off",
        tone: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200",
      };
  }
}

function convertAmountToCurrency(
  amount: number,
  fromCurrency: Currency,
  targetCurrency: Currency,
  rates: ExchangeRates = DEFAULT_EXCHANGE_RATES,
) {
  return convertCurrencyAmount(amount, fromCurrency, targetCurrency, rates);
}

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function SpendingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const { keys: encryptionKeys, privateKey: vaultPrivateKey } = useEncryptionVault();
  const [isOpen, setIsOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [handledEditTargetId, setHandledEditTargetId] = useState<string | null>(null);
  const { data: session } = authClient.useSession();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthKey());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState(() => new Date().getFullYear());
  const monthPickerRef = useRef<HTMLDivElement>(null);
  const [selectedScopeId, setSelectedScopeId] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [clearTarget, setClearTarget] = useState("all");
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<Currency>("USD");
  const [legacyLocalCategories, setLegacyLocalCategories] = useState<string[] | null>(null);
  const [customCategoryValue, setCustomCategoryValue] = useState("");
  const [isMigratingLegacy, setIsMigratingLegacy] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const [form, setForm] = useState({
    desc: "",
    notes: "",
    amount: "",
    cat: "Groceries",
    group: "personal" as ExpenseGroup,
    groupId: "",
    budgetId: "",
    cur: "USD" as Currency,
    date: toDatetimeLocalValue(new Date()),
    expenseType: "one-off" as ExpenseType,
    recurrenceFrequency: "none" as "none" | "daily" | "weekly" | "monthly",
    recurrenceDay: "1",
    paidByUserId: "",
  });

  const utils = api.useUtils();
  const { data: storedList, isLoading } = api.spending.getAll.useQuery();
  const [list, setList] =
    useState<
      Array<
        NonNullable<typeof storedList>[number] & {
          description: string;
          notes: string;
        }
      >
    >();
  const { data: expenseGroupRecipients = [], isFetching: isFetchingExpenseRecipients } = api.encryption.getGroupRecipients.useQuery({ groupId: form.groupId || "00000000-0000-0000-0000-000000000000" }, { enabled: Boolean(form.groupId) });
  const { data: householdRecipients = [] } = api.encryption.getHouseholdRecipients.useQuery();
  const { data: householdMembers = [] } = api.household.getMembers.useQuery();
  const { data: sharedGroups = [] } = api.group.listMine.useQuery();
  const { data: categorySettings } = api.spending.categories.useQuery();
  const { data: budgetOverview } = api.budget.overview.useQuery();
  const [decryptedBudgetOverview, setDecryptedBudgetOverview] = useState<typeof budgetOverview>();
  const { data: householdBalances = [] } = api.household.getBalances.useQuery();
  const { data: exchangeRatesData } = api.spending.getExchangeRates.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const rates = exchangeRatesData ?? DEFAULT_EXCHANGE_RATES;

  useEffect(() => {
    if (!isMonthPickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !monthPickerRef.current?.contains(event.target)) {
        setIsMonthPickerOpen(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !monthPickerRef.current?.contains(event.target)) {
        setIsMonthPickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMonthPickerOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMonthPickerOpen]);

  useEffect(() => {
    if (!budgetOverview) {
      setDecryptedBudgetOverview(undefined);
      return;
    }

    let cancelled = false;
    void Promise.all([
      Promise.all(
        budgetOverview.budgets.map(async (item) => {
          if (!item.encryptedPayload) return { ...item, name: item.name ?? "Budget" };
          const payload = await decryptPayload<{ name: string }>(JSON.parse(item.encryptedPayload) as EncryptedPayload, `budget:${item.id}:text:v1`, encryptionKeys.userId, vaultPrivateKey);
          return { ...item, name: payload.name };
        }),
      ),
      Promise.all(
        budgetOverview.incomes.map(async (item) => {
          if (!item.encryptedPayload) return { ...item, name: item.name ?? "Income source" };
          const payload = await decryptPayload<{ name: string }>(JSON.parse(item.encryptedPayload) as EncryptedPayload, `income:${item.id}:text:v1`, encryptionKeys.userId, vaultPrivateKey);
          return { ...item, name: payload.name };
        }),
      ),
    ])
      .then(([budgets, incomes]) => {
        if (!cancelled) setDecryptedBudgetOverview({ budgets, incomes });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDecryptedBudgetOverview(undefined);
          alert(error instanceof Error ? error.message : "Unable to decrypt budget labels.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [budgetOverview, encryptionKeys, vaultPrivateKey]);

  useEffect(() => {
    if (!storedList || !encryptionKeys) {
      setList(undefined);
      return;
    }

    let cancelled = false;
    void Promise.all(
      storedList.map(async (item) => {
        if (!item.encryptedPayload) {
          return { ...item, description: item.description ?? "", notes: "" };
        }

        const payload = await decryptPayload<{
          description: string;
          notes?: string;
        }>(JSON.parse(item.encryptedPayload) as EncryptedPayload, `expense:${item.id}:text:v1`, encryptionKeys.userId, vaultPrivateKey);
        return {
          ...item,
          description: payload.description,
          notes: payload.notes ?? "",
        };
      }),
    )
      .then((decrypted) => {
        if (!cancelled) setList(decrypted);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setList(undefined);
          alert(error instanceof Error ? error.message : "Unable to decrypt expense descriptions.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storedList, encryptionKeys, vaultPrivateKey]);

  const settleMutation = api.household.settle.useMutation({
    onSuccess: async () => {
      await utils.household.getBalances.invalidate();
    },
  });
  const saveCategories = api.spending.saveCategories.useMutation({
    onSuccess: async () => {
      await utils.spending.categories.invalidate();
    },
    onError: (error) => alert(error.message),
  });
  const clearExpenses = api.spending.clearExpenses.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.spending.getAll.invalidate(), utils.budget.overview.invalidate(), utils.household.getBalances.invalidate()]);
    },
    onError: (error) => alert(error.message),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedView = window.localStorage.getItem("spag-spending-view-mode");
    const savedMonth = window.localStorage.getItem("spag-spending-selected-month");
    const savedCurrency = window.localStorage.getItem("spag-spending-display-currency");
    const savedCategories = window.localStorage.getItem("spag-spending-custom-categories");

    if (savedView === "list" || savedView === "grid") {
      setViewMode(savedView);
    }

    if (savedMonth && /^\d{4}-\d{2}$/.test(savedMonth)) {
      setSelectedMonth(savedMonth);
    }

    if (savedCurrency === "USD" || savedCurrency === "EUR" || savedCurrency === "BTC") {
      setDisplayCurrency(savedCurrency);
      setForm((current) => ({ ...current, cur: savedCurrency }));
    }

    try {
      const parsed = savedCategories ? (JSON.parse(savedCategories) as unknown) : [];
      setLegacyLocalCategories(Array.isArray(parsed) ? parsed.filter((category): category is string => typeof category === "string" && category.trim().length > 0) : []);
    } catch {
      setLegacyLocalCategories([]);
    }

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !categorySettings || legacyLocalCategories === null) return;
    const categories = categorySettings.personal;
    const categoriesToMigrate = legacyLocalCategories.filter((category) => !categories.some((saved) => saved.toLowerCase() === category.toLowerCase()));

    if (categoriesToMigrate.length === 0) {
      window.localStorage.removeItem("spag-spending-custom-categories");
      setLegacyLocalCategories(null);
      return;
    }

    setLegacyLocalCategories(null);
    saveCategories.mutate(
      { type: "personal", categories: [...categories, ...categoriesToMigrate] },
      {
        onSuccess: () => window.localStorage.removeItem("spag-spending-custom-categories"),
        onError: (error) => alert(error.message),
      },
    );
  }, [categorySettings, legacyLocalCategories, mounted, saveCategories]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    window.localStorage.setItem("spag-spending-view-mode", viewMode);
  }, [mounted, viewMode]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    window.localStorage.setItem("spag-spending-selected-month", selectedMonth);
  }, [mounted, selectedMonth]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    window.localStorage.setItem("spag-spending-display-currency", displayCurrency);
  }, [mounted, displayCurrency]);

  const addMutation = api.spending.add.useMutation({
    onSuccess: () => {
      setIsOpen(false);
      setShowAdvanced(false);
      setCustomCategoryValue("");
      setForm({
        desc: "",
        notes: "",
        amount: "",
        cat: DEFAULT_CATEGORIES[0] ?? "Other",
        group: "personal",
        groupId: "",
        budgetId: "",
        cur: displayCurrency,
        date: toDatetimeLocalValue(new Date()),
        expenseType: "one-off",
        recurrenceFrequency: "none",
        recurrenceDay: "1",
        paidByUserId: "",
      });
    },
    onSettled: async () => {
      await utils.spending.getAll.invalidate();
    },
  });

  const updateMutation = api.spending.update.useMutation({
    onSuccess: async () => {
      setIsOpen(false);
      setEditingExpenseId(null);
      await utils.spending.getAll.invalidate();
    },
  });
  const migrateLegacyMutation = api.spending.update.useMutation({
    onSuccess: () => void utils.spending.getAll.invalidate(),
  });

  const deleteMutation = api.spending.delete.useMutation({
    onSuccess: async () => {
      await utils.spending.getAll.invalidate();
    },
  });

  const transactions = list ?? [];
  const legacyExpenseCount = (storedList ?? []).filter((item) => !item.encryptedPayload).length;

  const migrateLegacyExpenses = async () => {
    const legacyExpenses = (storedList ?? []).filter((item) => !item.encryptedPayload);
    if (legacyExpenses.length === 0) return;

    setMigrationError("");
    setIsMigratingLegacy(true);
    try {
      for (const item of legacyExpenses) {
        const sharingWithGroup = Boolean(item.groupId && item.visibility === "group");
        const members = sharingWithGroup
          ? await utils.encryption.getGroupRecipients.fetch({
              groupId: item.groupId!,
            })
          : householdRecipients;
        const recipients: RecipientPublicKey[] = members.map((member) => {
          if (member.userId === encryptionKeys.userId) {
            return { userId: member.userId, key: encryptionKeys.publicKey };
          }
          if (!member.publicKey) {
            throw new Error("All household or group members need encryption keys before these expenses can be migrated.");
          }
          return { userId: member.userId, key: member.publicKey };
        });

        const encryptedPayload = await encryptPayload({ description: item.description ?? "" }, `expense:${item.id}:text:v1`, recipients);
        const recurrenceFrequency = item.recurrenceFrequency === "daily" || item.recurrenceFrequency === "weekly" || item.recurrenceFrequency === "monthly" ? item.recurrenceFrequency : "none";

        await migrateLegacyMutation.mutateAsync({
          id: item.id,
          encryptedPayload,
          amount: item.amount,
          category: item.category,
          group: item.group as ExpenseGroup,
          currency: normalizeCurrency(item.currency),
          createdAt: new Date(item.createdAt),
          expenseType: normalizeExpenseType(item.expenseType),
          recurrenceFrequency,
          recurrenceDay: item.recurrenceDay ?? undefined,
          paidByUserId: item.paidByUserId ?? undefined,
          groupId: item.groupId ?? undefined,
          visibility: item.groupId && item.visibility === "group" ? "group" : "personal",
          budgetId: item.budgetId ?? undefined,
        });
      }

      void utils.spending.getAll.invalidate();
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : "Unable to migrate all expense descriptions.");
    } finally {
      setIsMigratingLegacy(false);
    }
  };

  const openExpenseEditor = (item: (typeof transactions)[number]) => {
    setEditingExpenseId(item.id);
    setForm({
      desc: item.description ?? "",
      notes: item.notes ?? "",
      amount: item.amount,
      cat: item.category,
      group: (item.group as ExpenseGroup) || "personal",
      groupId: item.groupId ?? "",
      budgetId: item.budgetId ?? "",
      cur: normalizeCurrency(item.currency),
      date: toDatetimeLocalValue(new Date(item.createdAt)),
      expenseType: normalizeExpenseType(item.expenseType),
      recurrenceFrequency: (item.recurrenceFrequency as "none" | "daily" | "weekly" | "monthly") || "none",
      recurrenceDay: item.recurrenceFrequency === "monthly" && Number(item.recurrenceDay) > 28 ? "0" : String(item.recurrenceDay ?? 1),
      paidByUserId: item.paidByUserId === session?.user.id ? "" : (item.paidByUserId ?? ""),
    });
    setShowAdvanced(true);
    setIsOpen(true);
  };

  const editTargetId = searchParams.get("edit");
  useEffect(() => {
    if (!editTargetId) {
      setHandledEditTargetId(null);
      return;
    }
    if (!list || handledEditTargetId === editTargetId) return;

    const targetExpense = list.find((item) => item.id === editTargetId);
    if (targetExpense) openExpenseEditor(targetExpense);
    setHandledEditTargetId(editTargetId);
    router.replace("/spending", { scroll: false });
  }, [editTargetId, handledEditTargetId, list, router]);

  const visibleTransactions = useMemo(
    () =>
      transactions
        .filter((item) => getMonthKeyFromDate(item.createdAt) === selectedMonth && (selectedScopeId === "all" || (selectedScopeId === "personal" ? !item.groupId : item.groupId === selectedScopeId)) && (selectedCategory === "all" || item.category === selectedCategory))
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [selectedCategory, selectedMonth, selectedScopeId, transactions],
  );

  const monthLabel = getMonthLabel(selectedMonth);
  const monthTotal = useMemo(() => visibleTransactions.reduce((sum, item) => sum + convertAmountToCurrency(Number(item.amount), normalizeCurrency(item.currency), displayCurrency, rates), 0), [displayCurrency, rates, visibleTransactions]);

  // Budget top-ups and income sources land in the ledger the month they were added/start
  const creditEntries = useMemo<CreditEntry[]>(() => {
    const entries: CreditEntry[] = [];

    for (const budgetRow of decryptedBudgetOverview?.budgets ?? []) {
      const date = new Date(budgetRow.createdAt);
      if (getMonthKeyFromDate(date) !== selectedMonth) continue;

      const linkedGroup = budgetRow.groupId ? sharedGroups.find((group) => group.id === budgetRow.groupId) : undefined;

      entries.push({
        id: `budget-${budgetRow.id}`,
        kind: "deposit",
        label: "Manual deposit",
        subtitle: budgetRow.name,
        amount: Number(budgetRow.amount),
        currency: normalizeCurrency(budgetRow.currency),
        date,
        groupId: budgetRow.groupId ?? null,
        groupName: linkedGroup?.name ?? null,
      });
    }

    for (const incomeRow of decryptedBudgetOverview?.incomes ?? []) {
      const date = new Date(incomeRow.startDate);
      if (getMonthKeyFromDate(date) !== selectedMonth) continue;

      const linkedGroup = incomeRow.groupId ? sharedGroups.find((group) => group.id === incomeRow.groupId) : undefined;

      entries.push({
        id: `income-${incomeRow.id}`,
        kind: "income",
        label: incomeRow.name ?? "Income source",
        subtitle: incomeRow.category,
        amount: Number(incomeRow.amount),
        currency: normalizeCurrency(incomeRow.currency),
        date,
        groupId: incomeRow.groupId ?? null,
        groupName: linkedGroup?.name ?? null,
      });
    }

    return entries;
  }, [decryptedBudgetOverview, selectedMonth, sharedGroups]);

  const visibleCreditEntries = useMemo(() => creditEntries.filter((entry) => selectedCategory === "all" && (selectedScopeId === "all" || (selectedScopeId === "personal" ? !entry.groupId : entry.groupId === selectedScopeId))), [creditEntries, selectedCategory, selectedScopeId]);
  const personalCategories = categorySettings?.personal ?? DEFAULT_CATEGORIES;
  const selectedGroupCategories = categorySettings?.groups.find((group) => group.id === selectedScopeId)?.categories ?? [];
  const filterCategories = Array.from(new Set(selectedScopeId === "all" ? [...personalCategories, ...(categorySettings?.groups.flatMap((group) => group.categories) ?? [])] : selectedScopeId === "personal" || selectedGroupCategories.length === 0 ? personalCategories : selectedGroupCategories));
  const formGroupCategories = categorySettings?.groups.find((group) => group.id === form.groupId)?.categories ?? [];
  const formCategories = formGroupCategories.length > 0 ? formGroupCategories : personalCategories;

  useEffect(() => {
    if (editingExpenseId || formCategories.length === 0) return;
    setForm((current) => (formCategories.includes(current.cat) ? current : { ...current, cat: formCategories[0] ?? "Other" }));
  }, [editingExpenseId, formCategories, form.groupId]);

  useEffect(() => {
    if (selectedCategory !== "all" && !filterCategories.includes(selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [filterCategories, selectedCategory]);

  const activeGroups = sharedGroups.filter((group) => group.memberStatus === "active");

  const ledgerItems = useMemo(
    () =>
      [
        ...visibleTransactions.map((item) => ({
          type: "expense" as const,
          date: new Date(item.createdAt),
          expense: item,
        })),
        ...visibleCreditEntries.map((entry) => ({
          type: "credit" as const,
          date: entry.date,
          credit: entry,
        })),
      ].sort((left, right) => right.date.getTime() - left.date.getTime()),
    [visibleCreditEntries, visibleTransactions],
  );

  // Wallet-style balance: all-time personal deposits/income minus all-time personal spend, same regardless of the month being browsed
  const personalRunningBalance = useMemo(() => {
    const totalDeposits =
      (budgetOverview?.budgets ?? []).filter((budgetRow) => !budgetRow.groupId).reduce((sum, budgetRow) => sum + convertAmountToCurrency(Number(budgetRow.amount), normalizeCurrency(budgetRow.currency), displayCurrency, rates), 0) +
      (budgetOverview?.incomes ?? []).filter((incomeRow) => !incomeRow.groupId).reduce((sum, incomeRow) => sum + convertAmountToCurrency(Number(incomeRow.amount), normalizeCurrency(incomeRow.currency), displayCurrency, rates), 0);

    const totalPersonalSpent = transactions.filter((item) => !item.groupId).reduce((sum, item) => sum + convertAmountToCurrency(Number(item.amount), normalizeCurrency(item.currency), displayCurrency, rates), 0);

    return totalDeposits - totalPersonalSpent;
  }, [budgetOverview, displayCurrency, rates, transactions]);

  // Running balance per active group (all-time): deposits/income in that group minus group spend
  const groupRunningBalances = useMemo(() => {
    return sharedGroups
      .filter((group) => group.memberStatus === "active")
      .map((group) => {
        const totalDeposits =
          (budgetOverview?.budgets ?? []).filter((budgetRow) => budgetRow.groupId === group.id).reduce((sum, budgetRow) => sum + convertAmountToCurrency(Number(budgetRow.amount), normalizeCurrency(budgetRow.currency), displayCurrency, rates), 0) +
          (budgetOverview?.incomes ?? []).filter((incomeRow) => incomeRow.groupId === group.id).reduce((sum, incomeRow) => sum + convertAmountToCurrency(Number(incomeRow.amount), normalizeCurrency(incomeRow.currency), displayCurrency, rates), 0);

        const totalSpent = transactions.filter((item) => item.groupId === group.id).reduce((sum, item) => sum + convertAmountToCurrency(Number(item.amount), normalizeCurrency(item.currency), displayCurrency, rates), 0);

        return {
          groupId: group.id,
          name: group.name,
          balance: totalDeposits - totalSpent,
        };
      })
      .filter((entry) => Math.abs(entry.balance) > 0.01);
  }, [budgetOverview, displayCurrency, rates, sharedGroups, transactions]);

  // Net cash flow per scope (personal + each active group) for the selected month: credits in, expenses out
  const monthlyScopeSummaries = useMemo(() => {
    const scopes: Array<{ key: string; name: string; groupId: string | null }> = [
      { key: "personal", name: "Personal", groupId: null },
      ...sharedGroups
        .filter((group) => group.memberStatus === "active")
        .map((group) => ({
          key: group.id,
          name: group.name,
          groupId: group.id,
        })),
    ];

    return scopes.map((scope) => {
      const credits = creditEntries.filter((entry) => (entry.groupId ?? null) === scope.groupId).reduce((sum, entry) => sum + convertAmountToCurrency(entry.amount, entry.currency, displayCurrency, rates), 0);

      const expenses = transactions.filter((item) => getMonthKeyFromDate(item.createdAt) === selectedMonth && (item.groupId ?? null) === scope.groupId).reduce((sum, item) => sum + convertAmountToCurrency(Number(item.amount), normalizeCurrency(item.currency), displayCurrency, rates), 0);

      return { ...scope, credits, expenses, net: credits - expenses };
    });
  }, [creditEntries, displayCurrency, rates, selectedMonth, sharedGroups, transactions]);

  const handleAddCategory = () => {
    const nextCategory = customCategoryValue.trim();
    if (!nextCategory) return;
    const currentCategories = categorySettings?.personal ?? DEFAULT_CATEGORIES;
    if (currentCategories.some((category) => category.toLowerCase() === nextCategory.toLowerCase())) return;
    saveCategories.mutate({
      type: "personal",
      categories: [...currentCategories, nextCategory],
    });
    setForm((current) => ({ ...current, cat: nextCategory }));
    setCustomCategoryValue("");
  };

  const handleRemoveCategory = (categoryToRemove: string) => {
    const currentCategories = categorySettings?.personal ?? DEFAULT_CATEGORIES;
    const remainingCategories = currentCategories.filter((category) => category !== categoryToRemove);
    if (remainingCategories.length === 0) return;
    if (selectedCategory === categoryToRemove) setSelectedCategory("all");
    if (clearTarget === `category:${categoryToRemove}`) setClearTarget("all");
    if (form.cat === categoryToRemove) {
      setForm((current) => ({
        ...current,
        cat: remainingCategories[0] ?? "Other",
      }));
    }
    saveCategories.mutate({
      type: "personal",
      categories: remainingCategories,
    });
  };

  const handleClearExpenses = () => {
    if (clearTarget === "all") {
      if (window.confirm("Delete all expenses you created? This cannot be undone.")) {
        clearExpenses.mutate({ type: "all" });
      }
      return;
    }

    if (clearTarget.startsWith("category:")) {
      const category = clearTarget.slice("category:".length);
      if (window.confirm(`Delete your personal expenses in ${category}? This cannot be undone.`)) {
        clearExpenses.mutate({ type: "personalCategory", category });
      }
      return;
    }

    const groupId = clearTarget.slice("group:".length);
    const groupName = sharedGroups.find((group) => group.id === groupId)?.name ?? "this group";
    if (window.confirm(`Delete every expense in ${groupName}, including other members' expenses? This cannot be undone.`)) {
      clearExpenses.mutate({ type: "group", groupId });
    }
  };

  const handleMonthStep = (delta: number) => {
    setSelectedMonth((current) => shiftMonth(current, delta));
  };

  const toggleMonthPicker = () => {
    if (!isMonthPickerOpen) {
      setMonthPickerYear(Number(selectedMonth.slice(0, 4)));
    }
    setIsMonthPickerOpen((open) => !open);
  };

  const totalVisible = visibleTransactions.length;
  const settleUpSuggestions = useMemo(() => {
    const suggestions: Array<{
      fromUserId: string;
      toUserId: string;
      from: string;
      to: string;
      amount: number;
      currency: Currency;
    }> = [];

      const currencies = Array.from(
        new Set(householdBalances.map((entry) => normalizeCurrency(entry.currency))),
    );
    for (const currency of currencies) {
      const digits = getCurrencyMinorDigits(currency);
      const threshold = 10 ** -digits;
      const balances = householdBalances
        .filter((entry) => normalizeCurrency(entry.currency) === currency)
        .map((entry) => ({
          userId: entry.userId,
          balance: entry.balance,
          name:
            householdMembers.find((member) => member.id === entry.userId)?.name ??
            "Unknown",
        }))
        .filter((entry) => Math.abs(entry.balance) >= threshold);

      const creditors = balances.filter((entry) => entry.balance > 0);
      const debtors = balances.filter((entry) => entry.balance < 0);

      for (const debtor of debtors) {
        let remaining = Math.abs(debtor.balance);

        for (const creditor of creditors) {
          if (remaining < threshold) break;
          const amount = Math.min(remaining, creditor.balance);
          if (amount >= threshold) {
            suggestions.push({
              fromUserId: debtor.userId,
              toUserId: creditor.userId,
              from: debtor.name,
              to: creditor.name,
              amount: Number(amount.toFixed(digits)),
              currency,
            });
            remaining = Number((remaining - amount).toFixed(digits));
            creditor.balance = Number(
              (creditor.balance - amount).toFixed(digits),
            );
          }
        }
      }
    }

    return suggestions;
  }, [householdBalances, householdMembers]);

  if (!mounted) return null;

  return (
    <main className="min-h-[calc(100dvh-8rem)] bg-emerald-50/50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        {legacyExpenseCount > 0 && (
          <section className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/60 dark:bg-amber-950/30">
            <div>
              <p className="font-bold text-amber-900 text-sm dark:text-amber-200">
                {legacyExpenseCount} expense {legacyExpenseCount === 1 ? "description is" : "descriptions are"} still stored as plaintext.
              </p>
              <p className="mt-1 text-amber-800/80 text-xs dark:text-amber-200/70">Descriptions are encrypted in this browser. Shared expenses require encryption keys for all group members.</p>
              {migrationError && (
                <p className="mt-2 text-red-600 text-xs dark:text-red-300" role="alert">
                  {migrationError}
                </p>
              )}
            </div>
            <button className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 font-black text-amber-950 text-xs uppercase tracking-widest disabled:opacity-50" disabled={isMigratingLegacy} onClick={() => void migrateLegacyExpenses()} type="button">
              {isMigratingLegacy && <Loader2 className="h-4 w-4 animate-spin" />}
              Encrypt legacy descriptions
            </button>
          </section>
        )}

        <section className="rounded-[2rem] border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur-sm sm:p-6 lg:p-7 dark:border-gray-800 dark:bg-gray-950/90">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-black text-[10px] text-slate-500 uppercase tracking-[0.28em] dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                <Wallet className="h-3.5 w-3.5" />
                Financial Stream
              </div>
              <div>
                <h1 className="font-black text-3xl text-slate-950 tracking-tight sm:text-4xl dark:text-white">Spending</h1>
                <p className="mt-1 max-w-2xl text-slate-500 text-sm dark:text-gray-400">One ledger, live conversion, and a clearer month picker.</p>
              </div>
            </div>

            <button
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-black text-emerald-800 text-xs uppercase tracking-[0.24em] transition hover:border-emerald-300 hover:bg-emerald-100 active:scale-[0.98] dark:border-emerald-900/60 dark:bg-gray-900 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
              onClick={() => {
                setEditingExpenseId(null);
                setShowAdvanced(false);
                setForm({
                  desc: "",
                  notes: "",
                  amount: "",
                  cat: DEFAULT_CATEGORIES[0] ?? "Other",
                  group: "personal",
                  groupId: "",
                  budgetId: "",
                  cur: displayCurrency,
                  date: toDatetimeLocalValue(new Date()),
                  expenseType: "one-off",
                  recurrenceFrequency: "none",
                  recurrenceDay: "1",
                  paidByUserId: "",
                });
                setIsOpen(true);
              }}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Add expense
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-950">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="mr-1 shrink-0 font-black text-[10px] text-slate-500 uppercase tracking-[0.2em] dark:text-gray-400">Month</span>
              <button
                aria-label="Previous month"
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                onClick={() => handleMonthStep(-1)}
                type="button"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="relative min-w-0 flex-1 sm:flex-none" ref={monthPickerRef}>
                <button
                  aria-controls="spending-month-picker"
                  aria-expanded={isMonthPickerOpen}
                  aria-haspopup="dialog"
                  aria-label={`Choose month, currently ${monthLabel}`}
                  className="inline-flex w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-black text-slate-950 text-sm transition hover:bg-slate-100 sm:w-auto dark:border-gray-800 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800"
                  onClick={toggleMonthPicker}
                  type="button"
                >
                  <Calendar className="h-4 w-4 shrink-0 text-slate-500 dark:text-gray-400" />
                  <span className="truncate">{monthLabel}</span>
                </button>
                {isMonthPickerOpen && (
                  <div aria-label="Choose month and year" className="absolute top-full left-1/2 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900" id="spending-month-picker" role="dialog">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="font-black text-slate-900 text-sm dark:text-white">Select month</span>
                      <select
                        aria-label="Select year"
                        className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-semibold text-slate-900 text-sm outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        onChange={(event) => setMonthPickerYear(Number(event.target.value))}
                        value={monthPickerYear}
                      >
                        {Array.from(new Set([...Array.from({ length: 21 }, (_, index) => new Date().getFullYear() - 10 + index), Number(selectedMonth.slice(0, 4))]))
                          .sort((a, b) => a - b)
                          .map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {MONTH_NAMES.map((month, index) => {
                        const monthKey = `${monthPickerYear}-${String(index + 1).padStart(2, "0")}`;
                        const isSelected = selectedMonth === monthKey;

                        return (
                          <button
                            aria-label={`Choose ${month} ${monthPickerYear}`}
                            aria-pressed={isSelected}
                            className={`rounded-lg px-2 py-2.5 font-semibold text-sm transition ${isSelected ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-emerald-50 dark:text-gray-200 dark:hover:bg-gray-800"}`}
                            key={month}
                            onClick={() => {
                              setSelectedMonth(monthKey);
                              setIsMonthPickerOpen(false);
                            }}
                            type="button"
                          >
                            {month}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button
                className="shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 font-black text-[10px] text-slate-500 uppercase tracking-[0.16em] transition hover:bg-slate-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
                onClick={() => setSelectedMonth(getCurrentMonthKey())}
                type="button"
              >
                Current
              </button>
              <button
                aria-label="Next month"
                className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                onClick={() => handleMonthStep(1)}
                type="button"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <label className="flex items-center gap-2 font-black text-[10px] text-slate-500 uppercase tracking-[0.2em] dark:text-gray-400">
                Currency
                <select
                  aria-label="Display currency"
                  className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-900 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                  onChange={(event) => setDisplayCurrency(event.target.value as Currency)}
                  value={displayCurrency}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>

              <div aria-label="Display view" className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-gray-800 dark:bg-gray-900" role="group">
                <button
                  aria-label="List view"
                  aria-pressed={viewMode === "list"}
                  className={`inline-flex h-8 w-9 cursor-pointer items-center justify-center rounded-lg transition ${
                    viewMode === "list" ? "bg-white text-emerald-800 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-200" : "text-slate-500 hover:bg-emerald-100 hover:text-emerald-800 dark:text-gray-400 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-200"
                  }`}
                  onClick={() => setViewMode("list")}
                  type="button"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  aria-label="Grid view"
                  aria-pressed={viewMode === "grid"}
                  className={`inline-flex h-8 w-9 cursor-pointer items-center justify-center rounded-lg transition ${
                    viewMode === "grid" ? "bg-white text-emerald-800 shadow-sm dark:bg-emerald-950/40 dark:text-emerald-200" : "text-slate-500 hover:bg-emerald-100 hover:text-emerald-800 dark:text-gray-400 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-200"
                  }`}
                  onClick={() => setViewMode("grid")}
                  type="button"
                >
                  <Grid2x2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="font-bold text-slate-600 text-xs dark:text-gray-300" htmlFor="spending-scope-filter">
                Show:
              </label>
              <select
                className="min-w-44 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-800 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                id="spending-scope-filter"
                onChange={(event) => {
                  setSelectedScopeId(event.target.value);
                  setSelectedCategory("all");
                }}
                value={selectedScopeId}
              >
                <option value="all">All spending</option>
                <option value="personal">Personal</option>
                {sharedGroups
                  .filter((group) => group.memberStatus === "active")
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-bold text-slate-600 text-xs dark:text-gray-300">Category</span>
              <button
                className={`rounded-full border px-3 py-1.5 font-semibold text-xs ${selectedCategory === "all" ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"}`}
                onClick={() => setSelectedCategory("all")}
                type="button"
              >
                All
              </button>
              {filterCategories.map((category) => (
                <button
                  className={`rounded-full border px-3 py-1.5 font-semibold text-xs ${selectedCategory === category ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"}`}
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  type="button"
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-slate-200 border-t pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
              <button className="inline-flex items-center gap-2 self-start font-bold text-slate-700 text-xs dark:text-gray-200" onClick={() => setShowCategoryManager((current) => !current)} type="button">
                <Tag className="h-4 w-4" /> {showCategoryManager ? "Hide personal categories" : "Manage personal categories"}
              </button>
              <div className="flex flex-wrap gap-2">
                <select aria-label="Expenses to clear" className="min-w-52 rounded-xl border border-rose-200 bg-white px-3 py-2 text-slate-700 text-xs dark:border-rose-950 dark:bg-gray-900 dark:text-gray-200" onChange={(event) => setClearTarget(event.target.value)} value={clearTarget}>
                  <option value="all">All expenses I created</option>
                  {personalCategories.map((category) => (
                    <option key={category} value={`category:${category}`}>
                      Personal category: {category}
                    </option>
                  ))}
                  {sharedGroups
                    .filter((group) => group.memberStatus === "active" && group.role === "owner")
                    .map((group) => (
                      <option key={group.id} value={`group:${group.id}`}>
                        Entire group: {group.name}
                      </option>
                    ))}
                </select>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 px-3 py-2 font-bold text-rose-700 text-xs transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  disabled={clearExpenses.isPending}
                  onClick={handleClearExpenses}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" /> {clearExpenses.isPending ? "Deleting..." : "Clear expenses"}
                </button>
              </div>
            </div>
            {showCategoryManager && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-gray-900">
                <p className="text-slate-500 text-xs">Remove categories from future entries; past transactions keep their saved category label.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {personalCategories.map((category) => (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950" key={category}>
                      {category}
                      <button aria-label={`Remove ${category} category`} className="rounded p-1 text-slate-400 hover:text-rose-600" disabled={saveCategories.isPending || personalCategories.length <= 1} onClick={() => handleRemoveCategory(category)} type="button">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <form
                  className="mt-3 flex max-w-md gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleAddCategory();
                  }}
                >
                  <input className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950 dark:text-white" maxLength={80} onChange={(event) => setCustomCategoryValue(event.target.value)} placeholder="Add a personal category" value={customCategoryValue} />
                  <button className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 font-bold text-white text-xs disabled:opacity-50" disabled={!customCategoryValue.trim() || saveCategories.isPending} type="submit">
                    <Plus className="h-4 w-4" /> Add
                  </button>
                </form>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-slate-950 shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-white">
            <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400">Spent this month</p>
            <p className="mt-3 font-black text-4xl tracking-tighter sm:text-5xl">{formatCurrencyAmount(monthTotal, displayCurrency)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2 font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-gray-700 dark:bg-gray-900">{displayCurrency}</span>
              <span>{totalVisible} entries</span>
            </div>
          </article>

          <article className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400">Balance</p>
              <Link
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-black text-[10px] text-slate-600 uppercase tracking-[0.2em] transition hover:bg-slate-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                href="/budgets"
              >
                Manage
              </Link>
            </div>

            <p className="mt-3 font-black text-[10px] text-slate-500 uppercase tracking-[0.2em] dark:text-gray-400">Personal</p>
            <p className={`mt-1 font-black text-2xl tracking-tight ${personalRunningBalance < 0 ? "text-rose-600" : "text-slate-950 dark:text-white"}`}>{formatCurrencyAmount(personalRunningBalance, displayCurrency)}</p>

            {groupRunningBalances.length > 0 && (
              <div className="mt-4 space-y-2 border-slate-200 border-t pt-3 dark:border-gray-800">
                <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.2em] dark:text-gray-400">Groups</p>
                {groupRunningBalances.map((entry) => {
                  const positive = entry.balance >= 0;
                  return (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900" key={entry.groupId}>
                      <span className="font-bold text-slate-950 text-sm dark:text-white">{entry.name}</span>
                      <span className={`font-black text-sm ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                        {positive ? "+" : "-"}
                        {formatCurrencyAmount(Math.abs(entry.balance), displayCurrency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2 text-slate-500 text-sm dark:text-gray-400">
              <Wallet className="h-4 w-4" />
              Running balances include deposits and income minus spend
            </div>
          </article>
        </section>

        <section className="space-y-4 pb-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-950 text-xl tracking-tight dark:text-white">Transactions</h2>
              <p className="text-slate-500 text-sm dark:text-gray-400">
                Showing {monthLabel.toLowerCase()} in {displayCurrency}.
              </p>
            </div>
            <div className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] sm:block dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">{totalVisible} items</div>
          </div>

          {isLoading ? (
            <div className="rounded-[1.75rem] border border-slate-200 border-dashed bg-white p-10 text-center font-black text-[10px] text-slate-400 uppercase tracking-[0.32em] dark:border-gray-800 dark:bg-gray-950">Syncing ledger...</div>
          ) : ledgerItems.length === 0 ? (
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10 dark:border-gray-800 dark:bg-gray-950">
              <p className="font-black text-lg text-slate-950 tracking-tight dark:text-white">No transactions for {monthLabel}.</p>
              <p className="mt-2 text-slate-500 text-sm dark:text-gray-400">Pick a different month or add a new expense to start the ledger.</p>
            </div>
          ) : (
            <div className={viewMode === "list" ? "space-y-3" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"}>
              {ledgerItems.map((ledgerItem) => {
                if (ledgerItem.type === "credit") {
                  const entry = ledgerItem.credit;
                  const convertedCredit = convertAmountToCurrency(entry.amount, entry.currency, displayCurrency, rates);

                  return (
                    <article className={`rounded-[1.75rem] border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20 ${viewMode === "list" ? "" : "min-h-[10rem]"}`} key={entry.id}>
                      <div className={`flex ${viewMode === "list" ? "items-center justify-between gap-4" : "flex-col gap-4"}`}>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-white text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                            <Wallet className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate font-bold text-slate-950 text-sm dark:text-white">{entry.label}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-2 font-black text-[10px] text-emerald-700 uppercase tracking-[0.24em] dark:text-emerald-200">
                              <span className="rounded-full bg-white px-2.5 py-1 dark:bg-emerald-950/40">{entry.kind === "income" ? "Income" : "Deposit"}</span>
                              {entry.subtitle && <span className="rounded-full bg-white px-2.5 py-1 dark:bg-emerald-950/40">{entry.subtitle}</span>}
                              {entry.groupName && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 dark:bg-emerald-950/40">
                                  <UsersRound className="h-3 w-3" />
                                  {entry.groupName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className={`${viewMode === "list" ? "text-right" : "flex items-end justify-between gap-3"}`}>
                          <div className="space-y-1">
                            <p className="font-black text-2xl text-emerald-600 tracking-tighter">+{formatCurrencyAmount(convertedCredit, displayCurrency)}</p>
                            <p className="font-semibold text-[10px] text-slate-400 dark:text-gray-500">
                              {entry.date.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                }

                const item = ledgerItem.expense;
                const sourceCurrency = normalizeCurrency(item.currency);
                const convertedAmount = convertAmountToCurrency(Number(item.amount), sourceCurrency, displayCurrency, rates);
                const createdAt = new Date(item.createdAt);
                const isPending = createdAt.getTime() > Date.now();
                const groupName = item.groupId ? (sharedGroups.find((group) => group.id === item.groupId)?.name ?? getExpenseGroupMeta(item.group).label) : null;

                return (
                  <article
                    className={`group cursor-pointer rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-950 ${viewMode === "list" ? "" : "min-h-[10rem]"}`}
                    key={item.id}
                    onClick={() => openExpenseEditor(item)}
                  >
                    <div className={`flex ${viewMode === "list" ? "items-center justify-between gap-4" : "flex-col gap-4"}`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${getCurrencyTone(sourceCurrency)}`}>{item.category.toLowerCase().includes("food") ? <Banknote className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}</div>
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-slate-950 text-sm dark:text-white">{item.description}</h3>
                          {item.notes && <p className="mt-1 line-clamp-2 text-slate-500 text-xs dark:text-gray-400">{item.notes}</p>}
                          <div className="mt-1 flex flex-wrap items-center gap-2 font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-gray-900">
                              <Tag className="h-3 w-3" />
                              {item.category}
                            </span>
                            {normalizeExpenseType(item.expenseType) === "recurring" && <span className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-gray-900">{getExpenseTypeMeta(item.expenseType).label}</span>}
                            {isPending && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">Pending</span>}
                            {groupName && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200" title={`Shared with ${groupName}`}>
                                <UsersRound className="h-3 w-3" />
                                {groupName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className={`${viewMode === "list" ? "text-right" : "flex items-end justify-between gap-3"}`}>
                        <div className="space-y-1">
                          <p className={`font-black text-2xl tracking-tighter ${getCurrencyAccent(displayCurrency)}`}>{formatCurrencyAmount(convertedAmount, displayCurrency)}</p>
                          <div className="space-y-1 text-right">
                            <p className="font-semibold text-[10px] text-slate-400 dark:text-gray-500">
                              {createdAt.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                            <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.18em] dark:text-gray-400">Paid by {item.payerName ?? "Unknown"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            aria-label={`Edit ${item.description}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-white"
                            onClick={(event) => {
                              event.stopPropagation();
                              openExpenseEditor(item);
                            }}
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            aria-label={`Delete ${item.description}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-400 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                            disabled={deleteMutation.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              deleteMutation.mutate({ id: item.id });
                            }}
                            type="button"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <div>
            <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400">This month</p>
            <h2 className="mt-1 font-black text-slate-950 text-xl tracking-tight dark:text-white">This month expenses</h2>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {monthlyScopeSummaries.map((scope) => (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900" key={scope.key}>
                <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400">{scope.name}</p>
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <span className="font-bold text-emerald-600">+{formatCurrencyAmount(scope.credits, displayCurrency)}</span>
                  <span className="font-bold text-rose-600">-{formatCurrencyAmount(scope.expenses, displayCurrency)}</span>
                </div>
                <p className={`mt-1 font-black text-lg ${scope.net < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  Net: {scope.net < 0 ? "-" : "+"}
                  {formatCurrencyAmount(Math.abs(scope.net), displayCurrency)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400">Settle up</p>
                <h2 className="mt-1 font-black text-slate-950 text-xl tracking-tight dark:text-white">Shared balances</h2>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {settleUpSuggestions.length === 0 ? (
                <p className="text-slate-500 text-sm dark:text-gray-400">No balances to settle yet.</p>
              ) : (
                settleUpSuggestions.slice(0, 4).map((entry) => (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900"                   key={`${entry.currency}-${entry.from}-${entry.to}`}>
                    <div>
                      <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400">
                        {entry.from} → {entry.to}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-base text-slate-950 dark:text-white">                      {formatCurrencyAmount(entry.amount, entry.currency)}</span>
                      <button
                        aria-label={`Mark ${entry.from} paying ${entry.to} as settled`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-200 text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        disabled={settleMutation.isPending}
                        onClick={() => {
                          settleMutation.mutate({
                            fromUserId: entry.fromUserId,
                            toUserId: entry.toUserId,
                            amount: entry.amount,
                            currency: entry.currency,
                          });
                        }}
                        title="Mark settlement as paid"
                        type="button"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
            <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400">Balance view</p>
            <div className="mt-4 space-y-2">
              {householdBalances.length === 0 ? (
                <p className="text-slate-500 text-sm dark:text-gray-400">No household balances yet.</p>
              ) : (
                householdBalances.map((entry) => {
                  const member = householdMembers.find((candidate) => candidate.id === entry.userId);
                  const positive = entry.balance > 0;

                  return (
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900" key={`${entry.userId}-${entry.currency}`}>
                      <div>
                        <p className="font-bold text-slate-950 text-sm dark:text-white">{member?.name ?? "Unknown"}</p>
                      </div>
                      <span className={`font-black text-sm ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                        {positive ? "+" : "-"}
                        {formatCurrencyAmount(
                          Math.abs(entry.balance),
                          normalizeCurrency(entry.currency),
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-md sm:items-center sm:p-6">
          <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-center justify-between border-slate-200 border-b px-5 py-4 sm:px-6 dark:border-gray-800">
              <div>
                <p className="font-black text-[10px] text-slate-500 uppercase tracking-[0.3em] dark:text-gray-400">{editingExpenseId ? "Edit entry" : "New entry"}</p>
                <h2 className="mt-1 font-black text-2xl text-slate-950 tracking-tight dark:text-white">{editingExpenseId ? "Edit expense" : "Add expense"}</h2>
              </div>
              <button
                aria-label="Close expense form"
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-900"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(92dvh-5rem)] overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <label className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-description">
                    Description
                  </label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-950 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                    id="spending-description"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        desc: event.target.value,
                      }))
                    }
                    placeholder="Transaction reference"
                    value={form.desc}
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-notes">
                    Comment <span className="font-medium normal-case tracking-normal">(optional)</span>
                  </label>
                  <textarea
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-950 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                    id="spending-notes"
                    maxLength={160}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                    placeholder="A detail to remember"
                    rows={2}
                    value={form.notes}
                  />
                  <p className="text-right text-[11px] text-slate-400 dark:text-gray-500">{form.notes.length}/160</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0 space-y-2">
                    <label className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-amount">
                      Amount ({getCurrencySymbol(form.cur)})
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-black text-slate-500 text-sm dark:text-gray-400">{getCurrencySymbol(form.cur)}</span>
                      <input
                        className="w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-4 pl-10 font-black text-lg text-slate-950 tracking-tight outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                        id="spending-amount"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            amount: event.target.value,
                          }))
                        }
                        placeholder="0.00"
                        step="any"
                        type="number"
                        value={form.amount}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 space-y-2">
                    <label className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-category">
                      Category
                    </label>
                    <select
                      className="w-full min-w-0 cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-950 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                      id="spending-category"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          cat: event.target.value,
                        }))
                      }
                      value={form.cat}
                    >
                      {!formCategories.includes(form.cat) && <option value={form.cat}>{form.cat} (past transaction)</option>}
                      {formCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="min-w-0 space-y-2">
                  <label className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-date">
                    Date
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <DateInputUs
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-950 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                      id="spending-date"
                      onChange={(date) => {
                        const timePart = form.date.split("T")[1] ?? "00:00";
                        setForm((current) => ({
                          ...current,
                          date: `${date}T${timePart}`,
                        }));
                      }}
                      value={form.date.split("T")[0] ?? ""}
                    />
                    <input
                      aria-label="Time"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-950 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                      onChange={(event) => {
                        const datePart = form.date.split("T")[0] ?? toDatetimeLocalValue(new Date()).split("T")[0];
                        setForm((current) => ({
                          ...current,
                          date: `${datePart}T${event.target.value}`,
                        }));
                      }}
                      type="time"
                      value={form.date.split("T")[1] ?? "00:00"}
                    />
                  </div>
                  {form.date && new Date(form.date).getTime() > Date.now() && <p className="font-semibold text-[11px] text-amber-600 dark:text-amber-400">Future date — this expense will show as Pending until then.</p>}
                </div>

                <div className="border-slate-200 border-t pt-3 dark:border-gray-800">
                  <button className="inline-flex cursor-pointer items-center gap-2 font-black text-[10px] text-slate-600 uppercase tracking-[0.24em] transition hover:text-slate-900 dark:text-gray-300 dark:hover:text-white" onClick={() => setShowAdvanced((current) => !current)} type="button">
                    {showAdvanced ? "Hide advanced options" : "Advanced options"}
                    {showAdvanced ? <ArrowLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {showAdvanced && (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                    <div className="space-y-2">
                      <label className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-advanced-currency">
                        Currency
                      </label>
                      <select
                        className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-950 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                        id="spending-advanced-currency"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            cur: event.target.value as Currency,
                          }))
                        }
                        value={form.cur}
                      >
                        {CURRENCIES.map((currency) => (
                          <option key={currency} value={currency}>
                            {currency}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-expense-type">
                          Expense type
                        </label>
                        <select
                          className="w-full min-w-0 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-950 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                          id="spending-expense-type"
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              expenseType: event.target.value as ExpenseType,
                            }))
                          }
                          value={form.expenseType}
                        >
                          <option value="one-off">One-off expense</option>
                          <option value="recurring">Recurring payment</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-group">
                          Group
                        </label>
                        <select
                          className="w-full min-w-0 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-950 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                          id="spending-group"
                          onChange={(event) => {
                            const selected = sharedGroups.find((group) => group.id === event.target.value);
                            const selectedGroupCategories = categorySettings?.groups.find((group) => group.id === selected?.id)?.categories ?? [];
                            const availableCategories = selectedGroupCategories.length > 0 ? selectedGroupCategories : personalCategories;
                            setForm((current) => ({
                              ...current,
                              groupId: selected?.id ?? "",
                              budgetId: "",
                              cat: availableCategories.includes(current.cat) ? current.cat : (availableCategories[0] ?? "Groceries"),
                              group: (selected?.category ?? "personal") as ExpenseGroup,
                            }));
                          }}
                          value={form.groupId}
                        >
                          <option value="">Personal</option>
                          {sharedGroups
                            .filter((group) => group.memberStatus === "active")
                            .map((group) => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                        </select>

                        <label className="mt-3 block font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-budget">
                          Budget
                        </label>
                        <select
                          className="w-full min-w-0 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-950 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                          id="spending-budget"
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              budgetId: event.target.value,
                            }))
                          }
                          value={form.budgetId}
                        >
                          <option value="">No budget selected</option>
                          {(decryptedBudgetOverview?.budgets ?? [])
                            .filter((budget) => (budget.groupId ?? "") === form.groupId)
                            .map((budget) => (
                              <option key={budget.id} value={budget.id}>
                                {budget.name ?? "Budget"} · {budget.remaining.toFixed(2)} left
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    {form.expenseType === "recurring" && (
                      <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/60 dark:bg-violet-950/20">
                        <p className="font-black text-[10px] text-violet-700 uppercase tracking-[0.24em] dark:text-violet-200">Repeat schedule</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <select
                            className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 font-bold text-slate-950 text-sm dark:border-violet-900/60 dark:bg-gray-900 dark:text-white"
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                recurrenceFrequency: event.target.value as typeof current.recurrenceFrequency,
                              }))
                            }
                            value={form.recurrenceFrequency}
                          >
                            <option value="daily">Every day</option>
                            <option value="weekly">Every week</option>
                            <option value="monthly">Every month</option>
                          </select>
                          {form.recurrenceFrequency === "weekly" ? (
                            <select
                              className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 font-bold text-slate-950 text-sm dark:border-violet-900/60 dark:bg-gray-900 dark:text-white"
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  recurrenceDay: event.target.value,
                                }))
                              }
                              value={form.recurrenceDay}
                            >
                              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => (
                                <option key={day} value={String(index + 1)}>
                                  {day}
                                </option>
                              ))}
                            </select>
                          ) : form.recurrenceFrequency === "monthly" ? (
                            <select
                              className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 font-bold text-slate-950 text-sm dark:border-violet-900/60 dark:bg-gray-900 dark:text-white"
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  recurrenceDay: event.target.value,
                                }))
                              }
                              value={form.recurrenceDay}
                            >
                              {Array.from({ length: 28 }, (_, index) => (
                                <option key={index + 1} value={String(index + 1)}>
                                  Day {index + 1}
                                </option>
                              ))}
                              <option value="0">Last day of the month</option>
                            </select>
                          ) : (
                            <p className="flex items-center rounded-2xl border border-violet-200 px-4 py-3 text-sm text-violet-800 dark:border-violet-900/60 dark:text-violet-200">Repeats every day</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="font-black text-[10px] text-slate-500 uppercase tracking-[0.24em] dark:text-gray-400" htmlFor="spending-payer">
                        Paid by
                      </label>
                      <select
                        className="w-full min-w-0 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-950 text-sm outline-none transition focus:border-slate-400 dark:border-gray-800 dark:bg-gray-900 dark:text-white"
                        id="spending-payer"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            paidByUserId: event.target.value,
                          }))
                        }
                        value={form.paidByUserId || ""}
                      >
                        <option value="">Me</option>
                        {householdMembers
                          .filter((member) => member.id !== session?.user.id)
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="pt-1">
                  <button
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-4 font-black text-[11px] text-white uppercase tracking-[0.28em] transition hover:bg-slate-800 active:scale-[0.99] dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                    onClick={async () => {
                      const parsedAmount = Number(form.amount);
                      const createdAt = form.date ? new Date(form.date) : new Date();

                      if (!form.desc.trim() || !form.amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0 || Number.isNaN(createdAt.getTime())) {
                        return;
                      }

                      try {
                        if (form.groupId && isFetchingExpenseRecipients) {
                          throw new Error("Wait for group encryption keys to load before saving.");
                        }

                        const id = editingExpenseId ?? crypto.randomUUID();
                        const members = form.groupId ? expenseGroupRecipients : householdRecipients;
                        const recipients: RecipientPublicKey[] = members.map((member) => {
                          if (member.userId === encryptionKeys.userId) {
                            return {
                              userId: member.userId,
                              key: encryptionKeys.publicKey,
                            };
                          }
                          if (!member.publicKey) {
                            throw new Error("Every household or group member must set up encryption before sharing expenses.");
                          }
                          return {
                            userId: member.userId,
                            key: member.publicKey,
                          };
                        });

                        const encryptedPayload = await encryptPayload({ description: form.desc, notes: form.notes.trim() }, `expense:${id}:text:v1`, recipients);
                        const payload = {
                          id,
                          encryptedPayload,
                          amount: form.amount,
                          category: form.cat,
                          group: form.group,
                          currency: form.cur,
                          expenseType: form.expenseType,
                          recurrenceFrequency: form.expenseType === "recurring" ? form.recurrenceFrequency : "none",
                          recurrenceDay: form.expenseType === "recurring" ? Number(form.recurrenceDay) : undefined,
                          paidByUserId: form.paidByUserId || undefined,
                          groupId: form.groupId || undefined,
                          budgetId: form.budgetId || undefined,
                          visibility: form.groupId ? ("group" as const) : ("personal" as const),
                          createdAt,
                        };

                        if (editingExpenseId) {
                          await updateMutation.mutateAsync(payload);
                        } else {
                          await addMutation.mutateAsync(payload);
                        }
                      } catch (error) {
                        alert(error instanceof Error ? error.message : "Unable to encrypt expense description.");
                      }
                    }}
                    type="button"
                  >
                    {editingExpenseId ? "Save changes" : "Add expense"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
