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
      className="flex-shrink-0 w-full md:w-44 border-b md:border-b-0 md:border-r border-gray-200 bg-white/80 p-2 md:py-6"
      aria-label="Settings navigation"
    >
      <h2 className="text-base font-semibold text-skydark-text mb-1 text-left">Settings</h2>
      <nav className="mt-2 flex md:flex-col gap-1 items-start w-full overflow-x-auto" aria-label="Settings sections">
        {navItems.map(({ id, label, Icon }) => {
          const isActive = activeId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              className={`
                flex items-center gap-2 shrink-0 md:w-full min-h-11 rounded-lg py-2.5 pl-3 pr-3 text-left text-sm font-medium transition-colors justify-start
                ${isActive
                  ? "bg-skydark-accent-bg text-skydark-accent"
                  : "text-skydark-text-secondary hover:bg-gray-100 hover:text-skydark-text"}
              `}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="shrink-0 text-inherit" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
