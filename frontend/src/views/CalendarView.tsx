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
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "agenda">(() => window.matchMedia?.("(max-width: 639px)").matches ? "agenda" : "month");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [tasksProgress, setTasksProgress] = useState(true);
  const [eventsSelectAll, setEventsSelectAll] = useState(true);
  const [memberVisibility, setMemberVisibility] = useState<Record<string, boolean>>({});
  const { familyMembers } = useAppContext();
  const { runIfUnlocked, pinPromptProps } = usePinGate();
  const weekViewRef = useRef<WeekViewRef>(null);
  const dayViewRef = useRef<DayViewRef>(null);

  const events = skydark?.data.events ?? FALLBACK_EVENTS;

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

  const mutate = async (action: (conn: NonNullable<typeof skydark>["data"]["connection"] & {}) => Promise<unknown>, close = true) => {
    const conn = skydark?.data.connection;
    if (!conn || saving) { setSaveError("Not connected. Reconnect before saving."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      await action(conn);
      await skydark?.refetchEvents();
      if (close) { setEventModalOpen(false); setSelectedEvent(null); }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save. Your changes have not been saved; please retry.");
    } finally { setSaving(false); }
  };

  const doSaveEvent = (data: Partial<CalendarEvent> & { id?: string }) => mutate(async conn => {
    const payload = {
      title: data.title!, start_time: data.start_time!, end_time: data.end_time,
      all_day: data.all_day ?? false, calendar_id: data.calendar_id,
      description: data.description, location: data.location, sync_push_targets: data.sync_push_targets,
    };
    if (data.id) await serviceUpdateEvent(conn, { event_id: data.id, ...payload });
    else await serviceAddEvent(conn, payload);
  });

  const handleEventMove = (eventId: string, newStart: Date, newEnd: Date) => {
    runIfUnlocked("editDeleteEvents", () => void mutate(conn => serviceUpdateEvent(conn, {
      event_id: eventId, start_time: newStart.toISOString(), end_time: newEnd.toISOString(),
    }), false));
  };
  const handleDeleteEvent = (eventId: string) => {
    runIfUnlocked("editDeleteEvents", () => void mutate(conn => serviceDeleteEvent(conn, eventId)));
  };

  const goPrev = () => {
    if (viewMode === "month") setCurrentDate((d) => subMonths(d, 1));
    else if ((viewMode === "week" || viewMode === "agenda")) setCurrentDate((d) => subWeeks(d, 1));
    else setCurrentDate((d) => subDays(d, 1));
  };
  const goNext = () => {
    if (viewMode === "month") setCurrentDate((d) => addMonths(d, 1));
    else if ((viewMode === "week" || viewMode === "agenda")) setCurrentDate((d) => addWeeks(d, 1));
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
          {viewMode === "agenda" && `Week of ${format(currentDate, "MMM d")}`}
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as "month" | "week" | "day" | "agenda")}
            className="input-skydark !w-auto min-w-[7.5rem]"
            aria-label="Calendar view"
          >
            <option value="agenda">Agenda</option>
            <option value="month">Month</option>
            <option value="week">Week</option>
            <option value="day">Day</option>
          </select>
          <FilterDropdown
            familyMembers={familyMembers}
            tasksProgress={tasksProgress}
            onTasksProgressChange={setTasksProgress}
            eventsSelectAll={eventsSelectAll}
            onEventsSelectAllChange={(visible) => { setEventsSelectAll(visible); setMemberVisibility(Object.fromEntries(familyMembers.map(m => [m.id, visible]))); }}
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
      {saveError && !eventModalOpen && <p role="alert" className="p-3 mb-2 text-red-700 bg-red-50 rounded-xl">{saveError}</p>}
      {viewMode === "agenda" && (
        <div className="overflow-auto min-h-0 space-y-4 pb-20">
          {Array.from({ length: 7 }, (_, i) => addDays(currentDate, i)).map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = filteredEvents.filter(e => {
              const start = e.all_day ? e.start_time.slice(0, 10) : format(new Date(e.start_time), "yyyy-MM-dd");
              const end = e.end_time ? (e.all_day ? e.end_time.slice(0, 10) : format(new Date(e.end_time), "yyyy-MM-dd")) : start;
              return key >= start && key <= end;
            }).sort((a,b) => a.start_time.localeCompare(b.start_time));
            return <section key={key} aria-label={format(day, "EEEE, MMMM d")}>
              <h3 className="text-sm font-semibold mb-2">{format(day, "EEEE, MMM d")}</h3>
              {dayEvents.length ? dayEvents.map(event => <button key={event.id} onClick={() => { setSaveError(null); setSelectedEvent(event); setEventModalOpen(true); }} className="w-full min-h-[64px] p-3 mb-2 bg-white border border-gray-200 rounded-xl text-left flex gap-3 items-center">
                <span className="text-xs text-skydark-text-secondary w-16 shrink-0">{event.all_day ? "All day" : format(new Date(event.start_time), "h:mm a")}</span>
                <span className="min-w-0 font-medium break-words">{event.title}</span>
              </button>) : <p className="text-sm text-skydark-text-secondary p-3 bg-white rounded-xl">No events</p>}
            </section>;
          })}
        </div>
      )}
      {viewMode === "month" && (
        <MonthView
          currentDate={currentDate}
          events={filteredEvents}
          familyMembers={familyMembers}
          onDateClick={(d) => { setCurrentDate(d); setViewMode("day"); }}
          onEventClick={(e) => {
            setSaveError(null);
            setSelectedEvent(e);
            setEventModalOpen(true);
          }}
        />
      )}
      {viewMode === "week" && (
        <div className="flex-1 min-h-0 overflow-x-auto"><div className="min-w-[700px] h-full flex flex-col">
        <WeekView
          ref={weekViewRef}
          currentDate={currentDate}
          events={filteredEvents}
          familyMembers={familyMembers}
          onEventClick={(e) => {
            setSaveError(null);
            setSelectedEvent(e);
            setEventModalOpen(true);
          }}
          onEventMove={handleEventMove}
        />
        </div></div>
      )}
      {viewMode === "day" && (
        <DayView
          ref={dayViewRef}
          currentDate={currentDate}
          events={filteredEvents}
          familyMembers={familyMembers}
          onEventClick={(e) => {
            setSaveError(null);
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
        saving={saving}
        error={saveError}
        onDelete={handleDeleteEvent}
      />

      <FloatingActionButton
        items={[
          {
            label: "Add event",
            icon: <span className="text-xl leading-none">+</span>,
            onClick: () => {
              runIfUnlocked("addEvents", () => {
                setSaveError(null);
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
