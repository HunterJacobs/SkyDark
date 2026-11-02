/**
 * Typed wrappers for SkyDark WebSocket API (skydark_calendar/* commands).
 */

import { callService } from "home-assistant-js-websocket";
import type { Connection } from "home-assistant-js-websocket";
import type { CalendarEvent } from "../types/calendar";
import type { FamilyMember } from "../types/calendar";

export interface SkydarkEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time?: string | null;
  all_day?: number;
  location?: string | null;
  calendar_id?: string | null;
  color?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  external_id?: string | null;
  external_source?: string | null;
  sync_push_targets?: string | null;
}

export interface SkydarkTask {
  id: string;
  title: string;
  assignee_id: string;
  category?: string | null;
  frequency?: string | null;
  icon?: string | null;
  points?: number;
  completed_date?: string | null;
  created_at?: string | null;
  due_date?: string | null;
  weekdays?: number[] | null;
  custom_schedule?: string | null;
  custom_monthday?: number | null;
  custom_month?: number | null;
  custom_weekday?: number | null;
  custom_week_of_month?: number | null;
}

export interface SkydarkList {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  sort_order?: number | null;
  owner_id?: string | null;
  list_type?: string | null;
}

export interface SkydarkListItem {
  id: string;
  list_id: string;
  content: string;
  completed: number;
  sort_order?: number | null;
  created_at?: string | null;
}

export interface SkydarkMeal {
  id: string;
  name: string;
  recipe_url?: string | null;
  ingredients?: string | { name: string; quantity?: string; unit?: string }[] | null;
  meal_date: string;
  meal_type: string;
  created_at?: string | null;
  meal_recipe_id?: string | null;
}

export interface SkydarkMealRecipe {
  id: string;
  name: string;
  created_at?: string | null;
  ingredients?: { name: string; quantity?: string; unit?: string }[];
}

export interface SkydarkConfig {
  panel_url?: string;
  config?: { family_name?: string; weather_entity?: string };
}

function send<T>(conn: Connection, message: { type: string; [key: string]: unknown }): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return conn.sendMessagePromise(message as any) as Promise<T>;
}

export async function fetchEvents(
  conn: Connection,
  startDate?: string,
  endDate?: string
): Promise<{ events: SkydarkEvent[] }> {
  const msg: { type: string; start_date?: string; end_date?: string } = { type: "skydark_calendar/get_events" };
  if (startDate) msg.start_date = startDate;
  if (endDate) msg.end_date = endDate;
  return send(conn, msg);
}

export async function fetchTasks(conn: Connection): Promise<{ tasks: SkydarkTask[] }> {
  return send(conn, { type: "skydark_calendar/get_tasks" });
}

export async function fetchLists(conn: Connection): Promise<{
  lists: SkydarkList[];
  list_items: Record<string, SkydarkListItem[]>;
}> {
  return send(conn, { type: "skydark_calendar/get_lists" });
}

export async function fetchMeals(
  conn: Connection,
  startDate?: string,
  endDate?: string
): Promise<{ meals: SkydarkMeal[] }> {
  const msg: { type: string; start_date?: string; end_date?: string } = { type: "skydark_calendar/get_meals" };
  if (startDate) msg.start_date = startDate;
  if (endDate) msg.end_date = endDate;
  return send(conn, msg);
}

export async function fetchFamilyMembers(conn: Connection): Promise<{
  family_members: FamilyMember[];
}> {
  return send(conn, { type: "skydark_calendar/get_family_members" });
}

export async function fetchConfig(conn: Connection): Promise<{
  panel_url?: string;
  config?: Record<string, unknown>;
  /** Integration version reported by Home Assistant (manifest.json). */
  version?: string | null;
}> {
  return send(conn, { type: "skydark_calendar/get_config" });
}

/** Save shared settings (stored in the integration's options, so every display sees them). */
export async function updateConfig(
  conn: Connection,
  values: { family_name?: string; weather_entity?: string }
): Promise<{ config: Record<string, unknown> }> {
  return send(conn, { type: "skydark_calendar/update_config", ...values });
}

export interface SkydarkPhoto {
  id: string;
  /** Signed, directly loadable URL (expires after ~24h; refetch to renew). */
  url: string;
  caption: string;
  created_at?: string;
}

export async function fetchPhotos(
  conn: Connection
): Promise<{ photos: SkydarkPhoto[]; supported?: boolean }> {
  return send(conn, { type: "skydark_calendar/get_photos" });
}

export async function uploadPhoto(
  conn: Connection,
  dataUrl: string,
  caption?: string
): Promise<{ photo: SkydarkPhoto }> {
  return send(conn, {
    type: "skydark_calendar/upload_photo",
    data_url: dataUrl,
    ...(caption ? { caption } : {}),
  });
}

export async function deletePhoto(conn: Connection, photoId: string): Promise<{ ok: boolean }> {
  return send(conn, { type: "skydark_calendar/delete_photo", photo_id: photoId });
}

export async function fetchPoints(conn: Connection): Promise<{ points_by_member: Record<string, number> }> {
  return send(conn, { type: "skydark_calendar/get_points" });
}

export interface SkydarkReward {
  id: string;
  name: string;
  points_required: number;
  description?: string | null;
  icon?: string | null;
}

export async function fetchRewards(conn: Connection): Promise<{ rewards: SkydarkReward[] }> {
  return send(conn, { type: "skydark_calendar/get_rewards" });
}

export async function fetchMealRecipes(conn: Connection): Promise<{ recipes: SkydarkMealRecipe[] }> {
  return send(conn, { type: "skydark_calendar/get_meal_recipes" });
}

export function parseSyncTargets(raw?: string | null): string[] | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* ignore */
  }
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

/** Normalize backend event to frontend CalendarEvent shape */
export function eventToCalendarEvent(e: SkydarkEvent): CalendarEvent {
  const calendar_id = e.calendar_id;
  let ids: string[] | undefined;
  if (Array.isArray(calendar_id)) {
    ids = calendar_id.map(String);
  } else if (typeof calendar_id === "string" && calendar_id) {
    ids = calendar_id.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? undefined,
    start_time: e.all_day ? e.start_time.slice(0,10) + "T00:00:00" : e.start_time,
    end_time: e.all_day && e.end_time ? e.end_time.slice(0,10) + "T23:59:59" : e.end_time ?? undefined,
    all_day: Boolean(e.all_day),
    location: e.location ?? undefined,
    calendar_id: ids,
    recurrence_rule: undefined,
    external_id: e.external_id ?? undefined,
    external_source: e.external_source ?? undefined,
    sync_push_targets: parseSyncTargets(e.sync_push_targets ?? null) ?? undefined,
  };
}

function calendarIdParam(ids?: string[] | string | null): string | undefined {
  if (!ids) return undefined;
  if (Array.isArray(ids)) return ids[0];
  const first = ids.split(",")[0]?.trim();
  return first || undefined;
}

// --- HA service calls (skydark_calendar domain) ---

const DOMAIN = "skydark_calendar";

export async function serviceAddEvent(
  conn: Connection,
  data: {
    title: string;
    start_time: string;
    end_time?: string;
    all_day?: boolean;
    calendar_id?: string | string[];
    description?: string;
    location?: string;
    sync_push_targets?: string[];
  }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_event", {
    ...data,
    calendar_id: calendarIdParam(data.calendar_id),
    sync_push_targets: data.sync_push_targets ? JSON.stringify(data.sync_push_targets) : undefined,
  });
}

export async function serviceUpdateEvent(
  conn: Connection,
  data: {
    event_id: string;
    title?: string;
    start_time?: string;
    end_time?: string;
    all_day?: boolean;
    calendar_id?: string | string[];
    description?: string;
    location?: string;
    sync_push_targets?: string[];
  }
): Promise<unknown> {
  return callService(conn, DOMAIN, "update_event", {
    ...data,
    calendar_id: calendarIdParam(data.calendar_id),
    sync_push_targets: data.sync_push_targets ? JSON.stringify(data.sync_push_targets) : undefined,
  });
}

export async function serviceDeleteEvent(conn: Connection, eventId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "delete_event", { event_id: eventId });
}

export async function serviceCompleteTask(
  conn: Connection,
  data: { task_id: string; completed_date?: string; points?: number }
): Promise<unknown> {
  return callService(conn, DOMAIN, "complete_task", data);
}

export async function serviceUncompleteTask(conn: Connection, taskId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "uncomplete_task", { task_id: taskId });
}

export async function serviceAddTask(
  conn: Connection,
  data: {
    title: string;
    assignee_id: string;
    category?: string;
    frequency?: string;
    icon?: string;
    points?: number;
    due_date?: string;
    weekdays?: number[];
    custom_schedule?: string;
    custom_monthday?: number;
    custom_month?: number;
    custom_weekday?: number;
    custom_week_of_month?: number;
  }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_task", data);
}

export async function serviceUpdateTask(
  conn: Connection,
  data: {
    task_id: string;
    title?: string;
    assignee_id?: string;
    category?: string;
    frequency?: string;
    icon?: string;
    points?: number;
    due_date?: string;
    weekdays?: number[];
    custom_schedule?: string;
    custom_monthday?: number;
    custom_month?: number;
    custom_weekday?: number;
    custom_week_of_month?: number;
  }
): Promise<unknown> {
  return callService(conn, DOMAIN, "update_task", data);
}

export async function serviceDeleteTask(conn: Connection, taskId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "delete_task", { task_id: taskId });
}

export async function serviceAddPoints(
  conn: Connection,
  data: { member_id: string; points: number; reason: string; task_id?: string }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_points", data);
}

export async function serviceRedeemReward(
  conn: Connection,
  data: { member_id: string; reward_id: string }
): Promise<unknown> {
  return callService(conn, DOMAIN, "redeem_reward", data);
}

export async function serviceAddReward(
  conn: Connection,
  data: { name: string; points_required: number; description?: string; icon?: string }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_reward", data);
}

export async function serviceDeleteReward(conn: Connection, rewardId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "delete_reward", { reward_id: rewardId });
}

export async function serviceCreateList(
  conn: Connection,
  data: { name: string; color?: string; owner_id?: string; list_type?: string }
): Promise<unknown> {
  return callService(conn, DOMAIN, "create_list", { ...data, list_type: data.list_type ?? "general" });
}

export async function serviceDeleteList(conn: Connection, listId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "delete_list", { list_id: listId });
}

export async function serviceAddListItem(
  conn: Connection,
  data: { list_id: string; content: string }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_list_item", data);
}

export async function serviceToggleListItem(conn: Connection, itemId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "toggle_list_item", { item_id: itemId });
}

export async function serviceDeleteListItem(conn: Connection, itemId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "delete_list_item", { item_id: itemId });
}

export async function serviceAddMeal(
  conn: Connection,
  data: {
    name: string;
    meal_date: string;
    meal_type?: string;
    ingredients?: { name: string; quantity?: string; unit?: string }[];
    meal_recipe_id?: string;
    recipe_url?: string;
  }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_meal", data);
}

export async function serviceUpdateMeal(
  conn: Connection,
  data: {
    meal_id: string;
    name?: string;
    meal_date?: string;
    meal_type?: string;
    ingredients?: { name: string; quantity?: string; unit?: string }[];
    meal_recipe_id?: string;
    recipe_url?: string;
  }
): Promise<unknown> {
  return callService(conn, DOMAIN, "update_meal", data);
}

export async function serviceDeleteMeal(conn: Connection, mealId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "delete_meal", { meal_id: mealId });
}

export async function serviceAddMealRecipe(
  conn: Connection,
  data: { name: string; ingredients?: { name: string; quantity?: string; unit?: string }[] }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_meal_recipe", {
    name: data.name,
    ingredients: data.ingredients ?? [],
  });
}

export async function serviceDeleteMealRecipe(conn: Connection, recipeId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "delete_meal_recipe", { recipe_id: recipeId });
}

export async function serviceAddFamilyMember(
  conn: Connection,
  data: { name: string; color: string; initial?: string; avatar_url?: string }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_family_member", data);
}

export async function serviceUpdateFamilyMember(
  conn: Connection,
  data: { member_id: string; name?: string; color?: string; initial?: string; avatar_url?: string; sort_order?: number }
): Promise<unknown> {
  return callService(conn, DOMAIN, "update_family_member", data);
}

export async function serviceDeleteFamilyMember(conn: Connection, memberId: string): Promise<unknown> {
  return callService(conn, DOMAIN, "delete_family_member", { member_id: memberId });
}

/** Resolve a Home Assistant media-source URL to a browser-fetchable path. */
export async function resolveMediaUrl(conn: Connection, mediaContentId: string): Promise<string | null> {
  if (!mediaContentId) return null;
  if (!mediaContentId.startsWith("media-source://")) return mediaContentId;
  try {
    const result = await conn.sendMessagePromise<{ url?: string }>({
      type: "media_source/resolve_media",
      media_content_id: mediaContentId,
    });
    return result?.url ?? null;
  } catch {
    return null;
  }
}

export interface HaCalendarInfo {
  entity_id: string;
  name: string;
  can_create: boolean;
  can_delete: boolean;
  features_known: boolean;
}

export interface CalendarSyncLink {
  id: string;
  entity_id: string;
  name?: string | null;
  pull_enabled: number | boolean;
  push_enabled: number | boolean;
  import_existing: number | boolean;
  last_synced_at?: string | null;
  last_error?: string | null;
}

export async function fetchSyncStatus(conn: Connection): Promise<{
  calendars: HaCalendarInfo[];
  links: CalendarSyncLink[];
  last_run?: string | null;
}> {
  return send(conn, { type: "skydark_calendar/get_sync_status" });
}

export interface SyncSummary { ok: boolean; links: { entity_id: string; pulled?: number; pushed?: number; error?: string | null }[]; }

export async function saveSyncLink(
  conn: Connection,
  data: {
    entity_id: string;
    name?: string;
    pull_enabled?: boolean;
    push_enabled?: boolean;
    import_existing?: boolean;
  }
): Promise<{ link_id: string; sync?: SyncSummary | null }> {
  return send(conn, { type: "skydark_calendar/save_sync_link", ...data });
}

export async function deleteSyncLink(conn: Connection, entityId: string): Promise<{ ok: boolean }> {
  return send(conn, { type: "skydark_calendar/delete_sync_link", entity_id: entityId });
}

export async function syncCalendarsNow(
  conn: Connection,
  data?: { entity_id?: string; import_existing?: boolean }
): Promise<SyncSummary> {
  return send(conn, { type: "skydark_calendar/sync_now", ...data });
}
