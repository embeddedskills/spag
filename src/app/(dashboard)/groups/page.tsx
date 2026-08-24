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
  const { data: groups = [] } = api.group.listMine.useQuery();
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

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Shared spaces</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">Groups</h1>
        </div>
        <Users className="h-7 w-7 text-blue-600" />
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
                className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition ${selectedGroup?.id === group.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-slate-200 hover:bg-slate-50 dark:border-gray-800 dark:hover:bg-gray-900"}`}
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
            <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:text-white" placeholder="Group name" value={name} onChange={(event) => setName(event.target.value)} />
            <select className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold outline-none dark:border-gray-800 dark:bg-gray-900 dark:text-white" value={category} onChange={(event) => setCategory(event.target.value as (typeof categories)[number])}>
              {categories.map((option) => <option key={option} value={option}>{option[0]?.toUpperCase()}{option.slice(1)}</option>)}
            </select>
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white dark:bg-white dark:text-slate-950" type="submit" disabled={createMutation.isPending}><Plus className="h-4 w-4" /> Create group</button>
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
                <button className="rounded-2xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white" type="submit" disabled={requestMutation.isPending}>Request</button>
              </form>

              <div className="mt-6"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Members</p><div className="space-y-2">{members.map((member) => <div key={member.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2 dark:border-gray-800"><span className="font-semibold text-slate-900 dark:text-white">{member.name} <span className="text-xs text-slate-500">@{member.username ?? "unknown"}</span></span><span className="text-[10px] font-black uppercase text-slate-500">{member.role}</span></div>)}</div></div>

              {selectedGroup.role === "owner" && <div className="mt-6"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Pending approvals</p>{requests.length === 0 ? <p className="text-sm text-slate-500">No pending requests.</p> : <div className="space-y-2">{requests.map((request) => <div key={request.id} className="flex items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20"><span className="text-sm font-semibold text-slate-900 dark:text-white">{request.name} <span className="text-xs text-slate-500">@{request.username ?? "unknown"}</span></span><div className="flex gap-1"><button className="rounded-xl bg-emerald-600 p-2 text-white" type="button" onClick={() => reviewMutation.mutate({ requestId: request.id, approve: true })} aria-label="Approve request"><Check className="h-4 w-4" /></button><button className="rounded-xl bg-slate-200 p-2 text-slate-700" type="button" onClick={() => reviewMutation.mutate({ requestId: request.id, approve: false })} aria-label="Reject request"><X className="h-4 w-4" /></button></div></div>)}</div>}</div>}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
