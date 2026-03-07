import { useState } from "react";
import Modal from "../Common/Modal";
import CloseIcon from "../Common/CloseIcon";
import { PROFILE_COLORS } from "../../lib/theme";

export interface AddProfileResult {
  name: string;
  color: string;
}

interface AddProfileModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (result: AddProfileResult) => void;
}

export default function AddProfileModal({ open, onClose, onAdd }: AddProfileModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
  const [showAppMessage, setShowAppMessage] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({ name: trimmed, color });
    setName("");
    setColor(PROFILE_COLORS[0]);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Profile" variant="slideRight">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <div className="space-y-6 flex-1">
          <div>
            <label className="block text-sm font-medium text-skydark-text mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-skydark"
              placeholder="Profile name"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-skydark-text mb-2">Color</label>
            <div className="grid grid-cols-5 gap-3">
              {PROFILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="aspect-square w-full max-w-[56px] rounded-full border-2 border-white shadow-sm transition-transform hover:scale-105 mx-auto"
                  style={{
                    backgroundColor: c,
                    boxShadow: color === c ? "0 0 0 2px white, 0 0 0 4px #2B3A4A" : undefined,
                  }}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                />
              ))}
            </div>
          </div>

          {showAppMessage && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 text-sm text-skydark-text-secondary">
              <span>You can add a profile picture in the Skydark App.</span>
              <button
                type="button"
                onClick={() => setShowAppMessage(false)}
                className="shrink-0 p-1 rounded-lg hover:bg-gray-200 text-skydark-text-secondary"
                aria-label="Dismiss"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="pt-6 pb-2 shrink-0">
          <button
            type="submit"
            disabled={!name.trim()}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}
