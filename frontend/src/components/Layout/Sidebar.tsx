import { NavLink } from "react-router-dom";
import {
  CalendarIcon,
  ListsIcon,
  CheckIcon,
  StarIcon,
  MealsIcon,
  PhotosIcon,
  SettingsIcon,
} from "./SidebarIcons";
import skydarkLogo from "../../assets/skydark-logo.png";

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

export default function Sidebar() {
  return (
    <aside
      className="hidden md:flex flex-col items-center py-4 flex-shrink-0 border-r border-gray-200 bg-white w-20"
      style={{ width: 80 }}
      aria-label="Main navigation"
    >
      <div className="mb-4 flex items-center justify-center" aria-hidden>
        <img src={skydarkLogo} alt="" className="w-10 h-10 rounded-full object-cover" />
      </div>
      <nav className="flex flex-col items-center gap-1 w-full" aria-label="Main">
        {navItems.map(({ path, label, Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center justify-center w-12 h-12 rounded-full transition-colors ${
                isActive
                  ? "bg-[rgba(59,155,191,0.1)] text-skydark-accent"
                  : "text-skydark-text-secondary hover:bg-gray-100"
              }`
            }
            title={label}
            aria-label={label}
          >
            <Icon />
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
