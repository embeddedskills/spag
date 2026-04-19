"use client";
import { useEffect, useState, useRef } from "react";

type Item = {
  id: string;
  title: string;
  content?: string;
  targetDate: string;
  type: string;
};

export default function UpcomingNotifier() {
  const [due, setDue] = useState<Item[]>([]);
  const pollingRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/upcoming");
        if (!res.ok) return;
        const items: Item[] = await res.json();
        if (!mounted) return;
        if (items.length) {
          setDue(items);
          // show browser notifications
          if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "default") Notification.requestPermission();
          }
          items.forEach(i => {
            const title = `Reminder: ${i.title}`;
            const body = i.content ?? "";
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification(title, { body });
            }
          });
          // mark as notified
          await fetch("/api/upcoming/mark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: items.map(i => i.id) }) });
        }
      } catch (e) {
        // ignore polling errors
        console.error(e);
      }
    };

    poll();
    pollingRef.current = window.setInterval(poll, 30_000);
    return () => {
      mounted = false;
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, []);

  if (due.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {due.map(item => (
        <div key={item.id} className="bg-blue-900/90 text-white p-4 rounded-lg shadow-lg">
          <div className="font-bold">{item.title}</div>
          {item.content && <div className="text-sm opacity-90">{item.content}</div>}
        </div>
      ))}
    </div>
  );
}
