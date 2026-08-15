import { useState } from "react";
import type { FamilyMember } from "../../types/calendar";
import type { Task } from "../../types/tasks";
import { isCompletedToday } from "../../lib/taskSchedule";
import TaskItem from "./TaskItem";

interface PersonColumnProps {
  member: FamilyMember;
  tasks: Task[];
  completedCount: number;
  onToggleTask: (taskId: string) => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  hideCompleted: boolean;
}

export default function PersonColumn({
  member,
  tasks,
  completedCount,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  hideCompleted,
}: PersonColumnProps) {
  const [expanded, setExpanded] = useState(false);
  const total = tasks.length;
  const displayTasks = hideCompleted
    ? tasks.filter((t) => !isCompletedToday(t.completed_date))
    : tasks;
  const visibleTasks = expanded ? displayTasks : displayTasks.slice(0, 5);
  const hasMoreThanFive = displayTasks.length > 5;

  return (
    <div className="flex flex-col flex-1 min-w-[260px] sm:min-w-0 rounded-card-lg bg-white shadow-skydark overflow-hidden">
      <div
        className="p-4 border-b flex items-center gap-3"
        style={{ backgroundColor: `${member.color}40` }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold text-white flex-shrink-0"
          style={{ backgroundColor: member.color }}
        >
          {member.initial || member.name[0]}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-skydark-text truncate">
            {member.name}
          </div>
          <div className="text-sm text-skydark-text-secondary font-medium">
            ✓ {completedCount}/{total}
          </div>
        </div>
      </div>
      <div className="p-3 flex-1 overflow-auto">
        {displayTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-skydark-text-secondary">
            <span className="text-4xl mb-2">😊</span>
            <span className="text-sm">Nothing to do today.</span>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                color={member.color}
                onToggle={() => onToggleTask(task.id)}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
              />
            ))}
          </ul>
        )}
        {hasMoreThanFive && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-sm text-skydark-accent hover:underline font-medium"
              aria-label={expanded ? `Show less chores for ${member.name}` : `Display all chores for ${member.name}`}
            >
              {expanded ? "Show less" : "Display all"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
