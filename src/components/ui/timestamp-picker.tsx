import React, { useEffect, useState } from "react";
import ClockPicker from "./clock-picker";

export default function TimestampPicker({ value, onChange }: { value?: string | null, onChange: (val: string) => void }) {
  // value is ISO-like string (e.g. 2026-03-07T14:30:00)
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("12:00");

  useEffect(() => {
    if (!value) {
      setDate("");
      setTime("12:00");
      return;
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return;
    const yyyy = d.getFullYear().toString().padStart(4, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    const hh = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");
    setDate(`${yyyy}-${mm}-${dd}`);
    setTime(`${hh}:${min}`);
  }, [value]);

  useEffect(() => {
    if (!date || !time) return;
    // seconds are fixed to 00
    const iso = `${date}T${time}:00`;
    onChange(iso);
  }, [date, time, onChange]);

  return (
    <div className="flex items-center gap-3 overflow-visible">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="bg-black/60 border border-gray-800 p-3 rounded-xl text-sm outline-none"
      />
      <div className="overflow-visible">
        <ClockPicker value={time} onChange={(val) => setTime(val)} />
      </div>
    </div>
  );
}
