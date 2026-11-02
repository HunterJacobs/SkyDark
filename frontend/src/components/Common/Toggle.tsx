/**
 * Toggle switch built on Radix UI Switch (accessible, keyboard and screen-reader friendly).
 *
 * Geometry: 48×28 track, 24px thumb inset 2px on every side, so the thumb
 * travels exactly 20px. The visible switch stays compact, but an invisible
 * ::before layer extends the touch target to 44px+ for tablets.
 */

import * as Switch from "@radix-ui/react-switch";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export default function Toggle({
  checked,
  onChange,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: ToggleProps) {
  return (
    <Switch.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      data-toggle
      className="
        group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5
        bg-gray-300 transition-colors duration-200 ease-out
        hover:bg-gray-400 data-[state=checked]:bg-skydark-accent data-[state=checked]:hover:bg-skydark-accent-dark
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-skydark-accent focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        cursor-pointer
        before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']
      "
    >
      <Switch.Thumb
        className="
          pointer-events-none block h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]
          transition-transform duration-200 ease-out
          translate-x-0 data-[state=checked]:translate-x-5
          group-active:scale-95
        "
      />
    </Switch.Root>
  );
}
