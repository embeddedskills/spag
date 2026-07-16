"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Calendar, LayoutDashboard, Minus, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

const primaryNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agenda", label: "Agenda", icon: Calendar },
  { href: "/spending", label: "Spending", icon: Wallet },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationExpanded, setNotificationExpanded] = useState(false);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number; expanded?: boolean }>).detail;
      setNotificationCount(detail?.count ?? 0);
      setNotificationExpanded(Boolean(detail?.expanded));
    };

    window.addEventListener("spag-notifications:update", onUpdate as EventListener);
    return () => {
      window.removeEventListener("spag-notifications:update", onUpdate as EventListener);
    };
  }, []);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/90 md:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-[1fr_1fr_1fr_auto] gap-2">
        {primaryNav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center justify-center rounded-2xl px-2 py-2 transition-all ${
                  active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-black"
                    : "text-slate-600 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-gray-900"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                <span className="mt-1 text-[10px] font-black uppercase tracking-wider">{item.label}</span>
              </Link>
            </li>
          );
        })}

        <li className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("spag-notifications:toggle"))}
            className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border transition-all ${
              notificationExpanded
                ? "border-rose-500/70 bg-rose-600 text-white"
                : notificationCount > 0
                ? "border-sky-500/60 bg-sky-600 text-white"
                : "border-slate-300/80 bg-white text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
            }`}
            aria-label={notificationExpanded ? "Collapse notifications" : "Open notifications"}
          >
            <Bell className="h-4 w-4" />
            {notificationExpanded && (
              <span className="absolute right-1 top-1 rounded-full bg-white/20 p-0.5">
                <Minus className="h-2.5 w-2.5" />
              </span>
            )}
            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-black leading-4 text-white">
                {notificationCount > 9 ? "9+" : notificationCount}
              </span>
            )}
          </button>
        </li>
      </ul>
    </nav>
  );
}
