// src/components/pwa-register.tsx
"use client";

import { useEffect } from "react";

export function PWARegister() {
  useEffect(() => {
    // This code only runs in the user's browser, safely inside useEffect
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("Service Worker registered!", reg.scope))
        .catch((err) => console.error("Service Worker registration failed:", err));
    }
  }, []);

  // This component doesn't need to visually render anything
  return null; 
}
