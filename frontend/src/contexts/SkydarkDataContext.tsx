/**
 * Provides HA WebSocket-backed SkyDark data (events, tasks, lists, meals, family, config)
 * and refetch/mutation helpers. Wrap app so views and AppContext can consume it.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useSkydarkData } from "../hooks/useSkydarkData";
import type { SkydarkDataState } from "../hooks/useSkydarkData";

interface SkydarkDataContextValue {
  data: SkydarkDataState;
  refetch: () => Promise<void>;
  refetchEvents: (startDate?: string, endDate?: string) => Promise<void>;
  refetchMeals: (startDate?: string, endDate?: string) => Promise<void>;
  refetchRecipes: () => Promise<void>;
}

const SkydarkDataContext = createContext<SkydarkDataContextValue | null>(null);

export function SkydarkDataProvider({ children }: { children: ReactNode }) {
  const value = useSkydarkData();
  return (
    <SkydarkDataContext.Provider
      value={{
        data: value.data,
        refetch: value.refetch,
        refetchEvents: value.refetchEvents,
        refetchMeals: value.refetchMeals,
        refetchRecipes: value.refetchRecipes,
      }}
    >
      {children}
    </SkydarkDataContext.Provider>
  );
}

export function useSkydarkDataContext(): SkydarkDataContextValue | null {
  return useContext(SkydarkDataContext);
}
