import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./components/Layout/MainLayout";
import SimulatedViewport from "./components/dev/SimulatedViewport";
import ViewportIndicator from "./components/dev/ViewportIndicator";
import { useViewportSimulator } from "./contexts/ViewportSimulatorContext";

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

function App() {
  const { developerMode } = useViewportSimulator();

  const content = (
    <MainLayout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/calendar" replace />} />
          <Route path="/index.html" element={<Navigate to="/calendar" replace />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/tasks" element={<TasksView />} />
          <Route path="/lists" element={<ListsView />} />
          <Route path="/meals" element={<MealsView />} />
          <Route path="/shopping" element={<ShoppingView />} />
          <Route path="/photos" element={<PhotosView />} />
          <Route path="/rewards" element={<RewardsView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </Suspense>
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
