"use client";

import { Plus, Trash2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { useEncryptionVault } from "~/components/auth/encryption-vault-provider";
import { decryptPayload, encryptPayload, type EncryptedPayload } from "~/lib/e2ee";

type Currency = "USD" | "EUR" | "BTC";
type Frequency = "daily" | "weekly" | "biweekly" | "monthly";

const field = "w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-violet-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white";
const money = (amount: number, currency: string) => `${currency === "EUR" ? "€" : currency === "BTC" ? "₿" : "$"}${amount.toFixed(currency === "BTC" ? 8 : 2)}`;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// ISO weekday (1=Monday..7=Sunday) of a yyyy-mm-dd string, used to anchor weekly/biweekly schedules to the start date
const isoWeekdayOf = (dateString: string) => {
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return 1;
  return ((parsed.getDay() + 6) % 7) + 1;
};

export default function BudgetsPage() {
  const utils = api.useUtils();
  const { keys: encryptionKeys, privateKey } = useEncryptionVault();
  const { data: storedData, isLoading } = api.budget.overview.useQuery();
  type StoredOverview = NonNullable<typeof storedData>;
  type DecryptedOverview = {
    budgets: Array<Omit<StoredOverview["budgets"][number], "name"> & { name: string }>;
    incomes: Array<Omit<StoredOverview["incomes"][number], "name"> & { name: string }>;
  };
  const [data, setData] = useState<DecryptedOverview>();
  const { data: groups = [] } = api.group.listMine.useQuery();
  const activeGroups = groups.filter((group) => group.memberStatus === "active");
  const { data: householdRecipients = [] } = api.encryption.getHouseholdRecipients.useQuery();
  const [budget, setBudget] = useState({ name: "", amount: "", currency: "USD" as Currency, groupId: "" });
  const [income, setIncome] = useState({ name: "", category: "Salary", amount: "", currency: "USD" as Currency, frequency: "monthly" as Frequency, recurrenceDay: "1", startDate: new Date().toISOString().slice(0, 10), groupId: "" });
  const [wipeScope, setWipeScope] = useState("all");
  const [isMigratingLegacy, setIsMigratingLegacy] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const { data: budgetGroupRecipients = [], isFetching: isFetchingBudgetRecipients } =
    api.encryption.getGroupRecipients.useQuery(
      { groupId: budget.groupId || "00000000-0000-0000-0000-000000000000" },
      { enabled: Boolean(budget.groupId) },
    );
  const { data: incomeGroupRecipients = [], isFetching: isFetchingIncomeRecipients } =
    api.encryption.getGroupRecipients.useQuery(
      { groupId: income.groupId || "00000000-0000-0000-0000-000000000000" },
      { enabled: Boolean(income.groupId) },
    );

  useEffect(() => {
    if (!storedData) {
      setData(undefined);
      return;
    }

    let cancelled = false;
    void Promise.all([
      Promise.all(storedData.budgets.map(async (item) => {
        if (!item.encryptedPayload) return { ...item, name: item.name ?? "Budget" };
        const payload = await decryptPayload<{ name: string }>(
          JSON.parse(item.encryptedPayload) as EncryptedPayload,
          `budget:${item.id}:text:v1`,
          encryptionKeys.userId,
          privateKey,
        );
        return { ...item, name: payload.name };
      })),
      Promise.all(storedData.incomes.map(async (item) => {
        if (!item.encryptedPayload) return { ...item, name: item.name ?? "Income source" };
        const payload = await decryptPayload<{ name: string }>(
          JSON.parse(item.encryptedPayload) as EncryptedPayload,
          `income:${item.id}:text:v1`,
          encryptionKeys.userId,
          privateKey,
        );
        return { ...item, name: payload.name };
      })),
    ])
      .then(([budgets, incomes]) => {
        if (!cancelled) setData({ budgets, incomes });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setData(undefined);
          alert(error instanceof Error ? error.message : "Unable to decrypt budget labels.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storedData, encryptionKeys, privateKey]);

  const createBudget = api.budget.create.useMutation({ onSuccess: () => { void utils.budget.overview.invalidate(); setBudget({ name: "", amount: "", currency: "USD", groupId: "" }); } });
  const removeBudget = api.budget.delete.useMutation({ onSuccess: () => { void utils.budget.overview.invalidate(); } });
  const migrateBudgetMutation = api.budget.migrateName.useMutation({ onSuccess: () => void utils.budget.overview.invalidate() });
  const addIncome = api.budget.addIncome.useMutation({ onSuccess: () => { void utils.budget.overview.invalidate(); setIncome({ name: "", category: "Salary", amount: "", currency: "USD", frequency: "monthly", recurrenceDay: "1", startDate: new Date().toISOString().slice(0, 10), groupId: "" }); } });
  const removeIncome = api.budget.deleteIncome.useMutation({ onSuccess: () => { void utils.budget.overview.invalidate(); } });
  const wipeRecords = api.budget.wipe.useMutation({ onSuccess: () => { void utils.budget.overview.invalidate(); } });
  const migrateIncomeMutation = api.budget.migrateIncomeName.useMutation({ onSuccess: () => void utils.budget.overview.invalidate() });

  const getRecordRecipients = (groupId: string, groupRecipients: typeof budgetGroupRecipients) => {
    const members = groupId ? groupRecipients : householdRecipients;
    const recipients = members.map((member) => {
      if (member.userId === encryptionKeys.userId) {
        return { userId: member.userId, key: encryptionKeys.publicKey };
      }
      if (!member.publicKey) {
        throw new Error("Every household or group member must set up encryption before sharing this name.");
      }
      return { userId: member.userId, key: member.publicKey };
    });

    if (!recipients.some((recipient) => recipient.userId === encryptionKeys.userId)) {
      recipients.push({ userId: encryptionKeys.userId, key: encryptionKeys.publicKey });
    }

    return recipients;
  };

  const saveBudget = async () => {
    if (!budget.amount) return;
    if (budget.groupId && isFetchingBudgetRecipients) {
      alert("Wait for group encryption keys to load before saving.");
      return;
    }

    try {
      const id = crypto.randomUUID();
      const encryptedPayload = await encryptPayload(
        { name: budget.name.trim() || "Budget" },
        `budget:${id}:text:v1`,
        getRecordRecipients(budget.groupId, budgetGroupRecipients),
      );
      await createBudget.mutateAsync({
        id,
        encryptedPayload,
        amount: budget.amount,
        currency: budget.currency,
        groupId: budget.groupId || undefined,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to encrypt budget name.");
    }
  };

  const saveIncome = async () => {
    if (!income.name || !income.amount) return;
    if (income.groupId && isFetchingIncomeRecipients) {
      alert("Wait for group encryption keys to load before saving.");
      return;
    }

    try {
      const id = crypto.randomUUID();
      const encryptedPayload = await encryptPayload(
        { name: income.name.trim() },
        `income:${id}:text:v1`,
        getRecordRecipients(income.groupId, incomeGroupRecipients),
      );
      await addIncome.mutateAsync({
        id,
        encryptedPayload,
        category: income.category,
        amount: income.amount,
        currency: income.currency,
        frequency: income.frequency,
        startDate: income.frequency === "monthly" ? new Date() : new Date(income.startDate),
        recurrenceDay: income.frequency === "weekly" || income.frequency === "biweekly"
          ? isoWeekdayOf(income.startDate)
          : Number(income.recurrenceDay),
        groupId: income.groupId || undefined,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to encrypt income name.");
    }
  };

  const legacyBudgetCount = (storedData?.budgets ?? []).filter((item) => !item.encryptedPayload).length;
  const legacyIncomeCount = (storedData?.incomes ?? []).filter((item) => !item.encryptedPayload).length;

  const migrateLegacyNames = async () => {
    setMigrationError("");
    setIsMigratingLegacy(true);
    try {
      for (const item of storedData?.budgets ?? []) {
        if (item.encryptedPayload) continue;
        const members = item.groupId
          ? await utils.encryption.getGroupRecipients.fetch({ groupId: item.groupId })
          : householdRecipients;
        const encryptedPayload = await encryptPayload(
          { name: item.name ?? "Budget" },
          `budget:${item.id}:text:v1`,
          getRecordRecipients(item.groupId ?? "", members),
        );
        await migrateBudgetMutation.mutateAsync({ id: item.id, encryptedPayload });
      }

      for (const item of storedData?.incomes ?? []) {
        if (item.encryptedPayload) continue;
        const members = item.groupId
          ? await utils.encryption.getGroupRecipients.fetch({ groupId: item.groupId })
          : householdRecipients;
        const encryptedPayload = await encryptPayload(
          { name: item.name ?? "Income source" },
          `income:${item.id}:text:v1`,
          getRecordRecipients(item.groupId ?? "", members),
        );
        await migrateIncomeMutation.mutateAsync({ id: item.id, encryptedPayload });
      }

      void utils.budget.overview.invalidate();
    } catch (error) {
      setMigrationError(error instanceof Error ? error.message : "Unable to migrate all budget labels.");
    } finally {
      setIsMigratingLegacy(false);
    }
  };

  const handleRemoveBudget = (id: string, name: string) => {
    if (window.confirm(`Remove the budget "${name}"? Linked expenses will remain, but no longer count toward this budget.`)) {
      removeBudget.mutate({ id });
    }
  };

  const handleRemoveIncome = (id: string, name: string) => {
    if (window.confirm(`Remove the income source "${name}"?`)) {
      removeIncome.mutate({ id });
    }
  };

  const handleWipe = (kind: "budgets" | "income") => {
    const scope = wipeScope === "all"
      ? { type: "all" as const }
      : wipeScope === "personal"
        ? { type: "personal" as const }
        : { type: "group" as const, groupId: wipeScope.slice("group:".length) };
    const scopeLabel = wipeScope === "all"
      ? "all available scopes"
      : wipeScope === "personal"
        ? "Personal"
        : activeGroups.find((group) => group.id === scope.groupId)?.name ?? "selected group";
    const recordLabel = kind === "budgets" ? "budgets" : "income sources";
    const detail = kind === "budgets" ? " Linked expenses will remain, but no longer count toward a budget." : "";

    if (window.confirm(`Delete all ${recordLabel} in ${scopeLabel}?${detail}`)) {
      wipeRecords.mutate({ kind, scope });
    }
  };

  const sortedBudgets = useMemo(
    () => [...(data?.budgets ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [data?.budgets],
  );

  const budgetScopes = useMemo(() => {
    const scopeMap = new Map<string, { groupId: string | null; label: string; totals: Map<string, { amount: number; spent: number; remaining: number }> }>();
    for (const item of sortedBudgets) {
      const key = item.groupId ?? "personal";
      if (!scopeMap.has(key)) {
        const label = item.groupId ? (activeGroups.find((group) => group.id === item.groupId)?.name ?? "Group") : "Personal";
        scopeMap.set(key, { groupId: item.groupId, label, totals: new Map() });
      }
      const scope = scopeMap.get(key);
      if (!scope) continue;
      const current = scope.totals.get(item.currency) ?? { amount: 0, spent: 0, remaining: 0 };
      current.amount += Number(item.amount);
      current.spent += item.spent;
      current.remaining += item.remaining;
      scope.totals.set(item.currency, current);
    }
    return Array.from(scopeMap.values());
  }, [sortedBudgets, activeGroups]);

  const personalScope = budgetScopes.find((scope) => scope.groupId === null);
  const groupScopes = budgetScopes.filter((scope) => scope.groupId !== null);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
      <header className="mb-6 flex items-end justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Plan your money</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Budgets & income</h1></div><Wallet className="h-7 w-7 text-violet-600" /></header>
      {(legacyBudgetCount > 0 || legacyIncomeCount > 0) && (
        <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
              {legacyBudgetCount + legacyIncomeCount} budget or income {legacyBudgetCount + legacyIncomeCount === 1 ? "name is" : "names are"} still stored as plaintext.
            </p>
            <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/70">
              Migration encrypts names in this browser; shared records require keys for every recipient.
            </p>
            {migrationError && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-300">{migrationError}</p>}
          </div>
          <button
            type="button"
            onClick={() => void migrateLegacyNames()}
            disabled={isMigratingLegacy}
            className="shrink-0 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-amber-950 disabled:opacity-50"
          >
            {isMigratingLegacy ? "Encrypting..." : "Encrypt legacy names"}
          </button>
        </section>
      )}
      <section className="mb-4 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-white p-4 dark:border-rose-950 dark:bg-gray-950 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Clear records from</span>
          <select className={field} onChange={(event) => setWipeScope(event.target.value)} value={wipeScope}>
            <option value="all">All scopes</option>
            <option value="personal">Personal only</option>
            {activeGroups.map((group) => <option key={group.id} value={`group:${group.id}`}>{group.name} only</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-300 px-3 py-3 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40 sm:flex-none" disabled={wipeRecords.isPending} onClick={() => handleWipe("budgets")} type="button">
            <Trash2 className="h-4 w-4" /> Clear budgets
          </button>
          <button className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-300 px-3 py-3 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40 sm:flex-none" disabled={wipeRecords.isPending} onClick={() => handleWipe("income")} type="button">
            <Trash2 className="h-4 w-4" /> Clear income
          </button>
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <h2 className="font-black text-slate-950 dark:text-white">Budgets</h2><p className="mt-1 text-sm text-slate-500">Link an expense to a matching budget and its remaining amount decreases.</p>
          {personalScope && (
            <div className="mt-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Personal</p>
              <div className="mt-2 flex flex-wrap gap-5">
                {Array.from(personalScope.totals.entries()).map(([budgetCurrency, totals]) => (
                  <div key={budgetCurrency}>
                    <p className={`text-3xl font-black ${totals.remaining < 0 ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400"}`}>{money(totals.remaining, budgetCurrency)}</p>
                    <p className="text-[10px] text-slate-500">of {money(totals.amount, budgetCurrency)} · {budgetCurrency}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {groupScopes.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {groupScopes.map((scope) => (
                <div key={scope.groupId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-gray-900">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{scope.label}</p>
                  <div className="mt-1 flex flex-wrap gap-4">
                    {Array.from(scope.totals.entries()).map(([budgetCurrency, totals]) => (
                      <div key={budgetCurrency}>
                        <p className={`text-lg font-black ${totals.remaining < 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(totals.remaining, budgetCurrency)}</p>
                        <p className="text-[10px] text-slate-500">of {money(totals.amount, budgetCurrency)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <form className="mt-5 space-y-2 border-t border-slate-200 pt-5 dark:border-gray-800" onSubmit={(event) => { event.preventDefault(); void saveBudget(); }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Add budget</p>
            <div className="grid grid-cols-2 gap-2"><input className={field} type="number" min="0" step={budget.currency === "BTC" ? "0.00000001" : "0.01"} placeholder="Amount" value={budget.amount} onChange={(event) => setBudget({ ...budget, amount: event.target.value })} /><select className={field} value={budget.currency} onChange={(event) => setBudget({ ...budget, currency: event.target.value as Currency })}><option>USD</option><option>EUR</option><option>BTC</option></select></div>
            <select className={field} value={budget.groupId} onChange={(event) => setBudget({ ...budget, groupId: event.target.value })}><option value="">Personal budget</option>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name} budget</option>)}</select>
            <input className={field} placeholder="Note (optional, e.g. where the money came from)" value={budget.name} onChange={(event) => setBudget({ ...budget, name: event.target.value })} />
            <button className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-violet-600 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> Add budget</button>
          </form>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <h2 className="font-black text-slate-950 dark:text-white">Income sources</h2><p className="mt-1 text-sm text-slate-500">Salary, direct deposits, rent, W-2, 1099, or custom income.</p><div className="mt-4 space-y-2">{data?.incomes.map((item) => <div key={item.id} className="flex justify-between gap-3 rounded-2xl border border-slate-200 p-3 dark:border-gray-800"><div><p className="font-bold text-slate-950 dark:text-white">{item.name}</p><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.category} · {item.frequency}</p></div><div className="flex items-start gap-3"><strong className="text-emerald-600">{money(Number(item.amount), item.currency)}</strong><button type="button" title="Remove income source" aria-label={`Remove ${item.name} income source`} disabled={removeIncome.isPending} onClick={() => handleRemoveIncome(item.id, item.name)} className="cursor-pointer text-slate-400 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>
          <form className="mt-5 space-y-2 border-t border-slate-200 pt-5 dark:border-gray-800" onSubmit={(event) => { event.preventDefault(); void saveIncome(); }}><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Add income</p><div className="grid grid-cols-2 gap-2"><input className={field} placeholder="Income name" value={income.name} onChange={(event) => setIncome({ ...income, name: event.target.value })} /><input className={field} placeholder="Category: Salary, W-2, 1099" value={income.category} onChange={(event) => setIncome({ ...income, category: event.target.value })} /></div><div className="grid grid-cols-2 gap-2"><input className={field} type="number" min="0" step={income.currency === "BTC" ? "0.00000001" : "0.01"} placeholder="Amount" value={income.amount} onChange={(event) => setIncome({ ...income, amount: event.target.value })} /><select className={field} value={income.currency} onChange={(event) => setIncome({ ...income, currency: event.target.value as Currency })}><option>USD</option><option>EUR</option><option>BTC</option></select></div><select className={field} value={income.frequency} onChange={(event) => setIncome({ ...income, frequency: event.target.value as Frequency })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option></select><div className="grid grid-cols-2 gap-2">
            {income.frequency !== "monthly" && (
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Starts on</span>
                <input className={field} type="date" value={income.startDate} onChange={(event) => setIncome({ ...income, startDate: event.target.value })} />
              </label>
            )}
            <label className={income.frequency === "monthly" ? "col-span-2 block" : "block"}>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                {income.frequency === "daily" ? "Repeats" : income.frequency === "monthly" ? "Day of month" : "Repeats on"}
              </span>
              {income.frequency === "daily" ? (
                <p className="flex items-center rounded-2xl border border-slate-200 px-3 py-3 text-xs text-slate-500 dark:border-gray-800">Every day at midnight</p>
              ) : income.frequency === "weekly" || income.frequency === "biweekly" ? (
                <p className="flex items-center rounded-2xl border border-slate-200 px-3 py-3 text-xs text-slate-500 dark:border-gray-800">{WEEKDAYS[isoWeekdayOf(income.startDate) - 1]} (from start date)</p>
              ) : (
                <select className={field} value={income.recurrenceDay} onChange={(event) => setIncome({ ...income, recurrenceDay: event.target.value })}>
                  {Array.from({ length: 28 }, (_, index) => <option key={index + 1} value={String(index + 1)}>Day {index + 1}</option>)}
                  <option value="0">Last day of the month</option>
                </select>
              )}
            </label>
          </div>
          <p className="text-xs text-slate-500">
            {income.frequency === "biweekly"
              ? "Starts on anchors the every-14-days cycle; the income lands on that weekday, every other week from the start date."
              : income.frequency === "monthly"
                ? "Lands on this day every month; if it already passed this month, the first payment is next month."
                : "Starts on marks when this income becomes active; it won't apply before that date."}
          </p><select className={field} value={income.groupId} onChange={(event) => setIncome({ ...income, groupId: event.target.value })}><option value="">Personal income</option>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name} income</option>)}</select><button className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-violet-600 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> Add income source</button></form>
        </section>
      </div>
      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
        <h2 className="font-black text-slate-950 dark:text-white">Previous budgets</h2><p className="mt-1 text-sm text-slate-500">Every budget you've added, oldest first.</p>
        <div className="mt-4 space-y-2">{isLoading ? <p className="text-sm text-slate-500">Loading...</p> : sortedBudgets.map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 p-3 dark:border-gray-800"><div className="flex justify-between gap-3"><div><p className="font-bold text-slate-950 dark:text-white">{item.name}</p><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{item.groupId ? activeGroups.find((group) => group.id === item.groupId)?.name ?? "Group" : "Personal"}</p></div><div className="flex items-start gap-3"><strong className={item.remaining < 0 ? "text-rose-600" : "text-emerald-600"}>{money(item.remaining, item.currency)}</strong><button type="button" title="Remove budget" aria-label={`Remove ${item.name} budget`} disabled={removeBudget.isPending} onClick={() => handleRemoveBudget(item.id, item.name)} className="cursor-pointer text-slate-400 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div></div><div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-gray-900"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, item.spent / Number(item.amount) * 100))}%` }} /></div><p className="mt-1 text-right text-[10px] text-slate-500">{money(item.spent, item.currency)} spent of {money(Number(item.amount), item.currency)}</p></div>)}</div>
      </section>
    </main>
  );
}
