"use client";

import { useEffect, useState } from "react";

export function RealTimeHeader({ compact = false }: { compact?: boolean }) {
  const [currentDate, setCurrentDate] = useState<Date | null>(null);

  useEffect(() => {
    // Set the initial date immediately upon mounting to the browser
    setCurrentDate(new Date());

    // Update the clock every minute
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 60000);

    // Clean up the timer when the user leaves the page
    return () => clearInterval(timer);
  }, []);

  // Return a skeleton loading state or blank space on the server to prevent mismatches
  if (!currentDate) {
    return compact
      ? <div className="h-8 w-36 animate-pulse rounded bg-slate-200 dark:bg-gray-700" />
      : <div className="mb-4 h-8 w-48 animate-pulse rounded bg-gray-200" />;
  }

  // Format the date nicely for your users
  const formattedDate = currentDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const formattedTime = currentDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const compactDate = currentDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (compact) {
    return (
      <div className="flex items-center justify-center gap-2 text-center leading-tight whitespace-nowrap overflow-hidden">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-gray-400">{compactDate}</p>
        <span className="text-slate-300 dark:text-gray-600">•</span>
        <p className="text-xs font-bold text-slate-700 dark:text-gray-100">{formattedTime}</p>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{formattedDate}</h1>
      <p className="text-sm text-gray-500">Current Time: {formattedTime}</p>
    </div>
  );
}
