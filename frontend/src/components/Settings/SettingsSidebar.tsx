/**
 * Left sidebar for Settings sub-navigation (General, Calendar, Photos, Reminders).
 * Matches Skydark two-column settings layout.
 */

import {
  GeneralIcon,
  CalendarSettingsIcon,
  DisplayIcon,
  LockIcon,
  DeveloperIcon,
} from "./SettingsIcons";

export type SettingsSectionId = "general" | "calendar" | "display" | "lock" | "developer";

interface NavItem {
  id: SettingsSectionId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: "general", label: "General", Icon: GeneralIcon },
  { id: "calendar", label: "Calendar", Icon: CalendarSettingsIcon },
  { id: "display", label: "Display", Icon: DisplayIcon },
  { id: "lock", label: "Lock", Icon: LockIcon },
  { id: "developer", label: "Developer", Icon: DeveloperIcon },
];

interface SettingsSidebarProps {
  activeId: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}

export default function SettingsSidebar({ activeId, onSelect }: SettingsSidebarProps) {
  return (
    <aside
      className="flex-shrink-0 w-full md:w-48 border-b md:border-b-0 md:border-r border-gray-200 bg-white/80 px-2 py-2 md:py-6"
      aria-label="Settings navigation"
    >
      <h2 className="hidden md:block text-base font-semibold text-skydark-text mb-1 px-3 text-left">Settings</h2>
      {/* Phones: all five sections fit in one row (icon over label) instead of a clipped scroller. */}
      <nav className="md:mt-2 grid grid-cols-5 md:flex md:flex-col gap-1 w-full" aria-label="Settings sections">
        {navItems.map(({ id, label, Icon }) => {
          const isActive = activeId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`
                flex flex-col md:flex-row items-center gap-1 md:gap-2 min-w-0 md:w-full min-h-11 rounded-lg py-2 md:py-2.5 px-1 md:px-3 text-[11px] md:text-sm font-medium transition-colors justify-center md:justify-start
                ${isActive
                  ? "bg-skydark-accent-bg text-skydark-accent"
                  : "text-skydark-text-secondary hover:bg-gray-100 hover:text-skydark-text"}
              `}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="shrink-0 text-inherit" />
              <span className="truncate max-w-full">{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
