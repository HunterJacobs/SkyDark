import { NavLink } from "react-router-dom";
import { navItems } from "./Sidebar";

export default function MobileNav() {
  return (
    <nav
      className="flex md:hidden items-center gap-1 px-3 py-2 overflow-x-auto border-b border-gray-200 bg-white shrink-0"
      aria-label="Main navigation"
    >
      {navItems.map(({ path, label, Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? "bg-[rgba(59,155,191,0.1)] text-skydark-accent"
                : "text-skydark-text-secondary hover:bg-gray-100"
            }`
          }
          aria-label={label}
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
