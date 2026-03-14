import { useState, useRef, useEffect } from "react";
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from "date-fns";
import MonthView from "../components/Calendar/MonthView";
import WeekView, { type WeekViewRef } from "../components/Calendar/WeekView";
import DayView, { type DayViewRef } from "../components/Calendar/DayView";
import EventModal from "../components/Calendar/EventModal";
import FilterDropdown from "../components/Calendar/FilterDropdown";
import { normalizeCalendarIds } from "../components/Calendar/EventColorPattern";
import { useAppContext } from "../contexts/AppContext";
import { useSkydarkDataContext } from "../contexts/SkydarkDataContext";
import PinPrompt from "../components/Common/PinPrompt";
import FloatingActionButton from "../components/Common/FloatingActionButton";
import { usePinGate } from "../hooks/usePinGate";
import { serviceAddEvent } from "../lib/skyDarkApi";
import type { CalendarEvent } from "../types/calendar";

const FALLBACK_EVENTS: CalendarEvent[] = [];

export default function CalendarView() {
  const skydark = useSkydarkDataContext();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week" | "day">("month");
  const [localOverrides, setLocalOverrides] = useState<{ events: CalendarEvent[]; deleted: Set<string> }>({
    events: [],
    deleted: new Set(),
  });
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [tasksProgress, setTasksProgress] = useState(true);
  const [eventsSelectAll, setEventsSelectAll] = useState(true);
  const [memberVisibility, setMemberVisibility] = useState<Record<string, boolean>>({});
  const { familyMembers } = useAppContext();
  const { runIfUnlocked, pinPromptProps } = usePinGate();
  const weekViewRef = useRef<WeekViewRef>(null);
  const dayViewRef = useRef<DayViewRef>(null);

  const serverEvents = skydark?.data?.connection ? (skydark.data.events ?? []) : FALLBACK_EVENTS;
  const events = serverEvents
    .filter((e) => !localOverrides.deleted.has(e.id))
    .map((e) => localOverrides.events.find((o) => o.id === e.id) ?? e);

  // When switching to week or day view, scroll to current time after the component mounts
  useEffect(() => {
    if (viewMode === "week" || viewMode === "day") {
      // Small delay to ensure the view has mounted and measured
      const timer = setTimeout(() => {
        if (viewMode === "week") {
          weekViewRef.current?.scrollToNow();
        } else {
          dayViewRef.current?.scrollToNow();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [viewMode]);

  const filteredEvents = events.filter((e) => {
    const ids = normalizeCalendarIds(e.calendar_id);
    if (ids.length === 0) return true;
    // Show event if at least one selected (visible) member is assigned to the event.
    return ids.some((id) => memberVisibility[id] !== false);
  });

  const handleSaveEvent = (data: Partial<CalendarEvent> & { id?: string }) => {
    const isAdd = !data.id;
    const feature = isAdd ? "addEvents" : "editDeleteEvents";
    runIfUnlocked(feature, () => doSaveEvent(data));
  };

  const doSaveEvent = async (data: Partial<CalendarEvent> & { id?: string }) => {
    const conn = skydark?.data?.connection;
    const isAdd = !data.id;
    const hasRequired = data.title && data.start_time;
    if (isAdd && hasRequired) {
      const title = data.title as string;
      const startTime = data.start_time as string;
      if (conn) {
        try {
          await serviceAddEvent(conn, {
            title,
            start_time: startTime,
            end_time: data.end_time,
            all_day: data.all_day ?? false,
            calendar_id: data.calendar_id?.[0],
            description: data.description,
            location: data.location,
          });
          await skydark?.refetchEvents();
        } catch {
          // fallback: optimistic local add when service fails
          const newEvent: CalendarEvent = {
            id: String(Date.now()),
            title,
            start_time: startTime,
            end_time: data.end_time,
            all_day: data.all_day,
            description: data.description,
            location: data.location,
            calendar_id: data.calendar_id,
          };
          setLocalOverrides((prev) => ({ ...prev, events: [...prev.events, newEvent] }));
        }
      } else {
        // No connection: keep event visible locally so add isn't silently dropped
        const newEvent: CalendarEvent = {
          id: String(Date.now()),
          title,
          start_time: startTime,
          end_time: data.end_time,
          all_day: data.all_day,
          description: data.description,
          location: data.location,
          calendar_id: data.calendar_id,
        };
        setLocalOverrides((prev) => ({ ...prev, events: [...prev.events, newEvent] }));
      }
    } else if (data.id) {
      setLocalOverrides((prev) => ({
        ...prev,
        events: prev.events.some((e) => e.id === data.id)
          ? prev.events.map((e) => (e.id === data.id ? { ...e, ...data } : e))
          : [...prev.events, { ...serverEvents.find((e) => e.id === data.id), ...data } as CalendarEvent],
      }));
    }
    setEventModalOpen(false);
    setSelectedEvent(null);
  };

  const handleEventMove = (eventId: string, newStart: Date, newEnd: Date) => {
    runIfUnlocked("editDeleteEvents", () =>
      setLocalOverrides((prev) => ({
        ...prev,
        events: prev.events.some((e) => e.id === eventId)
          ? prev.events.map((e) =>
              e.id === eventId
                ? { ...e, start_time: newStart.toISOString(), end_time: newEnd.toISOString() }
                : e
            )
          : [
              ...prev.events,
              {
                ...serverEvents.find((e) => e.id === eventId)!,
                start_time: newStart.toISOString(),
                end_time: newEnd.toISOString(),
              },
            ],
      }))
    );
  };

  const handleDeleteEvent = (eventId: string) => {
    runIfUnlocked("editDeleteEvents", () => doDeleteEvent(eventId));
  };

  const doDeleteEvent = (eventId: string) => {
    setLocalOverrides((prev) => ({ ...prev, deleted: new Set(prev.deleted).add(eventId) }));
    setEventModalOpen(false);
    setSelectedEvent(null);
  };

  const goPrev = () => {
    if (viewMode === "month") setCurrentDate((d) => subMonths(d, 1));
    else if (viewMode === "week") setCurrentDate((d) => subWeeks(d, 1));
    else setCurrentDate((d) => subDays(d, 1));
  };
  const goNext = () => {
    if (viewMode === "month") setCurrentDate((d) => addMonths(d, 1));
    else if (viewMode === "week") setCurrentDate((d) => addWeeks(d, 1));
    else setCurrentDate((d) => addDays(d, 1));
  };
  const goToday = () => {
    setCurrentDate(new Date());
    // In week or day view, also scroll to current time
    if (viewMode === "week") {
      weekViewRef.current?.scrollToNow();
    } else if (viewMode === "day") {
      dayViewRef.current?.scrollToNow();
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-shrink-0 items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-skydark-text">
          {viewMode === "month" && format(currentDate, "MMMM yyyy")}
          {viewMode === "week" && `Week of ${format(currentDate, "MMM d")}`}
          {viewMode === "day" && format(currentDate, "EEEE, MMM d")}
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as "month" | "week" | "day")}
            className="input-skydark"
          >
            <option value="month">Month</option>
            <option value="week">Week</option>
            <option value="day">Day</option>
          </select>
          <FilterDropdown
            familyMembers={familyMembers}
            tasksProgress={tasksProgress}
            onTasksProgressChange={setTasksProgress}
            eventsSelectAll={eventsSelectAll}
            onEventsSelectAllChange={setEventsSelectAll}
            memberVisibility={memberVisibility}
            onMemberVisibilityChange={(id, visible) =>
              setMemberVisibility((prev) => ({ ...prev, [id]: visible }))
            }
          />
          <button
            type="button"
            onClick={goPrev}
            className="p-2 rounded-xl hover:bg-gray-100 min-h-0 min-w-0"
            aria-label="Previous"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-2.5 rounded-xl bg-gray-100 text-skydark-text font-medium text-sm min-h-0 min-w-0"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            className="p-2 rounded-xl hover:bg-gray-100 min-h-0 min-w-0"
            aria-label="Next"
          >
            →
          </button>
        </div>
      </div>
      {viewMode === "month" && (
        <MonthView
          currentDate={currentDate}
          events={filteredEvents}
          familyMembers={familyMembers}
          onDateClick={(d) => setCurrentDate(d)}
          onEventClick={(e) => {
            setSelectedEvent(e);
            setEventModalOpen(true);
          }}
        />
      )}
      {viewMode === "week" && (
        <WeekView
          ref={weekViewRef}
          currentDate={currentDate}
          events={filteredEvents}
          familyMembers={familyMembers}
          onEventClick={(e) => {
            setSelectedEvent(e);
            setEventModalOpen(true);
          }}
          onEventMove={handleEventMove}
        />
      )}
      {viewMode === "day" && (
        <DayView
          ref={dayViewRef}
          currentDate={currentDate}
          events={filteredEvents}
          familyMembers={familyMembers}
          onEventClick={(e) => {
            setSelectedEvent(e);
            setEventModalOpen(true);
          }}
        />
      )}

      <EventModal
        open={eventModalOpen}
        onClose={() => {
          setEventModalOpen(false);
          setSelectedEvent(null);
        }}
        event={selectedEvent}
        familyMembers={familyMembers}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
      />

      <FloatingActionButton
        items={[
          {
            label: "Add event",
            icon: <span className="text-xl leading-none">+</span>,
            onClick: () => {
              runIfUnlocked("addEvents", () => {
                setSelectedEvent(null);
                setEventModalOpen(true);
              });
            },
          },
        ]}
      />
      <PinPrompt {...pinPromptProps} />
    </div>
  );
}
