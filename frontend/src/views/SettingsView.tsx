import { useState, useRef } from "react";
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
import { useViewportSimulator } from "../contexts/ViewportSimulatorContext";
import { VIEWPORT_PRESETS } from "../lib/viewportPresets";
import { useWeatherData } from "../hooks/useWeeklyWeather";

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
  const weather = useWeatherData();
  const pendingPinActionRef = useRef<(() => void) | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("general");
  const [showDisableLockPrompt, setShowDisableLockPrompt] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const [setPinStep, setSetPinStep] = useState<"current" | "new" | "confirm">("current");
  const [newPinForConfirm, setNewPinForConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [keyboardClicks, setKeyboardClicks] = useState(true);
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
      <div className="h-full flex bg-skydark-bg items-center justify-center p-4">
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
    <div className="h-full flex bg-skydark-bg">
      <SettingsSidebar activeId={activeSection} onSelect={setActiveSection} />

      <div className="flex-1 min-w-0 py-4 sm:py-6 px-4 sm:px-8 overflow-auto">
        {activeSection === "general" && (
          <>
            <h2 className="text-xl font-semibold text-skydark-text mb-6">General</h2>

            <SettingsSection title="Family" icon={<GeneralIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Family name</label>
                <input
                  type="text"
                  value={settings.familyName ?? "My Family"}
                  onChange={(e) => setSettings({ familyName: e.target.value })}
                  className="input-skydark max-w-md"
                />
              </div>
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-2">Family members</label>
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 p-3 rounded-card-lg bg-white shadow-skydark"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.initial}
                      </div>
                      <span className="flex-1 font-medium text-skydark-text">{m.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditColorMember({ id: m.id, name: m.name, color: m.color })}
                          className="text-sm font-medium text-skydark-accent hover:underline"
                        >
                          Edit color
                        </button>
                        <button
                          type="button"
                          onClick={() => setMemberToDelete({ id: m.id, name: m.name })}
                          disabled={members.length <= 1}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-skydark-text-secondary hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-skydark-text-secondary"
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
                  className="mt-2 text-sm font-medium text-skydark-accent hover:underline"
                >
                  + Add profile
                </button>
              </div>
            </SettingsSection>

            <SettingsSection title="Display" icon={<GeneralIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Weather ZIP code (US)</label>
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="tel"
                    value={settings.weatherZipCode ?? ""}
                    onChange={(e) => setSettings({ weatherZipCode: e.target.value })}
                    placeholder="12345"
                    className="input-skydark flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => weather.refresh()}
                    disabled={weather.refreshing}
                    className="btn-secondary whitespace-nowrap disabled:opacity-60"
                  >
                    {weather.refreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
                {weather.locationLabel && (
                  <p className="mt-1 text-xs text-skydark-text-secondary">
                    {weather.locationLabel}
                  </p>
                )}
                <p className="mt-1 text-xs text-skydark-text-secondary">
                  Leave blank to use device location.
                </p>
              </div>
              <SettingRow
                label="Show 7-day forecast in top header"
                control={
                  <Toggle
                    checked={settings.showTopWeeklyForecast ?? false}
                    onChange={(checked) => setSettings({ showTopWeeklyForecast: checked })}
                    aria-label="Show top 7-day forecast"
                  />
                }
              />
            </SettingsSection>

            <SettingsSection title="Volume" icon={<GeneralIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <SettingRow
                label="Keyboard clicks"
                control={
                  <Toggle
                    checked={keyboardClicks}
                    onChange={setKeyboardClicks}
                    aria-label="Keyboard clicks"
                  />
                }
              />
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
                    className="text-sm font-medium text-skydark-accent hover:underline"
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
                          ["importPhotos", "Import photos"],
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
              <p className="text-sm text-skydark-text-secondary mb-3">
                Connect Google or Microsoft Calendar in a future update for two-way sync.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary disabled:opacity-60"
                  disabled
                >
                  Connect Google Calendar (coming soon)
                </button>
                <button
                  type="button"
                  className="btn-secondary disabled:opacity-60"
                  disabled
                >
                  Connect Microsoft Calendar (coming soon)
                </button>
              </div>
            </SettingsSection>
          </>
        )}

        {activeSection === "display" && (
          <>
            <h2 className="text-xl font-semibold text-skydark-text mb-6">Display</h2>
            <SettingsSection title="Screen Saver" icon={<DisplayIcon className="w-5 h-5 text-skydark-text-secondary" />}>
              <SettingRow
                label="Show photo screen saver after inactivity"
                control={
                  <Toggle
                    checked={settings.screensaverEnabled}
                    onChange={(checked) => setSettings({ screensaverEnabled: checked })}
                    aria-label="Enable photo screen saver"
                  />
                }
              />
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Idle time before screen saver (minutes)</label>
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
              <div className="py-3">
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Image transition (Sleep mode)</label>
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
                    className="input-skydark"
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
                  />
                  <span className="text-sm text-skydark-text-secondary">
                    {settings.screensaverSlideshowIntervalUnit === "minutes" ? "min" : "sec"}
                  </span>
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
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Sleep mode time size</label>
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
                <label className="block text-sm font-medium text-skydark-text mb-1.5">Sleep mode weather size</label>
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
                value={viewportSimulator.orientation === "landscape" ? "Landscape" : "Portrait"}
                control={
                  <Toggle
                    checked={viewportSimulator.orientation === "landscape"}
                    onChange={(checked) =>
                      viewportSimulator.setOrientation(checked ? "landscape" : "portrait")
                    }
                    aria-label="Landscape orientation"
                  />
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
              <div className="pt-3">
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
              This will remove {memberToDelete.name} from family members. This cannot be undone.
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
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600"
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
