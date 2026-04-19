"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import TimestampPicker from "~/components/ui/timestamp-picker";
import { 
  Trash2, Plus, Calendar, Bell, StickyNote, 
  CheckCircle, Repeat, ArrowLeft, Loader2, Clock, X, Pin 
} from "lucide-react";
import Link from "next/link";

export default function AgendaPage() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("task");
  const [repeat, setRepeat] = useState("none");
  const [target, setTarget] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'targetDate' | 'createdAt'>('targetDate');
  const [noteGrid, setNoteGrid] = useState<1 | 2 | 3>(3);
  const [pinned, setPinned] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // 1. Hydration Fix: Ensure component is mounted before rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  const utils = api.useUtils();
  const { data: items, isLoading } = api.agenda.getAll.useQuery();

  const tasksReminders = items?.filter(item => item.type !== 'note').sort((a, b) => {
    if (sortBy === 'targetDate') {
      return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
    } else {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
  }) || [];

  const notes = items?.filter(item => item.type === 'note').sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }) || [];

  const addMutation = api.agenda.create.useMutation({
    onSuccess: () => {
      setTitle(""); 
      setContent(""); 
      setIsOpen(false);
      void utils.agenda.getAll.invalidate();
    },
    onError: (err) => alert(err.message),
  });

  const deleteMutation = api.agenda.delete.useMutation({
    onSuccess: () => void utils.agenda.getAll.invalidate(),
  });

  const toggleMutation = api.agenda.toggleComplete.useMutation({
    onSuccess: () => void utils.agenda.getAll.invalidate(),
  });

  const updateMutation = api.agenda.update.useMutation({
    onSuccess: () => {
      setTitle(""); 
      setContent(""); 
      setIsOpen(false);
      setEditingId(null);
      void utils.agenda.getAll.invalidate();
    },
    onError: (err) => alert(err.message),
  });

  const startEdit = (item: any) => {
    setTitle(item.title);
    setContent(item.content || "");
    setType(item.type);
    setRepeat(item.repeatInterval);
    setTarget(item.targetDate ? item.targetDate.toISOString() : null);
    setPinned(item.pinned || false);
    setIsCompleted(item.isCompleted || false);
    setEditingId(item.id);
    setIsOpen(true);
    // Scroll to top to show the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = () => {
    const startTime = type === 'note' ? undefined : (target ? new Date(target) : undefined);
    if (editingId) {
      updateMutation.mutate({ 
        id: editingId,
        title, 
        content, 
        type, 
        repeatInterval: repeat, 
        startTime,
        pinned,
        isCompleted
      });
    } else {
      addMutation.mutate({ 
        title, 
        content, 
        type, 
        repeatInterval: repeat, 
        startTime,
        pinned
      });
    }
  };

  const cancelEdit = () => {
    setTitle("");
    setContent("");
    setType("task");
    setRepeat("none");
    setTarget(null);
    setPinned(false);
    setIsCompleted(false);
    setEditingId(null);
    setIsOpen(false);
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-12 lg:p-20">
      {/* NEXUS HEADER */}
      <header className="max-w-4xl mx-auto flex justify-between items-center mb-16">
        <Link href="/" className="group flex items-center gap-2 text-gray-500 hover:text-white transition-all">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">System / Root</span>
        </Link>
        <div className="text-right">
          <p className="text-[10px] text-blue-500 uppercase tracking-[0.4em] font-black mb-1">Active Timeline</p>
          <h1 className="text-3xl font-black tracking-tighter">AGENDA</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto">
        {/* ADD ACTION BAR */}
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-xl font-bold text-gray-400">{editingId ? "Edit Sequence" : "Upcoming Events"}</h2>
            <p className="text-xs text-gray-600 uppercase tracking-widest mt-1">
              {isLoading ? "Syncing..." : `${tasksReminders.length} sequences active`}
            </p>
          </div>
          <button 
            onClick={editingId ? cancelEdit : () => setIsOpen(!isOpen)} 
            className={`p-4 rounded-2xl transition-all duration-300 shadow-xl active:scale-95 flex items-center justify-center
              ${isOpen ? 'bg-gray-800 text-gray-400' : 'bg-blue-600 text-white shadow-blue-900/20'}`}
          >
            {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
          </button>
        </div>

        {/* NEXUS CREATION BOX */}
        {isOpen && (
          <div className="bg-gray-900/40 border border-gray-800 p-4 sm:p-8 rounded-[2.5rem] mb-12 backdrop-blur-2xl animate-in fade-in slide-in-from-top-4 duration-300 overflow-visible max-w-full">
            <div className="flex gap-2 sm:gap-3 mb-6 sm:mb-8 overflow-x-auto pb-2 scrollbar-hide">
              {[ 
                {id:'task', icon:CheckCircle, color:'blue'}, 
                {id:'reminder', icon:Bell, color:'purple'}, 
                {id:'note', icon:StickyNote, color:'orange'} 
              ].map(t => (
                <button 
                  key={t.id} 
                  type="button"
                  onClick={() => setType(t.id)} 
                  className={`flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-[10px] sm:text-[10px] uppercase font-black tracking-widest transition-all whitespace-nowrap flex-shrink-0
                    ${type === t.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-black/50 text-gray-500 border border-gray-800 hover:border-gray-700'}`}
                >
                  <t.icon size={14}/> {t.id}
                </button>
              ))}
            </div>

            <div className="space-y-4 sm:space-y-5">
              <input 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                placeholder={`Identify ${type} name...`} 
                className="w-full bg-black/60 border border-gray-800 p-4 sm:p-5 rounded-2xl text-base sm:text-lg font-bold focus:border-blue-600 outline-none transition-all placeholder:text-gray-700" 
              />
              <textarea 
                value={content} 
                onChange={e => setContent(e.target.value)} 
                placeholder="Supplementary data / Description..." 
                className="w-full bg-black/60 border border-gray-800 p-4 sm:p-5 rounded-2xl min-h-[100px] sm:min-h-[120px] outline-none focus:border-blue-600 transition-all placeholder:text-gray-700" 
              />
              
              {type === 'note' && (
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPinned(!pinned)}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${pinned ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    <Pin size={14} /> {pinned ? 'Pinned' : 'Pin Note'}
                  </button>
                </div>
              )}

              {(type === 'task' || type === 'reminder') && (
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setIsCompleted(!isCompleted)}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${isCompleted ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    <CheckCircle size={14} /> {isCompleted ? 'Completed' : 'Mark Completed'}
                  </button>
                </div>
              )}
              
              {type === 'reminder' && (
                <div className="flex items-center gap-4 bg-black/40 p-5 rounded-2xl border border-gray-800 group transition-colors focus-within:border-purple-500/50">
                  <Repeat size={18} className="text-purple-500" />
                  <select 
                    value={repeat} 
                    onChange={e => setRepeat(e.target.value)} 
                    className="bg-transparent text-xs font-bold uppercase tracking-widest text-gray-400 outline-none cursor-pointer flex-1"
                  >
                    <option value="none">Discrete Event (No Repeat)</option>
                    <option value="daily">Daily Synchronisation</option>
                    <option value="weekly">Weekly Cycle</option>
                  </select>
                </div>
              )}

              {type !== 'note' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 overflow-visible">
                  <label className="text-sm text-gray-400 sm:flex-shrink-0">Target time</label>
                  <div className="overflow-visible w-full sm:w-auto">
                    <TimestampPicker value={target ?? null} onChange={(val) => setTarget(val)} />
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:justify-end gap-4 pt-4">
                {editingId && (
                  <button 
                    onClick={cancelEdit} 
                    className="bg-gray-800 text-gray-400 px-6 sm:px-8 py-3 sm:py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gray-700 transition-all active:scale-95 order-2 sm:order-1"
                  >
                    Cancel
                  </button>
                )}
                <button 
                  onClick={handleSubmit} 
                  disabled={!title || addMutation.isPending || updateMutation.isPending} 
                  className="bg-white text-black px-8 sm:px-12 py-3 sm:py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-500 hover:text-white transition-all active:scale-95 disabled:opacity-30 disabled:grayscale order-1 sm:order-2"
                >
                  {addMutation.isPending || updateMutation.isPending ? <Loader2 className="animate-spin w-4 h-4 sm:w-5 sm:h-5" /> : editingId ? `Update ${type}` : `Initialize ${type}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SORT OPTIONS */}
        <div className="flex justify-center gap-4 mb-8">
          <button 
            onClick={() => setSortBy('targetDate')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${sortBy === 'targetDate' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            Sort by Date
          </button>
          <button 
            onClick={() => setSortBy('createdAt')}
            className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${sortBy === 'createdAt' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            Sort by Added
          </button>
        </div>

        {/* TIMELINE LIST */}
        <div className="grid gap-6">
          {isLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>
          ) : tasksReminders.length === 0 ? (
            <div className="text-center p-20 bg-gray-900/20 border border-dashed border-gray-800 rounded-[2.5rem]">
              <p className="text-gray-600 text-xs uppercase tracking-[0.4em] font-black">No Active Sequences Found</p>
            </div>
          ) : (
            tasksReminders.map(item => (
              <div 
                key={item.id} 
                className="group relative p-8 bg-gray-900/30 backdrop-blur-xl hover:bg-gray-900/50 rounded-[2.5rem] border border-gray-800/50 flex gap-8 transition-all duration-500 hover:border-blue-500/30 overflow-hidden cursor-pointer"
                onClick={() => startEdit(item)}
              >
                {/* Visual Accent */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${item.isCompleted ? 'bg-gray-800' : 'bg-blue-600'}`} />
                
                {/* Active Pulse */}
                {!item.isCompleted && (
                  <div className="absolute top-8 right-8 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
                )}

                <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => toggleMutation.mutate({ id: item.id, isCompleted: !item.isCompleted })}
                    className={`w-7 h-7 rounded-xl border-2 transition-all flex items-center justify-center
                      ${item.isCompleted ? 'bg-blue-600 border-blue-600' : 'border-gray-800 bg-black hover:border-blue-500'}`}
                  >
                    {item.isCompleted && <CheckCircle size={16} className="text-white" />}
                  </button>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className={`text-xl font-bold tracking-tight transition-all ${item.isCompleted ? 'line-through text-gray-700' : 'text-gray-100'}`}>
                      {item.title}
                    </h3>
                    {item.repeatInterval !== 'none' && (
                      <span className="p-1 bg-purple-500/10 rounded text-purple-500 text-[9px] font-black uppercase tracking-[0.1em]">
                        {item.repeatInterval}
                      </span>
                    )}
                  </div>
                  
                  {item.content && (
                    <p className={`text-sm mb-6 leading-relaxed ${item.isCompleted ? 'text-gray-800' : 'text-gray-500'}`}>
                      {item.content}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-6 items-center">
                    {item.type !== 'note' && (
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-700">
                        <Clock size={12} /> {new Date(item.targetDate).toLocaleDateString()} at {new Date(item.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg border
                      ${item.type === 'task' ? 'border-blue-900/30 bg-blue-900/10 text-blue-500' : 
                        item.type === 'reminder' ? 'border-purple-900/30 bg-purple-900/10 text-purple-500' : 
                        'border-orange-900/30 bg-orange-900/10 text-orange-500'}`}>
                      {item.type}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: item.id }); }}
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-3 text-gray-700 hover:text-red-500 transition-all absolute bottom-6 right-6"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* NOTES SECTION */}
        {notes.length > 0 && (
          <div className="mt-16">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-gray-400">Notes Archive</h2>
              <div className="flex gap-2">
                {[1, 2, 3].map(cols => (
                  <button 
                    key={cols}
                    onClick={() => setNoteGrid(cols as 1 | 2 | 3)}
                    className={`px-3 py-1 rounded text-xs font-black uppercase tracking-widest transition-all ${noteGrid === cols ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    {cols} Col
                  </button>
                ))}
              </div>
            </div>
            <div className={`grid gap-4 sm:gap-6 ${noteGrid === 1 ? 'grid-cols-1' : noteGrid === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
              {notes.map(note => (
                <div 
                  key={note.id}
                  className="group relative p-4 sm:p-6 bg-gray-900/30 backdrop-blur-xl hover:bg-gray-900/50 rounded-[2.5rem] border border-gray-800/50 transition-all duration-300 hover:border-orange-500/30"
                >
                  {note.pinned && (
                    <div className="absolute top-3 sm:top-4 right-3 sm:right-4">
                      <Pin size={14} sm:size={16} className="text-orange-500" />
                    </div>
                  )}
                  <div onClick={() => startEdit(note)} className="cursor-pointer pr-8 sm:pr-0">
                    <h3 className="text-base sm:text-lg font-bold text-gray-100 mb-2 line-clamp-2">{note.title}</h3>
                    {note.content && (
                      <p className="text-sm text-gray-500 mb-3 sm:mb-4 line-clamp-3">{note.content}</p>
                    )}
                    <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-700">
                      Created {new Date(note.createdAt).toLocaleDateString()} at {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteMutation.mutate({ id: note.id })}
                    className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-gray-700 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={18} sm:size={20} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
