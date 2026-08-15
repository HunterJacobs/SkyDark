import { useState, useEffect } from "react";
import { useAppContext } from "../../contexts/AppContext";
import PinPrompt from "../Common/PinPrompt";
import { useWeeklyWeather, getWeatherIcon } from "../../hooks/useWeeklyWeather";

interface HeaderProps {
  weatherEntity?: string;
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function UnlockIcon({ className }: { className?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 019.9-1" />
    </svg>
  );
}

export default function Header({
  weatherEntity: _weatherEntity,
}: HeaderProps) {
  const [time, setTime] = useState("");
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const { settings, isLocked, unlockApp, setIsLocked } = useAppContext();
  const familyName = settings.familyName?.trim() || "My Family";
  const week = useWeeklyWeather();
  const todayWeather = week[0];

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-skydark-bg gap-4"
      style={{ minHeight: 80 }}
    >
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold text-skydark-text truncate">
          {familyName}
        </h1>
        <span className="text-sm sm:text-base text-skydark-text-secondary shrink-0">{time}</span>
        {todayWeather && (
          <span className="text-sm sm:text-base text-skydark-text-secondary shrink-0 inline-flex items-center gap-1">
            <span aria-hidden>{getWeatherIcon(todayWeather.condition)}</span>
            {Math.round(todayWeather.tempMax)}°
          </span>
        )}
      </div>
      {settings.lockEnabled && (
        <div className="flex items-center shrink-0">
          {isLocked ? (
            <button
              type="button"
              onClick={() => setShowUnlockPrompt(true)}
              className="p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-skydark-accent"
              aria-label="Unlock (enter PIN)"
            >
              <LockIcon className="w-6 h-6 text-red-500" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsLocked(true)}
              className="p-2 rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-skydark-accent"
              aria-label="Lock"
            >
              <UnlockIcon className="w-6 h-6 text-green-500" />
            </button>
          )}
        </div>
      )}
      <PinPrompt
        open={showUnlockPrompt}
        onClose={() => setShowUnlockPrompt(false)}
        onVerify={(pin) => unlockApp(pin)}
        title="Enter PIN to unlock"
      />
    </header>
  );
}
