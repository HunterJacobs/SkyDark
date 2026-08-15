import { useMemo, useState, useEffect } from "react";
import { subscribeEntities } from "home-assistant-js-websocket";
import { useSkydarkDataContext } from "../contexts/SkydarkDataContext";

export interface WeeklyDay {
  dayLabel: string;
  tempMin: number;
  tempMax: number;
  precipitation: number;
  condition: "sunny" | "cloudy" | "rain" | "snow" | "partly-cloudy";
}

/** Map condition to a short display icon (emoji for no extra deps). */
export function getWeatherIcon(condition: WeeklyDay["condition"]): string {
  switch (condition) {
    case "sunny":
      return "☀️";
    case "partly-cloudy":
      return "⛅";
    case "cloudy":
      return "☁️";
    case "rain":
      return "🌧️";
    case "snow":
      return "❄️";
    default:
      return "☀️";
  }
}

/** Map HA condition to our condition type. */
function mapCondition(ha: string | undefined): WeeklyDay["condition"] {
  const c = (ha ?? "").toLowerCase();
  if (c.includes("rain") || c.includes("drizzle") || c.includes("thunder")) return "rain";
  if (c.includes("snow")) return "snow";
  if (c.includes("cloud") && !c.includes("partly")) return "cloudy";
  if (c.includes("partly") || (c.includes("clear") && c.includes("cloud"))) return "partly-cloudy";
  return "sunny";
}

/** Mock 7-day forecast when no HA weather entity. */
function buildMockWeeklyForecast(): WeeklyDay[] {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const conditions: WeeklyDay["condition"][] = [
    "sunny",
    "partly-cloudy",
    "cloudy",
    "rain",
    "snow",
    "partly-cloudy",
    "sunny",
  ];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dayOfWeek = d.getDay();
    const isToday = i === 0;
    return {
      dayLabel: isToday ? "Today" : dayNames[dayOfWeek],
      tempMin: 38 + (i % 5) * 2,
      tempMax: 58 + (i % 4) * 3,
      precipitation: [0, 10, 30, 60, 0, 20, 5][i % 7],
      condition: conditions[i % conditions.length],
    };
  });
}

/** Build WeeklyDay[] from HA weather entity forecast attribute. */
function forecastFromHA(forecast: Array<{ datetime?: string; temperature?: number; templow?: number; condition?: string; precipitation?: number }> | undefined): WeeklyDay[] | null {
  if (!Array.isArray(forecast) || forecast.length === 0) return null;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const result: WeeklyDay[] = [];
  for (let i = 0; i < 7 && i < forecast.length; i++) {
    const f = forecast[i];
    const d = i === 0 ? today : new Date(today);
    if (i > 0) d.setDate(d.getDate() + i);
    const isToday = i === 0;
    const temp = typeof f.temperature === "number" ? f.temperature : 50;
    const low = typeof f.templow === "number" ? f.templow : temp - 5;
    result.push({
      dayLabel: isToday ? "Today" : dayNames[d.getDay()],
      tempMin: low,
      tempMax: temp,
      precipitation: typeof f.precipitation === "number" ? f.precipitation : 0,
      condition: mapCondition(f.condition),
    });
  }
  return result.length > 0 ? result : null;
}

export function useWeeklyWeather(): WeeklyDay[] {
  const skydark = useSkydarkDataContext();
  const [haForecast, setHaForecast] = useState<WeeklyDay[] | null>(null);

  useEffect(() => {
    const conn = skydark?.data?.connection;
    const entityId = skydark?.data?.config?.weather_entity;
    if (!conn || !entityId || typeof entityId !== "string") {
      setHaForecast(null);
      return;
    }
    const unsub = subscribeEntities(conn, (entities) => {
      const entity = entities[entityId];
      const forecast = entity?.attributes?.forecast;
      const parsed = forecastFromHA(Array.isArray(forecast) ? forecast : undefined);
      setHaForecast(parsed);
    });
    return () => unsub();
  }, [skydark?.data?.connection, skydark?.data?.config?.weather_entity]);

  return useMemo(() => {
    if (haForecast && haForecast.length > 0) return haForecast;
    return buildMockWeeklyForecast();
  }, [haForecast]);
}
