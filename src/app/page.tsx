"use client";
import { authClient } from "~/server/better-auth/client";
import Link from "next/link";
import { Calendar, Wallet, LayoutDashboard, TrendingUp, Clock } from "lucide-react";
import AppHeader from "~/components/ui/app-header";


export default function HomePage() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return (
    <div className="flex h-screen items-center justify-center bg-black text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
          <LayoutDashboard className="w-12 h-12 text-blue-500 relative animate-bounce" />
        </div>
        <span className="text-xs uppercase tracking-[0.3em] font-bold text-gray-500">Syncing</span>
      </div>
    </div>
  );

  if (!session) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-screen gap-8 p-6 bg-black text-white overflow-hidden">
        {/* Ambient Background Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-green-600/10 rounded-full blur-[120px] animate-pulse"></div>

        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-green-600 rounded-full blur opacity-30 group-hover:opacity-60 transition duration-1000"></div>
          <div className="relative flex items-center justify-center w-28 h-28 bg-gray-900 rounded-full border border-gray-800 shadow-2xl">
             <LayoutDashboard className="w-14 h-14 text-blue-500" />
          </div>
        </div>

        <div className="text-center space-y-4 z-10">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-gray-600">
            NEXUS
          </h1>
          <p className="text-gray-400 max-w-sm mx-auto text-sm md:text-base leading-relaxed tracking-wide">
            Master your schedule and track your wealth in one unified, high-performance workspace.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs z-10">
          <Link href="/login" className="flex-1 text-center bg-white text-black hover:bg-gray-200 px-6 py-4 rounded-2xl font-black transition-all active:scale-95 shadow-xl shadow-white/5">
            LOGIN
          </Link>
          <Link href="/signup" className="flex-1 text-center bg-gray-900 hover:bg-gray-800 text-white px-6 py-4 rounded-2xl font-black border border-gray-800 transition-all active:scale-95">
            JOIN
          </Link>
        </div>
        
        <p className="absolute bottom-8 text-[10px] tracking-[0.4em] text-gray-600 font-bold uppercase">
          Local-First Encryption Active
        </p>
      </div>
    );
  }

  return (
    <AppHeader>
      <main className="theme-invert-on-light min-h-0 bg-black p-6 text-white md:p-12 lg:p-20">
        <div className="mx-auto mb-8 max-w-6xl">
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">S P A G</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Welcome, {session.user.name}</h1>
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 sm:gap-6 lg:gap-8">
        {/* Agenda Card */}
        <Link href="/agenda" className="group relative min-w-0 p-4 sm:p-7 lg:p-10 bg-gradient-to-br from-gray-900/80 to-black rounded-[1.5rem] sm:rounded-[2.5rem] border border-gray-800 hover:border-blue-500/50 transition-all duration-500 active:scale-[0.98]">
          <div className="flex flex-col h-full justify-between">
            <div>
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-blue-600/10 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-8 border border-blue-500/20 group-hover:scale-110 transition-transform duration-500">
                <Calendar className="w-5 h-5 sm:w-7 sm:h-7 text-blue-500" />
              </div>
              <h2 className="text-xl sm:text-3xl font-bold mb-2 sm:mb-3 tracking-tight">Agenda</h2>
              <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">
                Strategic task management and timeline synchronization.
              </p>
            </div>
            <div className="mt-6 sm:mt-12 flex items-center gap-2 text-[9px] sm:text-[10px] font-black text-blue-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
              <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              Access Timeline
            </div>
          </div>
          <Calendar className="absolute -bottom-4 -right-4 sm:-bottom-6 sm:-right-6 w-20 h-20 sm:w-40 sm:h-40 text-blue-500 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500 -rotate-12" />
        </Link>

        {/* Spending Card */}
        <Link href="/spending" className="group relative min-w-0 p-4 sm:p-7 lg:p-10 bg-gradient-to-br from-gray-900/80 to-black rounded-[1.5rem] sm:rounded-[2.5rem] border border-gray-800 hover:border-green-500/50 transition-all duration-500 active:scale-[0.98]">
          <div className="flex flex-col h-full justify-between">
            <div>
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-green-600/10 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-8 border border-green-500/20 group-hover:scale-110 transition-transform duration-500">
                <Wallet className="w-5 h-5 sm:w-7 sm:h-7 text-green-500" />
              </div>
              <h2 className="text-xl sm:text-3xl font-bold mb-2 sm:mb-3 tracking-tight">Spending</h2>
              <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">
                Capital flow tracking and automated budget analytics.
              </p>
            </div>
            <div className="mt-6 sm:mt-12 flex items-center gap-2 text-[9px] sm:text-[10px] font-black text-green-500 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
              <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              Audit Wealth
            </div>
          </div>
          <Wallet className="absolute -bottom-4 -right-4 sm:-bottom-6 sm:-right-6 w-20 h-20 sm:w-40 sm:h-40 text-green-500 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500 -rotate-12" />
        </Link>
        </div>
      </main>
    </AppHeader>
  );
}
