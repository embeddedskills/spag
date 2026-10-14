"use client";

import { Check, Plus, Users, X } from "lucide-react";
import { useState } from "react";
import { api } from "~/trpc/react";

const categories = ["family", "friends", "work", "other"] as const;

export default function GroupsPage() {
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("family");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  const { data: groups = [] } = api.group.listMine.useQuery();
  const { data: categorySettings } = api.spending.categories.useQuery();
  const { data: members = [] } = api.group.getMembers.useQuery(
    { groupId: selectedGroupId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(selectedGroupId) },
  );
  const { data: requests = [] } = api.group.getRequests.useQuery(
    { groupId: selectedGroupId ?? "00000000-0000-0000-0000-000000000000" },
    {
      enabled: Boolean(
        selectedGroupId && groups.find((group) => group.id === selectedGroupId)?.role === "owner",
      ),
    },
  );
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const selectedGroupSettings = categorySettings?.groups.find((group) => group.id === selectedGroup?.id);

  const createMutation = api.group.create.useMutation({
    onSuccess: async (group) => {
      setName("");
      setSelectedGroupId(group.id);
      await utils.group.listMine.invalidate();
    },
  });
  const requestMutation = api.group.requestMember.useMutation({
    onSuccess: async () => {
      setUsername("");
      await utils.group.getRequests.invalidate();
    },
  });
  const reviewMutation = api.group.reviewRequest.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.group.getRequests.invalidate(), utils.group.getMembers.invalidate()]);
    },
  });
  const saveGroupCategories = api.spending.saveCategories.useMutation({
    onSuccess: async () => {
      setNewExpenseCategory("");
      await utils.spending.categories.invalidate();
    },
    onError: (error) => alert(error.message),
  });
  const setCategoryManager = api.group.setCategoryManager.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.group.getMembers.invalidate(), utils.spending.categories.invalidate()]);
    },
    onError: (error) => alert(error.message),
  });
  const canManageGroupCategories = selectedGroup?.role === "owner" || selectedGroupSettings?.canManageCategories;

  const addGroupCategory = () => {
    const category = newExpenseCategory.trim();
    if (!category || !selectedGroup) return;
    const categories = selectedGroupSettings?.categories ?? [];
    if (categories.some((existing) => existing.toLowerCase() === category.toLowerCase())) return;
    saveGroupCategories.mutate({ type: "group", groupId: selectedGroup.id, categories: [...categories, category] });
  };

  const removeGroupCategory = (categoryToRemove: string) => {
    if (!selectedGroup) return;
    const categories = selectedGroupSettings?.categories ?? [];
    saveGroupCategories.mutate({
      type: "group",
      groupId: selectedGroup.id,
      categories: categories.filter((category) => category !== categoryToRemove),
    });
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Shared spaces</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Groups</h1>
        </div>
        <Users className="h-7 w-7 text-amber-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-black text-slate-950 dark:text-white">Your groups</h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500 dark:bg-gray-900">{groups.length}</span>
          </div>
          <div className="space-y-2">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedGroupId(group.id)}
                className={`flex w-full cursor-pointer items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${selectedGroup?.id === group.id ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30" : "border-slate-200 hover:border-amber-200 hover:bg-amber-50 dark:border-gray-800 dark:hover:border-amber-900/60 dark:hover:bg-amber-950/30"}`}
              >
                <span>
                  <span className="block font-bold text-slate-950 dark:text-white">{group.name}</span>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">{group.category} · {group.role}</span>
                </span>
                <Users className="h-4 w-4 text-slate-400" />
              </button>
            ))}
            {groups.length === 0 && <p className="text-sm text-slate-500">Create your first shared group.</p>}
          </div>

          <form
            className="mt-5 space-y-3 border-t border-slate-200 pt-5 dark:border-gray-800"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) createMutation.mutate({ name, category });
            }}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">New group</p>
            <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-amber-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white" placeholder="Group name" value={name} onChange={(event) => setName(event.target.value)} />
            <select className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-amber-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white" value={category} onChange={(event) => setCategory(event.target.value as (typeof categories)[number])}>
              {categories.map((option) => <option key={option} value={option}>{option[0]?.toUpperCase()}{option.slice(1)}</option>)}
            </select>
            <button className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-amber-600 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={createMutation.isPending}><Plus className="h-4 w-4" /> Create group</button>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950">
          {!selectedGroup ? <p className="text-sm text-slate-500">Select or create a group to manage members.</p> : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">{selectedGroup.category}</p><h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{selectedGroup.name}</h2></div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">{selectedGroup.role}</span>
              </div>

              <form className="mt-6 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (username.trim()) requestMutation.mutate({ groupId: selectedGroup.id, username }); }}>
                <input className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-white" placeholder="Username to add" value={username} onChange={(event) => setUsername(event.target.value)} />
                <button className="cursor-pointer rounded-2xl bg-amber-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={requestMutation.isPending}>Request</button>
              </form>

              <div className="mt-6">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Members</p>
                <div className="space-y-2">
                  {members.map((member) => (
                    <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2 dark:border-gray-800">
                      <span className="font-semibold text-slate-900 dark:text-white">{member.name} <span className="text-xs text-slate-500">@{member.username ?? "unknown"}</span></span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black uppercase text-slate-500">{member.role}</span>
                        {selectedGroup.role === "owner" && member.role === "member" && member.status === "active" && (
                          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-gray-300">
                            <input
                              type="checkbox"
                              checked={member.canManageCategories}
                              disabled={setCategoryManager.isPending}
                              onChange={(event) => setCategoryManager.mutate({
                                groupId: selectedGroup.id,
                                memberUserId: member.id,
                                enabled: event.target.checked,
                              })}
                            />
                            Manage categories
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5 dark:border-gray-800">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Expense categories</p>
                {(selectedGroupSettings?.categories.length ?? 0) === 0
                  ? <p className="mt-2 text-sm text-slate-500">No group categories. Members use their personal categories for this group.</p>
                  : <div className="mt-3 flex flex-wrap gap-2">{selectedGroupSettings?.categories.map((category) => (
                      <span key={category} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-gray-700">
                        {category}
                        {canManageGroupCategories && <button type="button" aria-label={`Remove ${category} category`} disabled={saveGroupCategories.isPending} onClick={() => removeGroupCategory(category)}><X className="h-3.5 w-3.5" /></button>}
                      </span>
                    ))}</div>}
                {canManageGroupCategories && (
                  <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); addGroupCategory(); }}>
                    <input className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-900 dark:text-white" maxLength={80} placeholder="Add a group category" value={newExpenseCategory} onChange={(event) => setNewExpenseCategory(event.target.value)} />
                    <button className="inline-flex items-center gap-1 rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={!newExpenseCategory.trim() || saveGroupCategories.isPending} type="submit"><Plus className="h-4 w-4" /> Add</button>
                  </form>
                )}
              </div>

              {selectedGroup.role === "owner" && <div className="mt-6"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Pending approvals</p>{requests.length === 0 ? <p className="text-sm text-slate-500">No pending requests.</p> : <div className="space-y-2">{requests.map((request) => <div key={request.id} className="flex items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20"><span className="text-sm font-semibold text-slate-900 dark:text-white">{request.name} <span className="text-xs text-slate-500">@{request.username ?? "unknown"}</span></span><div className="flex gap-1"><button className="cursor-pointer rounded-xl bg-emerald-600 p-2 text-white transition hover:bg-emerald-700" type="button" onClick={() => reviewMutation.mutate({ requestId: request.id, approve: true })} aria-label="Approve request"><Check className="h-4 w-4" /></button><button className="cursor-pointer rounded-xl bg-slate-200 p-2 text-slate-700 transition hover:bg-slate-300" type="button" onClick={() => reviewMutation.mutate({ requestId: request.id, approve: false })} aria-label="Reject request"><X className="h-4 w-4" /></button></div></div>)}</div>}</div>}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
