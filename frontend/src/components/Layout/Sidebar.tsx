import { useState } from "react";
import Modal from "../Common/Modal";
import { NavLink } from "react-router-dom";
import {
  LogoIcon,
  CalendarIcon,
  ListsIcon,
  CheckIcon,
  StarIcon,
  MealsIcon,
  PhotosIcon,
  SettingsIcon,
} from "./SidebarIcons";

function ShoppingIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

export const navItems = [
  { path: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { path: "/lists", label: "Lists", Icon: ListsIcon },
  { path: "/tasks", label: "Chores", Icon: CheckIcon },
  { path: "/rewards", label: "Rewards", Icon: StarIcon },
  { path: "/meals", label: "Meals", Icon: MealsIcon },
  { path: "/shopping", label: "Meal Prep", Icon: ShoppingIcon },
  { path: "/photos", label: "Photos", Icon: PhotosIcon },
  { path: "/settings", label: "Settings", Icon: SettingsIcon },
];

export default function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const [moreOpen, setMoreOpen] = useState(false);
  // Desktop/tablet rail: icon with a short label underneath, so nothing is a guessing game.
  const nav = (
    <div className="flex flex-col items-center gap-1 w-full px-2">
      {navItems.map(({ path, label, Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            `w-full flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors ${
              isActive
                ? "bg-skydark-accent-bg text-skydark-accent"
                : "text-skydark-text-secondary hover:bg-gray-100 hover:text-skydark-text"
            }`
          }
        >
          <Icon />
          <span className="text-[11px] font-medium leading-tight text-center">{label}</span>
        </NavLink>
      ))}
    </div>
  );

  if (mobile) {
    const primary = navItems.filter(({ path }) => ["/calendar", "/tasks", "/lists", "/meals"].includes(path));
    return (
      <>
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 bg-white pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))] grid grid-cols-5" aria-label="Mobile navigation">
          {primary.map(({ path, label, Icon }) => (
            <NavLink key={path} to={path} className={({ isActive }) => `min-h-[56px] min-w-0 flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${isActive ? "text-skydark-accent bg-skydark-accent-bg" : "text-skydark-text-secondary"}`}>
              <Icon /><span>{label}</span>
            </NavLink>
          ))}
          <button className="min-h-[56px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} aria-label="More navigation">
            <span className="text-xl leading-6" aria-hidden>•••</span><span>More</span>
          </button>
        </nav>
        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
          <nav className="grid grid-cols-2 gap-3" aria-label="More navigation">
            {navItems.filter(item => !primary.includes(item)).map(({ path, label, Icon }) => (
              <NavLink key={path} to={path} onClick={() => setMoreOpen(false)} className="min-h-[80px] rounded-xl bg-skydark-bg flex flex-col items-center justify-center gap-2 font-medium"><Icon />{label}</NavLink>
            ))}
          </nav>
        </Modal>
      </>
    );
  }

  return (
    <aside
      className="hidden md:flex flex-col items-center py-4 flex-shrink-0 border-r border-gray-200 bg-white w-[88px] overflow-y-auto"
      aria-label="Main navigation"
    >
      <div className="mb-4 flex items-center justify-center text-skydark-accent" aria-hidden>
        <LogoIcon className="w-8 h-8" />
      </div>
      {nav}
    </aside>
  );
}
