/** Custom schedule type when frequency is "custom". */
export type CustomScheduleType = "date" | "monthly" | "yearly" | "weekday_of_month";

export interface Task {
  id: string;
  title: string;
  assignee_id: string;
  category?: string;
  frequency: string;
  /** When frequency is "weekly", which days (0=Sun … 6=Sat). */
  weekdays?: number[];
  /** When frequency is "custom", which schedule type. */
  custom_schedule?: CustomScheduleType;
  /** Day of month 1-31 (monthly and yearly). */
  custom_monthday?: number;
  /** Month 1-12 (yearly only). */
  custom_month?: number;
  /** Weekday 0-6 (weekday_of_month only). */
  custom_weekday?: number;
  /** Week of month 1-5: 1=first, 2=second, 3=third, 4=fourth, 5=last (weekday_of_month only). */
  custom_week_of_month?: number;
  icon?: string;
  /** Points awarded when task is completed (for rewards). */
  points: number;
  completed_date?: string | null;
  created_at?: string;
  /** ISO date or datetime for when the task is due (optional). */
  due_date?: string | null;
}

export const TASK_CATEGORIES = ["morning", "evening", "chores"] as const;
export const TASK_FREQUENCIES = ["daily", "weekly", "custom"] as const;

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Returns 1-5 for which occurrence of this weekday in the month (5 = last). */
function getWeekOfMonth(d: Date): number {
  const day = d.getDate();
  const weekday = d.getDay();
  const year = d.getFullYear();
  const month = d.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  let firstOcc = 1;
  while (new Date(year, month, firstOcc).getDay() !== weekday) firstOcc++;
  const occurrence = Math.floor((day - firstOcc) / 7) + 1;
  if (day + 7 > lastDay) return 5;
  return Math.min(occurrence, 4);
}

/** Returns true if the task is due on the given date (for custom recurrence checks). */
function isCustomDueOnDate(task: Task, date: Date): boolean {
  const schedule = task.custom_schedule ?? (task.due_date ? "date" : undefined);
  if (!schedule || schedule === "date") {
    if (!task.due_date) return false;
    const due = new Date(task.due_date);
    return due.getFullYear() === date.getFullYear() && due.getMonth() === date.getMonth() && due.getDate() === date.getDate();
  }
  if (schedule === "monthly" && task.custom_monthday != null) {
    return date.getDate() === task.custom_monthday;
  }
  if (schedule === "yearly" && task.custom_month != null && task.custom_monthday != null) {
    return date.getMonth() + 1 === task.custom_month && date.getDate() === task.custom_monthday;
  }
  if (schedule === "weekday_of_month" && task.custom_weekday != null && task.custom_week_of_month != null) {
    if (date.getDay() !== task.custom_weekday) return false;
    const weekNum = getWeekOfMonth(date);
    return weekNum === task.custom_week_of_month;
  }
  return false;
}

/** Returns true if the task is due today (daily = every day; weekly = today's weekday in task.weekdays). */
export function isDueToday(task: Task): boolean {
  if (task.frequency === "daily") return true;
  if (task.frequency === "weekly" && task.weekdays?.length) {
    const today = new Date().getDay();
    return task.weekdays.includes(today);
  }
  if (task.frequency === "custom") {
    return isCustomDueOnDate(task, new Date());
  }
  return false;
}

/** Returns true if the task was due in the last 7 days and is not completed (late). */
export function isLateInLastWeek(task: Task): boolean {
  const now = new Date();
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (task.completed_date === todayDate) return false;
  if (task.frequency === "daily") return false;
  if (task.frequency === "weekly" && task.weekdays?.length) {
    for (let offset = 1; offset <= 7; offset++) {
      const d = new Date(now);
      d.setDate(d.getDate() - offset);
      if (task.weekdays.includes(d.getDay())) return true;
    }
    return false;
  }
  if (task.frequency === "custom") {
    for (let offset = 1; offset <= 7; offset++) {
      const d = new Date(now);
      d.setDate(d.getDate() - offset);
      if (isCustomDueOnDate(task, d)) return true;
    }
    if (task.due_date) {
      const due = new Date(task.due_date);
      const dueStr = due.toISOString().slice(0, 10);
      const past = new Date(now);
      past.setDate(past.getDate() - 7);
      if (dueStr >= past.toISOString().slice(0, 10) && dueStr < todayDate) return true;
    }
    return false;
  }
  return false;
}

/** Format weekdays for display (e.g. "Tue, Thu"). */
export function formatWeekdays(weekdays: number[] | undefined): string {
  if (!weekdays?.length) return "";
  return weekdays.slice().sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(", ");
}

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEK_ORDINAL_LABELS = ["1st", "2nd", "3rd", "4th", "Last"] as const;

/** Format custom schedule for display (e.g. "Monthly (15th)", "1st Mon", "Yearly (Jan 15)"). */
export function formatCustomSchedule(task: Task): string {
  if (task.frequency !== "custom") return "";
  const schedule = task.custom_schedule ?? (task.due_date ? "date" : undefined);
  if (!schedule || schedule === "date") {
    if (task.due_date) {
      const d = new Date(task.due_date);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
    return "—";
  }
  if (schedule === "monthly" && task.custom_monthday != null) {
    const n = task.custom_monthday;
    const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
    return `Monthly (${n}${suffix})`;
  }
  if (schedule === "yearly" && task.custom_month != null && task.custom_monthday != null) {
    return `Yearly (${MONTH_LABELS[task.custom_month - 1]} ${task.custom_monthday})`;
  }
  if (schedule === "weekday_of_month" && task.custom_weekday != null && task.custom_week_of_month != null) {
    const ord = WEEK_ORDINAL_LABELS[task.custom_week_of_month - 1] ?? `${task.custom_week_of_month}th`;
    return `${ord} ${WEEKDAY_LABELS[task.custom_weekday]}`;
  }
  return "Custom";
}
