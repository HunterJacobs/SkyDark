/**
 * Centralized app state: family members, settings, and PIN auth.
 * Used by Calendar, Tasks, Rewards, Lists, and Settings so all views share the same accounts.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { FamilyMember } from "../types/calendar";
import { useSkydarkDataContext } from "./SkydarkDataContext";

const STORAGE_KEY_MEMBERS = "skydark_family_members";
const STORAGE_KEY_SETTINGS = "skydark_app_settings";
const STORAGE_KEY_AUTH = "skydark_pin_authenticated";

const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: "1", name: "Mom", color: "#FFD4D4", initial: "M" },
  { id: "2", name: "Dad", color: "#C8E6F5", initial: "D" },
  { id: "3", name: "Harper", color: "#C8F5E8", initial: "H" },
  { id: "4", name: "Liam", color: "#FFF4D4", initial: "L" },
];

export interface LockedFeatures {
  addEvents: boolean;
  editDeleteEvents: boolean;
  createLists: boolean;
  deleteLists: boolean;
  addItemsToLists: boolean;
  checkLists: boolean;
  addChores: boolean;
  deleteChores: boolean;
  completeChores: boolean;
  addRewards: boolean;
  claimRewards: boolean;
  meals: boolean;
  mealprep: boolean;
  importPhotos: boolean;
  changeSettings: boolean;
}

const DEFAULT_LOCKED_FEATURES: LockedFeatures = {
  addEvents: false,
  editDeleteEvents: false,
  createLists: false,
  deleteLists: false,
  addItemsToLists: false,
  checkLists: false,
  addChores: false,
  deleteChores: false,
  completeChores: false,
  addRewards: false,
  claimRewards: false,
  meals: false,
  mealprep: false,
  importPhotos: false,
  changeSettings: false,
};

export type LockedFeatureKey = keyof LockedFeatures;

export interface AppSettings {
  familyName: string;
  pinCodeHash?: string;
  lockEnabled: boolean;
  autoRelockEnabled: boolean;
  autoRelockMinutes: number;
  lockedFeatures: LockedFeatures;
  screensaverEnabled: boolean;
  screensaverIdleMinutes: number;
  /** Sleep mode slideshow: "none" | "fade" | "slide" */
  screensaverTransitionType: "none" | "fade" | "slide";
  /** Time between photo changes; unit determines which value is used */
  screensaverSlideshowIntervalUnit: "seconds" | "minutes";
  /** Used when unit is seconds (3-60) */
  screensaverSlideshowIntervalSeconds: number;
  /** Used when unit is minutes (1-10) */
  screensaverSlideshowIntervalMinutes: number;
  /** Transition duration in milliseconds */
  screensaverTransitionDurationMs: number;
  /** Sleep mode time size: 0-100, 50 = current */
  screensaverTimeDisplayScale: number;
  /** Sleep mode weather size: 0-100, 50 = current */
  screensaverWeatherDisplayScale: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  familyName: "My Family",
  lockEnabled: false,
  autoRelockEnabled: false,
  autoRelockMinutes: 5,
  lockedFeatures: DEFAULT_LOCKED_FEATURES,
  screensaverEnabled: false,
  screensaverIdleMinutes: 5,
  screensaverTransitionType: "fade",
  screensaverSlideshowIntervalUnit: "seconds",
  screensaverSlideshowIntervalSeconds: 5,
  screensaverSlideshowIntervalMinutes: 1,
  screensaverTransitionDurationMs: 1200,
  screensaverTimeDisplayScale: 50,
  screensaverWeatherDisplayScale: 50,
};

interface AppState {
  familyMembers: FamilyMember[];
  settings: AppSettings;
  isAuthenticated: boolean;
  isLocked: boolean;
}

interface AppContextValue extends AppState {
  setFamilyMembers: (members: FamilyMember[] | ((prev: FamilyMember[]) => FamilyMember[])) => void;
  addFamilyMember: (member: Omit<FamilyMember, "id">) => FamilyMember;
  updateFamilyMember: (id: string, updates: Partial<FamilyMember>) => void;
  removeFamilyMember: (id: string) => void;
  setSettings: (settings: Partial<AppSettings>) => void;
  setAuthenticated: (value: boolean) => void;
  verifyPin: (pin: string) => boolean;
  screensaverTriggered: boolean;
  setScreensaverTriggered: (value: boolean) => void;
  setIsLocked: (locked: boolean) => void;
  isFeatureLocked: (feature: LockedFeatureKey) => boolean;
  unlockApp: (pin: string) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

function isValidMember(m: unknown): m is FamilyMember {
  return (
    typeof m === "object" &&
    m !== null &&
    "id" in m &&
    "name" in m &&
    "color" in m &&
    typeof (m as FamilyMember).id === "string" &&
    typeof (m as FamilyMember).name === "string" &&
    typeof (m as FamilyMember).color === "string"
  );
}

function loadMembers(): FamilyMember[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MEMBERS);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const valid = parsed.filter(isValidMember);
        if (valid.length > 0) {
          return valid.map((m) => ({
            ...m,
            initial: m.initial ?? String(m.name).charAt(0).toUpperCase(),
          }));
        }
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_MEMBERS;
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      if (!merged.lockedFeatures) {
        merged.lockedFeatures = { ...DEFAULT_LOCKED_FEATURES };
      } else {
        merged.lockedFeatures = { ...DEFAULT_LOCKED_FEATURES, ...merged.lockedFeatures };
      }
      if (typeof merged.lockEnabled !== "boolean") merged.lockEnabled = false;
      if (typeof merged.autoRelockEnabled !== "boolean") merged.autoRelockEnabled = false;
      if (typeof merged.autoRelockMinutes !== "number" || merged.autoRelockMinutes < 1 || merged.autoRelockMinutes > 60) {
        merged.autoRelockMinutes = 5;
      }
      if (typeof merged.familyName !== "string" || !merged.familyName.trim()) {
        merged.familyName = DEFAULT_SETTINGS.familyName;
      }
      return merged;
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

function loadAuthenticated(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_AUTH) === "1";
  } catch {
    return false;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const skydark = useSkydarkDataContext();
  const [familyMembers, setFamilyMembersState] = useState<FamilyMember[]>(loadMembers);
  const [settings, setSettingsState] = useState<AppSettings>(loadSettings);
  const [isAuthenticated, setAuthenticatedState] = useState(loadAuthenticated);
  const [screensaverTriggered, setScreensaverTriggered] = useState(false);
  const [isLocked, setIsLockedState] = useState(false);

  // Seed family members and family name from HA when WebSocket data is available
  useEffect(() => {
    if (!skydark?.data?.connection) return;
    if (Array.isArray(skydark.data.familyMembers) && skydark.data.familyMembers.length > 0) {
      const valid = skydark.data.familyMembers.filter((m) => isValidMember(m));
      if (valid.length > 0) setFamilyMembersState(valid);
    }
    const familyName = skydark.data.config?.family_name;
    if (typeof familyName === "string" && familyName.trim()) {
      setSettingsState((prev) => ({ ...prev, familyName: familyName.trim() }));
    }
  }, [skydark?.data?.connection, skydark?.data?.familyMembers, skydark?.data?.config?.family_name]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(familyMembers));
    } catch {
      // QuotaExceededError or private browsing; avoid crashing the app
    }
  }, [familyMembers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {
      // QuotaExceededError or private browsing
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_AUTH, isAuthenticated ? "1" : "0");
    } catch {
      // QuotaExceededError or private browsing
    }
  }, [isAuthenticated]);

  const setFamilyMembers = useCallback(
    (value: FamilyMember[] | ((prev: FamilyMember[]) => FamilyMember[])) => {
      setFamilyMembersState(value);
    },
    []
  );

  const addFamilyMember = useCallback((member: Omit<FamilyMember, "id">): FamilyMember => {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const newMember: FamilyMember = {
      ...member,
      id,
      initial: member.initial ?? member.name.charAt(0).toUpperCase(),
    };
    setFamilyMembersState((prev) => [...prev, newMember]);
    return newMember;
  }, []);

  const updateFamilyMember = useCallback((id: string, updates: Partial<FamilyMember>) => {
    setFamilyMembersState((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
  }, []);

  const removeFamilyMember = useCallback((id: string) => {
    setFamilyMembersState((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const setSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setAuthenticated = useCallback((value: boolean) => {
    setAuthenticatedState(value);
  }, []);

  const setIsLocked = useCallback((locked: boolean) => {
    setIsLockedState(locked);
  }, []);

  const isFeatureLocked = useCallback(
    (feature: LockedFeatureKey): boolean => {
      if (!settings.lockEnabled || !isLocked) return false;
      return settings.lockedFeatures[feature] === true;
    },
    [settings.lockEnabled, settings.lockedFeatures, isLocked]
  );

  const unlockApp = useCallback(
    (pin: string): boolean => {
      if (!settings.lockEnabled) return true;
      if (!settings.pinCodeHash) return true;
      const hash = hashPin(pin);
      if (hash === settings.pinCodeHash) {
        setIsLockedState(false);
        return true;
      }
      return false;
    },
    [settings.lockEnabled, settings.pinCodeHash]
  );

  const verifyPin = useCallback(
    (pin: string): boolean => {
      if (!settings.pinCodeHash) return true;
      const hash = hashPin(pin);
      if (hash === settings.pinCodeHash) {
        setAuthenticatedState(true);
        return true;
      }
      return false;
    },
    [settings.pinCodeHash]
  );

  const value: AppContextValue = useMemo(
    () => ({
      familyMembers,
      settings,
      isAuthenticated,
      isLocked,
      setFamilyMembers,
      addFamilyMember,
      updateFamilyMember,
      removeFamilyMember,
      setSettings,
      setAuthenticated,
      verifyPin,
      screensaverTriggered,
      setScreensaverTriggered,
      setIsLocked,
      isFeatureLocked,
      unlockApp,
    }),
    [
      familyMembers,
      settings,
      isAuthenticated,
      isLocked,
      setFamilyMembers,
      addFamilyMember,
      updateFamilyMember,
      removeFamilyMember,
      setSettings,
      setAuthenticated,
      verifyPin,
      screensaverTriggered,
      setScreensaverTriggered,
      setIsLocked,
      isFeatureLocked,
      unlockApp,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}

/** Simple hash for PIN (not cryptographically secure; sufficient for local protection). */
export function hashPin(pin: string): string {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = (h << 5) - h + pin.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}
