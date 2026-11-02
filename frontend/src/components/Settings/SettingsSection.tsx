/**
 * Content section for Settings (e.g. "General", "Calendar").
 * Renders a section title and optional icon; children are the setting rows.
 */

import { ReactNode } from "react";

interface SettingsSectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export default function SettingsSection({ title, icon, children }: SettingsSectionProps) {
  return (
    <section className="mb-6" aria-labelledby={`section-${title.replace(/\s/g, "-")}`}>
      <h3
        id={`section-${title.replace(/\s/g, "-")}`}
        className="text-sm font-semibold uppercase tracking-wide text-skydark-text-secondary mb-2 px-1 flex items-center gap-2"
      >
        {icon}
        <span>{title}</span>
      </h3>
      <div className="rounded-card-lg bg-white shadow-skydark px-4 sm:px-5 py-1">{children}</div>
    </section>
  );
}

/** Single setting row: label (and optional icon) left, control right. */
interface SettingRowProps {
  label: string;
  icon?: ReactNode;
  value?: ReactNode;
  control: ReactNode;
}

export function SettingRow({ label, icon, value, control }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 min-h-[56px] py-2.5 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <span className="shrink-0 text-skydark-text-secondary">{icon}</span>}
        <div className="min-w-0">
          <span className="text-sm font-medium text-skydark-text">{label}</span>
          {value != null && (
            <span className="block text-xs text-skydark-text-secondary mt-0.5">{value}</span>
          )}
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
