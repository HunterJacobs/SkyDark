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
  ingredients?: string | null;
  meal_date: string;
  meal_type: string;
  created_at?: string | null;
  meal_recipe_id?: string | null;
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
}> {
  return send(conn, { type: "skydark_calendar/get_config" });
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

/** Normalize backend event to frontend CalendarEvent shape */
export function eventToCalendarEvent(e: SkydarkEvent): CalendarEvent {
  const calendar_id = e.calendar_id;
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? undefined,
    start_time: e.start_time,
    end_time: e.end_time ?? undefined,
    all_day: Boolean(e.all_day),
    location: e.location ?? undefined,
    calendar_id: Array.isArray(calendar_id) ? calendar_id : calendar_id ? [String(calendar_id)] : undefined,
    recurrence_rule: undefined,
    external_id: undefined,
    external_source: undefined,
  };
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
    calendar_id?: string;
    description?: string;
    location?: string;
  }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_event", data);
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
  }
): Promise<unknown> {
  return callService(conn, DOMAIN, "update_task", data);
}

export async function serviceCompleteTask(
  conn: Connection,
  data: { task_id: string; completed_date?: string; points?: number }
): Promise<unknown> {
  return callService(conn, DOMAIN, "complete_task", data);
}

export async function serviceAddReward(
  conn: Connection,
  data: { name: string; points_required: number; description?: string; icon?: string }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_reward", data);
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

export async function serviceCreateList(
  conn: Connection,
  data: { name: string; color?: string; owner_id?: string; list_type?: string }
): Promise<unknown> {
  return callService(conn, DOMAIN, "create_list", { ...data, list_type: data.list_type ?? "general" });
}

export async function serviceAddListItem(
  conn: Connection,
  data: { list_id: string; content: string }
): Promise<unknown> {
  return callService(conn, DOMAIN, "add_list_item", data);
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
