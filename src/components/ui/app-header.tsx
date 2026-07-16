"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness } from "lucide-react";
import ThemeToggle from "~/components/theme-toggle";
import { RealTimeHeader } from "~/components/ui/realtime";
import AppBurgerMenu from "~/components/ui/app-burger-menu";
import MobileBottomNav from "~/components/ui/mobile-bottom-nav";

export default function AppHeader({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showBackDesktop = pathname !== "/";

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/85">
        <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8">
          <div className="grid h-14 grid-cols-[auto_1fr_auto] items-center gap-2 sm:h-16">
            <Link href="/" className="flex items-center gap-2 rounded-xl px-1 py-1 transition hover:bg-slate-100 dark:hover:bg-gray-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300/70 bg-white dark:border-gray-700 dark:bg-gray-900">
                <BriefcaseBusiness className="h-4 w-4 text-blue-500" />
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-700 dark:text-gray-200 sm:text-[11px] sm:tracking-[0.35em]">S P A G</span>
            </Link>

            <div className="hidden min-w-0 sm:block">
              <RealTimeHeader compact />
            </div>

            <div className="ml-auto flex items-center gap-2 justify-self-end">
              <ThemeToggle compact />
              <AppBurgerMenu />
            </div>
          </div>

          <div className="border-t border-slate-200/70 py-1.5 dark:border-gray-800 sm:hidden">
            <RealTimeHeader compact />
          </div>
        </div>
      </header>

      <div className="pt-24 pb-24 md:pt-20 md:pb-8">
        {showBackDesktop && (
          <div className="mb-3 hidden px-3 sm:px-6 md:flex lg:px-8">
            <div className="mx-auto flex w-full max-w-6xl justify-end">
              <Link
                href="/"
                className="rounded-xl border border-slate-300/70 bg-white px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-700 transition hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                Back To Dashboard
              </Link>
            </div>
          </div>
        )}
        {children}
      </div>

      <MobileBottomNav />
    </div>
  );
}
