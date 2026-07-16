"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { 
  Plus, Wallet, TrendingUp, Clock, X, 
  CreditCard, Banknote, Bitcoin, 
  ChevronRight, Calendar
} from "lucide-react";

export default function SpendingPage() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isNow, setIsNow] = useState(true);
  const [form, setForm] = useState({ desc: "", amount: "", cat: "Food", cur: "EUR", date: "" });

  useEffect(() => { setMounted(true); }, []);

  const utils = api.useUtils();
  const { data: list, isLoading } = api.spending.getAll.useQuery();
  
  const addMutation = api.spending.add.useMutation({
    onSuccess: () => { 
      void utils.spending.getAll.invalidate(); 
      setIsOpen(false); 
    }
  });

  const now = new Date();
  const totalToday = list?.filter(e => new Date(e.createdAt).toDateString() === now.toDateString())
    .reduce((acc, curr) => acc + parseFloat(curr.amount), 0) ?? 0;

  if (!mounted) return null;

  return (
    <main className="theme-invert-on-dark min-h-0 bg-slate-50 text-slate-900 p-6 md:p-12 lg:p-20 relative overflow-hidden">
      {/* BACKGROUND ACCENTS */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400/10 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-400/10 rounded-full blur-[120px] -z-10" />

      <div className="max-w-4xl mx-auto">
        {/* STATS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-[2rem] border border-blue-100 shadow-sm flex flex-col justify-between group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-500"><TrendingUp size={20}/></div>
              <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Today</span>
            </div>
            <p className="text-3xl font-black tracking-tighter text-slate-800">
              €{totalToday.toFixed(2)}
            </p>
          </div>
          {/* Repeat for Month/Year if needed */}
        </div>

        <div className="flex justify-between items-end mb-8">
          <h2 className="text-xl font-bold text-slate-400 tracking-tight uppercase">Transactions</h2>
          <button 
            onClick={() => setIsOpen(true)} 
            className="bg-blue-600 hover:bg-blue-500 text-white p-4 rounded-2xl transition-all shadow-xl shadow-blue-200 active:scale-95"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        {/* LIST */}
        <div className="grid gap-4">
          {isLoading ? (
             <div className="text-center p-10 animate-pulse text-blue-400 font-bold uppercase tracking-widest text-xs">Syncing Ledger...</div>
          ) : list?.map(item => (
            <div key={item.id} className="group bg-white/60 backdrop-blur-md p-6 rounded-[2rem] border border-white shadow-sm flex justify-between items-center hover:border-blue-200 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-blue-500 transition-colors">
                  {item.category === "Food" ? <Banknote size={20}/> : <CreditCard size={20}/>}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{item.description}</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">{item.category}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-blue-600 tracking-tighter">
                   {item.amount} <span className="text-xs text-blue-400">{(item as any).currency ?? "EUR"}</span>
                </p>
                <p className="text-[9px] text-slate-300 font-bold">{new Date(item.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LIGHT MODAL */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-blue-50 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black tracking-tighter text-slate-800">NEW TRANSACTION</h2>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20}/></button>
            </div>

            <div className="space-y-4">
              <input placeholder="Transaction reference..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:border-blue-500 outline-none text-slate-800" 
                onChange={e => setForm({...form, desc: e.target.value})} />
              
              <div className="flex gap-3">
                <input type="number" placeholder="0.00" className="flex-1 p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:border-blue-500 outline-none text-xl font-bold"
                  onChange={e => setForm({...form, amount: e.target.value})} />
                <select className="bg-slate-100 border-none p-4 rounded-2xl font-bold text-sm" onChange={e => setForm({...form, cur: e.target.value})}>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="BTC">BTC</option>
                </select>
              </div>

              <div className="flex items-center gap-3 bg-blue-50/50 p-4 rounded-2xl">
                <Calendar size={18} className="text-blue-500" />
                <label className="text-xs font-bold text-blue-600 flex-1 uppercase tracking-widest">Auto-timestamp</label>
                <input type="checkbox" className="w-5 h-5 accent-blue-600" checked={isNow} onChange={() => setIsNow(!isNow)} />
              </div>

              {!isNow && (
                <input type="datetime-local" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none"
                  onChange={e => setForm({...form, date: e.target.value})} />
              )}

              <button className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black tracking-widest text-xs uppercase shadow-lg shadow-blue-200 active:scale-95 transition-all" 
                onClick={() => addMutation.mutate({
                  description: form.desc, amount: form.amount, category: form.cat, currency: form.cur as any,
                  createdAt: isNow ? new Date() : new Date(form.date)
                })}>
                Commit to Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
