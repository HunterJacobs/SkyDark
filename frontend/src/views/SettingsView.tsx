import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SettingsSidebar, { type SettingsSectionId } from "../components/Settings/SettingsSidebar";
import SettingsSection, { SettingRow } from "../components/Settings/SettingsSection";
import AddProfileModal from "../components/Settings/AddProfileModal";
import EditProfileColorModal from "../components/Settings/EditProfileColorModal";
import Toggle from "../components/Common/Toggle";
import Modal from "../components/Common/Modal";
import CloseIcon from "../components/Common/CloseIcon";
import { useAppContext, hashPin } from "../contexts/AppContext";
import PinPrompt from "../components/Common/PinPrompt";
import {
  GeneralIcon,
  CalendarSettingsIcon,
  DisplayIcon,
  LockIcon,
  DeveloperIcon,
} from "../components/Settings/SettingsIcons";
import CalendarSyncSettings from "../components/Settings/CalendarSyncSettings";
import { useViewportSimulator } from "../contexts/ViewportSimulatorContext";
import { VIEWPORT_PRESETS } from "../lib/viewportPresets";
import { avatarStyle } from "../lib/colors";
import { useSkydarkDataContext } from "../contexts/SkydarkDataContext";
import { updateConfig } from "../lib/skyDarkApi";

/** Version of this panel build (from manifest.json at build time). */
const PANEL_VERSION = __SKYDARK_VERSION__;

type SaveState = { status: "idle" | "saving" | "saved" | "error"; message?: string };

function SaveHint({ state }: { state: SaveState }) {
  if (state.status === "idle") return null;
  const text =
    state.status === "saving" ? "Saving…" : state.status === "saved" ? "Saved" : state.message ?? "Couldn't save";
  return (
    <span
      role={state.status === "error" ? "alert" : "status"}
      className={`text-xs ${state.status === "error" ? "text-red-600" : "text-skydark-text-secondary"}`}
    >
      {text}
    </span>
  );
}
export default function SettingsView() {
  const {
    familyMembers: members,
    addFamilyMember,
    updateFamilyMember,
    removeFamilyMember,
    settings,
    setSettings,
    verifyPin,
    isLocked,
    unlockApp,
  } = useAppContext();
  const navigate = useNavigate();
  const viewportSimulator = useViewportSimulator();
  const skydark = useSkydarkDataContext();
  const conn = skydark?.data?.connection ?? null;
  const serverConfig = skydark?.data?.config ?? null;
  const integrationVersion = serverConfig?.version ?? null;
  const pendingPinActionRef = useRef<(() => void) | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const [weatherEntity, setWeatherEntity] = useState(serverConfig?.weather_entity ?? "");
  const [weatherSave, setWeatherSave] = useState<SaveState>({ status: "idle" });
  const [familyNameSave, setFamilyNameSave] = useState<SaveState>({ status: "idle" });

  // Keep the field in sync when the server value arrives or changes elsewhere.
  useEffect(() => {
    setWeatherEntity(serverConfig?.weather_entity ?? "");
  }, [serverConfig?.weather_entity]);

  const saveSharedConfig = async (
    values: { family_name?: string; weather_entity?: string },
    setState: (s: SaveState) => void
  ) => {
    if (!conn) return;
    setState({ status: "saving" });
    try {
      await updateConfig(conn, values);
      setState({ status: "saved" });
      void skydark?.refetch();
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : undefined;
      setState({ status: "error", message });
    }
  };

  const saveFamilyName = () => {
    const name = (settings.familyName ?? "").trim();
    if (!name || name === serverConfig?.family_name) return;
    void saveSharedConfig({ family_name: name }, setFamilyNameSave);
  };

  const saveWeatherEntity = () => {
    const value = weatherEntity.trim();
    if (value === (serverConfig?.weather_entity ?? "")) return;
    void saveSharedConfig({ weather_entity: value }, setWeatherSave);
  };
  const [showDisableLockPrompt, setShowDisableLockPrompt] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const [setPinStep, setSetPinStep] = useState<"current" | "new" | "confirm">("current");
  const [newPinForConfirm, setNewPinForConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editColorMember, setEditColorMember] = useState<{ id: string; name: string; color: string } | null>(null);

  const handleAddProfile = (result: { name: string; color: string }) => {
    addFamilyMember({
      name: result.name,
      color: result.color,
      initial: result.name.charAt(0).toUpperCase(),
    });
    setAddProfileOpen(false);
  };

  const handleSetPinVerify = (pin: string): boolean => {
    if (setPinStep === "current") {
      if (settings.pinCodeHash && hashPin(pin) !== settings.pinCodeHash) return false;
      setPinError("");
      const pending = pendingPinActionRef.current;
      if (pending) {
        pending();
        pendingPinActionRef.current = null;
        handleSetPinClose();
        return true;
      }
      setSetPinStep("new");
      return false;
    }
    if (setPinStep === "new") {
      setNewPinForConfirm(pin);
      setSetPinStep("confirm");
      setPinError("");
      return false;
    }
    if (setPinStep === "confirm") {
      if (pin !== newPinForConfirm) {
        setPinError("PINs do not match");
        return false;
      }
      setSettings({ pinCodeHash: hashPin(pin) });
      setShowSetPin(false);
      setSetPinStep("current");
      setNewPinForConfirm("");
      pendingPinActionRef.current?.();
      pendingPinActionRef.current = null;
      return true;
    }
    return false;
  };

  const handleSetPinClose = () => {
    setShowSetPin(false);
    setSetPinStep("current");
    setNewPinForConfirm("");
    setPinError("");
    pendingPinActionRef.current = null;
  };

  const handleLockEnabledChange = (checked: boolean) => {
    if (checked) {
      if (!settings.pinCodeHash) {
        setPinError("");
        setShowSetPin(true);
        setSetPinStep("new");
        setNewPinForConfirm("");
        pendingPinActionRef.current = () => {
          setSettings({ lockEnabled: true });
          setShowSetPin(false);
        };
        return;
      }
      setSettings({ lockEnabled: true });
      return;
    }
    setShowDisableLockPrompt(true);
  };

  const handleDisableLockVerify = (pin: string): boolean => {
    if (!pin && settings.pinCodeHash) return false;
    const ok = !settings.pinCodeHash || verifyPin(pin);
    if (ok) {
      setSettings({ lockEnabled: false });
      setShowDisableLockPrompt(false);
      return true;
    }
    return false;
  };

  const requireUnlockToChangeSettings =
    settings.lockEnabled && isLocked && settings.lockedFeatures.changeSettings;

  if (requireUnlockToChangeSettings) {
    return (
      <div className="h-full flex flex-col md:flex-row bg-skydark-bg items-center justify-center p-4">
        <PinPrompt
          open
          onClose={() => navigate(-1)}
          onVerify={(pin) => unlockApp(pin)}
          onSuccess={() => {}}
          title="Enter PIN to change settings"
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row bg-skydark-bg">
      <SettingsSidebar activeId={activeSection} onSelect={setActiveSection} />

      <div className="flex-1 min-w-0 py-4 sm:py-6 px-4 sm:px-8 overflow-auto">
        <div className="max-w-3xl">
        {activeSection === "general" && (
          <>
            <h2 className="text-xl font-semibold text-skydark-text mb-6">General</h2>

            <SettingsSection title="Family" icon={<GeneralIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <div className="py-3">
                <div className="flex items-center justify-between gap-2 mb-1.5 max-w-md">
                  <label htmlFor="family-name" className="block text-sm font-medium text-skydark-text">
                    Family name
                  </label>
                  <SaveHint state={familyNameSave} />
                </div>
                <input
                  id="family-name"
                  type="text"
                  maxLength={60}
                  value={settings.familyName ?? "My Family"}
                  onChange={(e) => {
                    setFamilyNameSave({ status: "idle" });
                    setSettings({ familyName: e.target.value });
                  }}
                  onBlur={saveFamilyName}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="input-skydark max-w-md"
                />
              </div>
              <div className="py-3">
                <span className="block text-sm font-medium text-skydark-text mb-2">Family members</span>
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0"
                        style={avatarStyle(m.color)}
                      >
                        {m.initial}
                      </div>
                      <span className="flex-1 min-w-0 truncate font-medium text-skydark-text">{m.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditColorMember({ id: m.id, name: m.name, color: m.color })}
                          className="btn-ghost text-skydark-accent hover:text-skydark-accent"
                        >
                          Edit color
                        </button>
                        <button
                          type="button"
                          onClick={() => setMemberToDelete({ id: m.id, name: m.name })}
                          disabled={members.length <= 1}
                          className="btn-icon hover:bg-red-50 text-skydark-text-secondary hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-skydark-text-secondary"
                          aria-label={`Delete ${m.name}`}
                          title={members.length <= 1 ? "At least one profile is required" : `Delete ${m.name}`}
                        >
                          <CloseIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setAddProfileOpen(true)}
                  className="btn-ghost mt-2 -ml-3 text-skydark-accent hover:text-skydark-accent"
                >
                  + Add family member
                </button>
              </div>
            </SettingsSection>

            <SettingsSection title="Weather" icon={<DisplayIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <div className="py-3">
                <div className="flex items-center justify-between gap-2 mb-1.5 max-w-md">
                  <label htmlFor="weather-entity" className="block text-sm font-medium text-skydark-text">
                    Weather entity
                  </label>
                  <SaveHint state={weatherSave} />
                </div>
                <div className="flex gap-2 max-w-md">
                  <input
                    id="weather-entity"
                    type="text"
                    value={weatherEntity}
                    onChange={(e) => {
                      setWeatherSave({ status: "idle" });
                      setWeatherEntity(e.target.value);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && saveWeatherEntity()}
                    placeholder="weather.home"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="input-skydark flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={saveWeatherEntity}
                    disabled={!conn || weatherEntity.trim() === (serverConfig?.weather_entity ?? "")}
                    className="btn-secondary shrink-0"
                  >
                    Save
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-skydark-text-secondary">
                  Shown in the header and sleep mode. Leave empty to hide the weather.
                </p>
              </div>
            </SettingsSection>
          </>
        )}

        {activeSection === "lock" && (
          <>
            <h2 className="text-xl font-semibold text-skydark-text mb-6">Lock</h2>
            <SettingsSection title="Lock" icon={<LockIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <SettingRow
                label="Enable lock"
                control={
                  <Toggle
                    checked={settings.lockEnabled}
                    onChange={handleLockEnabledChange}
                    aria-label="Enable lock"
                  />
                }
              />
              {settings.lockEnabled && settings.pinCodeHash && !isLocked && (
                <div className="py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPinError("");
                      setSetPinStep("current");
                      setNewPinForConfirm("");
                      setShowSetPin(true);
                      (window as unknown as { __pendingPinAction?: () => void }).__pendingPinAction = undefined;
                    }}
                    className="btn-ghost text-skydark-accent hover:text-skydark-accent"
                  >
                    Change PIN
                  </button>
                </div>
              )}
              {settings.lockEnabled && (
                <>
                  <SettingRow
                    label="Re-lock after inactivity"
                    control={
                      <Toggle
                        checked={settings.autoRelockEnabled}
                        onChange={(checked) => setSettings({ autoRelockEnabled: checked })}
                        aria-label="Auto-relock on inactivity"
                      />
                    }
                  />
                  {settings.autoRelockEnabled && (
                    <div className="py-2">
                      <label className="block text-sm font-medium text-skydark-text mb-1.5">Inactivity timeout (minutes)</label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={settings.autoRelockMinutes}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (!Number.isNaN(n) && n >= 1 && n <= 60) setSettings({ autoRelockMinutes: n });
                        }}
                        className="input-skydark w-24 py-2"
                      />
                    </div>
                  )}
                  {!isLocked && (
                    <>
                      <div className="pt-4 pb-2">
                        <span className="text-sm font-medium text-skydark-text">Lock individual features when locked</span>
                      </div>
                      {(
                        [
                          ["addEvents", "Add events"],
                          ["editDeleteEvents", "Edit & delete events"],
                          ["createLists", "Create lists"],
                          ["deleteLists", "Delete lists"],
                          ["addItemsToLists", "Add items to lists"],
                          ["checkLists", "Check lists"],
                          ["addChores", "Add chores"],
                          ["deleteChores", "Delete chores"],
                          ["completeChores", "Complete chores"],
                          ["addRewards", "Add rewards"],
                          ["claimRewards", "Claim rewards"],
                          ["meals", "Meals (all)"],
                          ["mealprep", "Meal prep (check/uncheck ingredients)"],
                          ["importPhotos", "Add & delete photos"],
                          ["changeSettings", "Change any settings"],
                        ] as const
                      ).map(([key, label]) => (
                        <SettingRow
                          key={key}
                          label={label}
                          control={
                            <Toggle
                              checked={settings.lockedFeatures[key]}
                              onChange={(checked) =>
                                setSettings({
                                  lockedFeatures: { ...settings.lockedFeatures, [key]: checked },
                                })
                              }
                              aria-label={label}
                            />
                          }
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </SettingsSection>
          </>
        )}

        {activeSection === "calendar" && (
          <>
            <h2 className="text-xl font-semibold text-skydark-text mb-6">Calendar</h2>

            <SettingsSection title="Calendar sync" icon={<CalendarSettingsIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <CalendarSyncSettings />
            </SettingsSection>
          </>
        )}

        {activeSection === "display" && (
          <>
            <h2 className="text-xl font-semibold text-skydark-text mb-6">Display</h2>
            <SettingsSection title="Sleep mode" icon={<DisplayIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <SettingRow
                label="Start sleep mode automatically"
                value="Shows a photo slideshow with the time and weather when nobody is using the screen."
                control={
                  <Toggle
                    checked={settings.screensaverEnabled}
                    onChange={(checked) => setSettings({ screensaverEnabled: checked })}
                    aria-label="Enable photo screen saver"
                  />
                }
              />
              {settings.screensaverEnabled && (
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Start after (minutes of inactivity)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={settings.screensaverIdleMinutes}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n) && n >= 1 && n <= 120) {
                      setSettings({ screensaverIdleMinutes: n });
                    }
                  }}
                  className="input-skydark max-w-[120px]"
                />
              </div>
              )}
            </SettingsSection>
            <SettingsSection title="Slideshow" icon={<DisplayIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Transition</label>
                <select
                  value={settings.screensaverTransitionType}
                  onChange={(e) =>
                    setSettings({
                      screensaverTransitionType: e.target.value as "none" | "fade" | "slide",
                    })
                  }
                  className="input-skydark max-w-[200px]"
                >
                  <option value="none">None</option>
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                </select>
              </div>
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Time between photos</label>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={settings.screensaverSlideshowIntervalUnit ?? "seconds"}
                    onChange={(e) => {
                      const newUnit = e.target.value as "seconds" | "minutes";
                      const prevUnit = settings.screensaverSlideshowIntervalUnit ?? "seconds";
                      if (newUnit === prevUnit) return;
                      if (newUnit === "minutes") {
                        const sec = settings.screensaverSlideshowIntervalSeconds ?? 5;
                        setSettings({
                          screensaverSlideshowIntervalUnit: "minutes",
                          screensaverSlideshowIntervalMinutes: Math.max(1, Math.min(10, Math.round(sec / 60))),
                        });
                      } else {
                        const min = settings.screensaverSlideshowIntervalMinutes ?? 1;
                        setSettings({
                          screensaverSlideshowIntervalUnit: "seconds",
                          screensaverSlideshowIntervalSeconds: Math.max(3, Math.min(60, min * 60)),
                        });
                      }
                    }}
                    className="input-skydark w-auto"
                    aria-label="Interval unit"
                  >
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                  </select>
                  <input
                    type="number"
                    min={settings.screensaverSlideshowIntervalUnit === "minutes" ? 1 : 3}
                    max={settings.screensaverSlideshowIntervalUnit === "minutes" ? 10 : 60}
                    value={
                      settings.screensaverSlideshowIntervalUnit === "minutes"
                        ? (settings.screensaverSlideshowIntervalMinutes ?? 1)
                        : (settings.screensaverSlideshowIntervalSeconds ?? 5)
                    }
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      const isMinutes = settings.screensaverSlideshowIntervalUnit === "minutes";
                      if (isMinutes && !Number.isNaN(n) && n >= 1 && n <= 10) {
                        setSettings({ screensaverSlideshowIntervalMinutes: n });
                      } else if (!isMinutes && !Number.isNaN(n) && n >= 3 && n <= 60) {
                        setSettings({ screensaverSlideshowIntervalSeconds: n });
                      }
                    }}
                    className="input-skydark max-w-[100px]"
                    aria-label="Time between photos"
                  />
                </div>
              </div>
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Transition duration (ms)</label>
                <input
                  type="number"
                  min={200}
                  max={2000}
                  step={100}
                  value={settings.screensaverTransitionDurationMs}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n) && n >= 200 && n <= 2000) {
                      setSettings({ screensaverTransitionDurationMs: n });
                    }
                  }}
                  className="input-skydark max-w-[120px]"
                />
              </div>
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Clock size</label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-skydark-text-secondary shrink-0">Small</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.screensaverTimeDisplayScale ?? 50}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isNaN(n) && n >= 0 && n <= 100) {
                        setSettings({ screensaverTimeDisplayScale: n });
                      }
                    }}
                    className="flex-1 h-2 rounded-lg appearance-none bg-gray-200 accent-skydark-accent"
                  />
                  <span className="text-xs text-skydark-text-secondary shrink-0">Large</span>
                </div>
              </div>
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Weather size</label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-skydark-text-secondary shrink-0">Small</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.screensaverWeatherDisplayScale ?? 50}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isNaN(n) && n >= 0 && n <= 100) {
                        setSettings({ screensaverWeatherDisplayScale: n });
                      }
                    }}
                    className="flex-1 h-2 rounded-lg appearance-none bg-gray-200 accent-skydark-accent"
                  />
                  <span className="text-xs text-skydark-text-secondary shrink-0">Large</span>
                </div>
              </div>
            </SettingsSection>
          </>
        )}

        {activeSection === "developer" && (
          <>
            <h2 className="text-xl font-semibold text-skydark-text mb-6">Developer</h2>
            <SettingsSection title="About" icon={<DeveloperIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <SettingRow
                label="Panel version"
                control={<span className="text-sm font-mono text-skydark-text" data-testid="panel-version">{PANEL_VERSION}</span>}
              />
              <SettingRow
                label="Integration version"
                value={integrationVersion ? undefined : "Not reported by Home Assistant"}
                control={
                  <span className="text-sm font-mono text-skydark-text" data-testid="integration-version">
                    {integrationVersion ?? "—"}
                  </span>
                }
              />
              {integrationVersion && integrationVersion !== PANEL_VERSION && (
                <div
                  role="alert"
                  className="my-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900"
                >
                  <span>This screen is running an older panel than the installed integration.</span>
                  <button type="button" onClick={() => window.location.reload()} className="btn-secondary">
                    Reload panel
                  </button>
                </div>
              )}
            </SettingsSection>
            <SettingsSection title="Viewport Tester" icon={<DeveloperIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <SettingRow
                label="Developer Mode"
                control={
                  <Toggle
                    checked={viewportSimulator.developerMode}
                    onChange={viewportSimulator.setDeveloperMode}
                    aria-label="Developer mode"
                  />
                }
              />
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Device preset</label>
                <select
                  value={viewportSimulator.presetId}
                  onChange={(e) => viewportSimulator.setPresetId(e.target.value)}
                  className="input-skydark max-w-[280px]"
                  aria-label="Device preset"
                >
                  {VIEWPORT_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <SettingRow
                label="Orientation"
                control={
                  <div role="radiogroup" aria-label="Orientation" className="inline-flex rounded-xl bg-gray-100 p-1">
                    {(["portrait", "landscape"] as const).map((o) => {
                      const active = viewportSimulator.orientation === o;
                      return (
                        <button
                          key={o}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => viewportSimulator.setOrientation(o)}
                          className={`px-3 min-h-[36px] rounded-lg text-sm font-medium capitalize transition-colors ${
                            active ? "bg-white text-skydark-text shadow-sm" : "text-skydark-text-secondary hover:text-skydark-text"
                          }`}
                        >
                          {o}
                        </button>
                      );
                    })}
                  </div>
                }
              />
              <SettingRow
                label="Show safe-area padding"
                control={
                  <Toggle
                    checked={viewportSimulator.showSafeArea}
                    onChange={viewportSimulator.setShowSafeArea}
                    aria-label="Show safe-area padding"
                  />
                }
              />
              <SettingRow
                label="Show grid overlay"
                control={
                  <Toggle
                    checked={viewportSimulator.showGrid}
                    onChange={viewportSimulator.setShowGrid}
                    aria-label="Show grid overlay"
                  />
                }
              />
              <div className="py-3">
                <button
                  type="button"
                  onClick={viewportSimulator.resetToRealDevice}
                  className="btn-secondary"
                >
                  Reset to real device
                </button>
              </div>
            </SettingsSection>
          </>
        )}
        </div>
      </div>

      <AddProfileModal
        open={addProfileOpen}
        onClose={() => setAddProfileOpen(false)}
        onAdd={handleAddProfile}
      />

      <Modal
        open={!!memberToDelete}
        onClose={() => setMemberToDelete(null)}
        title={memberToDelete ? `Delete ${memberToDelete.name}?` : "Delete profile"}
        variant="center"
      >
        {memberToDelete && (
          <div className="space-y-4">
            <p className="text-sm text-skydark-text-secondary">
              {memberToDelete.name}'s chores and reward points will be deleted too. Their events and
              lists are kept but no longer assigned to anyone. This can't be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  removeFamilyMember(memberToDelete.id);
                  setMemberToDelete(null);
                }}
                className="btn-danger"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>

      <EditProfileColorModal
        open={!!editColorMember}
        member={editColorMember}
        onClose={() => setEditColorMember(null)}
        onSelectColor={(color) => {
          if (editColorMember) {
            updateFamilyMember(editColorMember.id, { color });
            setEditColorMember(null);
          }
        }}
      />

      <PinPrompt
        key={setPinStep}
        open={showSetPin}
        onClose={handleSetPinClose}
        onVerify={handleSetPinVerify}
        title={
          setPinStep === "current"
            ? settings.pinCodeHash
              ? "Enter current PIN"
              : "Enter new PIN"
            : setPinStep === "new"
              ? "Enter new PIN"
              : "Confirm new PIN"
        }
        error={pinError}
      />

      <PinPrompt
        open={showDisableLockPrompt}
        onClose={() => setShowDisableLockPrompt(false)}
        onVerify={handleDisableLockVerify}
        title="Enter PIN to disable lock"
        allowBypass
        onBypass={() => {
          setSettings({ lockEnabled: false });
          setShowDisableLockPrompt(false);
        }}
      />
    </div>
  );
}
