"use client";
import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { Clock, Check } from "lucide-react";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function ClockPicker({ value, onChange }: { value?: string, onChange: (val: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [hour24, setHour24] = useState<number>(12);
  const [minute, setMinute] = useState<number>(0);
  const [mode, setMode] = useState<"hour" | "minute">("hour");

  useEffect(() => {
    if (!value) return;
    const [hh, mm] = value.split(":").map(Number);
    if (hh !== undefined) setHour24(hh);
    if (mm !== undefined) setMinute(mm);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        popupRef.current && !popupRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handlePointClick = (val: number) => {
    if (mode === "hour") {
      setHour24(val);
      const hhS = val.toString().padStart(2, "0");
      const mmS = minute.toString().padStart(2, "0");
      onChange(`${hhS}:${mmS}`);
      setMode("minute");
    } else {
      setMinute(val);
      const hhS = hour24.toString().padStart(2, "0");
      const mmS = val.toString().padStart(2, "0");
      onChange(`${hhS}:${mmS}`);
    }
  };

  const updateManualHour = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setHour24(0);
      onChange(`00:${minute.toString().padStart(2, "0")}`);
      return;
    }

    const parsed = Number.parseInt(digits.slice(-2), 10);
    const nextHour = Number.isNaN(parsed) ? 0 : clamp(parsed, 0, 23);
    setHour24(nextHour);
    onChange(`${nextHour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
  };

  const updateManualMinute = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setMinute(0);
      onChange(`${hour24.toString().padStart(2, "0")}:00`);
      return;
    }

    const parsed = Number.parseInt(digits.slice(-2), 10);
    const nextMinute = Number.isNaN(parsed) ? 0 : clamp(parsed, 0, 59);
    setMinute(nextMinute);
    onChange(`${hour24.toString().padStart(2, "0")}:${nextMinute.toString().padStart(2, "0")}`);
  };

  const clockData = useMemo(() => {
    if (mode === "hour") {
      return {
        outer: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0],
        inner: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        step: 30, // 360 / 12
      };
    }
    return {
      outer: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 0],
      inner: [],
      step: 30,
    };
  }, [mode]);

  const display = `${hour24.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);

  const toggleOpen = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      const popupWidth = 320;
      const popupHeight = 400; // approximate
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = r.left;
      let top = r.bottom + 4;

      // Adjust if popup would go off-screen
      if (left + popupWidth > viewportWidth) {
        left = viewportWidth - popupWidth - 10;
      }
      if (left < 10) {
        left = 10;
      }
      if (top + popupHeight > viewportHeight) {
        top = r.top - popupHeight - 4;
        if (top < 10) {
          top = 10;
        }
      }

      setPopupPos({ top, left });
    }
    setOpen(o => !o);
  };

  return (
    <div ref={ref} className="relative inline-block text-white [overflow:visible]">
      <button 
        type="button" 
        onClick={toggleOpen} 
        className="bg-gray-900/40 border border-gray-800 p-3 rounded-2xl flex items-center gap-3 backdrop-blur-xl hover:border-blue-500/50 transition-all active:scale-95"
      >
        <Clock className="w-4 h-4 text-blue-500" />
        <span className="font-black tracking-widest text-sm">{display}</span>
      </button>

      {open && popupPos && createPortal(
        <div ref={popupRef} style={{ position: 'fixed', top: popupPos.top, left: popupPos.left }} className="theme-invert-on-light [&.theme-invert-on-light]:text-white bg-gray-900/95 border border-gray-800 rounded-[2.5rem] p-6 shadow-2xl z-[9999] w-[320px] backdrop-blur-2xl animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 px-2">
            <div className="flex gap-1">
               <span className={`text-2xl font-black ${mode === 'hour' ? 'text-blue-500' : 'text-gray-600'}`}>{hour24.toString().padStart(2, "0")}</span>
               <span className="text-2xl font-black text-gray-800">:</span>
               <span className={`text-2xl font-black ${mode === 'minute' ? 'text-blue-500' : 'text-gray-600'}`}>{minute.toString().padStart(2, "0")}</span>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              {mode === "hour" ? "Sequence Hour" : "Sequence Min"}
            </p>
          </div>

          {/* Clock Face */}
          <div className="relative w-full aspect-square bg-black/40 rounded-full border border-gray-800 flex items-center justify-center mb-6">
            <div className="absolute w-1 h-1 bg-blue-500 rounded-full shadow-[0_0_10px_#3b82f6]" />
            
            {/* Render Numbers */}
            {clockData.outer.map((val, i) => {
              const angle = (i + 1) * clockData.step;
              const isSelected = mode === 'hour' ? hour24 === val : minute === val;
              return (
                <ClockNumber 
                  key={val} 
                  val={val} 
                  angle={angle} 
                  distance={105} 
                  isSelected={isSelected} 
                  onClick={() => handlePointClick(val)} 
                />
              );
            })}

            {mode === "hour" && clockData.inner.map((val, i) => {
              const angle = (i + 1) * clockData.step;
              const isSelected = hour24 === val;
              return (
                <ClockNumber 
                  key={val} 
                  val={val} 
                  angle={angle} 
                  distance={65} 
                  isSelected={isSelected} 
                  onClick={() => handlePointClick(val)} 
                  isSmall
                />
              );
            })}
          </div>

          {/* Footer Controls */}
          <div className="flex items-center justify-between">
            <div className="flex bg-black/50 p-1 rounded-xl border border-gray-800">
              <button onClick={() => setMode("hour")} className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all ${mode === 'hour' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>HH</button>
              <button onClick={() => setMode("minute")} className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all ${mode === 'minute' ? 'bg-blue-600 text-white' : 'text-gray-500'}`}>MM</button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={hour24.toString().padStart(2, "0")}
                onChange={(e) => updateManualHour(e.target.value)}
                className="w-12 rounded-lg border border-gray-700 bg-black/50 px-2 py-1 text-center text-xs font-black tracking-widest text-gray-100 outline-none focus:border-blue-500"
                aria-label="Hours"
              />
              <span className="text-gray-500">:</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={minute.toString().padStart(2, "0")}
                onChange={(e) => updateManualMinute(e.target.value)}
                className="w-12 rounded-lg border border-gray-700 bg-black/50 px-2 py-1 text-center text-xs font-black tracking-widest text-gray-100 outline-none focus:border-blue-500"
                aria-label="Minutes"
              />
              <button
                onClick={() => setOpen(false)}
                className="p-3 bg-white text-black rounded-xl active:scale-90 transition-transform"
              >
                <Check size={18} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function ClockNumber({ val, angle, distance, isSelected, onClick, isSmall = false }: any) {
  // Convert polar to cartesian
  const x = Math.sin((angle * Math.PI) / 180) * distance;
  const y = -Math.cos((angle * Math.PI) / 180) * distance;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      className={`absolute flex items-center justify-center transition-all duration-300 rounded-full
        ${isSelected ? 'bg-blue-600 scale-110 shadow-[0_0_15px_rgba(59,130,246,0.5)] z-10' : 'hover:bg-gray-800'}
        ${isSmall ? 'w-8 h-8 text-[10px]' : 'w-10 h-10 text-xs'}
        font-black
      `}
    >
      {val === 0 && !isSmall ? "00" : val}
    </button>
  );
}
