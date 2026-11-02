import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import type { CalendarEvent } from "../../types/calendar";
import type { FamilyMember } from "../../types/calendar";
import Modal from "../Common/Modal";
import Toggle from "../Common/Toggle";
import AddProfileModal from "../Settings/AddProfileModal";
import { useAppContext } from "../../contexts/AppContext";
import { toDatetimeLocalValue, localDateTimeToISO } from "../../lib/dates";
import { fetchSyncStatus, type CalendarSyncLink } from "../../lib/skyDarkApi";
import { useSkydarkDataContext } from "../../contexts/SkydarkDataContext";

type EventModalMode = "view" | "edit" | "create";

interface EventModalProps {
  open: boolean;
  onClose: () => void;
  event?: CalendarEvent | null;
  familyMembers: FamilyMember[];
  onSave: (data: Partial<CalendarEvent> & { id?: string }) => void;
  onDelete?: (eventId: string) => void;
  saving?: boolean;
  error?: string | null;
}

export default function EventModal({
  open,
  onClose,
  event,
  familyMembers,
  onSave,
  onDelete,
  saving = false,
  error,
}: EventModalProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mode, setMode] = useState<EventModalMode>("create");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [addProfileModalOpen, setAddProfileModalOpen] = useState(false);
  const [pushCalendars, setPushCalendars] = useState<{ entity_id: string; name: string }[]>([]);
  const [selectedPushTargets, setSelectedPushTargets] = useState<string[] | null>(null);
  const { addFamilyMember } = useAppContext();
  const conn = useSkydarkDataContext()?.data?.connection ?? null;

  useEffect(() => {
    setValidationError(null);
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
      setStartTime(event.all_day ? event.start_time.slice(0,10) + "T00:00" : toDatetimeLocalValue(event.start_time));
      setEndTime(event.all_day ? (event.end_time ?? event.start_time).slice(0,10) + "T23:59" : toDatetimeLocalValue(event.end_time));
      setAllDay(!!event.all_day);
      setSelectedProfileIds(ids);
      setDescription(event.description || "");
      setLocation(event.location || "");
      setSelectedPushTargets(event.sync_push_targets ?? null);
    } else {
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000);
      setTitle("");
      setStartTime(toDatetimeLocalValue(now.toISOString()));
      setEndTime(toDatetimeLocalValue(end.toISOString()));
      setAllDay(false);
      setSelectedProfileIds(familyMembers.map((m) => m.id));
      setDescription("");
      setLocation("");
      setSelectedPushTargets(null);
    }
  }, [event, open]);

  useEffect(() => {
    if (!open || !conn) {
      setPushCalendars([]);
      return;
    }
    let cancelled = false;
    fetchSyncStatus(conn)
      .then((status) => {
        if (cancelled) return;
        const names = new Map(status.calendars.map((cal) => [cal.entity_id, cal.name]));
        const enabled = (status.links || [])
          .filter((link: CalendarSyncLink) => link.push_enabled === 1 || link.push_enabled === true)
          .map((link) => ({
            entity_id: link.entity_id,
            name: link.name || names.get(link.entity_id) || link.entity_id,
          }));
        setPushCalendars(enabled);
      })
      .catch(() => {
        if (!cancelled) setPushCalendars([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conn]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (saving) return;
    if (!title.trim() || !startTime || (endTime && (allDay ? endTime.slice(0,10) < startTime.slice(0,10) : new Date(endTime) <= new Date(startTime)))) {
      setValidationError("Enter a title, a start date, and an end time after the start."); return;
    }
    const allIds = pushCalendars.map((cal) => cal.entity_id);
    const chosen = selectedPushTargets ?? allIds;
    onSave({
      ...(event?.id && { id: event.id }),
      title: title.trim(),
      start_time: allDay ? startTime.slice(0,10) + "T00:00:00+00:00" : localDateTimeToISO(startTime),
      end_time: allDay ? (endTime || startTime).slice(0,10) + "T23:59:59+00:00" : endTime ? localDateTimeToISO(endTime) : undefined,
      all_day: allDay,
      calendar_id: selectedProfileIds.length > 0 ? selectedProfileIds : undefined,
      description: description || undefined,
      location: location || undefined,
      sync_push_targets: chosen,
    });
  };

  const togglePushTarget = (entityId: string) => {
    const allIds = pushCalendars.map((cal) => cal.entity_id);
    const current = selectedPushTargets ?? allIds;
    const next = current.includes(entityId)
      ? current.filter((id) => id !== entityId)
      : [...current, entityId];
    setSelectedPushTargets(next);
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
            className="btn-icon"
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
      {(error || validationError) && <p role="alert" className="p-3 mb-3 rounded-xl bg-red-50 text-red-700">{error || validationError}</p>}
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
          {event?.external_source && (
            <div>
              <p className="text-sm text-skydark-text-secondary mb-0.5">Imported from</p>
              <p className="text-skydark-text">
                {pushCalendars.find((cal) => cal.entity_id === event.external_source)?.name || event.external_source}
              </p>
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
              aria-label="Event title"
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
                  setEndTime(d + "T23:59:59");
                }}
                className="input-skydark"
                aria-label="Event date"
                required
              />
              <label className="block text-sm font-medium mt-3 mb-1">Last day</label>
              <input type="date" aria-label="Event last day" required min={startTime.slice(0,10)} value={(endTime || startTime).slice(0,10)} onChange={e => setEndTime(e.target.value + "T23:59:59")} className="input-skydark" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-skydark-text mb-1">Starts</label>
                <input
                  type="datetime-local"
                  required
                  aria-label="Event starts"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="input-skydark"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-skydark-text mb-1">Ends</label>
                <input
                  type="datetime-local"
                  aria-label="Event ends"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="input-skydark"
                />
              </div>
            </>
          )}

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
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl ${selected ? "bg-skydark-accent-bg ring-2 ring-skydark-accent" : "hover:bg-gray-50"}`}
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
                className="flex flex-col items-center gap-1 p-1.5 rounded-xl text-skydark-text-secondary hover:text-skydark-accent hover:bg-gray-50"
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
          {pushCalendars.length > 0 && (
            <div>
              <p className="block text-sm font-medium text-skydark-text mb-2">Also add to</p>
              <div className="space-y-2">
                {pushCalendars.map((cal) => {
                  const checked = (selectedPushTargets ?? pushCalendars.map((item) => item.entity_id)).includes(
                    cal.entity_id
                  );
                  return (
                    <label key={cal.entity_id} className="flex items-center justify-between gap-3 py-1">
                      <span className="text-sm text-skydark-text min-w-0 truncate">{cal.name}</span>
                      <Toggle
                        checked={checked}
                        onChange={() => togglePushTarget(cal.entity_id)}
                        aria-label={`Sync to ${cal.name}`}
                      />
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-skydark-text-secondary mt-1">
                Turn these off to keep the event only in SkyDark.
              </p>
            </div>
          )}
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
                if (window.confirm("Delete this event? This also deletes linked exports when supported.")) onDelete(event.id);
              }}
              disabled={saving}
              className="btn-danger-outline w-full"
            >
              Delete
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full"
          >
            {saving ? "Saving…" : event ? "Save" : "Add"}
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
