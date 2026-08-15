import { motion } from "framer-motion";
import type { Task } from "../../types/tasks";
import { formatWeekdays, formatCustomSchedule } from "../../types/tasks";
import { isCompletedToday } from "../../lib/taskSchedule";

function formatDueStatus(dueDate: string): { text: string; isLate: boolean } {
  const due = new Date(dueDate);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffMs < 0) {
    if (diffDays > -1) return { text: `${Math.abs(diffHours)} hours late`, isLate: true };
    if (diffDays > -7) return { text: `${Math.abs(diffDays)} day${diffDays === -1 ? "" : "s"} late`, isLate: true };
    return { text: `${Math.abs(diffDays)} days late`, isLate: true };
  }
  if (diffDays === 0) return { text: "Due today", isLate: false };
  if (diffDays === 1) return { text: "Due tomorrow", isLate: false };
  return { text: `Due in ${diffDays} days`, isLate: false };
}

function formatFrequency(freq: string): string {
  if (freq === "daily") return "Daily";
  if (freq === "weekly") return "Weekly";
  if (freq === "custom") return "Custom";
  return freq.charAt(0).toUpperCase() + freq.slice(1);
}

interface TaskItemProps {
  task: Task;
  color: string;
  onToggle: () => void;
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: string) => void;
}

export default function TaskItem({ task, color, onToggle, onEdit, onDelete }: TaskItemProps) {
  const completed = isCompletedToday(task.completed_date);
  const dueStatus = task.due_date ? formatDueStatus(task.due_date) : null;

  return (
    <motion.li
      layout
      className="flex items-center gap-3 p-3 rounded-card-lg bg-gray-50 hover:bg-gray-100 transition-colors"
      initial={false}
      animate={{ opacity: completed ? 0.7 : 1 }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
        style={{
          borderColor: color,
          backgroundColor: completed ? "#9EE5CC" : "white",
        }}
        aria-label={completed ? "Mark incomplete" : "Mark complete"}
      >
        {completed && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
            className="text-white text-sm font-bold"
          >
            ✓
          </motion.span>
        )}
      </button>
      <button
        type="button"
        onClick={() => onEdit?.(task)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="min-w-0">
          <span
            className={`block truncate font-medium text-skydark-text ${
              completed ? "line-through" : ""
            }`}
          >
            {task.title}
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-skydark-text-secondary">
            <span className="capitalize">
              {formatFrequency(task.frequency)}
              {task.frequency === "weekly" && task.weekdays?.length ? ` (${formatWeekdays(task.weekdays)})` : ""}
              {task.frequency === "custom" && formatCustomSchedule(task) ? ` (${formatCustomSchedule(task)})` : ""}
            </span>
            {task.category && <span>· {task.category}</span>}
            {dueStatus && (
              <span className={dueStatus.isLate ? "text-red-600 font-medium" : ""}>
                {dueStatus.text}
              </span>
            )}
          </div>
        </div>
      </button>
      {task.icon && <span className="text-lg shrink-0">{task.icon}</span>}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-skydark-text-secondary hover:bg-red-50 hover:text-red-600 transition-colors"
          aria-label="Delete task"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </motion.li>
  );
}
