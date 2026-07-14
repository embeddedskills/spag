"use client";

import { useEffect, useState } from "react";

export function RealTimeHeader() {
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
    return <div className="h-8 animate-pulse bg-gray-200 rounded w-48 mb-4"></div>;
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

  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{formattedDate}</h1>
      <p className="text-sm text-gray-500">Current Time: {formattedTime}</p>
    </div>
  );
}
