import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "../../types/calendar";
import type { FamilyMember } from "../../types/calendar";
import Modal from "../Common/Modal";
import Toggle from "../Common/Toggle";
import AddProfileModal from "../Settings/AddProfileModal";
import { useAppContext } from "../../contexts/AppContext";
import { toDatetimeLocalValue, localDateTimeToISO } from "../../lib/dates";

type EventModalMode = "view" | "edit" | "create";

interface EventModalProps {
  open: boolean;
  onClose: () => void;
  event?: CalendarEvent | null;
  familyMembers: FamilyMember[];
  onSave: (data: Partial<CalendarEvent> & { id?: string }) => void;
  onDelete?: (eventId: string) => void;
}

export default function EventModal({
  open,
  onClose,
  event,
  familyMembers,
  onSave,
  onDelete,
}: EventModalProps) {
  const [mode, setMode] = useState<EventModalMode>("create");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [repeats, setRepeats] = useState(false);
  const [countdown, setCountdown] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [addProfileModalOpen, setAddProfileModalOpen] = useState(false);
  const { addFamilyMember } = useAppContext();

  useEffect(() => {
    if (open && event) setMode("view");
    else if (open && !event) setMode("create");
  }, [open, event]);

  useEffect(() => {
    if (event) {
      const ids = Array.isArray(event.calendar_id)
        ? event.calendar_id
        : event.calendar_id
          ? [event.calendar_id]
          : [];
      setTitle(event.title);
      setStartTime(toDatetimeLocalValue(event.start_time));
      setEndTime(toDatetimeLocalValue(event.end_time));
      setAllDay(!!event.all_day);
      setSelectedProfileIds(ids);
      setDescription(event.description || "");
      setLocation(event.location || "");
    } else {
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000);
      setTitle("");
      setStartTime(now.toISOString().slice(0, 16));
      setEndTime(end.toISOString().slice(0, 16));
      setAllDay(false);
      setSelectedProfileIds(familyMembers.map((m) => m.id));
      setDescription("");
      setLocation("");
      setRepeats(false);
      setCountdown(false);
      setReminder(false);
    }
  }, [event, open, familyMembers]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...(event?.id && { id: event.id }),
      title,
      start_time: localDateTimeToISO(startTime),
      end_time: endTime ? localDateTimeToISO(endTime) : undefined,
      all_day: allDay,
      calendar_id: selectedProfileIds.length > 0 ? selectedProfileIds : undefined,
      description: description || undefined,
      location: location || undefined,
    });
    onClose();
  };

  const toggleProfile = (id: string) => {
    setSelectedProfileIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddProfile = (result: { name: string; color: string }) => {
    const newMember = addFamilyMember(result);
    setSelectedProfileIds((prev) => [...prev, newMember.id]);
    setAddProfileModalOpen(false);
  };

  const isView = mode === "view";
  const assignedMembers = selectedProfileIds
    .map((id) => familyMembers.find((m) => m.id === id))
    .filter(Boolean) as FamilyMember[];

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={isView ? (event?.title ?? "Event") : event ? "Edit Event" : "Add Event"}
      variant="slideRight"
      rightAction={
        isView ? (
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="p-2 rounded-lg hover:bg-gray-100 text-skydark-text-secondary"
            aria-label="Edit event"
            title="Edit"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        ) : undefined
      }
    >
      {isView ? (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-skydark-text-secondary mb-0.5">When</p>
            <p className="text-skydark-text font-medium">
              {allDay
                ? format(parseISO(startTime), "EEE, MMM d, yyyy")
                : `${format(parseISO(startTime), "EEE, MMM d · h:mm a")}${endTime ? ` – ${format(parseISO(endTime), "h:mm a")}` : ""}`}
            </p>
          </div>
          {location && (
            <div>
              <p className="text-sm text-skydark-text-secondary mb-0.5">Location</p>
              <p className="text-skydark-text">{location}</p>
            </div>
          )}
          {assignedMembers.length > 0 && (
            <div>
              <p className="text-sm text-skydark-text-secondary mb-0.5">Assigned to</p>
              <div className="flex flex-wrap gap-2">
                {assignedMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.initial}
                    </div>
                    <span className="text-skydark-text">{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {description && (
            <div>
              <p className="text-sm text-skydark-text-secondary mb-0.5">Description</p>
              <p className="text-skydark-text whitespace-pre-wrap">{description}</p>
            </div>
          )}
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="space-y-5 flex-1">
          <div>
            <label className="block text-sm font-medium text-skydark-text mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-skydark"
              placeholder="Event title"
              required
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium text-skydark-text">All day</span>
            <Toggle checked={allDay} onChange={setAllDay} aria-label="All day event" />
          </div>

          {allDay ? (
            <div>
              <label className="block text-sm font-medium text-skydark-text mb-1">Date</label>
              <input
                type="date"
                value={startTime.slice(0, 10)}
                onChange={(e) => {
                  const d = e.target.value;
                  setStartTime(d ? `${d}T00:00:00` : startTime);
                  if (endTime) setEndTime(endTime.slice(0, 10) + "T23:59:59");
                }}
                className="input-skydark"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-skydark-text mb-1">Starts</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input-skydark"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-skydark-text mb-1">Ends</label>
                <input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="input-skydark"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium text-skydark-text">Repeats</span>
            <Toggle checked={repeats} onChange={setRepeats} aria-label="Repeats" />
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium text-skydark-text">Countdown</span>
            <Toggle checked={countdown} onChange={setCountdown} aria-label="Countdown" />
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium text-skydark-text">Reminder</span>
            <Toggle checked={reminder} onChange={setReminder} aria-label="Reminder" />
          </div>

          <div>
            <label className="block text-sm font-medium text-skydark-text mb-2">Profiles</label>
            <div className="flex items-end gap-3 flex-wrap">
              {familyMembers.map((m) => {
                const selected = selectedProfileIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleProfile(m.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-full ${selected ? "ring-2 ring-skydark-accent ring-offset-2" : ""}`}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.initial}
                    </div>
                    <span className="text-xs font-medium text-skydark-text">{m.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setAddProfileModalOpen(true)}
                className="flex flex-col items-center gap-1.5 text-skydark-text-secondary hover:text-skydark-accent"
                aria-label="Add profile"
              >
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-xl font-light">
                  +
                </div>
                <span className="text-xs font-medium">Add</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-skydark-text mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input-skydark"
              placeholder="Location"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-skydark-text mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-skydark resize-none"
              placeholder="Description"
            />
          </div>
        </div>

        <div className="pt-6 pb-2 shrink-0 space-y-2">
          {event && onDelete && (
            <button
              type="button"
              onClick={() => {
                onDelete(event.id);
                onClose();
              }}
              className="w-full py-2.5 rounded-xl border border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          )}
          <button
            type="submit"
            className="btn-primary w-full"
          >
            {event ? "Save" : "Add"}
          </button>
        </div>
      </form>
      )}
    </Modal>
    <AddProfileModal
      open={addProfileModalOpen}
      onClose={() => setAddProfileModalOpen(false)}
      onAdd={handleAddProfile}
    />
    </>
  );
}
