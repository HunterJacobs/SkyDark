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
  useRef,
  type ReactNode,
} from "react";
import type { FamilyMember } from "../types/calendar";
import { useSkydarkDataContext } from "./SkydarkDataContext";
import {
  addFamilyMemberWS,
  deleteFamilyMemberWS,
  saveAppSettings,
  updateFamilyMemberWS,
} from "../lib/skyDarkApi";

const STORAGE_KEY_SETTINGS = "skydark_app_settings";
const STORAGE_KEY_MEMBERS = "skydark_family_members";

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
  /** Optional US ZIP code for weather API lookups. */
  weatherZipCode: string;
  /** Show a compact 7-day forecast row in the top header. */
  showTopWeeklyForecast: boolean;
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
  weatherZipCode: "",
  showTopWeeklyForecast: false,
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

function normalizeSettings(candidate: Partial<AppSettings> | null | undefined): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(candidate ?? {}) };
  if (!merged.lockedFeatures) {
    merged.lockedFeatures = { ...DEFAULT_LOCKED_FEATURES };
  } else {
    merged.lockedFeatures = { ...DEFAULT_LOCKED_FEATURES, ...merged.lockedFeatures };
  }
  if (typeof merged.lockEnabled !== "boolean") merged.lockEnabled = false;
  if (typeof merged.autoRelockEnabled !== "boolean") merged.autoRelockEnabled = false;
  if (
    typeof merged.autoRelockMinutes !== "number" ||
    merged.autoRelockMinutes < 1 ||
    merged.autoRelockMinutes > 60
  ) {
    merged.autoRelockMinutes = 5;
  }
  if (typeof merged.familyName !== "string" || !merged.familyName.trim()) {
    merged.familyName = DEFAULT_SETTINGS.familyName;
  }
  return merged;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const skydark = useSkydarkDataContext();
  const [familyMembers, setFamilyMembersState] = useState<FamilyMember[]>(DEFAULT_MEMBERS);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isAuthenticated, setAuthenticatedState] = useState(false);
  const [screensaverTriggered, setScreensaverTriggered] = useState(false);
  const [isLocked, setIsLockedState] = useState(false);
  const didMigrateLegacyLocalRef = useRef(false);

  // Seed shared state from HA-backed WebSocket data.
  useEffect(() => {
    if (!skydark?.data?.connection) return;
    if (Array.isArray(skydark.data.familyMembers) && skydark.data.familyMembers.length > 0) {
      const valid = skydark.data.familyMembers.filter((m) => isValidMember(m));
      if (valid.length > 0) setFamilyMembersState(valid);
    }
    if (skydark.data.appSettings && typeof skydark.data.appSettings === "object") {
      setSettingsState(normalizeSettings(skydark.data.appSettings as Partial<AppSettings>));
    }
  }, [skydark?.data?.connection, skydark?.data?.familyMembers, skydark?.data?.appSettings]);

  // One-time migration: copy old local settings/members into backend settings once connected.
  useEffect(() => {
    if (didMigrateLegacyLocalRef.current) return;
    const conn = skydark?.data?.connection;
    if (!conn) return;
    didMigrateLegacyLocalRef.current = true;

    try {
      const rawSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
      const rawMembers = localStorage.getItem(STORAGE_KEY_MEMBERS);
      if (rawSettings || rawMembers) {
        if (rawSettings) {
          const parsed = JSON.parse(rawSettings) as Partial<AppSettings>;
          const merged = normalizeSettings(parsed);
          setSettingsState(merged);
          void saveAppSettings(conn, merged as unknown as Record<string, unknown>);
        }
        if (rawMembers) {
          const parsedMembers = JSON.parse(rawMembers) as unknown;
          if (Array.isArray(parsedMembers)) {
            const valid = parsedMembers.filter(isValidMember);
            if (valid.length > 0) {
              setFamilyMembersState(valid);
            }
          }
        }
      }
    } catch {
      // Ignore bad local migration payloads.
    } finally {
      try {
        localStorage.removeItem(STORAGE_KEY_SETTINGS);
        localStorage.removeItem(STORAGE_KEY_MEMBERS);
      } catch {
        // ignore
      }
    }
  }, [skydark?.data?.connection]);

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
    const conn = skydark?.data?.connection;
    if (conn) {
      void addFamilyMemberWS(conn, {
        name: newMember.name,
        color: newMember.color,
        initial: newMember.initial,
      })
        .then((res) => {
          const saved = res.family_member;
          if (!saved?.id) return;
          setFamilyMembersState((prev) => [...prev, {
            id: String(saved.id),
            name: String(saved.name ?? newMember.name),
            color: String(saved.color ?? newMember.color),
            initial: String(saved.initial ?? newMember.initial ?? newMember.name.charAt(0).toUpperCase()),
          }]);
        })
        .catch(() => {
          setFamilyMembersState((prev) => [...prev, newMember]);
        });
    } else {
      setFamilyMembersState((prev) => [...prev, newMember]);
    }
    return newMember;
  }, [skydark?.data?.connection]);

  const updateFamilyMember = useCallback((id: string, updates: Partial<FamilyMember>) => {
    setFamilyMembersState((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
    );
    const conn = skydark?.data?.connection;
    if (!conn) return;
    void updateFamilyMemberWS(conn, {
      member_id: id,
      name: updates.name,
      color: updates.color,
      initial: updates.initial,
    });
  }, [skydark?.data?.connection]);

  const removeFamilyMember = useCallback((id: string) => {
    setFamilyMembersState((prev) => prev.filter((m) => m.id !== id));
    const conn = skydark?.data?.connection;
    if (!conn) return;
    void deleteFamilyMemberWS(conn, id);
  }, [skydark?.data?.connection]);

  const setSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next = normalizeSettings({ ...prev, ...updates });
      const conn = skydark?.data?.connection;
      if (conn) {
        void saveAppSettings(conn, next as unknown as Record<string, unknown>);
      }
      return next;
    });
  }, [skydark?.data?.connection]);

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
