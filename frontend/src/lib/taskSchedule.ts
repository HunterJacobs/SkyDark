import type { Task } from "../types/tasks";

export interface TaskSchedulePayload {
  weekdays?: number[];
  custom_schedule?: string;
  custom_monthday?: number;
  custom_month?: number;
  custom_weekday?: number;
  custom_week_of_month?: number;
}

export function scheduleFromTask(data: Partial<Task>): TaskSchedulePayload {
  const payload: TaskSchedulePayload = {};
  if (data.weekdays?.length) payload.weekdays = data.weekdays;
  if (data.custom_schedule) payload.custom_schedule = data.custom_schedule;
  if (data.custom_monthday != null) payload.custom_monthday = data.custom_monthday;
  if (data.custom_month != null) payload.custom_month = data.custom_month;
  if (data.custom_weekday != null) payload.custom_weekday = data.custom_weekday;
  if (data.custom_week_of_month != null) payload.custom_week_of_month = data.custom_week_of_month;
  return payload;
}

export function isCompletedToday(completedDate: string | null | undefined, today = todayStr()): boolean {
  return completedDate === today;
}

export function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
