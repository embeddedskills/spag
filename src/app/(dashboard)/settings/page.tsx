"use client";

import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-gray-800 dark:bg-gray-900">
            <Settings className="h-5 w-5 text-slate-500" />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Workspace</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 dark:text-white">Settings</h1>
          </div>
        </div>
        <p className="mt-6 text-sm text-slate-500 dark:text-gray-400">Settings will be available here soon.</p>
      </section>
    </main>
  );
}
