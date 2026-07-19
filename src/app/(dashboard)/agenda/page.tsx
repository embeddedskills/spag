"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import TimestampPicker from "~/components/ui/timestamp-picker";
import { useSearchParams } from "next/navigation";
import { 
  Trash2, Plus, Calendar, Bell, StickyNote, 
  CheckCircle, Repeat, Loader2, Clock, X, Pin 
} from "lucide-react";

function getStoredAgendaView(key: "agenda-timeline-view" | "agenda-notes-view") {
  if (typeof window === "undefined") return "list" as const;

  const value = window.localStorage.getItem(key);
  return value === "grid" ? "grid" : "list";
}

export default function AgendaPage() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("task");
  const [repeat, setRepeat] = useState("none");
  const [target, setTarget] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'targetDate' | 'createdAt'>('targetDate');
  const [timelineView, setTimelineView] = useState<"list" | "grid">(() => getStoredAgendaView("agenda-timeline-view"));
  const [notesView, setNotesView] = useState<"list" | "grid">(() => getStoredAgendaView("agenda-notes-view"));
  const [editingCreatedAt, setEditingCreatedAt] = useState<Date | null>(null);
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
  const [handledEditTargetId, setHandledEditTargetId] = useState<string | null>(null);
  const [pinnedExpanded, setPinnedExpanded] = useState(true);
  const [upcomingExpanded, setUpcomingExpanded] = useState(true);
  const [pastDueExpanded, setPastDueExpanded] = useState(true);

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

  const getTimelineSurfaceClasses = (tone: "blue" | "purple" | "indigo" | "gray" = "blue") => {
    switch (tone) {
      case "purple":
        return "border-purple-500/15 bg-gradient-to-r from-purple-950/18 via-gray-950/40 to-transparent hover:border-purple-500/30 hover:from-purple-950/28";
      case "indigo":
        return "border-indigo-500/15 bg-gradient-to-r from-indigo-950/18 via-gray-950/40 to-transparent hover:border-indigo-500/30 hover:from-indigo-950/28";
      case "gray":
        return "border-gray-700/50 bg-gradient-to-r from-gray-900/45 via-gray-950/55 to-transparent hover:border-gray-600/70 hover:from-gray-900/60";
      default:
        return "border-blue-500/15 bg-gradient-to-r from-blue-950/18 via-gray-950/40 to-transparent hover:border-blue-500/30 hover:from-blue-950/28";
    }
  };

  const getTimelineShadowClasses = (tone: "blue" | "purple" | "indigo" | "gray" = "blue") => {
    switch (tone) {
      case "purple":
        return "shadow-[0_14px_32px_-20px_rgba(168,85,247,0.42)] hover:shadow-[0_18px_40px_-20px_rgba(168,85,247,0.56)]";
      case "indigo":
        return "shadow-[0_14px_32px_-20px_rgba(99,102,241,0.42)] hover:shadow-[0_18px_40px_-20px_rgba(99,102,241,0.56)]";
      case "gray":
        return "shadow-[0_14px_32px_-20px_rgba(107,114,128,0.28)] hover:shadow-[0_18px_40px_-20px_rgba(107,114,128,0.4)]";
      default:
        return "shadow-[0_14px_32px_-20px_rgba(59,130,246,0.42)] hover:shadow-[0_18px_40px_-20px_rgba(59,130,246,0.56)]";
    }
  };

  const getTimelineAccentClasses = (tone: "blue" | "purple" | "indigo" | "gray" = "blue") => {
    switch (tone) {
      case "purple":
        return "bg-purple-500";
      case "indigo":
        return "bg-indigo-500";
      case "gray":
        return "bg-gray-600";
      default:
        return "bg-blue-500";
    }
  };

  const getTimelineChipClasses = (tone: "blue" | "purple" | "indigo" | "gray" = "blue") => {
    switch (tone) {
      case "purple":
        return "border-purple-500/25 bg-purple-500/10 text-purple-300";
      case "indigo":
        return "border-indigo-500/25 bg-indigo-500/10 text-indigo-300";
      case "gray":
        return "border-gray-600/50 bg-gray-900/70 text-gray-400";
      default:
        return "border-blue-500/25 bg-blue-500/10 text-blue-300";
    }
  };

  const getTimelineActionClasses = (tone: "blue" | "purple" | "indigo" | "gray" = "blue", completed = false) => {
    if (completed) {
      switch (tone) {
        case "purple":
          return "bg-purple-600 border-purple-600 text-white";
        case "indigo":
          return "bg-indigo-600 border-indigo-600 text-white";
        case "gray":
          return "bg-gray-600 border-gray-600 text-white";
        default:
          return "bg-blue-600 border-blue-600 text-white";
      }
    }

    switch (tone) {
      case "purple":
        return "border-purple-500/50 bg-black text-purple-300 hover:border-purple-500";
      case "indigo":
        return "border-indigo-500/50 bg-black text-indigo-300 hover:border-indigo-500";
      case "gray":
        return "border-gray-600/50 bg-black text-gray-300 hover:border-gray-500";
      default:
        return "border-blue-500/50 bg-black text-blue-300 hover:border-blue-500";
    }
  };

  const renderTimelineCard = (
    item: any,
    tone: "blue" | "purple" | "indigo" | "gray",
    layout: "row" | "stacked" = "row",
    extraContent?: React.ReactNode,
  ) => {
    const surfaceClasses = getTimelineSurfaceClasses(tone);
    const shadowClasses = getTimelineShadowClasses(tone);
    const accentClasses = getTimelineAccentClasses(tone);
    const chipClasses = getTimelineChipClasses(tone);

    return (
      <div
        key={item.id}
        className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-3 sm:p-4 backdrop-blur-sm transition-all duration-300 ${surfaceClasses} ${shadowClasses} ${item.isCompleted ? 'opacity-60' : ''}`}
        onClick={() => (bulkMode ? toggleItemSelection(item.id) : startEdit(item))}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${item.isCompleted ? 'bg-gray-700' : accentClasses}`} />

        <div className={layout === "stacked" ? "flex flex-col items-start gap-2" : "flex items-center gap-3 min-w-0"}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMutation.mutate({ id: item.id, isCompleted: !item.isCompleted });
          }}
          className={`shrink-0 self-start rounded-xl border px-2 py-1 transition-all cursor-pointer flex items-center justify-center gap-1 ${getTimelineActionClasses(tone, item.isCompleted)} ${
            !item.isCompleted && (
              tone === 'gray' ? 'hover:bg-gray-800 hover:text-white' :
              tone === 'purple' ? 'hover:bg-purple-900 hover:text-white' :
              tone === 'indigo' ? 'hover:bg-indigo-900 hover:text-white' :
              'hover:bg-blue-900 hover:text-white'
            )
          }`}
        >
          <CheckCircle size={12} className={item.isCompleted ? 'text-white' : tone === 'gray' ? 'text-gray-400 group-hover:text-gray-200' : tone === 'purple' ? 'text-purple-400 group-hover:text-purple-200' : tone === 'indigo' ? 'text-indigo-400 group-hover:text-indigo-200' : 'text-blue-400 group-hover:text-blue-200'} />
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider">{item.isCompleted ? 'Completed' : 'Mark Done'}</span>
        </button>


          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className={`text-sm sm:text-base font-bold leading-snug break-words ${item.isCompleted ? 'line-through text-gray-500' : 'text-gray-100'}`}>
                {item.title}
              </h3>
              {item.repeatInterval !== 'none' && (
                <span className={`rounded-lg border px-2 py-1 text-[7px] sm:text-[8px] font-black uppercase tracking-[0.18em] shrink-0 ${chipClasses}`}>
                  {item.repeatInterval}
                </span>
              )}
            </div>
            {item.type !== 'note' && item.targetDate && (
              <div className={`mt-1 flex items-center gap-1.5 text-[7px] sm:text-[8px] font-black uppercase tracking-widest ${tone === 'gray' ? 'text-gray-500' : 'text-gray-600'}`}>
                <Clock size={11} /> {new Date(item.targetDate).toLocaleDateString()} at {new Date(item.targetDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>

        <div className={`mt-3 flex items-center gap-2 ${layout === 'stacked' ? 'justify-between' : 'ml-auto'} flex-wrap sm:flex-nowrap`}>
          <div className="flex items-center gap-2 flex-wrap">
            {bulkMode && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleItemSelection(item.id); }}
                className={`h-5 w-5 rounded border flex items-center justify-center transition-colors ${selectedIds.includes(item.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-transparent'}`}
              >
                ✓
              </button>
            )}
            <span className={`rounded-lg border px-2 py-1 text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] ${getCategoryBadgeClasses(item.category)}`}>
              {item.category ?? 'Other'}
            </span>
            <span className={`rounded-lg border px-2 py-1 text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] ${item.type === 'task' ? 'border-blue-500/20 bg-blue-500/10 text-blue-300' : item.type === 'reminder' ? 'border-purple-500/20 bg-purple-500/10 text-purple-300' : 'border-orange-500/20 bg-orange-500/10 text-orange-300'}`}>
              {item.type}
            </span>
            {item.sticky && item.type !== 'note' && (
              <span className="rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-2 py-1 text-[7px] sm:text-[8px] font-black uppercase tracking-[0.2em] text-indigo-300">
                Priority
              </span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: item.id }); }}
              className="cursor-pointer p-1.5 text-gray-600 transition-all hover:cursor-pointer hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
            >
              <Trash2 size={14} className="cursor-pointer" />
            </button>
          </div>
        </div>

        {extraContent}
      </div>
    );
  };

  // 1. Hydration Fix: Ensure component is mounted before rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("agenda-timeline-view", timelineView);
  }, [timelineView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("agenda-notes-view", notesView);
  }, [notesView]);

  const utils = api.useUtils();
  const { data: items, isLoading } = api.agenda.getAll.useQuery();

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
  const activeSequenceCount = activeStickyItems.length + activeTasksReminders.length;
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

  const editTargetId = searchParams.get("edit");

  useEffect(() => {
    if (!bulkMode) {
      setSelectedIds([]);
    }
  }, [bulkMode]);

  useEffect(() => {
    const validIds = new Set((items ?? []).map((item) => item.id));
    setSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [items]);

  useEffect(() => {
    if (!editTargetId || !items?.length) return;
    if (handledEditTargetId === editTargetId) return;

    const targetItem = items.find((item) => item.id === editTargetId);
    if (!targetItem) {
      setHandledEditTargetId(editTargetId);
      return;
    }

    startEdit(targetItem);
    setHandledEditTargetId(editTargetId);
  }, [editTargetId, handledEditTargetId, items]);

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
    setEditingCreatedAt(null);
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
    setEditingCreatedAt(item.createdAt ? new Date(item.createdAt) : null);
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
  const visibleExpiredIds = expiredItems.map((item) => item.id);
  const allVisibleSelected =
    visibleSelectableItems.length > 0 &&
    visibleSelectableItems.every((item) => selectedIds.includes(item.id));
  const allExpiredVisibleSelected =
    visibleExpiredIds.length > 0 &&
    visibleExpiredIds.every((id) => selectedIds.includes(id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(visibleSelectableItems.map((item) => item.id));
  };

  const toggleSelectExpiredVisible = () => {
    if (visibleExpiredIds.length === 0) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (allExpiredVisibleSelected) {
        visibleExpiredIds.forEach((id) => next.delete(id));
      } else {
        visibleExpiredIds.forEach((id) => next.add(id));
      }

      return Array.from(next);
    });
  };

  const isBulkBusy =
    bulkDeleteMutation.isPending ||
    bulkSetCompleteMutation.isPending ||
    bulkSetStickyMutation.isPending ||
    bulkSetCategoryMutation.isPending;

  if (!mounted) return null;

  return (
    <main className="theme-invert-on-light min-h-0 bg-black text-white p-3 sm:p-6 md:p-12 lg:p-20">
      <div className="w-full max-w-6xl mx-auto">
        {/* ADD ACTION BAR */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-4 sm:mb-8">
          <div>
            <p className="text-[9px] sm:text-[10px] text-blue-500 uppercase tracking-[0.4em] font-black mb-1">Timeline</p>
            {/* <h2 className="text-base sm:text-xl font-black text-gray-100">{editingId ? "Edit" : "Timeline"}</h2> */}
            <p className="mt-1 text-sm font-black text-gray-400">
              {isLoading ? "Syncing..." : `${activeSequenceCount} active · ${expiredItems.length} archived`}
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

            {editingId && type === 'reminder' && editingCreatedAt && (
              <div className="mb-4 sm:mb-6 rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 sm:p-4">
                <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-purple-300">
                  Created at {editingCreatedAt.toLocaleDateString()} {editingCreatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}

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
                className={`w-full bg-black/60 border border-gray-800 p-4 sm:p-5 rounded-2xl outline-none focus:border-blue-600 transition-all placeholder:text-gray-700 resize-y ${type === 'note' ? 'min-h-[200px] sm:min-h-[240px]' : 'min-h-[100px] sm:min-h-[120px]'}`}
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
                    <option value="monthly">Monthly Cycle</option>
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

        {/* CONTROL BAR */}
        <div className="mb-4 sm:mb-8 rounded-[2rem] border border-gray-800/80 bg-gray-950/60 p-3 sm:p-4 backdrop-blur-xl">
          <div className="flex flex-col gap-2 sm:gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setSearchOpen((prev) => !prev)}
                className={`px-3 py-2 rounded-xl text-[9px] sm:text-xs font-black cursor-pointer uppercase tracking-widest transition-all ${searchOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}
            >
              {searchOpen ? 'Hide Search' : 'Search'}
            </button>
            <button
              onClick={() => setBulkMode((prev) => !prev)}
              className={`px-3 py-2 rounded-xl text-[9px] sm:text-xs font-black cursor-pointer uppercase tracking-widest transition-all ${bulkMode ? 'bg-red-600 text-white shadow-lg shadow-red-900/20' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}
            >
              {bulkMode ? 'Exit Bulk' : 'Bulk Select'}
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'targetDate' | 'createdAt')}
              className="cursor-pointer rounded-xl border border-gray-800 bg-black/40 px-2 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-gray-200 outline-none"
            >
              <option value="targetDate">Due Date</option>
              <option value="createdAt">Date Added</option>
            </select>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 md:ml-auto shrink-0 whitespace-nowrap">
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-gray-600">View</span>
              <button
                onClick={() => setTimelineView("list")}
                className={`rounded-lg px-3 py-1.5 text-[10px] sm:text-xs font-black cursor-pointer uppercase tracking-[0.2em] transition-all ${timelineView === "list" ? "bg-blue-600 text-white" : "bg-gray-900 text-gray-400 hover:bg-gray-800"}`}
              >
                List
              </button>
              <button
                onClick={() => setTimelineView("grid")}
                className={`rounded-lg px-3 py-1.5 text-[10px] sm:text-xs font-black cursor-pointer uppercase tracking-[0.2em] transition-all ${timelineView === "grid" ? "bg-blue-600 text-white" : "bg-gray-900 text-gray-400 hover:bg-gray-800"}`}
              >
                Grid
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="mt-3 rounded-2xl border border-gray-800 bg-gray-950/70 p-3 sm:p-4">
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
                    className="rounded-lg border border-gray-700 bg-black/60 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:border-gray-500"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  value={searchTitle}
                  onChange={(e) => setSearchTitle(e.target.value)}
                  placeholder="Title"
                  className="rounded-xl border border-gray-800 bg-black/60 p-2.5 text-xs font-bold text-gray-200 placeholder:text-gray-600 outline-none"
                />
                <input
                  value={searchContent}
                  onChange={(e) => setSearchContent(e.target.value)}
                  placeholder="Content"
                  className="rounded-xl border border-gray-800 bg-black/60 p-2.5 text-xs font-bold text-gray-200 placeholder:text-gray-600 outline-none"
                />
                <select
                  value={searchCategory}
                  onChange={(e) => setSearchCategory(e.target.value)}
                  className="rounded-xl border border-gray-800 bg-black/60 p-2.5 text-xs font-black uppercase tracking-widest text-gray-200 outline-none"
                >
                  <option value="all">All Categories</option>
                  {categoryOptions.map((option) => (
                    <option key={option} value={option.toLowerCase()}>{option}</option>
                  ))}
                </select>
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                  className="rounded-xl border border-gray-800 bg-black/60 p-2.5 text-xs font-black uppercase tracking-widest text-gray-200 outline-none"
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
            <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-3 sm:p-4 flex flex-col gap-3">
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
                <button
                  onClick={toggleSelectExpiredVisible}
                  disabled={visibleExpiredIds.length === 0}
                  className="px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest bg-red-950/40 border border-red-800/50 text-red-200 hover:border-red-600 disabled:opacity-40"
                >
                  {allExpiredVisibleSelected ? 'Clear Expired' : 'Select Expired'}
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
            <div className="mb-4 sm:mb-6 flex items-end justify-between gap-4">
              <p className="text-[9px] sm:text-[10px] text-indigo-400 uppercase tracking-[0.35em] font-black mb-1">Priority</p>
              <button
                type="button"
                aria-expanded={pinnedExpanded}
                onClick={() => setPinnedExpanded((v) => !v)}
                className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-indigo-300 transition-all hover:border-indigo-400/40 cursor-pointer"
              >
                {activeStickyItems.length} items {pinnedExpanded ? "−" : "+"}
              </button>
            </div>
            {pinnedExpanded && groupedSticky.map(([label, group]) => (
              <div key={label} className="mb-6">
                <h3 className="mb-3 text-sm font-black text-gray-400">{label}</h3>
                <div className={`grid gap-2 sm:gap-3 ${timelineView === "list" ? "grid-cols-1" : "grid-cols-2 xl:grid-cols-3"}`}>
                  {group.map((item) => renderTimelineCard(item, 'indigo', timelineView === "grid" ? 'stacked' : 'row'))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TIMELINE LIST (Normal Priority) */}
        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-500 w-8 h-8" /></div>
        ) : activeSequenceCount === 0 ? (
          <div className="text-center p-20 bg-gray-900/20 border border-dashed border-gray-800 rounded-[2.5rem]">
            <p className="text-gray-600 text-xs uppercase tracking-[0.4em] font-black">{filteredResultCount === 0 ? 'No Search Matches Found' : 'No Active Sequences Found'}</p>
            {expiredItems.length > 0 && (
              <p className="text-[10px] text-gray-700 mt-3 uppercase tracking-[0.2em]">See expired section below</p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <p className="text-[9px] sm:text-[10px] text-blue-400 uppercase tracking-[0.35em] font-black">Non-Priority</p>
              <button
                type="button"
                aria-expanded={upcomingExpanded}
                onClick={() => setUpcomingExpanded((v) => !v)}
                className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-blue-300 transition-all hover:border-blue-400/40 cursor-pointer"
              >
                {activeTasksReminders.length} items {upcomingExpanded ? "−" : "+"}
              </button>
            </div>

            {/* Render grouped tasks by due date */}
            {upcomingExpanded && groupedTasks.map(([label, group]) => (
              <div key={label} className="mb-8">
                <h3 className="mb-3 text-sm font-black text-gray-400">{label}</h3>
                <div className={`grid gap-2 sm:gap-3 ${timelineView === "list" ? "grid-cols-1" : "grid-cols-2 xl:grid-cols-3"}`}>
                  {group.map((item) => renderTimelineCard(item, item.type === 'reminder' ? 'purple' : 'blue', timelineView === "grid" ? 'stacked' : 'row'))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* EXPIRED SECTION */}
        {expiredItems.length > 0 && (
          <div className="mt-12 sm:mt-16">
            <div className="mb-4 sm:mb-6 flex items-end justify-between gap-4">
              <p className="text-[9px] sm:text-[10px] text-red-400 uppercase tracking-[0.35em] font-black mb-1">Past due</p>
              <button
                type="button"
                aria-expanded={pastDueExpanded}
                onClick={() => setPastDueExpanded((v) => !v)}
                className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-red-300 transition-all hover:border-red-400/40 cursor-pointer"
              >
                {expiredItems.length} items {pastDueExpanded ? "−" : "+"}
              </button>
            </div>

            {pastDueExpanded && (
              <div className={`grid gap-2 sm:gap-3 ${timelineView === "list" ? "grid-cols-1" : "grid-cols-2 xl:grid-cols-3"}`}>
                {expiredItems.map((item) => renderTimelineCard(item, 'gray', timelineView === "grid" ? 'stacked' : 'row'))}
              </div>
            )}
          </div>
        )}

        {/* NOTES SECTION */}
        {filteredNotes.length > 0 && (
          <div className="mt-16">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl font-bold text-gray-400">Notes Archive</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNotesView("list")}
                  className={`rounded-lg px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all ${notesView === "list" ? "bg-orange-600 text-white" : "bg-gray-900 text-gray-400 hover:bg-gray-800"}`}
                >
                  List
                </button>
                <button
                  onClick={() => setNotesView("grid")}
                  className={`rounded-lg px-3 py-1.5 text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all ${notesView === "grid" ? "bg-orange-600 text-white" : "bg-gray-900 text-gray-400 hover:bg-gray-800"}`}
                >
                  Grid
                </button>
              </div>
            </div>
            <div className={`grid gap-4 sm:gap-6 ${notesView === "list" ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"}`}>
              {filteredNotes.map(note => (
                <div 
                  key={note.id}
                  className="group relative rounded-2xl border border-orange-500/15 bg-gray-900/35 p-4 shadow-[0_14px_32px_-20px_rgba(249,115,22,0.45)] backdrop-blur-xl transition-all duration-300 hover:border-orange-500/35 hover:bg-gray-900/55 hover:shadow-[0_18px_40px_-20px_rgba(249,115,22,0.58)] sm:p-6"
                >
                  {note.pinned && (
                    <div className="absolute top-3 sm:top-4 right-3 sm:right-4">
                      <Pin size={16} className="text-orange-500" />
                    </div>
                  )}
                  <div onClick={() => bulkMode ? toggleItemSelection(note.id) : startEdit(note)} className="cursor-pointer pb-2">
                    <h3 className="text-base sm:text-lg font-bold text-gray-100 mb-2 line-clamp-2">{note.title}</h3>
                    {note.content && (
                      <p className="text-sm text-gray-500 mb-3 sm:mb-4 line-clamp-3">{note.content}</p>
                    )}
                    <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-700">
                      <p>
                        Created {new Date(note.createdAt).toLocaleDateString()} at {new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-1 rounded-lg border ${getCategoryBadgeClasses(note.category)}`}>
                            {note.category ?? 'Other'}
                          </span>
                        {bulkMode && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleItemSelection(note.id); }}
                            className={`w-5 h-5 rounded border flex items-center justify-center ${selectedIds.includes(note.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-600 text-transparent'}`}
                          >
                            ✓
                          </button>
                        )}
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: note.id }); }}
                          className="cursor-pointer p-2 text-gray-700 transition-all hover:cursor-pointer hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
                        >
                          <Trash2 size={20} className="cursor-pointer" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
