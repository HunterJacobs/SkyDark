import { NavLink } from "react-router-dom";
import { navItems } from "./Sidebar";

interface MobileNavProps {
  position?: "top" | "bottom";
  forceVisible?: boolean;
  iconOnly?: boolean;
}

export default function MobileNav({
  position = "top",
  forceVisible = false,
  iconOnly = false,
}: MobileNavProps) {
  const edgeBorderClass = position === "bottom" ? "border-t" : "border-b";
  const visibilityClass = forceVisible ? "flex" : "flex md:hidden";

  return (
    <nav
      className={`${visibilityClass} items-center gap-1 px-2 py-2 overflow-x-auto ${edgeBorderClass} border-gray-200 bg-white shrink-0`}
      aria-label="Main navigation"
    >
      {navItems.map(({ path, label, Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            `${iconOnly ? "flex-1 justify-center px-2" : "px-3"} flex items-center gap-1.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? "bg-[rgba(59,155,191,0.1)] text-skydark-accent"
                : "text-skydark-text-secondary hover:bg-gray-100"
            }`
          }
          aria-label={label}
        >
          <Icon className="w-5 h-5 shrink-0" />
          {!iconOnly && <span>{label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
