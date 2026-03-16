/**
 * Single shared hook: HA WebSocket connection + all SkyDark domain data
 * with loading/error state and retry. Used by views and AppContext to sync from backend.
 */

import { useCallback, useEffect, useState } from "react";
import { getHAConnection } from "../lib/haConnection";
import type { Connection } from "home-assistant-js-websocket";
import {
  fetchConfig,
  fetchEvents,
  fetchFamilyMembers,
  fetchLists,
  fetchMeals,
  fetchMealRecipes,
  fetchTasks,
  fetchPoints,
  fetchRewards,
  eventToCalendarEvent,
  type SkydarkEvent,
  type SkydarkList,
  type SkydarkListItem,
  type SkydarkMeal,
  type SkydarkMealRecipe,
  type SkydarkTask,
  type SkydarkReward,
} from "../lib/skyDarkApi";
import type { CalendarEvent } from "../types/calendar";
import type { FamilyMember } from "../types/calendar";

const DEFAULT_EVENT_RANGE_DAYS = 60;

export interface SkydarkDataState {
  connection: Connection | null;
  events: CalendarEvent[];
  tasks: SkydarkTask[];
  lists: SkydarkList[];
  listItems: Record<string, SkydarkListItem[]>;
  meals: SkydarkMeal[];
  mealRecipes: SkydarkMealRecipe[];
  familyMembers: FamilyMember[];
  config: {
    family_name?: string;
    weather_entity?: string;
    panel_url?: string;
  } | null;
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
  mealRecipes: [],
  familyMembers: [],
  config: null,
  pointsByMember: {},
  rewards: [],
  loading: true,
  error: null,
};

export function useSkydarkData(
  eventRangeDays: number = DEFAULT_EVENT_RANGE_DAYS,
): {
  data: SkydarkDataState;
  refetch: () => Promise<void>;
  refetchEvents: (startDate?: string, endDate?: string) => Promise<void>;
  refetchMeals: (startDate?: string, endDate?: string) => Promise<void>;
  refetchRecipes: () => Promise<void>;
} {
  const [data, setData] = useState<SkydarkDataState>(initialState);

  const load = useCallback(
    async (conn: Connection, startDate?: string, endDate?: string) => {
      const start = startDate ?? new Date().toISOString().slice(0, 10);
      const end =
        endDate ??
        new Date(Date.now() + eventRangeDays * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
      const [
        eventsRes,
        tasksRes,
        listsRes,
        mealsRes,
        recipesRes,
        familyRes,
        configRes,
        pointsRes,
        rewardsRes,
      ] = await Promise.all([
        fetchEvents(conn, start, end),
        fetchTasks(conn),
        fetchLists(conn),
        fetchMeals(conn, start, end),
        fetchMealRecipes(conn),
        fetchFamilyMembers(conn),
        fetchConfig(conn),
        fetchPoints(conn),
        fetchRewards(conn),
      ]);

      const events: CalendarEvent[] = (eventsRes.events ?? []).map(
        (e: SkydarkEvent) => eventToCalendarEvent(e),
      );
      const listItems: Record<string, SkydarkListItem[]> =
        listsRes.list_items ?? {};
      const cfg = configRes.config ?? {};
      const config = {
        panel_url: configRes.panel_url,
        family_name: (cfg as { family_name?: string }).family_name,
        weather_entity: (cfg as { weather_entity?: string }).weather_entity,
      };

      setData((prev) => ({
        ...prev,
        connection: conn,
        events,
        tasks: tasksRes.tasks ?? [],
        lists: listsRes.lists ?? [],
        listItems,
        meals: mealsRes.meals ?? [],
        mealRecipes: recipesRes.recipes ?? [],
        familyMembers: Array.isArray(familyRes.family_members)
          ? familyRes.family_members
          : [],
        config,
        pointsByMember: pointsRes.points_by_member ?? {},
        rewards: rewardsRes.rewards ?? [],
        loading: false,
        error: null,
      }));
    },
    [eventRangeDays],
  );

  const refetch = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true, error: null }));
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
        const start = startDate ?? new Date().toISOString().slice(0, 10);
        const end =
          endDate ??
          new Date(Date.now() + eventRangeDays * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        const res = await fetchEvents(conn, start, end);
        const events = (res.events ?? []).map((e: SkydarkEvent) =>
          eventToCalendarEvent(e),
        );
        setData((prev) => ({ ...prev, events }));
      } catch {
        // keep previous events on partial failure
      }
    },
    [data.connection, eventRangeDays],
  );

  const refetchMeals = useCallback(
    async (startDate?: string, endDate?: string) => {
      const conn = data.connection;
      if (!conn) return;
      try {
        const start = startDate ?? new Date().toISOString().slice(0, 10);
        const end =
          endDate ??
          new Date(Date.now() + eventRangeDays * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        const res = await fetchMeals(conn, start, end);
        setData((prev) => ({ ...prev, meals: res.meals ?? [] }));
      } catch (e) {
        console.error("[SkyDark] Failed to refresh meals:", e);
        throw e instanceof Error ? e : new Error("Failed to refresh meals");
      }
    },
    [data.connection, eventRangeDays],
  );

  const refetchRecipes = useCallback(async () => {
    const conn = data.connection;
    if (!conn) return;
    try {
      const res = await fetchMealRecipes(conn);
      setData((prev) => ({ ...prev, mealRecipes: res.recipes ?? [] }));
    } catch {
      // keep previous recipes
    }
  }, [data.connection]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setData((prev) => ({ ...prev, loading: true, error: null }));
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

  return { data, refetch, refetchEvents, refetchMeals, refetchRecipes };
}
