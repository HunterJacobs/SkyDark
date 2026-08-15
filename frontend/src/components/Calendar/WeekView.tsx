import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  format,
  startOfWeek,
  addDays,
  parseISO,
  differenceInMinutes,
  isSameDay,
} from "date-fns";
import type { CalendarEvent } from "../../types/calendar";
import type { FamilyMember } from "../../types/calendar";
import DraggableEventCard from "./DraggableEventCard";
import DropTargetCell from "./DropTargetCell";
import { getEventColorStyle, normalizeCalendarIds } from "./EventColorPattern";
import { getInitialScrollTopForFourHourWindow, isAllDayEvent } from "./calendarScrollUtils";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DEFAULT_FOUR_HOUR_VIEWPORT_PX = 240;
const MIN_EVENT_HEIGHT = 40;
const DAY_BLOCKS = 3;

// Helper to normalize scroll position to middle block range [fullDayHeight, 2*fullDayHeight)
function normalizeScrollToMiddleBlock(offset: number, dayHeight: number): number {
  let scroll = dayHeight + offset;
  // Handle negative offsets (early morning times wanting to show previous day's late hours)
  while (scroll < dayHeight) {
    scroll += dayHeight;
  }
  // Handle offsets that push past the middle block
  while (scroll >= 2 * dayHeight) {
    scroll -= dayHeight;
  }
  return scroll;
}

function getEventPosition(event: CalendarEvent, pixelsPerHour: number) {
  const start = parseISO(event.start_time);
  const end = event.end_time ? parseISO(event.end_time) : new Date(start.getTime() + 60 * 60 * 1000);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const durationMinutes = Math.max(
    differenceInMinutes(end, start),
    30
  );
  const top = (startMinutes / 60) * pixelsPerHour;
  const height = Math.max(
    (durationMinutes / 60) * pixelsPerHour,
    MIN_EVENT_HEIGHT
  );
  return { top, height };
}

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  familyMembers: FamilyMember[];
  onEventClick?: (event: CalendarEvent) => void;
  onEventMove?: (eventId: string, newStart: Date, newEnd: Date) => void;
}

export interface WeekViewRef {
  scrollToNow: () => void;
}

const WeekView = forwardRef<WeekViewRef, WeekViewProps>(function WeekView(
  { currentDate, events, familyMembers, onEventClick, onEventMove },
  ref
) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastInitializedWeekRef = useRef<string | null>(null);
  const fullDayHeightRef = useRef<number>(0);
  const [now, setNow] = useState(() => new Date());
  const [timeStripHeight, setTimeStripHeight] = useState(DEFAULT_FOUR_HOUR_VIEWPORT_PX);
  const weekContainsToday = days.some((d) => isSameDay(d, now));
  const weekKey = format(weekStart, "yyyy-MM-dd");
  // Use fallback until ResizeObserver reports real height so time labels and grid render correctly
  const pixelsPerHour =
    timeStripHeight > 0 ? Math.max(timeStripHeight / 4, 1) : DEFAULT_FOUR_HOUR_VIEWPORT_PX / 4;
  const fullDayHeight = HOURS.length * pixelsPerHour;
  fullDayHeightRef.current = fullDayHeight;
  const totalContentHeight = DAY_BLOCKS * fullDayHeight;
  const currentTimeTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * pixelsPerHour;

  useEffect(() => {
    const tick = () => setNow(new Date());
    const timerId = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  // Auto-update scroll position every minute to keep current time centered (only if today is in view)
  useEffect(() => {
    if (!weekContainsToday) return;
    const el = scrollRef.current;
    const dayHeight = fullDayHeightRef.current;
    if (!el || dayHeight <= 0) return;
    
    const pph = dayHeight / 24;
    const offset = getInitialScrollTopForFourHourWindow(now, pph);
    el.scrollTop = normalizeScrollToMiddleBlock(offset, dayHeight);
  }, [now, weekContainsToday]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setTimeStripHeight(el.clientHeight);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || timeStripHeight <= 0) return;
    if (lastInitializedWeekRef.current === weekKey) return;

    const referenceDate = weekContainsToday
      ? new Date()
      : (() => {
          const d = new Date();
          d.setHours(10, 0, 0, 0);
          return d;
        })();
    // Start in the middle block so we can scroll up or down seamlessly
    const offset = getInitialScrollTopForFourHourWindow(referenceDate, pixelsPerHour);
    el.scrollTop = normalizeScrollToMiddleBlock(offset, fullDayHeight);
    lastInitializedWeekRef.current = weekKey;
  }, [fullDayHeight, pixelsPerHour, timeStripHeight, weekContainsToday, weekKey]);

  // Wrap scroll when leaving middle block for seamless infinite scroll
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dayHeight = fullDayHeightRef.current;
    if (dayHeight <= 0) return;

    const scrollTop = el.scrollTop;
    if (scrollTop < dayHeight) {
      el.scrollTop = scrollTop + dayHeight;
    } else if (scrollTop >= 2 * dayHeight) {
      el.scrollTop = scrollTop - dayHeight;
    }
  };

  // Expose scrollToNow for parent to call (e.g., when "Today" button is clicked)
  useImperativeHandle(ref, () => ({
    scrollToNow: () => {
      const el = scrollRef.current;
      const dayHeight = fullDayHeightRef.current;
      if (!el || dayHeight <= 0) return;
      const nowDate = new Date();
      const pph = dayHeight / 24;
      const offset = getInitialScrollTopForFourHourWindow(nowDate, pph);
      el.scrollTop = normalizeScrollToMiddleBlock(offset, dayHeight);
    },
  }), []);

  const DAY_HEADER_HEIGHT = 40;
  const currentDayKey = useMemo(
    () => format(now, "yyyy-MM-dd"),
    [now]
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex flex-1 min-h-0 flex-col">
        {/* Row 1: day headers */}
        <div
          className="flex flex-shrink-0 bg-skydark-bg border-b border-gray-100"
          style={{ height: DAY_HEADER_HEIGHT, scrollbarGutter: "stable" }}
        >
          <div className="w-14 flex-shrink-0" aria-hidden />
          <div className="flex-1 grid grid-cols-7 gap-px bg-gray-200 min-w-0">
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className="bg-skydark-bg flex flex-col items-center justify-center"
              >
                <span className="text-sm font-semibold text-skydark-text">{format(d, "EEE")}</span>
                <span className="text-xs text-skydark-text-secondary">{format(d, "d")}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Row 2: all-day events (max 2 rows, then +N overflow) */}
        <div
          className="flex flex-shrink-0 bg-skydark-bg border-b border-gray-100"
          style={{ scrollbarGutter: "stable" }}
        >
          <div className="w-14 flex-shrink-0 border-r border-gray-200" aria-hidden />
          <div className="flex-1 grid grid-cols-7 gap-px bg-gray-200 min-w-0">
            {days.map((d) => {
              const dayEvents = events.filter((e) => {
                const start = parseISO(e.start_time);
                return isSameDay(start, d);
              });
              const allDayEvents = dayEvents.filter((e) => isAllDayEvent(e));
              const visibleEvents = allDayEvents.slice(0, 2);
              const overflowCount = allDayEvents.length - 2;
              return (
                <div
                  key={d.toISOString()}
                  className="bg-skydark-bg px-1 py-1 flex flex-col gap-0.5"
                >
                  {visibleEvents.map((event) => {
                    const { style: colorStyle, borderColor } = getEventColorStyle(
                      normalizeCalendarIds(event.calendar_id),
                      familyMembers
                    );
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onEventClick?.(event)}
                        className="text-left text-[10px] leading-tight px-1.5 py-0.5 rounded font-medium truncate w-full min-h-0 min-w-0 justify-start"
                        style={{
                          ...colorStyle,
                          borderLeft: `3px solid ${borderColor}`,
                        }}
                      >
                        {event.title}
                      </button>
                    );
                  })}
                  {overflowCount > 0 && (
                    <span className="text-[10px] text-skydark-text-secondary px-1.5">
                      +{overflowCount} more
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {/* Row 3: single scroll container — 4h viewport, 3x24h content for seamless wrap */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto hide-scrollbar"
          style={{ scrollbarGutter: "stable" }}
          onScroll={handleScroll}
        >
          <div
            className="flex flex-col"
            style={{ height: totalContentHeight }}
          >
            {Array.from({ length: DAY_BLOCKS }, (_, blockIndex) => (
              <div key={blockIndex} className="flex" style={{ height: fullDayHeight }}>
                <div className="flex flex-col flex-shrink-0 w-14 border-r border-gray-200 pr-2">
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="text-xs text-skydark-text-secondary"
                      style={{ height: pixelsPerHour }}
                    >
                      {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
                    </div>
                  ))}
                </div>
                <div className="flex-1 grid grid-cols-7 gap-px bg-gray-200 min-w-0">
                  {days.map((d) => {
                    const dayEvents = events.filter((e) => {
                      const start = parseISO(e.start_time);
                      return isSameDay(start, d);
                    });
                    const timedEvents = dayEvents.filter((e) => !isAllDayEvent(e));
                    return (
                      <div
                        key={d.toISOString()}
                        className="bg-skydark-bg relative"
                        style={{ minHeight: fullDayHeight }}
                      >
                        {format(d, "yyyy-MM-dd") === currentDayKey && (
                          <div
                            className="absolute left-0 right-0 z-20 pointer-events-none"
                            style={{ top: currentTimeTop }}
                          >
                            <div className="h-0.5 bg-red-500 w-full" />
                          </div>
                        )}
                        {HOURS.slice(1).map((h) => (
                          <div
                            key={h}
                            className="border-t border-gray-100"
                            style={{ height: pixelsPerHour - 1 }}
                          />
                        ))}
                        {HOURS.map((h) => (
                          <DropTargetCell key={`${blockIndex}-${h}`} date={d} hour={h} pixelsPerHour={pixelsPerHour}>
                            <span className="opacity-0">.</span>
                          </DropTargetCell>
                        ))}
                        {timedEvents.map((event) => {
                          const { top, height } = getEventPosition(event, pixelsPerHour);
                          return (
                            <DraggableEventCard
                              key={`${blockIndex}-${event.id}`}
                              event={event}
                              familyMembers={familyMembers}
                              top={top}
                              height={height}
                              onEventClick={onEventClick}
                              onEventMove={onEventMove}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DndProvider>
  );
});

export default WeekView;
