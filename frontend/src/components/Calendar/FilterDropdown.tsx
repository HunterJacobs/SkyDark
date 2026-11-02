import { useState, useRef, useEffect } from "react";
import type { FamilyMember } from "../../types/calendar";
import Toggle from "../Common/Toggle";

interface FilterDropdownProps {
  familyMembers: FamilyMember[];
  /** Whether to show tasks progress in the calendar header. */
  tasksProgress?: boolean;
  onTasksProgressChange?: (value: boolean) => void;
  /** "Select all" for events (show all members' events). */
  eventsSelectAll?: boolean;
  onEventsSelectAllChange?: (value: boolean) => void;
  /** Per-member visibility for events. */
  memberVisibility?: Record<string, boolean>;
  onMemberVisibilityChange?: (memberId: string, visible: boolean) => void;
  onEditMember?: (member: FamilyMember) => void;
  /** Anchor: the Filter button element or null to use internal state for open. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function FilterDropdown({
  familyMembers,
  eventsSelectAll = true,
  onEventsSelectAllChange,
  memberVisibility = {},
  onMemberVisibilityChange,
  onEditMember,
  open: controlledOpen,
  onOpenChange,
}: FilterDropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setOpen]);

  const getMemberVisible = (id: string) => memberVisibility[id] ?? true;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`btn-ghost gap-1.5 ${
          open ? "bg-skydark-accent-bg text-skydark-accent hover:bg-skydark-accent-bg" : ""
        }`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Filter calendar"
      >
        <FilterIcon className="w-4 h-4" />
        Filter
        <span className="text-xs opacity-80">▼</span>
      </button>
      {open && (
        <div
          className="fixed left-3 right-3 top-36 sm:absolute sm:top-full sm:left-auto sm:right-0 mt-1 py-3 bg-white rounded-2xl shadow-skydark-modal border border-gray-100 z-50 min-w-[280px]"
          role="group" aria-label="Calendar filters"
        >
          <div className="px-4 pt-3">
            <div className="text-sm font-semibold text-skydark-text mb-2">Events</div>
            <div className="flex items-center justify-between gap-4 mb-3">
              <span className="text-sm font-medium text-skydark-text flex items-center gap-2">
                <GroupIcon className="w-4 h-4 text-skydark-text-secondary" />
                Select All
              </span>
              <Toggle
                checked={eventsSelectAll}
                onChange={(v) => onEventsSelectAllChange?.(v)}
                aria-label="Select all events"
              />
            </div>
            <div className="space-y-1">
              {familyMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 py-2 px-2 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                      style={{ backgroundColor: member.color }}
                    >
                      {member.initial ?? member.name.charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-skydark-text truncate">{member.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onEditMember && (
                      <button
                        type="button"
                        onClick={() => onEditMember(member)}
                        className="btn-icon w-9 h-9"
                        aria-label={`Edit ${member.name}`}
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    )}
                    <Toggle
                      checked={getMemberVisible(member.id)}
                      onChange={(v) => onMemberVisibilityChange?.(member.id, v)}
                      aria-label={`Show ${member.name}'s events`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function GroupIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
