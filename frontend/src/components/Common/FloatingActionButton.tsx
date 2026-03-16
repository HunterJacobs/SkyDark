import { useState, ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FABItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

interface FloatingActionButtonProps {
  items: FABItem[];
}

export default function FloatingActionButton({ items }: FloatingActionButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(orientation: portrait)");
    const updateOrientation = () => setIsPortrait(mediaQuery.matches);
    updateOrientation();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateOrientation);
      return () => mediaQuery.removeEventListener("change", updateOrientation);
    }
    mediaQuery.addListener(updateOrientation);
    return () => mediaQuery.removeListener(updateOrientation);
  }, []);

  return (
    <div
      className={`fixed right-6 sm:right-8 z-30 flex flex-col-reverse items-end gap-2 ${
        isPortrait ? "bottom-24" : "bottom-8"
      }`}
    >
      <AnimatePresence>
        {open &&
          items.map((item, i) => (
            <motion.button
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: i * 0.05 }}
              type="button"
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-skydark hover:shadow-skydark-hover text-skydark-text text-sm font-medium"
            >
              {item.icon}
              {item.label}
            </motion.button>
          ))}
      </AnimatePresence>
      <motion.button
        type="button"
        onClick={() => (items.length === 1 ? items[0].onClick() : setOpen((o) => !o))}
        className="flex items-center justify-center w-14 h-14 rounded-full bg-skydark-accent text-white shadow-fab hover:opacity-90"
        aria-label={items.length === 1 ? (items[0].label ?? "Add") : open ? "Close menu" : "Add"}
        animate={{ rotate: open ? 45 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <span className="text-2xl leading-none">+</span>
      </motion.button>
    </div>
  );
}
