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
import { serviceAddEvent, serviceUpdateEvent, serviceDeleteEvent } from "../lib/skyDarkApi";
import { eventRangeForDate } from "../lib/dates";
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
  const events = [
    ...serverEvents
      .filter((e) => !localOverrides.deleted.has(e.id))
      .map((e) => localOverrides.events.find((o) => o.id === e.id) ?? e),
    ...localOverrides.events.filter(
      (o) => !serverEvents.some((e) => e.id === o.id) && !localOverrides.deleted.has(o.id)
    ),
  ];

  useEffect(() => {
    if (!skydark?.refetchEvents) return;
    const { start, end } = eventRangeForDate(currentDate, viewMode === "month" ? 1 : 0);
    void skydark.refetchEvents(start, end);
  }, [currentDate, viewMode, skydark?.refetchEvents]);

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
    if (conn && data.title && data.start_time) {
      try {
        if (isAdd) {
          await serviceAddEvent(conn, {
            title: data.title,
            start_time: data.start_time,
            end_time: data.end_time,
            all_day: data.all_day ?? false,
            calendar_id: data.calendar_id,
            description: data.description,
            location: data.location,
            sync_push_targets: data.sync_push_targets,
          });
        } else if (data.id) {
          await serviceUpdateEvent(conn, {
            event_id: data.id,
            title: data.title,
            start_time: data.start_time,
            end_time: data.end_time,
            all_day: data.all_day ?? false,
            calendar_id: data.calendar_id,
            description: data.description,
            location: data.location,
            sync_push_targets: data.sync_push_targets,
          });
        }
        await skydark?.refetchEvents();
        setLocalOverrides({ events: [], deleted: new Set() });
      } catch {
        if (isAdd) {
          setLocalOverrides((prev) => ({
            ...prev,
            events: [...prev.events, { ...data, id: String(Date.now()) } as CalendarEvent],
          }));
        } else if (data.id) {
          setLocalOverrides((prev) => ({
            ...prev,
            events: prev.events.some((e) => e.id === data.id)
              ? prev.events.map((e) => (e.id === data.id ? { ...e, ...data } : e))
              : [...prev.events, { ...serverEvents.find((e) => e.id === data.id), ...data } as CalendarEvent],
          }));
        }
      }
    } else if (data.id) {
      setLocalOverrides((prev) => ({
        ...prev,
        events: prev.events.some((e) => e.id === data.id)
          ? prev.events.map((e) => (e.id === data.id ? { ...e, ...data } : e))
          : [...prev.events, { ...serverEvents.find((e) => e.id === data.id), ...data } as CalendarEvent],
      }));
    } else {
      setLocalOverrides((prev) => ({
        ...prev,
        events: [...prev.events, { ...data, id: String(Date.now()) } as CalendarEvent],
      }));
    }
    setEventModalOpen(false);
    setSelectedEvent(null);
  };

  const handleEventMove = (eventId: string, newStart: Date, newEnd: Date) => {
    runIfUnlocked("editDeleteEvents", async () => {
      const conn = skydark?.data?.connection;
      if (conn) {
        try {
          await serviceUpdateEvent(conn, {
            event_id: eventId,
            start_time: newStart.toISOString(),
            end_time: newEnd.toISOString(),
          });
          await skydark?.refetchEvents();
          return;
        } catch {
          // fall through to local override
        }
      }
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
      }));
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    runIfUnlocked("editDeleteEvents", () => doDeleteEvent(eventId));
  };

  const doDeleteEvent = async (eventId: string) => {
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceDeleteEvent(conn, eventId);
        await skydark?.refetchEvents();
      } catch {
        setLocalOverrides((prev) => ({ ...prev, deleted: new Set(prev.deleted).add(eventId) }));
      }
    } else {
      setLocalOverrides((prev) => ({ ...prev, deleted: new Set(prev.deleted).add(eventId) }));
    }
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
      <div className="flex flex-shrink-0 flex-col gap-3 mb-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-skydark-text">
          {viewMode === "month" && format(currentDate, "MMMM yyyy")}
          {viewMode === "week" && `Week of ${format(currentDate, "MMM d")}`}
          {viewMode === "day" && format(currentDate, "EEEE, MMM d")}
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as "month" | "week" | "day")}
            className="input-skydark !w-auto min-w-[7.5rem]"
            aria-label="Calendar view"
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
          <div className="flex items-center rounded-xl bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={goPrev}
              className="btn-icon"
              aria-label="Previous"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={goToday}
              className="btn-ghost text-skydark-text"
            >
              Today
            </button>
            <button
              type="button"
              onClick={goNext}
              className="btn-icon"
              aria-label="Next"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
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
