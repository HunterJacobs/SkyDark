import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./components/Layout/MainLayout";
import SimulatedViewport from "./components/dev/SimulatedViewport";
import ViewportIndicator from "./components/dev/ViewportIndicator";
import ErrorBoundary from "./components/Common/ErrorBoundary";
import { useViewportSimulator } from "./contexts/ViewportSimulatorContext";
import { useSkydarkDataContext } from "./contexts/SkydarkDataContext";

function ViewErrorFallback() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
      <p className="text-skydark-text">This section failed to load.</p>
      <a href="#/calendar" className="text-skydark-accent font-medium underline">
        Go to Calendar
      </a>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="btn-primary"
      >
        Reload page
      </button>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-skydark-text">Page not found</h2>
      <a href="#/calendar" className="text-skydark-accent font-medium underline">
        Go to Calendar
      </a>
    </div>
  );
}

const CalendarView = lazy(() => import("./views/CalendarView"));
const TasksView = lazy(() => import("./views/TasksView"));
const ListsView = lazy(() => import("./views/ListsView"));
const MealsView = lazy(() => import("./views/MealsView"));
const ShoppingView = lazy(() => import("./views/ShoppingView"));
const PhotosView = lazy(() => import("./views/PhotosView"));
const RewardsView = lazy(() => import("./views/RewardsView"));
const SettingsView = lazy(() => import("./views/SettingsView"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-skydark-text/60">Loading...</div>
    </div>
  );
}

/** Full-screen loading so the app never shows a blank white screen (e.g. in HA while connecting). */
function ConnectionLoadingScreen() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen bg-[#F8FAFB] text-[#2B3A4A]"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
    >
      <div className="animate-pulse text-skydark-accent text-xl font-medium">Loading SkyDark…</div>
      <div className="mt-2 text-sm text-gray-500">Connecting to Home Assistant</div>
    </div>
  );
}

/** Full-screen error when HA connection fails (e.g. auth or network). */
function ConnectionErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen bg-[#F8FAFB] text-[#2B3A4A] p-8 text-center"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}
    >
      <div className="text-6xl mb-4" aria-hidden>⚠️</div>
      <h2 className="text-xl font-semibold mb-2">Could not connect</h2>
      <p className="text-sm text-gray-600 max-w-md mb-6">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="btn-primary"
      >
        Retry
      </button>
    </div>
  );
}

function App() {
  const { developerMode } = useViewportSimulator();
  const skydark = useSkydarkDataContext();

  // Avoid white screen: show loading or connection error before main UI
  if (skydark?.data.loading && !skydark?.data.connection) {
    return <ConnectionLoadingScreen />;
  }
  if (skydark?.data.error) {
    return (
      <ConnectionErrorScreen
        message={skydark.data.error}
        onRetry={() => void skydark.refetch()}
      />
    );
  }

  const content = (
    <MainLayout>
      <ErrorBoundary fallback={<ViewErrorFallback />}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/calendar" replace />} />
            <Route path="/calendar" element={<CalendarView />} />
            <Route path="/tasks" element={<TasksView />} />
            <Route path="/lists" element={<ListsView />} />
            <Route path="/meals" element={<MealsView />} />
            <Route path="/shopping" element={<ShoppingView />} />
            <Route path="/photos" element={<PhotosView />} />
            <Route path="/rewards" element={<RewardsView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  );

  return (
    <>
      {developerMode ? <SimulatedViewport>{content}</SimulatedViewport> : content}
      {developerMode && <ViewportIndicator />}
    </>
  );
}

export default App;
