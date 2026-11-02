import { useCallback, useEffect, useState } from "react";
import Toggle from "../Common/Toggle";
import { useSkydarkDataContext } from "../../contexts/SkydarkDataContext";
import {
  fetchSyncStatus,
  saveSyncLink,
  syncCalendarsNow,
  type CalendarSyncLink,
  type HaCalendarInfo,
} from "../../lib/skyDarkApi";

function isOn(value: number | boolean | undefined): boolean {
  return value === true || value === 1;
}

function formatSynced(iso?: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString();
}

export default function CalendarSyncSettings() {
  const skydark = useSkydarkDataContext();
  const conn = skydark?.data?.connection ?? null;
  const [calendars, setCalendars] = useState<HaCalendarInfo[]>([]);
  const [links, setLinks] = useState<CalendarSyncLink[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!conn) return;
    setLoading(true);
    setError(null);
    try {
      const status = await fetchSyncStatus(conn);
      setCalendars(status.calendars ?? []);
      setLinks(status.links ?? []);
      setLastRun(status.last_run ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load calendar sync.");
    } finally {
      setLoading(false);
    }
  }, [conn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const linkByEntity = new Map(links.map((link) => [link.entity_id, link]));

  const save = async (
    cal: HaCalendarInfo,
    patch: { pull_enabled?: boolean; push_enabled?: boolean; import_existing?: boolean }
  ) => {
    if (!conn) return;
    const existing = linkByEntity.get(cal.entity_id);
    const nextPull = patch.pull_enabled ?? isOn(existing?.pull_enabled);
    const nextPush = patch.push_enabled ?? isOn(existing?.push_enabled);
    setBusyId(cal.entity_id);
    setError(null);
    setMessage(null);
    try {
        const saved = await saveSyncLink(conn, {
          entity_id: cal.entity_id,
          name: cal.name,
          pull_enabled: nextPull,
          push_enabled: nextPush,
          import_existing: patch.import_existing,
        });
      await reload();
      if (saved.sync && !saved.sync.ok) throw new Error(saved.sync.links.filter(l => l.error).map(l => `${l.entity_id}: ${l.error}`).join("; "));
      await skydark?.refetchEvents();
      if (patch.import_existing) setMessage(`Imported existing events from ${cal.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save calendar sync.");
    } finally {
      setBusyId(null);
    }
  };

  const runSync = async (entityId?: string, importExisting = false) => {
    if (!conn) return;
    setBusyId(entityId ?? "all");
    setError(null);
    setMessage(null);
    try {
      const summary = await syncCalendarsNow(conn, { entity_id: entityId, import_existing: importExisting });
      await reload();
      await skydark?.refetchEvents();
      if (!summary.ok) throw new Error(summary.links.filter(l => l.error).map(l => `${l.entity_id}: ${l.error}`).join("; "));
      setMessage(`Sync finished: ${summary.links.reduce((n,l) => n + (l.pulled ?? 0), 0)} imported, ${summary.links.reduce((n,l) => n + (l.pushed ?? 0), 0)} exported.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setBusyId(null);
    }
  };

  if (!conn) {
    return (
      <p className="text-sm text-skydark-text-secondary">
        Calendar sync needs a Home Assistant connection. Standalone mode keeps events in SkyDark only.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-skydark-text-secondary">
        Connect Google, Outlook, CalDAV, or Local Calendar in Home Assistant first
        (Settings → Devices &amp; services). Then choose what SkyDark should import and
        what it should send back.
      </p>
      <p className="text-sm text-skydark-text-secondary">Sync runs every 15 minutes. Tap an event and Edit to change its time on touchscreens. Imported events stay local unless selected for export.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={loading || busyId !== null || calendars.length === 0}
          onClick={() => void runSync()}
        >
          {busyId === "all" ? "Syncing…" : "Sync now"}
        </button>
        <button className="btn-secondary" disabled={loading || busyId !== null} onClick={() => void reload()}>Refresh calendars</button>
        <span className="text-sm text-skydark-text-secondary">
          Last attempt: {formatSynced(lastRun)}
        </span>
      </div>
      {message && <p role="status" className="text-sm text-green-700">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading && calendars.length === 0 ? (
        <p className="text-sm text-skydark-text-secondary">Loading calendars…</p>
      ) : calendars.length === 0 ? (
        <p className="text-sm text-skydark-text-secondary">
          No Home Assistant calendars found yet. Add Google Calendar, Outlook, CalDAV, or
          Local Calendar, then come back here.
        </p>
      ) : (
        <ul className="space-y-3">
          {calendars.map((cal) => {
            const link = linkByEntity.get(cal.entity_id);
            const pull = isOn(link?.pull_enabled);
            const push = isOn(link?.push_enabled);
            const busy = busyId !== null || loading;
            return (
              <li
                key={cal.entity_id}
                className="rounded-card-lg bg-white shadow-skydark p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-skydark-text">{cal.name}</div>
                    <div className="text-xs text-skydark-text-secondary truncate">{cal.entity_id}</div>
                    {link?.last_error && (
                      <div className="text-xs text-red-600 mt-1">{link.last_error}</div>
                    )}
                    {link?.last_synced_at && (
                      <div className="text-xs text-skydark-text-secondary mt-1">
                        Synced {formatSynced(link.last_synced_at)}
                      </div>
                    )}
                  </div>
                  {!cal.can_create && (
                    <span className="text-xs font-medium text-skydark-text-secondary bg-gray-100 px-2 py-1 rounded-lg shrink-0">
                      Read-only
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-skydark-text">Import into SkyDark</span>
                  <Toggle
                    checked={pull}
                    onChange={(checked) => void save(cal, { pull_enabled: checked })}
                    aria-label={`Import ${cal.name} into SkyDark`}
                    disabled={busy}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-skydark-text">Export SkyDark events here</span>
                  <Toggle
                    checked={push}
                    onChange={(checked) => void save(cal, { push_enabled: checked })}
                    aria-label={`Export SkyDark events to ${cal.name}`}
                    disabled={busy || !cal.can_create}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className="btn-secondary text-sm"
                    disabled={busy || !pull}
                    onClick={() => void save(cal, { pull_enabled: true, import_existing: true })}
                  >
                    Import existing events
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy || (!pull && !push)}
                    onClick={() => void runSync(cal.entity_id)}
                  >
                    Sync this calendar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
