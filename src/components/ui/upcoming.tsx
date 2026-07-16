"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "~/server/better-auth/client";

type AgendaApiItem = {
  id: string;
  title: string;
  content?: string;
  targetDate: string;
  type: string;
  sticky: boolean;
  category: string;
};

type UpcomingApiResponse = {
  serverTime: string;
  dueTodayCount: number;
  pendingTodayItems: AgendaApiItem[];
  expiredItems: AgendaApiItem[];
  agenda: AgendaApiItem[];
};

type NotificationStage =
  | "threeHours"
  | "oneHour"
  | "expired"
  | "todaySummary"
  | "todayPending";

type NotificationItem = {
  id: string;
  source: "agenda" | "system";
  stage: NotificationStage;
  title: string;
  body: string;
  dueAt: string;
  agendaId?: string;
  href?: string;
};

const POLL_INTERVAL_MS = 30_000;
const AUTO_HIDE_MS = 5_000;
const STAGE_CACHE_KEY = "spag:notification-stage-cache";

function readStageCache(): Set<string> {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.sessionStorage.getItem(STAGE_CACHE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set<string>();
  }
}

function writeStageCache(cache: Set<string>) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(STAGE_CACHE_KEY, JSON.stringify(Array.from(cache)));
  } catch {
    // Ignore storage failures.
  }
}

function nextStage(nowMs: number, dueMs: number): NotificationStage | null {
  const delta = dueMs - nowMs;
  if (delta <= 0) return "expired";
  if (delta <= 60 * 60 * 1000) return "oneHour";
  if (delta <= 3 * 60 * 60 * 1000) return "threeHours";
  return null;
}

function mergeNotifications(
  current: NotificationItem[],
  incoming: NotificationItem[],
): NotificationItem[] {
  const map = new Map<string, NotificationItem>();
  [...current, ...incoming].forEach((item) => map.set(item.id, item));

  return Array.from(map.values()).sort((a, b) => {
    if (a.stage === "todaySummary" && b.stage !== "todaySummary") return -1;
    if (a.stage !== "todaySummary" && b.stage === "todaySummary") return 1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });
}

export default function UpcomingNotifier() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [isPinnedOpen, setIsPinnedOpen] = useState(false);

  const stageCacheRef = useRef<Set<string>>(new Set<string>());
  const initialDashboardDigestShownRef = useRef(false);
  const pollingRef = useRef<number | null>(null);
  const autoHideRef = useRef<number | null>(null);
  const notificationCountRef = useRef(0);
  const soundRef = useRef<HTMLAudioElement | null>(null);
  const soundUnlockedRef = useRef(false);
  const pendingSoundRef = useRef(false);
  const pinnedOpenRef = useRef(false);

  const isDashboard = pathname === "/";

  const pendingBubbleCount = useMemo(() => notifications.length, [notifications.length]);
  const canShowBubble = showBubble && !isExpanded && pendingBubbleCount > 0;

  const setPinnedOpenState = (next: boolean) => {
    pinnedOpenRef.current = next;
    setIsPinnedOpen(next);
  };

  const cancelAutoHide = () => {
    if (autoHideRef.current) {
      window.clearTimeout(autoHideRef.current);
      autoHideRef.current = null;
    }
  };

  const scheduleAutoHide = () => {
    cancelAutoHide();

    autoHideRef.current = window.setTimeout(() => {
      if (pinnedOpenRef.current) return;

      setIsExpanded(false);

      if (notificationCountRef.current > 0) {
        setShowBubble(true);
      }
    }, AUTO_HIDE_MS);
  };

  const notifyBrowser = (title: string, body: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "default") {
      void Notification.requestPermission();
      return;
    }

    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  };

  const ensureSound = () => {
    if (typeof window === "undefined") return null;

    if (!soundRef.current) {
      const audio = new Audio("/sounds/notify.mp3");
      audio.preload = "auto";
      audio.volume = 0.18;
      soundRef.current = audio;
    }

    return soundRef.current;
  };

  const playNotificationSound = async () => {
    const audio = ensureSound();
    if (!audio) return;

    try {
      audio.currentTime = 0;
      await audio.play();
      soundUnlockedRef.current = true;
      setSoundBlocked(false);
    } catch {
      pendingSoundRef.current = true;
      setSoundBlocked(true);
    }
  };

  const unlockSound = async () => {
    const audio = ensureSound();
    if (!audio || soundUnlockedRef.current) return;

    try {
      audio.currentTime = 0;
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      soundUnlockedRef.current = true;
      setSoundBlocked(false);

      if (pendingSoundRef.current) {
        pendingSoundRef.current = false;
        void playNotificationSound();
      }
    } catch {
      // If the browser still blocks audio, we'll try again after the next user gesture.
    }
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  };

  const markAgendaItemsAsNotified = async (ids: string[]) => {
    if (ids.length === 0) return;

    try {
      await fetch("/api/upcoming/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch (error) {
      console.error(error);
    }
  };

  const dismissWithOptionalMark = (item: NotificationItem) => {
    dismissNotification(item.id);

    if (item.stage === "expired" && item.agendaId) {
      void markAgendaItemsAsNotified([item.agendaId]);
    }
  };

  const onNotificationClick = (item: NotificationItem) => {
    dismissWithOptionalMark(item);

    if (!item.href) return;

    router.push(item.href);
  };

  const clearAllForDashboard = () => {
    const expiredAgendaIds = notifications
      .filter((item) => item.stage === "expired" && item.agendaId)
      .map((item) => item.agendaId as string);

    void markAgendaItemsAsNotified(expiredAgendaIds);

    setNotifications([]);
    setShowBubble(false);
    setIsExpanded(false);
    setSoundBlocked(false);
    setPinnedOpenState(false);
    cancelAutoHide();
  };

  useEffect(() => {
    stageCacheRef.current = readStageCache();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onFirstGesture = () => {
      void unlockSound();
    };

    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("keydown", onFirstGesture, { once: true });
    window.addEventListener("touchstart", onFirstGesture, { once: true });

    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
    };
  }, []);

  useEffect(() => {
    notificationCountRef.current = notifications.length;

    if (notifications.length === 0) {
      setShowBubble(false);
      setIsExpanded(false);
      setPinnedOpenState(false);
    }
  }, [notifications.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
      new CustomEvent("spag-notifications:update", {
        detail: { count: pendingBubbleCount, expanded: isExpanded, pinned: isPinnedOpen },
      }),
    );
  }, [pendingBubbleCount, isExpanded, isPinnedOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onToggle = () => {
      if (notificationCountRef.current === 0) return;

      setIsExpanded((prev) => {
        const next = !prev;

        if (next) {
          setShowBubble(false);
          setPinnedOpenState(true);
          cancelAutoHide();
        } else if (notificationCountRef.current > 0) {
          setShowBubble(true);
          setPinnedOpenState(false);
          cancelAutoHide();
        }

        return next;
      });
    };

    window.addEventListener("spag-notifications:toggle", onToggle);
    return () => {
      window.removeEventListener("spag-notifications:toggle", onToggle);
    };
  }, []);

  useEffect(() => {
    if (isPending || !session?.user) return;

    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/upcoming");
        if (!res.ok) return;

        const data: UpcomingApiResponse = await res.json();
        if (!mounted) return;

        const nowMs = new Date(data.serverTime).getTime();

        const nextNotifications: NotificationItem[] = [];
        const shouldShowInitialDashboardDigest =
          isDashboard && !initialDashboardDigestShownRef.current;

        if (shouldShowInitialDashboardDigest) {
          initialDashboardDigestShownRef.current = true;

          const summaryDueAt = new Date(nowMs).toISOString();
          const summaryDayKey = new Date(nowMs).toISOString().slice(0, 10);

          if (data.dueTodayCount > 0) {
            nextNotifications.push({
              id: `summary-${summaryDayKey}`,
              source: "system",
              stage: "todaySummary",
              title: "Pending items today",
              body:
                data.dueTodayCount === 1
                  ? "You have 1 pending item due today."
                  : `You have ${data.dueTodayCount} pending items due today.`,
              dueAt: summaryDueAt,
            });
          }

          data.pendingTodayItems.forEach((item) => {
            nextNotifications.push({
              id: `today-${item.id}-${item.targetDate}`,
              source: "agenda",
              stage: "todayPending",
              title: item.title,
              body: item.content ?? "Due today",
              dueAt: item.targetDate,
              agendaId: item.id,
              href: `/agenda?edit=${encodeURIComponent(item.id)}&source=agenda`,
            });

            notifyBrowser(
              `Due today: ${item.title}`,
              item.content ?? "This item is due today.",
            );
          });

          data.expiredItems.forEach((item) => {
            nextNotifications.push({
              id: `expired-${item.id}-${item.targetDate}`,
              source: "agenda",
              stage: "expired",
              title: item.title,
              body: item.content ?? "This item is overdue",
              dueAt: item.targetDate,
              agendaId: item.id,
              href: `/agenda?edit=${encodeURIComponent(item.id)}&source=agenda`,
            });

            notifyBrowser(
              `Expired: ${item.title}`,
              item.content ?? "This item is overdue.",
            );
          });

          if (data.dueTodayCount > 0) {
            notifyBrowser(
              "Pending agenda today",
              data.dueTodayCount === 1
                ? "You have 1 pending item due today."
                : `You have ${data.dueTodayCount} pending items due today.`,
            );
          }
        }

        if (!shouldShowInitialDashboardDigest) {
          for (const item of data.agenda) {
            const dueMs = new Date(item.targetDate).getTime();
            const stage = nextStage(nowMs, dueMs);
            if (!stage) continue;

            const stageKey = `agenda:${item.id}:${item.targetDate}:${stage}`;
            if (stageCacheRef.current.has(stageKey)) continue;

            stageCacheRef.current.add(stageKey);
            const baseId = `${item.id}-${stage}-${dueMs}`;

            const suffix =
              stage === "expired"
                ? "is overdue"
                : stage === "oneHour"
                  ? "is due in 1 hour"
                  : "is due in 3 hours";

            nextNotifications.push({
              id: baseId,
              source: "agenda",
              stage,
              title: item.title,
              body: item.content ?? suffix,
              dueAt: item.targetDate,
              agendaId: item.id,
              href: `/agenda?edit=${encodeURIComponent(item.id)}&source=agenda`,
            });

            notifyBrowser(`Reminder: ${item.title}`, suffix);
          }
        }

        writeStageCache(stageCacheRef.current);

        if (nextNotifications.length > 0) {
          void playNotificationSound();
          setNotifications((prev) => mergeNotifications(prev, nextNotifications));
          setIsExpanded(true);
          setShowBubble(false);
          if (!pinnedOpenRef.current) {
            scheduleAutoHide();
          }
        }
      } catch (e) {
        // ignore polling errors
        console.error(e);
      }
    };

    poll();
    pollingRef.current = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, [isDashboard, isPending, session?.user]);

  useEffect(() => {
    return () => {
      if (autoHideRef.current) {
        window.clearTimeout(autoHideRef.current);
      }
    };
  }, []);

  if (isPending || !session?.user) return null;

  if (!isExpanded && !canShowBubble) return null;

  const stageStyles: Record<NotificationStage, string> = {
    threeHours: "border-sky-500/40 bg-sky-950/60",
    oneHour: "border-amber-500/40 bg-amber-950/60",
    expired: "border-red-500/40 bg-red-950/70",
    todaySummary: "border-emerald-500/40 bg-emerald-950/60",
    todayPending: "border-blue-500/40 bg-blue-950/60",
  };

  return (
    <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-50 flex flex-col items-end gap-2 md:bottom-4">
      {isExpanded && notifications.length > 0 && (
        <div className="w-[min(14.5rem,calc(100vw-1rem))] rounded-2xl border border-gray-700/70 bg-black/90 p-2.5 shadow-2xl backdrop-blur-xl md:w-[min(24rem,calc(100vw-2rem))] md:p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 md:text-[10px] md:tracking-[0.25em]">
              Active notifications
            </p>
            <button
              type="button"
              onClick={clearAllForDashboard}
              className="rounded-lg border border-gray-600 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-gray-300 hover:border-gray-400 md:text-[10px]"
            >
              Clear all
            </button>
          </div>

          {soundBlocked && (
            <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-950/50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-200">
                Sound blocked by browser
              </p>
              <p className="mt-1 text-xs text-amber-100/80">
                Click to enable notification sound.
              </p>
              <button
                type="button"
                onClick={() => void unlockSound()}
                className="mt-2 rounded-lg bg-amber-400 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-black"
              >
                Enable sound
              </button>
            </div>
          )}

          <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1 md:max-h-[60vh]">
            {notifications.map((item) => {
              const stageLabel =
                item.stage === "todaySummary"
                  ? "Today"
                  : item.stage === "todayPending"
                    ? "Pending"
                    : item.stage === "expired"
                      ? "Expired"
                      : item.stage === "oneHour"
                        ? "1h"
                        : "3h";

              return (
                <div
                  key={item.id}
                  className={`relative w-full rounded-xl border p-2.5 text-left text-white transition hover:brightness-110 md:p-3 ${stageStyles[item.stage]}`}
                >
                  <button
                    type="button"
                    onClick={() => dismissWithOptionalMark(item)}
                    className="absolute right-2 top-2 cursor-pointer rounded-md border border-white/20 px-1.5 py-0.5 text-[10px] font-black text-white/80 hover:bg-white/10"
                    aria-label="Dismiss notification"
                  >
                    X
                  </button>

                  <button
                    type="button"
                    onClick={() => onNotificationClick(item)}
                    className="block w-full cursor-pointer text-left"
                  >
                    <div className="flex items-start justify-between gap-2 pr-8">
                      <p className="text-xs font-bold leading-snug md:text-sm">{item.title}</p>
                      <span className="text-[8px] font-black uppercase tracking-[0.16em] text-gray-300 md:text-[9px] md:tracking-[0.18em]">
                        {stageLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-200/90 md:text-xs">{item.body}</p>
                    <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-300 md:text-[10px] md:tracking-[0.15em]">
                      {item.stage === "todaySummary"
                        ? "Dashboard summary"
                        : `Due ${new Date(item.dueAt).toLocaleDateString()} ${new Date(item.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canShowBubble && (
        <button
          type="button"
          onClick={() => {
            setIsExpanded(true);
            setShowBubble(false);
            scheduleAutoHide();
          }}
          className="hidden rounded-full border border-sky-500/50 bg-sky-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-sky-900/30 md:inline-flex"
        >
          {pendingBubbleCount} notifications
        </button>
      )}
    </div>
  );
}
