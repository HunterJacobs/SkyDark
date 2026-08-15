import { useRef } from "react";
import { useDrag } from "react-dnd";
import type { CalendarEvent } from "../../types/calendar";
import type { FamilyMember } from "../../types/calendar";
import { format, parseISO } from "date-fns";
import { getEventColorStyle, normalizeCalendarIds } from "./EventColorPattern";

export const EVENT_TYPE = "calendar-event";

interface DraggableEventCardProps {
  event: CalendarEvent;
  familyMembers: FamilyMember[];
  top: number;
  height: number;
  onEventClick?: (event: CalendarEvent) => void;
  onEventMove?: (eventId: string, newStart: Date, newEnd: Date) => void;
}

export default function DraggableEventCard({
  event,
  familyMembers,
  top,
  height,
  onEventClick,
  onEventMove,
}: DraggableEventCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const profileIds = normalizeCalendarIds(event.calendar_id);
  const { style: colorStyle, borderColor } = getEventColorStyle(profileIds, familyMembers);

  const [{ isDragging }, drag] = useDrag({
    type: EVENT_TYPE,
    item: () => ({
      id: event.id,
      event,
      start: parseISO(event.start_time),
      end: event.end_time ? parseISO(event.end_time) : new Date(parseISO(event.start_time).getTime() + 60 * 60 * 1000),
    }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const dropResult = monitor.getDropResult<{ date: Date; hour: number; minute: number }>();
      if (dropResult && item && onEventMove) {
        const newStart = new Date(dropResult.date);
        newStart.setHours(dropResult.hour, dropResult.minute, 0, 0);
        const duration = item.end.getTime() - item.start.getTime();
        const newEnd = new Date(newStart.getTime() + duration);
        onEventMove(item.event.id, newStart, newEnd);
      }
    },
  });

  drag(ref);

  return (
    <button
      ref={ref}
      type="button"
      className="absolute left-0.5 right-0.5 rounded overflow-hidden text-left shadow-sm hover:shadow transition-shadow z-10 cursor-grab active:cursor-grabbing min-h-0 min-w-0 justify-start items-start"
      style={{
        top,
        height,
        ...colorStyle,
        borderLeft: `3px solid ${borderColor}`,
        padding: "2px 4px",
        opacity: isDragging ? 0.5 : 1,
        lineHeight: 1.2,
      }}
      onClick={() => onEventClick?.(event)}
    >
      <span className="block truncate font-medium text-[11px] leading-tight">{event.title}</span>
      {!event.all_day && event.end_time && (
        <span className="text-[9px] text-skydark-text-secondary block truncate leading-tight">
          {format(parseISO(event.start_time), "h:mm a")} - {format(parseISO(event.end_time), "h:mm a")}
        </span>
      )}
    </button>
  );
}
