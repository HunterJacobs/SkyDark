import { ReactNode, useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useAppContext } from "../../contexts/AppContext";
import { usePhotosContext } from "../../contexts/PhotosContext";
import { useIdleDetection } from "../../hooks/useIdleDetection";
import { useWeeklyWeather, getWeatherIcon } from "../../hooks/useWeeklyWeather";

function SleepModeTime() {
  const { settings } = useAppContext();
  const [time, setTime] = useState("");
  const scale = settings.screensaverTimeDisplayScale ?? 50;
  const sizeClass =
    scale <= 20 ? "text-2xl" :
    scale <= 40 ? "text-3xl" :
    scale <= 60 ? "text-4xl" :
    scale <= 80 ? "text-5xl" : "text-7xl";

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
    <div
      className={`absolute top-4 right-4 px-4 py-3 rounded-xl bg-black/50 text-white font-medium tabular-nums pointer-events-none ${sizeClass}`}
      aria-live="polite"
    >
      {time}
    </div>
  );
}

function SleepModeWeather() {
  const { settings } = useAppContext();
  const week = useWeeklyWeather();
  const scale = settings.screensaverWeatherDisplayScale ?? 50;
  const transformScale =
    scale <= 50
      ? 0.7 + (scale / 50) * 0.3
      : 1 + ((scale - 50) / 50) * 1;

  return (
    <div
      className="absolute bottom-4 left-1/2 px-4 py-3 rounded-2xl bg-black/50 text-white pointer-events-none"
      style={{
        transform: `translateX(-50%) scale(${transformScale})`,
        transformOrigin: "bottom center",
      }}
      aria-label="Weekly weather forecast"
    >
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {week.map((day) => (
          <div
            key={day.dayLabel}
            className="flex flex-col items-center gap-0.5 min-w-[3rem]"
          >
            <span className="text-xs font-medium opacity-90">{day.dayLabel}</span>
            <span className="text-lg" aria-hidden>
              {getWeatherIcon(day.condition)}
            </span>
            <span className="text-sm font-medium">
              {day.tempMin}° / {day.tempMax}°
            </span>
            <span className="text-xs opacity-80">
              {day.precipitation}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenSaverOverlay() {
  const { settings, screensaverTriggered, setScreensaverTriggered } = useAppContext();
  const { photos } = usePhotosContext();
  const { isIdle, reset } = useIdleDetection(
    settings.screensaverIdleMinutes,
    settings.screensaverEnabled
  );
  const intervalMs =
    (settings.screensaverSlideshowIntervalUnit ?? "seconds") === "minutes"
      ? (settings.screensaverSlideshowIntervalMinutes ?? 1) * 60 * 1000
      : (settings.screensaverSlideshowIntervalSeconds ?? 5) * 1000;
  const durationMs = settings.screensaverTransitionDurationMs ?? 800;
  const transitionType = settings.screensaverTransitionType ?? "fade";

  const [index, setIndex] = useState(0);
  const [visibleLayer, setVisibleLayer] = useState(0);
  const transitionEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isIdle && !screensaverTriggered) return;
    if (photos.length === 0) return;
    const id = setInterval(() => {
      if (photos.length <= 1) return;
      if (transitionType === "none") {
        setIndex((i) => (i + 1) % photos.length);
        return;
      }
      setVisibleLayer((v) => 1 - v);
      transitionEndRef.current = setTimeout(() => {
        setIndex((i) => (i + 1) % photos.length);
        setVisibleLayer((v) => 1 - v);
        transitionEndRef.current = null;
      }, durationMs);
    }, intervalMs);
    return () => {
      clearInterval(id);
      if (transitionEndRef.current) clearTimeout(transitionEndRef.current);
    };
  }, [isIdle, screensaverTriggered, photos.length, intervalMs, durationMs, transitionType]);

  useEffect(() => {
    if ((isIdle || screensaverTriggered) && photos.length > 0) {
      setIndex(0);
      setVisibleLayer(0);
    }
  }, [isIdle, screensaverTriggered]);

  const show = photos.length > 0 && ((isIdle && settings.screensaverEnabled) || screensaverTriggered);
  const currentPhoto = photos[index];
  const nextIndex = (index + 1) % photos.length;
  const nextPhoto = photos[nextIndex];
  const transitionStyle = { transition: `opacity ${durationMs}ms ease-in-out` };
  const slideStyle = { transition: `transform ${durationMs}ms ease-in-out` };

  const dismiss = () => {
    if (transitionEndRef.current) clearTimeout(transitionEndRef.current);
    transitionEndRef.current = null;
    reset();
    setScreensaverTriggered(false);
  };

  if (!show) return null;

  const singleImage = transitionType === "none" || photos.length === 1;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
      onClick={dismiss}
      onKeyDown={(e) => { if (e.key === "Escape") dismiss(); }}
      role="button"
      tabIndex={0}
      aria-label="Screen saver active, click to exit"
    >
      {singleImage ? (
        <img
          src={currentPhoto?.url}
          alt={currentPhoto?.caption || "Slideshow"}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />
      ) : transitionType === "fade" ? (
        <>
          <img
            src={currentPhoto?.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ ...transitionStyle, opacity: visibleLayer === 0 ? 1 : 0 }}
            draggable={false}
            aria-hidden
          />
          <img
            src={nextPhoto?.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{ ...transitionStyle, opacity: visibleLayer === 1 ? 1 : 0 }}
            draggable={false}
            aria-hidden
          />
          <img
            src={visibleLayer === 0 ? currentPhoto?.url : nextPhoto?.url}
            alt={currentPhoto?.caption || nextPhoto?.caption || "Slideshow"}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none sr-only"
            draggable={false}
          />
        </>
      ) : (
        <>
          <img
            src={currentPhoto?.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{
              ...slideStyle,
              transform: visibleLayer === 0 ? "translateX(0)" : "translateX(-100%)",
            }}
            draggable={false}
            aria-hidden
          />
          <img
            src={nextPhoto?.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={{
              ...slideStyle,
              transform: visibleLayer === 1 ? "translateX(0)" : "translateX(100%)",
            }}
            draggable={false}
            aria-hidden
          />
          <img
            src={visibleLayer === 0 ? currentPhoto?.url : nextPhoto?.url}
            alt={currentPhoto?.caption || nextPhoto?.caption || "Slideshow"}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none sr-only"
            draggable={false}
          />
        </>
      )}
      <SleepModeTime />
      <SleepModeWeather />
    </div>
  );
}

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { pathname } = useLocation();
  const { settings, isLocked, setIsLocked } = useAppContext();
  const { isIdle } = useIdleDetection(
    settings.autoRelockMinutes,
    !!(settings.lockEnabled && !isLocked && settings.autoRelockEnabled)
  );

  useEffect(() => {
    if (isIdle) setIsLocked(true);
  }, [isIdle, setIsLocked]);

  const isCalendar = pathname.includes("calendar");
  return (
    <div
      className={`flex bg-skydark-bg font-sans text-skydark-text max-w-full ${
        isCalendar ? "h-screen overflow-hidden" : "min-h-screen"
      }`}
    >
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
        <Header />
        <main
          className={`flex-1 p-5 sm:p-6 min-h-0 ${
            isCalendar ? "overflow-hidden" : "overflow-auto"
          }`}
        >
          {children}
        </main>
      </div>
      <ScreenSaverOverlay />
    </div>
  );
}
