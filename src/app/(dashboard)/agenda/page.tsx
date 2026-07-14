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
  const [taskGrid, setTaskGrid] = useState<1 | 2 | 3 | 4>(2);
  const [noteGrid, setNoteGrid] = useState<1 | 2 | 3>(3);
  const [pinned, setPinned] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [category, setCategory] = useState("Other");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState("Other");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchContent, setSearchContent] = useState("");
  const [searchCategory, setSearchCategory] = useState("all");
  const [searchType, setSearchType] = useState("all");

  const categoryOptions = ["Work", "Personal", "Family", "Other"] as const;
  const getCategoryBadgeClasses = (value: string | null | undefined) => {
    switch ((value ?? "Other").toLowerCase()) {
      case "work":
        return "border-sky-500/30 bg-sky-500/10 text-sky-400";
      case "personal":
        return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400";
      case "family":
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
      default:
        return "border-gray-500/30 bg-gray-500/10 text-gray-400";
    }
  };

  // 1. Hydration Fix: Ensure component is mounted before rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  const utils = api.useUtils();
  const { data: items, isLoading } = api.agenda.getAll.useQuery();

  const isCompactTaskView = taskGrid === 3;

  const stickyItems = items?.filter(item => item.sticky && item.type !== 'note').sort((a, b) => {
    if (sortBy === 'targetDate') {
      return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
    } else {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
  }) || [];

  const tasksReminders = items?.filter(item => !item.sticky && item.type !== 'note').sort((a, b) => {
    if (sortBy === 'targetDate') {
      return new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime();
    } else {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
  }) || [];

  const titleFilter = searchTitle.trim().toLowerCase();
  const contentFilter = searchContent.trim().toLowerCase();
  const categoryFilter = searchCategory.toLowerCase();
  const typeFilter = searchType.toLowerCase();

  const matchesFilters = (item: { title: string; content?: string | null; category?: string | null; type: string }) => {
    if (titleFilter && !item.title.toLowerCase().includes(titleFilter)) return false;
    if (contentFilter && !(item.content ?? "").toLowerCase().includes(contentFilter)) return false;
    if (categoryFilter !== "all" && (item.category ?? "other").toLowerCase() !== categoryFilter) return false;
    if (typeFilter !== "all" && item.type.toLowerCase() !== typeFilter) return false;
    return true;
  };

  const now = new Date();
  const isExpiredItem = (item: { targetDate: string | Date }) => {
    return new Date(item.targetDate).getTime() < now.getTime();
  };

  const filteredStickyItems = stickyItems.filter((item) => matchesFilters(item));
  const filteredTasksReminders = tasksReminders.filter((item) => matchesFilters(item));
  const hasActiveFilters =
    titleFilter.length > 0 ||
    contentFilter.length > 0 ||
    categoryFilter !== "all" ||
    typeFilter !== "all";

  const activeStickyItems = filteredStickyItems.filter((item) => !isExpiredItem(item));
  const expiredStickyItems = filteredStickyItems.filter((item) => isExpiredItem(item));
  const activeTasksReminders = filteredTasksReminders.filter((item) => !isExpiredItem(item));
  const expiredTasksReminders = filteredTasksReminders.filter((item) => isExpiredItem(item));
  const expiredItems = [...expiredStickyItems, ...expiredTasksReminders].sort(
    (a, b) => new Date(b.targetDate).getTime() - new Date(a.targetDate).getTime(),
  );

  // Group items by due date for clearer timeline sections
  const groupByDue = <T extends { targetDate: string | Date }>(list: T[]) => {
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = startOf(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const buckets = new Map<string, any[]>();
    list.forEach((item) => {
      const d = new Date(item.targetDate);
      const sd = startOf(d);
      let label: string;
      if (sd.getTime() === today.getTime()) {
        label = `Due Today ${d.toLocaleDateString(undefined, { weekday: 'long' })} ${d.toLocaleDateString()}`;
      } else if (sd.getTime() === tomorrow.getTime()) {
        label = `Due Tomorrow ${d.toLocaleDateString(undefined, { weekday: 'long' })} ${d.toLocaleDateString()}`;
      } else {
        label = `Due ${d.toLocaleDateString(undefined, { weekday: 'long' })} ${d.toLocaleDateString()}`;
      }
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label)!.push(item);
    });

    const arr = Array.from(buckets.entries());
    arr.sort((a, b) => new Date(a[1][0].targetDate).getTime() - new Date(b[1][0].targetDate).getTime());
    return arr; // [label, items[]]
  };

  const groupedSticky = groupByDue(activeStickyItems);
  const groupedTasks = groupByDue(activeTasksReminders);

  const notes = items?.filter(item => item.type === 'note').sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }) || [];
  const filteredNotes = notes.filter((item) => matchesFilters(item));
  const filteredResultCount = filteredStickyItems.length + filteredTasksReminders.length + filteredNotes.length;

  useEffect(() => {
    if (!bulkMode) {
      setSelectedIds([]);
    }
  }, [bulkMode]);

  useEffect(() => {
    const validIds = new Set((items ?? []).map((item) => item.id));
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [items]);

  const resetForm = () => {
    setTitle("");
    setContent("");
    setType("task");
    setRepeat("none");
    setTarget(null);
    setPinned(false);
    setIsCompleted(false);
    setSticky(false);
    setCategory("Other");
    setEditingId(null);
  };

  const addMutation = api.agenda.create.useMutation({
    onSuccess: () => {
      resetForm();
      setIsOpen(false);
      void utils.agenda.getAll.invalidate();
    },
    onError: (err) => alert(err.message),
  });

  const deleteMutation = api.agenda.delete.useMutation({
    onSuccess: () => void utils.agenda.getAll.invalidate(),
  });

  const bulkDeleteMutation = api.agenda.bulkDelete.useMutation({
    onSuccess: () => {
      setSelectedIds([]);
      void utils.agenda.getAll.invalidate();
    },
  });

  const bulkSetCompleteMutation = api.agenda.bulkSetComplete.useMutation({
    onSuccess: () => {
      setSelectedIds([]);
      void utils.agenda.getAll.invalidate();
    },
  });

  const bulkSetStickyMutation = api.agenda.bulkSetSticky.useMutation({
    onSuccess: () => {
      setSelectedIds([]);
      void utils.agenda.getAll.invalidate();
    },
  });

  const bulkSetCategoryMutation = api.agenda.bulkSetCategory.useMutation({
    onSuccess: () => {
      setSelectedIds([]);
      void utils.agenda.getAll.invalidate();
    },
  });

  const toggleMutation = api.agenda.toggleComplete.useMutation({
    onSuccess: () => void utils.agenda.getAll.invalidate(),
  });

  const updateMutation = api.agenda.update.useMutation({
    onSuccess: () => {
      resetForm();
      setIsOpen(false);
      void utils.agenda.getAll.invalidate();
    },
    onError: (err) => alert(err.message),
  });

  const startEdit = (item: any) => {
    resetForm();
    setTitle(item.title);
    setContent(item.content || "");
    setType(item.type);
    setRepeat(item.repeatInterval);
    setTarget(item.targetDate ? item.targetDate.toISOString() : null);
    setPinned(item.pinned || false);
    setIsCompleted(item.isCompleted || false);
    setSticky(item.sticky || false);
    setCategory(item.category ?? "Other");
    setEditingId(item.id);
    setIsOpen(true);
    // Scroll to top to show the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = () => {
    if (type !== 'note' && !target) {
      alert("Please select a due date and time before saving.");
      return;
    }

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
        sticky,
        isCompleted,
        category
      });
    } else {
      addMutation.mutate({ 
        title, 
        content, 
        type, 
        category,
        repeatInterval: repeat, 
        startTime,
        pinned,
        sticky
      });
    }
  };

  const cancelEdit = () => {
    resetForm();
    setIsOpen(false);
  };

  const toggleItemSelection = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      return [...prev, id];
    });
  };

  const visibleSelectableItems = [...activeStickyItems, ...activeTasksReminders, ...expiredItems, ...filteredNotes];
  const allVisibleSelected =
    visibleSelectableItems.length > 0 &&
    visibleSelectableItems.every((item) => selectedIds.includes(item.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(visibleSelectableItems.map((item) => item.id));
  };

  const isBulkBusy =
    bulkDeleteMutation.isPending ||
    bulkSetCompleteMutation.isPending ||
    bulkSetStickyMutation.isPending ||
    bulkSetCategoryMutation.isPending;

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-black text-white p-3 sm:p-6 md:p-12 lg:p-20">
      {/* NEXUS HEADER */}
      <header className="max-w-4xl mx-auto flex flex-col gap-2 sm:gap-3 sm:flex-row sm:justify-between sm:items-center mb-6 sm:mb-16">
        <Link href="/" className="group flex items-center gap-2 text-gray-500 hover:text-white transition-all">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">System / Root</span>
        </Link>
        <div className="text-right">
          <p className="text-[9px] sm:text-[10px] text-blue-500 uppercase tracking-[0.4em] font-black mb-1">Active Timeline</p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tighter">AGENDA</h1>
        </div>
      </header>

      <div className="w-full max-w-6xl mx-auto">
        {/* ADD ACTION BAR */}
        <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:justify-between sm:items-end mb-4 sm:mb-8">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-gray-400">{editingId ? "Edit Sequence" : activeStickyItems.length > 0 ? "Normal Priority" : "Upcoming Events"}</h2>
            <p className="text-[9px] sm:text-xs text-gray-600 uppercase tracking-widest mt-1">
              {isLoading ? "Syncing..." : `${activeTasksReminders.length} sequences active`}
            </p>
          </div>
          <button 
            onClick={() => {
              if (editingId) {
                cancelEdit();
                return;
              }

              if (isOpen) {
                resetForm();
                setIsOpen(false);
              } else {
                resetForm();
                setIsOpen(true);
              }
            }} 
            className={`p-2.5 sm:p-4 rounded-2xl transition-all duration-300 shadow-xl active:scale-95 flex items-center justify-center
              ${isOpen ? 'bg-gray-800 text-gray-400' : 'bg-blue-600 text-white shadow-blue-900/20'}`}
          >
            {isOpen ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Plus className="w-5 h-5 sm:w-6 sm:h-6" />}
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

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-black/40 p-4 sm:p-5 rounded-2xl border border-gray-800">
                <label className="text-sm text-gray-400 sm:flex-shrink-0">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-transparent text-sm font-bold uppercase tracking-widest text-gray-300 outline-none cursor-pointer flex-1"
                >
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              
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
                    onClick={() => setSticky(!sticky)}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${sticky ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                  >
                    <Pin size={14} /> {sticky ? 'Has Priority' : 'Mark Priority'}
                  </button>
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
                  disabled={!title || (type !== 'note' && !target) || addMutation.isPending || updateMutation.isPending} 
                  className="bg-white text-black px-8 sm:px-12 py-3 sm:py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-500 hover:text-white transition-all active:scale-95 disabled:opacity-30 disabled:grayscale order-1 sm:order-2"
                >
                  {addMutation.isPending || updateMutation.isPending ? <Loader2 className="animate-spin w-4 h-4 sm:w-5 sm:h-5" /> : editingId ? `Update ${type}` : `Initialize ${type}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SORT OPTIONS */}
        <div className="flex flex-col gap-2 sm:gap-4 mb-4 sm:mb-8">
          <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-3">
            <button
              onClick={() => setSearchOpen((prev) => !prev)}
              className={`px-3 py-1.5 sm:px-6 sm:py-2 rounded-xl text-[9px] sm:text-xs font-black uppercase tracking-widest transition-all ${searchOpen ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {searchOpen ? 'Hide Search' : 'Search'}
            </button>
            <div className="flex items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-xl px-3 py-2">
              <label className="text-[9px] sm:text-xs font-black uppercase tracking-widest text-gray-500">Sort</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'targetDate' | 'createdAt')}
                className="bg-transparent text-[10px] sm:text-xs font-black uppercase tracking-widest text-gray-200 outline-none cursor-pointer"
              >
                <option value="targetDate">By Date</option>
                <option value="createdAt">By Added</option>
              </select>
            </div>
            <button
              onClick={() => setBulkMode((prev) => !prev)}
              className={`px-3 py-1.5 sm:px-6 sm:py-2 rounded-xl text-[9px] sm:text-xs font-black uppercase tracking-widest transition-all ${bulkMode ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {bulkMode ? 'Exit Bulk' : 'Bulk Select'}
            </button>
          </div>

          {searchOpen && (
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-gray-500">Search Filters</p>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-gray-600">{filteredResultCount} matches</p>
                )}
                <button
                  onClick={() => {
                    setSearchTitle("");
                    setSearchContent("");
                    setSearchCategory("all");
                    setSearchType("all");
                  }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-black/60 border border-gray-700 text-gray-300 hover:border-gray-500"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <input
                value={searchTitle}
                onChange={(e) => setSearchTitle(e.target.value)}
                placeholder="Title"
                className="bg-black/60 border border-gray-800 p-2.5 rounded-xl text-xs sm:text-sm font-bold text-gray-200 placeholder:text-gray-600 outline-none"
              />
              <input
                value={searchContent}
                onChange={(e) => setSearchContent(e.target.value)}
                placeholder="Content"
                className="bg-black/60 border border-gray-800 p-2.5 rounded-xl text-xs sm:text-sm font-bold text-gray-200 placeholder:text-gray-600 outline-none"
              />
              <select
                value={searchCategory}
                onChange={(e) => setSearchCategory(e.target.value)}
                className="bg-black/60 border border-gray-800 p-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest text-gray-200 outline-none"
              >
                <option value="all">All Categories</option>
                {categoryOptions.map((option) => (
                  <option key={option} value={option.toLowerCase()}>{option}</option>
                ))}
              </select>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="bg-black/60 border border-gray-800 p-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-widest text-gray-200 outline-none"
              >
                <option value="all">All Types</option>
                <option value="task">Task</option>
                <option value="reminder">Reminder</option>
                <option value="note">Note</option>
              </select>
            </div>
          </div>
          )}

          {bulkMode && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-gray-400">
                  {selectedIds.length} selected
                </p>
                <button
                  onClick={toggleSelectAllVisible}
                  className="px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest bg-black/60 border border-gray-700 text-gray-300 hover:border-gray-500"
                >
                  {allVisibleSelected ? 'Clear Selection' : 'Select All'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => selectedIds.length > 0 && bulkDeleteMutation.mutate({ ids: selectedIds })}
                  disabled={selectedIds.length === 0 || isBulkBusy}
                  className="px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest bg-red-600/80 text-white hover:bg-red-500 disabled:opacity-40"
                >
                  Delete
                </button>
                <button
                  onClick={() => selectedIds.length > 0 && bulkSetCompleteMutation.mutate({ ids: selectedIds, isCompleted: true })}
                  disabled={selectedIds.length === 0 || isBulkBusy}
                  className="px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest bg-emerald-600/80 text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  Mark Completed
                </button>
                <button
                  onClick={() => selectedIds.length > 0 && bulkSetStickyMutation.mutate({ ids: selectedIds, sticky: true })}
                  disabled={selectedIds.length === 0 || isBulkBusy}
                  className="px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest bg-indigo-600/80 text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  Mark Priority (Sticky)
                </button>
                <div className="flex items-center gap-2">
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="px-2 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest bg-black/60 border border-gray-700 text-gray-200"
                  >
                    {categoryOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => selectedIds.length > 0 && bulkSetCategoryMutation.mutate({ ids: selectedIds, category: bulkCategory })}
                    disabled={selectedIds.length === 0 || isBulkBusy}
                    className="px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest bg-sky-600/80 text-white hover:bg-sky-500 disabled:opacity-40"
                  >
                    Set Category
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* View controls moved to the non-priority timeline section (applies only to other sequences) */}
        </div>

        {/* STICKY SECTION */}
        {activeStickyItems.length > 0 && (
          <div className="mb-8 sm:mb-12">
            <div className="mb-4 sm:mb-6">
              <p className="text-[9px] sm:text-[10px] text-indigo-500 uppercase tracking-[0.4em] font-black mb-1">Priority Items</p>
              <h2 className="text-lg sm:text-xl font-black text-gray-100">High Priority</h2>
            </div>
            {groupedSticky.map(([label, group]) => (
              <div key={label} className="mb-6">
                <h3 className="text-sm text-gray-400 font-black mb-3">{label}</h3>
                <div className="grid gap-2 sm:gap-3">
                  {group.map(item => (
                    <div
                      key={item.id}
                      className={`group relative p-3 sm:p-4 bg-gradient-to-r from-indigo-950/20 to-transparent backdrop-blur-sm hover:from-indigo-950/40 rounded-xl border border-indigo-500/20 transition-all duration-300 hover:border-indigo-500/40 cursor-pointer overflow-hidden flex items-center justify-between ${item.isCompleted ? 'opacity-60' : ''}`}
                      onClick={() => bulkMode ? toggleItemSelection(item.id) : startEdit(item)}
                    >
                      {/* Left accent */}
                      <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${item.isCompleted ? 'bg-gray-700' : 'bg-indigo-500'}`} />

                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: item.id, isCompleted: !item.isCompleted }); }}
                          className={`rounded-lg border transition-all flex items-center justify-center gap-1 px-2 py-1 shrink-0
                            ${item.isCompleted ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-indigo-500/50 bg-black hover:border-indigo-500 text-indigo-300'}`}
                        >
                          <CheckCircle size={12} className={item.isCompleted ? 'text-white' : 'text-indigo-400'} />
                          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">{item.isCompleted ? 'Completed' : 'Mark Done'}</span>
                        </button>
                        <div className="min-w-0 flex-1">
                          <h3 className={`text-sm sm:text-base font-bold truncate ${item.isCompleted ? 'line-through text-gray-600' : 'text-gray-100'}`}>
                            {item.title}
                          </h3>
                          {item.type !== 'note' && item.targetDate && (
                            <div className={`flex items-center gap-1.5 text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-gray-700 mt-1`}>
                              <Clock size={11} /> {new Date(item.targetDate).toLocaleDateString()} at {new Date(item.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                        {item.repeatInterval !== 'none' && (
                          <span className="p-1 bg-indigo-500/20 rounded text-indigo-400 text-[7px] font-black uppercase tracking-[0.1em] shrink-0">
                            {item.repeatInterval}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        {bulkMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleItemSelection(item.id); }}
                            className={`w-5 h-5 rounded border flex items-center justify-center ${selectedIds.includes(item.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-transparent'}`}
                          >
                            ✓
                          </button>
                        )}
                        <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg border ${getCategoryBadgeClasses(item.category)}`}>
                          {item.category ?? 'Other'}
                        </span>
                        <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg border ${item.type === 'task' ? 'border-blue-900/30 bg-blue-900/10 text-blue-500' : 'border-purple-900/30 bg-purple-900/10 text-purple-500'}`}>
                          {item.type}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: item.id }); }}
                          className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-gray-600 hover:text-red-500 transition-all p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TIMELINE LIST (Normal Priority) */}
        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>
        ) : activeTasksReminders.length === 0 ? (
          <div className="text-center p-20 bg-gray-900/20 border border-dashed border-gray-800 rounded-[2.5rem]">
            <p className="text-gray-600 text-xs uppercase tracking-[0.4em] font-black">{filteredResultCount === 0 ? 'No Search Matches Found' : 'No Active Sequences Found'}</p>
            {expiredItems.length > 0 && (
              <p className="text-[10px] text-gray-700 mt-3 uppercase tracking-[0.2em]">See expired section below</p>
            )}
          </div>
        ) : (
          <>
            {/* View controls for other sequences */}
            <div className="flex flex-wrap justify-center lg:justify-between items-center gap-2 rounded-2xl border border-gray-800 bg-gray-950/70 p-2 sm:p-3 mb-6">
              <h2 className="text-sm sm:text-base font-black text-gray-200 uppercase tracking-[0.18em] px-1">
                Normal Priority
              </h2>
              {/* <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-gray-600 mr-1">View</span>
                {[{value: 1, label: 'I'}, {value: 2, label: 'II'}, {value: 3, label: 'III'}, {value: 4, label: 'IV'}].map(option => {
                  const isHidden = option.value >= 3;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTaskGrid(option.value as 1 | 2 | 3 | 4)}
                      className={`flex aspect-square h-7 w-7 sm:h-10 sm:w-10 items-center justify-center rounded-xl transition-all ${taskGrid === option.value ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-black/40 text-gray-400 hover:bg-gray-800 hover:text-white'} ${isHidden ? 'hidden lg:flex' : 'flex'}`}
                    >
                      <div className={`grid h-4 w-4 sm:h-5 sm:w-5 gap-0.5 ${option.value === 1 ? 'grid-cols-1' : option.value === 2 ? 'grid-cols-2' : option.value === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                        {Array.from({ length: option.value }, (_, index) => (
                          <span
                            key={index}
                            className={`rounded-[2px] border ${taskGrid === option.value ? 'border-white bg-white/25' : 'border-gray-400/80 bg-transparent'}`}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div> */}
              <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
                <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-gray-700 mr-2 mix-blend-plus-lighting">View</span>
                {[1, 2, 3, 4].map(value => {
                  const isHidden = value >= 3;
                  const isActive = taskGrid === value;

                  const continuousLine = {
                    1: <path d="M10 2v16M5 2h10M5 18h10" strokeWidth={isActive ? "2.8" : "1.6"} strokeLinecap="round" strokeLinejoin="round" />,
                    2: <path d="M6 3v14M14 3v14M3 3h6M11 3h6M3 17h6M11 17h6" strokeWidth={isActive ? "2.4" : "1.4"} strokeLinecap="round" strokeLinejoin="round" />,
                    3: <path d="M4 3v14M10 3v14M16 3v14M2 3h4M8 3h4M14 3h4M2 17h4M8 17h4M14 17h4" strokeWidth={isActive ? "2.0" : "1.2"} strokeLinecap="round" strokeLinejoin="round" />,
                    4: <path d="M5 3v14 M3 3h4 M3 17h4 M9 3l4 14 4-14 M9 3h3 M14 3h3" strokeWidth={isActive ? "2.0" : "1.2"} strokeLinecap="round" strokeLinejoin="round" />
                  }[value as 1 | 2 | 3 | 4];

                  return (
                    <button
                      key={value}
                      onClick={() => setTaskGrid(value as 1 | 2 | 3 | 4)}
                      style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
                      className={`group relative flex aspect-square h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border transition-all duration-300 active:scale-95 ${
                        isActive
                          ? 'border-t-pink-500 border-r-purple-500 border-b-cyan-500 border-l-blue-500 text-white scale-105 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                          : 'border-gray-800 bg-gray-950/20 text-gray-600 hover:text-gray-300 hover:border-gray-600 hover:bg-gray-900/30'
                      } ${isHidden ? 'hidden lg:flex' : 'flex'}`}
                    >
                      {/* Layer 1: Symmetrical Under-Glow Aura */}
                      <div
                        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
                        className={`absolute -inset-[1px] -z-10 rounded-xl opacity-0 blur-md transition-all duration-500 group-hover:opacity-40 ${
                          isActive ? 'opacity-100 bg-gradient-to-tr from-cyan-500 via-purple-500 to-pink-500' : 'bg-white/5'
                        }`}
                      />

                      {/* Layer 2: Inner Liquid Velvet Canvas */}
                      <div
                        style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
                        className={`absolute inset-[1px] -z-10 rounded-xl transition-all duration-300 ${
                          isActive
                            ? 'bg-gradient-to-br from-purple-950/50 via-black to-cyan-950/50'
                            : 'bg-black/40 group-hover:bg-gray-900/60'
                        }`}
                      />

                      {/* Glowing Filaments */}
                      <svg
                        viewBox="0 0 20 20"
                        style={{
                          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                          filter: isActive ? 'drop-shadow(0 0 3px currentColor)' : 'none'
                        }}
                        className={`relative z-10 w-4 h-4 fill-none stroke-current transition-all duration-300 ${
                          isActive ? 'text-cyan-300' : 'group-hover:text-pink-400'
                        }`}
                      >
                        {continuousLine}
                      </svg>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Render grouped tasks by due date */}
            {groupedTasks.map(([label, group]) => (
              <div key={label} className="mb-8">
                <h3 className="text-sm text-gray-400 font-black mb-3">{label}</h3>
                <div className={`grid gap-2 sm:gap-3 ${taskGrid === 1 ? 'grid-cols-1' : taskGrid === 2 ? 'grid-cols-1 sm:grid-cols-2' : taskGrid === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
                  {group.map(item => (
                    taskGrid === 1 ? (
                      <div
                        key={item.id}
                        className={`group relative p-3 sm:p-4 bg-gradient-to-r ${item.type === 'reminder' ? 'from-purple-950/20 to-transparent' : 'from-blue-950/20 to-transparent'} backdrop-blur-sm hover:${item.type === 'reminder' ? 'from-purple-950/40' : 'from-blue-950/40'} rounded-xl border ${item.type === 'reminder' ? 'border-purple-500/20 hover:border-purple-500/40' : 'border-blue-500/20 hover:border-blue-500/40'} transition-all duration-300 cursor-pointer overflow-hidden flex items-center justify-between ${item.isCompleted ? 'opacity-60' : ''}`}
                        onClick={() => bulkMode ? toggleItemSelection(item.id) : startEdit(item)}
                      >
                        <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${item.isCompleted ? 'bg-gray-700' : item.type === 'reminder' ? 'bg-purple-500' : 'bg-blue-500'}`} />

                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: item.id, isCompleted: !item.isCompleted }); }}
                            className={`rounded-lg border transition-all flex items-center justify-center gap-1 px-2 py-1 shrink-0 ${item.isCompleted ? (item.type === 'reminder' ? 'bg-purple-600 border-purple-600 text-white' : 'bg-blue-600 border-blue-600 text-white') : (item.type === 'reminder' ? 'border-purple-500/50 bg-black hover:border-purple-500 text-purple-300' : 'border-blue-500/50 bg-black hover:border-blue-500 text-blue-300')}`}
                          >
                            <CheckCircle size={12} className={item.isCompleted ? 'text-white' : item.type === 'reminder' ? 'text-purple-400' : 'text-blue-400'} />
                            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">{item.isCompleted ? 'Completed' : 'Mark Done'}</span>
                          </button>
                          <div className="min-w-0 flex-1">
                            <h3 className={`text-sm sm:text-base font-bold truncate ${item.isCompleted ? 'line-through text-gray-600' : 'text-gray-100'}`}>
                              {item.title}
                            </h3>
                            {item.type !== 'note' && item.targetDate && (
                              <div className="flex items-center gap-1.5 text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-gray-700 mt-1">
                                <Clock size={11} /> {new Date(item.targetDate).toLocaleDateString()} at {new Date(item.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                          {item.repeatInterval !== 'none' && (
                            <span className={`p-1 rounded text-[7px] font-black uppercase tracking-[0.1em] shrink-0 ${item.type === 'reminder' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                              {item.repeatInterval}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          {bulkMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleItemSelection(item.id); }}
                              className={`w-5 h-5 rounded border flex items-center justify-center ${selectedIds.includes(item.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-transparent'}`}
                            >
                              ✓
                            </button>
                          )}
                          <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg border ${getCategoryBadgeClasses(item.category)}`}>
                            {item.category ?? 'Other'}
                          </span>
                          <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg border ${item.type === 'task' ? 'border-blue-900/30 bg-blue-900/10 text-blue-500' : item.type === 'reminder' ? 'border-purple-900/30 bg-purple-900/10 text-purple-500' : 'border-orange-900/30 bg-orange-900/10 text-orange-500'}`}>
                            {item.type}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: item.id }); }}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-gray-600 hover:text-red-500 transition-all p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={item.id}
                        className={`group relative min-h-[112px] sm:min-h-[128px] p-3 sm:p-4 bg-gradient-to-r ${item.type === 'reminder' ? 'from-purple-950/20 to-transparent' : 'from-blue-950/20 to-transparent'} backdrop-blur-sm hover:${item.type === 'reminder' ? 'from-purple-950/40' : 'from-blue-950/40'} rounded-xl border ${item.type === 'reminder' ? 'border-purple-500/20 hover:border-purple-500/40' : 'border-blue-500/20 hover:border-blue-500/40'} transition-all duration-300 cursor-pointer overflow-hidden flex flex-col gap-2 ${item.isCompleted ? 'opacity-60' : ''}`}
                        onClick={() => bulkMode ? toggleItemSelection(item.id) : startEdit(item)}
                      >
                        <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${item.isCompleted ? 'bg-gray-700' : item.type === 'reminder' ? 'bg-purple-500' : 'bg-blue-500'}`} />

                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: item.id, isCompleted: !item.isCompleted }); }}
                            className={`rounded-lg border transition-all flex items-center justify-center gap-1 px-2 py-1 shrink-0 ${item.isCompleted ? (item.type === 'reminder' ? 'bg-purple-600 border-purple-600 text-white' : 'bg-blue-600 border-blue-600 text-white') : (item.type === 'reminder' ? 'border-purple-500/50 bg-black hover:border-purple-500 text-purple-300' : 'border-blue-500/50 bg-black hover:border-blue-500 text-blue-300')}`}
                          >
                            <CheckCircle size={12} className={item.isCompleted ? 'text-white' : item.type === 'reminder' ? 'text-purple-400' : 'text-blue-400'} />
                            <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">{item.isCompleted ? 'Completed' : 'Mark Done'}</span>
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className={`text-sm sm:text-base font-bold leading-snug break-words ${item.isCompleted ? 'line-through text-gray-600' : 'text-gray-100'}`}>
                                {item.title}
                              </h3>
                              {item.repeatInterval !== 'none' && (
                                <span className={`p-1 rounded text-[7px] font-black uppercase tracking-[0.1em] shrink-0 ${item.type === 'reminder' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                  {item.repeatInterval}
                                </span>
                              )}
                            </div>
                            {item.type !== 'note' && item.targetDate && (
                              <div className="flex items-center gap-1.5 text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-gray-700 mt-1">
                                <Clock size={11} /> {new Date(item.targetDate).toLocaleDateString()} at {new Date(item.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {bulkMode && (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleItemSelection(item.id); }}
                                className={`w-5 h-5 rounded border flex items-center justify-center ${selectedIds.includes(item.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-transparent'}`}
                              >
                                ✓
                              </button>
                            )}
                            <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg border ${getCategoryBadgeClasses(item.category)}`}>
                              {item.category ?? 'Other'}
                            </span>
                            <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg border ${item.type === 'task' ? 'border-blue-900/30 bg-blue-900/10 text-blue-500' : item.type === 'reminder' ? 'border-purple-900/30 bg-purple-900/10 text-purple-500' : 'border-orange-900/30 bg-orange-900/10 text-orange-500'}`}>
                              {item.type}
                            </span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: item.id }); }}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-gray-600 hover:text-red-500 transition-all p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* EXPIRED SECTION */}
        {expiredItems.length > 0 && (
          <div className="mt-12 sm:mt-16">
            <div className="mb-4 sm:mb-6">
              <p className="text-[9px] sm:text-[10px] text-red-500 uppercase tracking-[0.4em] font-black mb-1">Timeline Overflow</p>
              <h2 className="text-lg sm:text-xl font-black text-gray-200">Expired</h2>
            </div>

            <div className="grid gap-2 sm:gap-3">
              {expiredItems.map((item) => (
                <div
                  key={`expired-${item.id}`}
                  className="group relative p-3 sm:p-4 bg-gradient-to-r from-gray-900/40 to-transparent backdrop-blur-sm rounded-xl border border-gray-700/40 cursor-pointer overflow-hidden flex items-center justify-between opacity-60 hover:opacity-80 transition-all duration-300"
                  onClick={() => bulkMode ? toggleItemSelection(item.id) : startEdit(item)}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gray-600" />

                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMutation.mutate({ id: item.id, isCompleted: !item.isCompleted }); }}
                      className={`rounded-lg border transition-all flex items-center justify-center gap-1 px-2 py-1 shrink-0 ${item.isCompleted ? 'bg-gray-600 border-gray-600 text-white' : 'border-gray-600/50 bg-black hover:border-gray-500 text-gray-300'}`}
                    >
                      <CheckCircle size={12} className={item.isCompleted ? 'text-white' : 'text-gray-400'} />
                      <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">{item.isCompleted ? 'Completed' : 'Mark Done'}</span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <h3 className={`text-sm sm:text-base font-bold truncate ${item.isCompleted ? 'line-through text-gray-600' : 'text-gray-300'}`}>
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[7px] sm:text-[8px] font-black uppercase tracking-widest text-gray-600 mt-1">
                        <Clock size={11} /> {new Date(item.targetDate).toLocaleDateString()} at {new Date(item.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {bulkMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleItemSelection(item.id); }}
                        className={`w-5 h-5 rounded border flex items-center justify-center ${selectedIds.includes(item.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-transparent'}`}
                      >
                        ✓
                      </button>
                    )}
                    <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg border border-red-700/40 bg-red-900/20 text-red-300">
                      Expired
                    </span>
                    {item.sticky && (
                      <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg border border-indigo-700/30 bg-indigo-900/20 text-indigo-300">
                        Priority
                      </span>
                    )}
                    <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-lg border ${getCategoryBadgeClasses(item.category)}`}>
                      {item.category ?? 'Other'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: item.id }); }}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NOTES SECTION */}
        {filteredNotes.length > 0 && (
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
              {filteredNotes.map(note => (
                <div 
                  key={note.id}
                  className="group relative p-4 sm:p-6 bg-gray-900/30 backdrop-blur-xl hover:bg-gray-900/50 rounded-[2.5rem] border border-gray-800/50 transition-all duration-300 hover:border-orange-500/30"
                >
                  {note.pinned && (
                    <div className="absolute top-3 sm:top-4 right-3 sm:right-4">
                      <Pin size={16} className="text-orange-500" />
                    </div>
                  )}
                  <div onClick={() => bulkMode ? toggleItemSelection(note.id) : startEdit(note)} className="cursor-pointer pr-10 pb-2">
                    <h3 className="text-base sm:text-lg font-bold text-gray-100 mb-2 line-clamp-2">{note.title}</h3>
                    {note.content && (
                      <p className="text-sm text-gray-500 mb-3 sm:mb-4 line-clamp-3">{note.content}</p>
                    )}
                    <div className="flex items-center justify-between gap-2 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-700">
                      <span>
                        Created {new Date(note.createdAt).toLocaleDateString()} at {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-2">
                        {bulkMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleItemSelection(note.id); }}
                            className={`w-5 h-5 rounded border flex items-center justify-center ${selectedIds.includes(note.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-transparent'}`}
                          >
                            ✓
                          </button>
                        )}
                        <span className={`px-2 py-1 rounded-lg border ${getCategoryBadgeClasses(note.category)}`}>
                          {note.category ?? 'Other'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: note.id }); }}
                    className={`absolute right-3 sm:right-4 ${note.pinned ? 'top-10 sm:top-11' : 'top-3 sm:top-4'} opacity-100 md:opacity-0 md:group-hover:opacity-100 p-2 text-gray-700 hover:text-red-500 transition-all`}
                  >
                    <Trash2 size={20} />
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
