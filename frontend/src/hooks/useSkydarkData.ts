/**
 * Single shared hook: HA WebSocket connection + all SkyDark domain data
 * with loading/error state and retry. Used by views and AppContext to sync from backend.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getHAConnection } from "../lib/haConnection";
import type { Connection } from "home-assistant-js-websocket";
import {
  fetchConfig,
  fetchEvents,
  fetchFamilyMembers,
  fetchLists,
  fetchMeals,
  fetchTasks,
  fetchPoints,
  fetchRewards,
  fetchMealRecipes,
  eventToCalendarEvent,
  type SkydarkEvent,
  type SkydarkList,
  type SkydarkListItem,
  type SkydarkMeal,
  type SkydarkMealRecipe,
  type SkydarkTask,
  type SkydarkReward,
} from "../lib/skyDarkApi";
import { defaultLoadRange } from "../lib/dates";
import type { CalendarEvent } from "../types/calendar";
import type { FamilyMember } from "../types/calendar";

export interface SkydarkDataState {
  connection: Connection | null;
  events: CalendarEvent[];
  tasks: SkydarkTask[];
  lists: SkydarkList[];
  listItems: Record<string, SkydarkListItem[]>;
  meals: SkydarkMeal[];
  recipes: SkydarkMealRecipe[];
  familyMembers: FamilyMember[];
  config: { family_name?: string; weather_entity?: string; panel_url?: string } | null;
  pointsByMember: Record<string, number>;
  rewards: SkydarkReward[];
  loading: boolean;
  error: string | null;
}

const initialState: SkydarkDataState = {
  connection: null,
  events: [],
  tasks: [],
  lists: [],
  listItems: {},
  meals: [],
  recipes: [],
  familyMembers: [],
  config: null,
  pointsByMember: {},
  rewards: [],
  loading: true,
  error: null,
};

export function useSkydarkData(): {
  data: SkydarkDataState;
  refetch: () => Promise<void>;
  refetchEvents: (startDate?: string, endDate?: string) => Promise<void>;
  refetchMeals: (startDate?: string, endDate?: string) => Promise<void>;
} {
  const [data, setData] = useState<SkydarkDataState>(initialState);
  const eventRange = useRef(defaultLoadRange());
  const mealRange = useRef(defaultLoadRange());
  const eventRequest = useRef(0);
  const mealRequest = useRef(0);

  const load = useCallback(
    async (conn: Connection, startDate?: string, endDate?: string) => {
      const range = eventRange.current;
      const start = startDate ?? range.start;
      const end = endDate ?? range.end;
      const eventVersion = ++eventRequest.current;
      const mealVersion = ++mealRequest.current;
      const [eventsRes, tasksRes, listsRes, mealsRes, familyRes, configRes, pointsRes, rewardsRes, recipesRes] =
        await Promise.all([
          fetchEvents(conn, start, end),
          fetchTasks(conn),
          fetchLists(conn),
          fetchMeals(conn, mealRange.current.start.slice(0,10), mealRange.current.end.slice(0,10)),
          fetchFamilyMembers(conn),
          fetchConfig(conn),
          fetchPoints(conn),
          fetchRewards(conn),
          fetchMealRecipes(conn).catch(() => ({ recipes: [] as SkydarkMealRecipe[] })),
        ]);

      const events: CalendarEvent[] = (eventsRes.events ?? []).map((e: SkydarkEvent) => eventToCalendarEvent(e));
      const listItems: Record<string, SkydarkListItem[]> = listsRes.list_items ?? {};
      const cfg = configRes.config ?? {};
      const config = {
        panel_url: configRes.panel_url,
        family_name: (cfg as { family_name?: string }).family_name,
        weather_entity: (cfg as { weather_entity?: string }).weather_entity,
      };

      setData((prev) => ({
        ...prev,
        connection: conn,
        events: eventVersion === eventRequest.current ? events : prev.events,
        tasks: tasksRes.tasks ?? [],
        lists: listsRes.lists ?? [],
        listItems,
        meals: mealVersion === mealRequest.current ? mealsRes.meals ?? [] : prev.meals,
        recipes: recipesRes.recipes ?? [],
        familyMembers: Array.isArray(familyRes.family_members) ? familyRes.family_members : [],
        config,
        pointsByMember: pointsRes.points_by_member ?? {},
        rewards: rewardsRes.rewards ?? [],
        loading: false,
        error: null,
      }));
    },
    []
  );

  const refetch = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: !prev.connection, error: null }));
    try {
      const conn = await getHAConnection();
      await load(conn);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load data";
      setData((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
    }
  }, [load]);

  const refetchEvents = useCallback(
    async (startDate?: string, endDate?: string) => {
      const conn = data.connection;
      if (!conn) return;
      try {
        const range = eventRange.current;
        const start = startDate ?? range.start;
        const end = endDate ?? range.end;
        eventRange.current = { start, end };
        const request = ++eventRequest.current;
        const res = await fetchEvents(conn, start, end);
        const events = (res.events ?? []).map((e: SkydarkEvent) => eventToCalendarEvent(e));
        if (request === eventRequest.current) setData((prev) => ({ ...prev, events }));
      } catch {
        // keep previous events on partial failure
      }
    },
    [data.connection]
  );

  const refetchMeals = useCallback(
    async (startDate?: string, endDate?: string) => {
      const conn = data.connection;
      if (!conn) return;
      try {
        const range = mealRange.current;
        const start = startDate ?? range.start;
        const end = endDate ?? range.end;
        mealRange.current = { start, end };
        const request = ++mealRequest.current;
        const res = await fetchMeals(conn, start.slice(0,10), end.slice(0,10));
        if (request === mealRequest.current) setData((prev) => ({ ...prev, meals: res.meals ?? [] }));
      } catch {
        // keep previous meals
      }
    },
    [data.connection]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setData((prev) => ({ ...prev, loading: !prev.connection, error: null }));
      try {
        const conn = await getHAConnection();
        if (cancelled) return;
        await load(conn);
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Failed to connect";
        setData((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const conn = data.connection;
    if (!conn) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (disposed || document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => void refetch(), 150);
    };
    if (typeof conn.subscribeEvents === "function") {
      conn.subscribeEvents(refresh, "skydark_calendar_updated").then(unsub => {
        if (disposed) unsub(); else unsubscribe = unsub;
      }).catch(() => { /* polling below provides a fallback */ });
    }
    conn.addEventListener("ready", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 60_000);
    return () => {
      disposed = true; clearTimeout(timer); clearInterval(interval); unsubscribe?.();
      conn.removeEventListener("ready", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [data.connection, refetch]);

  return { data, refetch, refetchEvents, refetchMeals };
}
