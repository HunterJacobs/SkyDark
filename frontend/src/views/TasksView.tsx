import { useState, useMemo } from "react";
import PersonColumn from "../components/Tasks/PersonColumn";
import TaskModal from "../components/Tasks/TaskModal";
import FloatingActionButton from "../components/Common/FloatingActionButton";
import Toggle from "../components/Common/Toggle";
import PinPrompt from "../components/Common/PinPrompt";
import { useAppContext } from "../contexts/AppContext";
import { useSkydarkDataContext } from "../contexts/SkydarkDataContext";
import { usePinGate } from "../hooks/usePinGate";
import { serviceCompleteTask, serviceAddTask, serviceUpdateTask } from "../lib/skyDarkApi";
import type { Task } from "../types/tasks";
import { isDueToday, isLateInLastWeek, formatWeekdays, formatCustomSchedule } from "../types/tasks";

type ChoresTabId = "byPerson" | "allChores";
type ViewFilterId = "all" | "daily" | "weekly" | "custom";

const MOCK_TASKS: Task[] = [
  { id: "t1", title: "Load dishwasher", assignee_id: "1", frequency: "daily", category: "chores", points: 5 },
  { id: "t2", title: "Litter Box", assignee_id: "1", frequency: "daily", points: 3 },
  { id: "t3", title: "Put away laundry", assignee_id: "2", frequency: "daily", points: 10, completed_date: new Date().toISOString().slice(0, 10) },
];
const todayStr = () => new Date().toISOString().slice(0, 10);

function skydarkTasksToTasks(rows: { id: string; title: string; assignee_id: string; category?: string | null; frequency?: string | null; icon?: string | null; points?: number; completed_date?: string | null; due_date?: string | null; weekdays?: number[] | null }[]): Task[] {
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    assignee_id: t.assignee_id,
    category: t.category ?? undefined,
    frequency: t.frequency ?? "daily",
    icon: t.icon ?? undefined,
    points: t.points ?? 0,
    completed_date: t.completed_date ?? null,
    due_date: t.due_date ?? null,
    weekdays: t.weekdays ?? undefined,
  }));
}

export default function TasksView() {
  const skydark = useSkydarkDataContext();
  const { familyMembers } = useAppContext();
  const { runIfUnlocked, pinPromptProps } = usePinGate();
  const [hideCompleted, setHideCompleted] = useState(false);
  const [localTasks, setLocalTasks] = useState<Task[]>(MOCK_TASKS);
  const [activeTab, setActiveTab] = useState<ChoresTabId>("byPerson");
  const [viewFilter, setViewFilter] = useState<ViewFilterId>("all");
  const [showWeeklyChores, setShowWeeklyChores] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const serverTasks = skydark?.data?.connection ? skydarkTasksToTasks(skydark.data.tasks ?? []) : [];
  const tasks = skydark?.data?.connection ? serverTasks : localTasks;

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          isDueToday(t) ||
          isLateInLastWeek(t) ||
          (showWeeklyChores && t.frequency === "weekly")
      ),
    [tasks, showWeeklyChores]
  );

  const visibleTasksForTable = useMemo(
    () =>
      tasks.filter(
        (t) =>
          isDueToday(t) ||
          (showWeeklyChores && t.frequency === "weekly")
      ),
    [tasks, showWeeklyChores]
  );

  const filteredTasksForTable = useMemo(
    () =>
      viewFilter === "all"
        ? visibleTasksForTable
        : visibleTasksForTable.filter((t) => t.frequency === viewFilter),
    [visibleTasksForTable, viewFilter]
  );

  const handleToggle = (taskId: string) => {
    runIfUnlocked("completeChores", async () => {
      const conn = skydark?.data?.connection;
      const task = tasks.find((t) => t.id === taskId);
      const today = todayStr();
      const isCompleting = !task?.completed_date;
      if (conn && task) {
        try {
          await serviceCompleteTask(conn, {
            task_id: taskId,
            completed_date: isCompleting ? today : undefined,
            points: isCompleting ? (task.points ?? 0) : 0,
          });
          await skydark?.refetch();
        } catch {
          // leave UI as-is; refetch could be used to revert
        }
      } else {
        setLocalTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, completed_date: t.completed_date ? null : today } : t
          )
        );
      }
    });
  };

  const requestOpenTaskModal = (action: "add" | { edit: Task }) => {
    runIfUnlocked("addChores", () => {
      if (action === "add") {
        setEditingTask(null);
        setTaskModalOpen(true);
      } else {
        setEditingTask(action.edit);
        setTaskModalOpen(true);
      }
    });
  };

  const handleDeleteTask = (taskId: string) => {
    if (skydark?.data?.connection) return; // no delete_task service yet
    setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
    setTaskModalOpen(false);
    setEditingTask(null);
  };

  const requestDeleteTask = (taskId: string) => {
    runIfUnlocked("deleteChores", () => handleDeleteTask(taskId));
  };

  const handleSaveTask = async (data: Partial<Task> & { id?: string }) => {
    const conn = skydark?.data?.connection;
    const points = typeof data.points === "number" ? data.points : 0;
    if (conn && data.title && data.assignee_id) {
      try {
        if (data.id) {
          await serviceUpdateTask(conn, {
            task_id: data.id,
            title: data.title,
            assignee_id: data.assignee_id,
            category: data.category,
            frequency: data.frequency,
            icon: data.icon,
            points,
            due_date: data.due_date ?? undefined,
          });
        } else {
          await serviceAddTask(conn, {
            title: data.title,
            assignee_id: data.assignee_id,
            category: data.category,
            frequency: data.frequency ?? "daily",
            icon: data.icon,
            points,
            due_date: data.due_date ?? undefined,
          });
        }
        await skydark?.refetch();
      } catch {
        // leave UI as-is; refetch could revert
      }
    } else if (!conn) {
      if (data.id) {
        setLocalTasks((prev) =>
          prev.map((t) => (t.id === data.id ? { ...t, ...data, points } : t))
        );
      } else {
        setLocalTasks((prev) => [
          ...prev,
          { ...data, id: `t${Date.now()}`, completed_date: null, points } as Task,
        ]);
      }
    }
    setTaskModalOpen(false);
    setEditingTask(null);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-skydark-text">Chores</h2>
        <div className="flex items-center gap-4">
          {activeTab === "allChores" && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-skydark-text-secondary">Show:</span>
              <select
                value={viewFilter}
                onChange={(e) => setViewFilter(e.target.value as ViewFilterId)}
                className="input-skydark py-1.5 text-sm min-w-[100px]"
                aria-label="Filter by frequency"
              >
                <option value="all">All</option>
                <option value="daily">Daily only</option>
                <option value="weekly">Weekly only</option>
                <option value="custom">Custom only</option>
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-skydark-text-secondary">Show weekly chores</span>
            <Toggle checked={showWeeklyChores} onChange={setShowWeeklyChores} aria-label="Show weekly chores" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-skydark-text-secondary">Hide completed</span>
            <Toggle checked={hideCompleted} onChange={setHideCompleted} aria-label="Hide completed tasks" />
          </div>
        </div>
      </div>

      <div className="flex gap-0 border-b border-gray-200 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab("byPerson")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "byPerson"
              ? "text-skydark-accent border-b-2 border-skydark-accent bg-[rgba(59,155,191,0.06)]"
              : "text-skydark-text-secondary hover:text-skydark-text hover:bg-gray-50"
          }`}
        >
          By person
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("allChores")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "allChores"
              ? "text-skydark-accent border-b-2 border-skydark-accent bg-[rgba(59,155,191,0.06)]"
              : "text-skydark-text-secondary hover:text-skydark-text hover:bg-gray-50"
          }`}
        >
          All chores
        </button>
      </div>

      {activeTab === "byPerson" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 flex-1 min-h-0 overflow-y-auto">
          {familyMembers.map((member) => {
            const memberTasks = visibleTasks.filter((t) => t.assignee_id === member.id);
            const completedCount = memberTasks.filter((t) => t.completed_date).length;
            return (
              <PersonColumn
                key={member.id}
                member={member}
                tasks={memberTasks}
                completedCount={completedCount}
                onToggleTask={handleToggle}
                onEditTask={(t) => requestOpenTaskModal({ edit: t })}
                onDeleteTask={requestDeleteTask}
                hideCompleted={hideCompleted}
              />
            );
          })}
        </div>
      )}

      {activeTab === "allChores" && (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse bg-white rounded-card shadow-skydark overflow-hidden min-w-[700px]">
            <thead>
              <tr className="bg-skydark-bg border-b border-gray-200">
                <th className="text-left p-3 text-skydark-text-secondary font-medium">Chore</th>
                <th className="text-left p-3 text-skydark-text-secondary font-medium">Assigned to</th>
                <th className="text-left p-3 text-skydark-text-secondary font-medium">Frequency</th>
                <th className="text-left p-3 text-skydark-text-secondary font-medium">Days</th>
                <th className="text-left p-3 text-skydark-text-secondary font-medium w-16">Points</th>
                <th className="text-left p-3 text-skydark-text-secondary font-medium">Status</th>
                <th className="text-left p-3 text-skydark-text-secondary font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasksForTable.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-skydark-text-secondary">
                    No chores match the current filter.
                  </td>
                </tr>
              ) : (
                filteredTasksForTable.map((task) => {
                  const member = familyMembers.find((m) => m.id === task.assignee_id);
                  const dueToday = isDueToday(task);
                  const completedToday = task.completed_date === todayStr();
                  return (
                    <tr
                      key={task.id}
                      className="border-b border-gray-100 hover:bg-gray-50 align-middle"
                    >
                      <td className="p-3">
                        <span className="font-medium text-skydark-text">{task.icon && `${task.icon} `}{task.title}</span>
                      </td>
                      <td className="p-3">
                        {member ? (
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                              style={{ backgroundColor: member.color }}
                            >
                              {member.initial || member.name[0]}
                            </span>
                            {member.name}
                          </span>
                        ) : (
                          <span className="text-skydark-text-secondary">—</span>
                        )}
                      </td>
                      <td className="p-3 text-skydark-text capitalize">{task.frequency}</td>
                      <td className="p-3 text-skydark-text-secondary">
                        {task.frequency === "weekly"
                          ? formatWeekdays(task.weekdays) || "—"
                          : task.frequency === "daily"
                            ? "Daily"
                            : task.frequency === "custom"
                              ? formatCustomSchedule(task) || "—"
                              : "—"}
                      </td>
                      <td className="p-3">{task.points}</td>
                      <td className="p-3">
                        <span className={
                          completedToday ? "text-green-600 font-medium" : dueToday ? "text-skydark-accent" : ""
                        }>
                          {completedToday ? "Done" : dueToday ? "Due today" : "—"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggle(task.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-colors"
                            style={{
                              borderColor: member?.color ?? "#ccc",
                              backgroundColor: completedToday ? "#9EE5CC" : "white",
                            }}
                            aria-label={completedToday ? "Mark incomplete" : "Mark complete"}
                          >
                            {completedToday && <span className="text-white text-sm font-bold">✓</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => requestOpenTaskModal({ edit: task })}
                            className="px-2 py-1.5 rounded-lg text-sm text-skydark-text-secondary hover:bg-gray-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteTask(task.id)}
                            className="px-2 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <TaskModal
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
        task={editingTask}
        familyMembers={familyMembers}
        onSave={handleSaveTask}
        onDelete={requestDeleteTask}
      />

      <FloatingActionButton
        items={[
          {
            label: "Add chore",
            icon: <span>✓</span>,
            onClick: () => requestOpenTaskModal("add"),
          },
        ]}
      />

      <PinPrompt {...pinPromptProps} />
    </div>
  );
}
