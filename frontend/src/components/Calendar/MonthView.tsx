import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isToday,
  parseISO,
} from "date-fns";
import type { CalendarEvent } from "../../types/calendar";
import type { FamilyMember } from "../../types/calendar";
import { getEventColorStyle, normalizeCalendarIds } from "./EventColorPattern";

const MAX_VISIBLE_EVENTS = 3;

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  familyMembers: FamilyMember[];
  onDateClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

export default function MonthView({
  currentDate,
  events,
  familyMembers,
  onDateClick,
  onEventClick,
}: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days: Date[] = [];
  let day = calendarStart;
  while (day <= calendarEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const getEventsForDay = (d: Date) => {
    const dStr = format(d, "yyyy-MM-dd");
    return events.filter((e) => {
      const start = parseISO(e.start_time);
      const startStr = format(start, "yyyy-MM-dd");
      if (e.end_time) {
        const end = parseISO(e.end_time);
        const endStr = format(end, "yyyy-MM-dd");
        return dStr >= startStr && dStr <= endStr;
      }
      return startStr === dStr;
    });
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
      {weekDays.map((wd) => (
        <div
          key={wd}
          className="bg-skydark-bg p-2 text-center text-sm font-semibold text-skydark-text"
        >
          {wd}
        </div>
      ))}
      {days.map((d) => {
        const dayEvents = getEventsForDay(d);
        const visibleEvents = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
        const moreCount = dayEvents.length - MAX_VISIBLE_EVENTS;
        const isCurrentMonth = isSameMonth(d, currentDate);

        return (
          <div
            key={d.toISOString()}
            className="bg-skydark-bg min-h-[100px] p-1 flex flex-col"
          >
            <button
              type="button"
              onClick={() => onDateClick?.(d)}
              className={`text-left text-sm w-6 h-6 rounded-full flex items-center justify-center mb-1 ${
                !isCurrentMonth ? "text-gray-400" : "text-skydark-text"
              } ${isToday(d) ? "bg-red-100 text-red-700 font-semibold" : ""}`}
            >
              {format(d, "d")}
            </button>
            <div className="flex-1 space-y-1 overflow-hidden">
              {visibleEvents.map((ev) => {
                const profileIds = normalizeCalendarIds(ev.calendar_id);
                const { style: colorStyle, borderColor } = getEventColorStyle(profileIds, familyMembers);
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick?.(ev);
                    }}
                    className="w-full text-left rounded-sm overflow-hidden min-h-[24px] flex items-center px-2 py-1 text-xs font-medium truncate transition-shadow hover:shadow-sm"
                    style={{
                      ...colorStyle,
                      borderLeft: `4px solid ${borderColor}`,
                    }}
                    title={ev.title}
                  >
                    <span className="block truncate text-skydark-text">{ev.title}</span>
                  </button>
                );
              })}
              {moreCount > 0 && (
                <button
                  type="button"
                  className="text-xs text-skydark-text-secondary hover:underline w-full text-left"
                  onClick={() => onDateClick?.(d)}
                >
                  +{moreCount} more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
