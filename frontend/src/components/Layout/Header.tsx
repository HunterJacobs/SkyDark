import { useState, useEffect } from "react";
import { useAppContext } from "../../contexts/AppContext";
import PinPrompt from "../Common/PinPrompt";
import { useWeatherData, getWeatherIcon } from "../../hooks/useWeeklyWeather";

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
  const weather = useWeatherData();
  const currentWeather = weather.current;
  const familyName = settings.familyName?.trim() || "My Family";

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
      className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-skydark-bg"
      style={{ minHeight: 80 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-wrap">
          <h1 className="text-lg sm:text-xl font-semibold text-skydark-text truncate">
            {familyName}
          </h1>
          <span className="text-base sm:text-lg font-semibold text-skydark-text shrink-0 tabular-nums">
            {time}
          </span>
          {weather.locationLabel && (
            <span className="text-sm sm:text-base font-medium text-skydark-text-secondary shrink-0">
              {weather.locationLabel}
            </span>
          )}
          <span className="text-base sm:text-lg font-semibold text-skydark-text shrink-0">
            {currentWeather
              ? `${getWeatherIcon(currentWeather.condition)} ${currentWeather.temperature}°`
              : "Weather"}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 min-w-0">
          {settings.showTopWeeklyForecast && weather.weekly.length > 0 && (
            <div
              className="flex items-center gap-2 overflow-x-auto pb-1 max-w-[52vw]"
              aria-label="Top weekly forecast"
            >
              {weather.weekly.slice(0, 7).map((day) => (
                <div
                  key={day.dayLabel}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 min-w-[86px] text-center"
                >
                  <div className="text-[11px] font-medium text-skydark-text-secondary">{day.dayLabel}</div>
                  <div className="text-sm">{getWeatherIcon(day.condition)}</div>
                  <div className="text-[11px] text-skydark-text">
                    {day.tempMin}° / {day.tempMax}°
                  </div>
                </div>
              ))}
            </div>
          )}
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
        </div>
      </div>
      <PinPrompt
        open={showUnlockPrompt}
        onClose={() => setShowUnlockPrompt(false)}
        onVerify={(pin) => unlockApp(pin)}
        title="Enter PIN to unlock"
      />
    </header>
  );
}
