import { forwardRef, useRef, useEffect, useImperativeHandle, useState } from "react";
import { format, parseISO, isSameDay, differenceInMinutes } from "date-fns";
import type { CalendarEvent } from "../../types/calendar";
import type { FamilyMember } from "../../types/calendar";
import { getEventColorStyle, normalizeCalendarIds } from "./EventColorPattern";
import { getInitialScrollTopForFourHourWindow, isAllDayEvent } from "./calendarScrollUtils";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DEFAULT_FOUR_HOUR_VIEWPORT_PX = 240;
const MIN_EVENT_HEIGHT = 40;
const DAY_BLOCKS = 3;

function normalizeScrollToMiddleBlock(offset: number, dayHeight: number): number {
  let scroll = dayHeight + offset;
  while (scroll < dayHeight) {
    scroll += dayHeight;
  }
  while (scroll >= 2 * dayHeight) {
    scroll -= dayHeight;
  }
  return scroll;
}

function getEventPosition(event: CalendarEvent, pixelsPerHour: number) {
  const start = parseISO(event.start_time);
  const end = event.end_time
    ? parseISO(event.end_time)
    : new Date(start.getTime() + 60 * 60 * 1000);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const durationMinutes = Math.max(differenceInMinutes(end, start), 30);
  const top = (startMinutes / 60) * pixelsPerHour;
  const height = Math.max((durationMinutes / 60) * pixelsPerHour, MIN_EVENT_HEIGHT);
  return { top, height, start, end };
}

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  familyMembers: FamilyMember[];
  onEventClick?: (event: CalendarEvent) => void;
}

export interface DayViewRef {
  scrollToNow: () => void;
}

const DayView = forwardRef<DayViewRef, DayViewProps>(function DayView(
  { currentDate, events, familyMembers, onEventClick },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fullDayHeightRef = useRef<number>(0);
  const lastInitializedDateRef = useRef<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [timeStripHeight, setTimeStripHeight] = useState(DEFAULT_FOUR_HOUR_VIEWPORT_PX);

  const isToday = isSameDay(currentDate, now);
  const dateKey = format(currentDate, "yyyy-MM-dd");

  const pixelsPerHour =
    timeStripHeight > 0 ? Math.max(timeStripHeight / 4, 1) : DEFAULT_FOUR_HOUR_VIEWPORT_PX / 4;
  const fullDayHeight = HOURS.length * pixelsPerHour;
  fullDayHeightRef.current = fullDayHeight;
  const totalContentHeight = DAY_BLOCKS * fullDayHeight;
  const currentTimeTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * pixelsPerHour;

  const dayEventsAll = events.filter((e) =>
    isSameDay(parseISO(e.start_time), currentDate)
  );
  const allDayEvents = dayEventsAll.filter((e) => isAllDayEvent(e));
  const timedEvents = dayEventsAll
    .filter((e) => !isAllDayEvent(e))
    .sort(
      (a, b) =>
        parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
    );

  // Timer to update current time every minute
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timerId = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timerId);
  }, []);

  // Auto-update scroll position every minute to keep current time centered (only if viewing today)
  useEffect(() => {
    if (!isToday) return;
    const el = scrollRef.current;
    const dayHeight = fullDayHeightRef.current;
    if (!el || dayHeight <= 0) return;

    const pph = dayHeight / 24;
    const offset = getInitialScrollTopForFourHourWindow(now, pph);
    el.scrollTop = normalizeScrollToMiddleBlock(offset, dayHeight);
  }, [now, isToday]);

  // ResizeObserver to measure container height for dynamic pixelsPerHour
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

  // Initial scroll position when date changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || timeStripHeight <= 0) return;
    if (lastInitializedDateRef.current === dateKey) return;

    const referenceDate = isToday
      ? new Date()
      : (() => {
          const d = new Date();
          d.setHours(10, 0, 0, 0);
          return d;
        })();
    const offset = getInitialScrollTopForFourHourWindow(referenceDate, pixelsPerHour);
    el.scrollTop = normalizeScrollToMiddleBlock(offset, fullDayHeight);
    lastInitializedDateRef.current = dateKey;
  }, [fullDayHeight, pixelsPerHour, timeStripHeight, isToday, dateKey]);

  // Infinite scroll wrap handler
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

  // Expose scrollToNow for parent to call
  useImperativeHandle(
    ref,
    () => ({
      scrollToNow: () => {
        const el = scrollRef.current;
        const dayHeight = fullDayHeightRef.current;
        if (!el || dayHeight <= 0) return;
        const nowDate = new Date();
        const pph = dayHeight / 24;
        const offset = getInitialScrollTopForFourHourWindow(nowDate, pph);
        el.scrollTop = normalizeScrollToMiddleBlock(offset, dayHeight);
      },
    }),
    []
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* All-day events header - fixed */}
      <div
        className="flex-shrink-0 border-b border-gray-100 px-3 py-2 flex flex-col gap-1.5 bg-skydark-bg"
        style={{ scrollbarGutter: "stable" }}
      >
        {allDayEvents.length === 0 && (
          <div className="text-xs text-skydark-text-secondary">All day</div>
        )}
        {allDayEvents.slice(0, 2).map((event) => {
          const { style: colorStyle, borderColor } = getEventColorStyle(
            normalizeCalendarIds(event.calendar_id),
            familyMembers
          );
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onEventClick?.(event)}
              className="text-left text-[10px] px-1.5 py-0.5 rounded font-medium w-full truncate"
              style={{
                ...colorStyle,
                borderLeft: `3px solid ${borderColor}`,
              }}
            >
              {event.title}
            </button>
          );
        })}
        {allDayEvents.length > 2 && (
          <div className="text-[10px] text-skydark-text-secondary">
            +{allDayEvents.length - 2} more
          </div>
        )}
      </div>

      {/* Scrollable time grid */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto hide-scrollbar"
        style={{ scrollbarGutter: "stable" }}
        onScroll={handleScroll}
      >
        <div className="flex flex-col" style={{ height: totalContentHeight }}>
          {Array.from({ length: DAY_BLOCKS }, (_, blockIndex) => (
            <div key={blockIndex} className="flex" style={{ height: fullDayHeight }}>
              {/* Time labels column */}
              <div className="flex flex-col flex-shrink-0 w-14 border-r border-gray-200 pr-2">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="text-xs text-skydark-text-secondary"
                    style={{ height: pixelsPerHour }}
                  >
                    {h === 0
                      ? "12 AM"
                      : h < 12
                      ? `${h} AM`
                      : h === 12
                      ? "12 PM"
                      : `${h - 12} PM`}
                  </div>
                ))}
              </div>

              {/* Event grid */}
              <div
                className="flex-1 relative border-l border-gray-100 bg-skydark-bg"
                style={{ minHeight: fullDayHeight }}
              >
                {/* Current time red line (only on today) */}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: currentTimeTop }}
                  >
                    <div className="h-0.5 bg-red-500 w-full" />
                  </div>
                )}

                {/* Hour lines */}
                {HOURS.slice(1).map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-gray-100"
                    style={{ top: h * pixelsPerHour }}
                  />
                ))}

                {/* Events */}
                {timedEvents.map((event) => {
                  const { top, height, start, end } = getEventPosition(
                    event,
                    pixelsPerHour
                  );
                  const { style: colorStyle, borderColor } = getEventColorStyle(
                    normalizeCalendarIds(event.calendar_id),
                    familyMembers
                  );
                  return (
                    <button
                      key={`${blockIndex}-${event.id}`}
                      type="button"
                      className="absolute left-1 right-1 rounded overflow-hidden text-left shadow-skydark hover:shadow-skydark-hover transition-shadow z-10 min-h-0 min-w-0 justify-start items-start flex flex-col"
                      style={{
                        top,
                        height,
                        padding: "2px 4px",
                        ...colorStyle,
                        borderLeft: `3px solid ${borderColor}`,
                      }}
                      onClick={() => onEventClick?.(event)}
                    >
                      <span className="block font-medium truncate text-[11px] leading-tight w-full">
                        {event.title}
                      </span>
                      <span className="text-[9px] leading-tight text-skydark-text-secondary block">
                        {format(start, "h:mm a")} - {format(end, "h:mm a")}
                      </span>
                      {event.location && height > 50 && (
                        <span className="text-[9px] text-skydark-text-secondary block truncate mt-0.5 w-full">
                          {event.location}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default DayView;
