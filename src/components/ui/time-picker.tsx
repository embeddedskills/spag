"use client";
import React, { useEffect, useRef, useState } from "react";

export default function TimePicker({ value, onChange }: { value?: string, onChange: (val: string) => void }) {
  // value expected as HH:MM (24h)
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [hour12, setHour12] = useState<number>(12);
  const [minute, setMinute] = useState<number>(0);
  const [isAM, setIsAM] = useState(true);

  useEffect(() => {
    if (!value) return;
    const parts = value.split(":");
    if (parts.length < 2) return;
    let hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) || 0;
    const am = hh < 12;
    setIsAM(am);
    let h12 = hh % 12;
    if (h12 === 0) h12 = 12;
    setHour12(h12);
    setMinute(mm - (mm % 5));
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!(e.target instanceof Node)) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const to24 = (h12: number, m: number, am: boolean) => {
    let hh = h12 % 12;
    if (!am) hh += 12;
    const hhS = hh.toString().padStart(2, "0");
    const mmS = m.toString().padStart(2, "0");
    return `${hhS}:${mmS}`;
  };

  const display = `${hour12.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} ${isAM ? "AM" : "PM"}`;

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen(v => !v)} className="bg-black/60 border border-gray-800 p-3 rounded-xl text-sm flex items-center gap-2">
        <span className="font-mono">{display}</span>
        <svg className="w-3 h-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-black/90 border border-gray-800 rounded-xl p-3 shadow-lg z-50">
          <div className="grid grid-cols-6 gap-2 mb-3">
            {Array.from({ length: 12 }).map((_, i) => {
              const h = i + 1;
              return (
                <button key={h} type="button" onClick={() => { setHour12(h); onChange(to24(h, minute, isAM)); }} className={`p-2 rounded ${hour12===h? 'bg-blue-600 text-white' : 'bg-black/50 text-gray-300'}`}>{h}</button>
              );
            })}
          </div>

          <div className="grid grid-cols-6 gap-2 mb-3">
            {Array.from({ length: 12 }).map((_, i) => {
              const m = i * 5;
              const label = m.toString().padStart(2, '0');
              return (
                <button key={m} type="button" onClick={() => { setMinute(m); onChange(to24(hour12, m, isAM)); }} className={`p-2 rounded ${minute===m? 'bg-blue-600 text-white' : 'bg-black/50 text-gray-300'}`}>{label}</button>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button type="button" onClick={() => { setIsAM(true); onChange(to24(hour12, minute, true)); }} className={`px-3 py-1 rounded ${isAM ? 'bg-blue-600 text-white' : 'bg-black/50 text-gray-300'}`}>AM</button>
              <button type="button" onClick={() => { setIsAM(false); onChange(to24(hour12, minute, false)); }} className={`px-3 py-1 rounded ${!isAM ? 'bg-blue-600 text-white' : 'bg-black/50 text-gray-300'}`}>PM</button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setOpen(false); }} className="px-3 py-1 rounded bg-gray-800 text-gray-300">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
