"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, LayoutDashboard, LogOut, Menu, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "~/server/better-auth/client";

const appLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/spending", label: "Spending", icon: Wallet },
];

export default function AppBurgerMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (open) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-slate-300/70 bg-white p-2 text-slate-700 transition hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
        aria-label="Open app menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] overflow-hidden" onClick={() => setOpen(false)}>
          <div className="fixed inset-0 bg-black/70 backdrop-blur-[3px]" />
          <aside
            className="fixed right-0 top-0 flex h-dvh w-[min(88vw,22rem)] flex-col border-l border-slate-200 bg-white p-4 shadow-2xl dark:border-gray-800 dark:bg-gray-950"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">App Menu</p>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                aria-label="Close app menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Apps</p>
              <div className="space-y-2">
                {appLinks.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-black"
                          : "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-900"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-900">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Tip</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-gray-300">
                Use bottom tabs for quick switching and this menu for overview.
              </p>
            </div>

            <div className="mt-auto pt-4">
              <button
                onClick={() => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })}
                className="group flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-red-600 transition hover:bg-red-600 hover:text-white dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
                aria-label="Logout"
              >
                <LogOut className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
