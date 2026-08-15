/**
 * Modal PIN entry with numeric keypad (0-9). Used for redeeming rewards and protected actions.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface PinPromptProps {
  open: boolean;
  onClose: () => void;
  /** Called when user submits; return true to close, false to show error / keep open. */
  onVerify: (pin: string) => boolean | Promise<boolean>;
  title?: string;
  /** Optional error message to show (e.g. wrong PIN). */
  error?: string;
  /** If true, allow bypass by submitting empty PIN 20 times; then onBypass is called. */
  allowBypass?: boolean;
  /** Called when bypass is triggered (20 empty submits). */
  onBypass?: () => void;
  /** When provided, called on successful verify instead of onClose (e.g. to stay on current page). */
  onSuccess?: () => void;
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export default function PinPrompt({
  open,
  onClose,
  onVerify,
  title = "Enter PIN",
  error: externalError,
  allowBypass = false,
  onBypass,
  onSuccess,
}: PinPromptProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [emptySubmitCount, setEmptySubmitCount] = useState(0);

  useEffect(() => {
    if (open) {
      setPin("");
      setError(externalError ?? "");
      setEmptySubmitCount(0);
    }
  }, [open, externalError]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const handleDigit = (d: string) => {
    if (d === "⌫") {
      setPin((p) => p.slice(0, -1));
      setError("");
      setEmptySubmitCount(0);
    } else if (d !== "") {
      setPin((p) => p + d);
      setError("");
      setEmptySubmitCount(0);
    }
  };

  const handleSubmit = async () => {
    if (!pin) {
      if (allowBypass && onBypass) {
        const next = emptySubmitCount + 1;
        setEmptySubmitCount(next);
        if (next >= 20) {
          onBypass();
          onClose();
        }
        return;
      }
      setError("Enter your PIN");
      return;
    }
    setVerifying(true);
    setError("");
    setEmptySubmitCount(0);
    try {
      const result = await Promise.resolve(onVerify(pin));
      if (result) {
        if (onSuccess) onSuccess();
        else onClose();
      } else {
        setError("Incorrect PIN");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setVerifying(false);
    }
  };

  const canSubmit = !!pin || (allowBypass && !!onBypass);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl max-w-xs w-full p-6"
            >
              <h3 className="text-lg font-semibold text-skydark-text mb-2">{title}</h3>
              <div className="flex items-center justify-center gap-1 mb-4 h-12 rounded-xl bg-gray-100 px-3">
                <span className="text-xl font-mono tracking-widest text-skydark-text">
                  {pin.replace(/./g, "•")}
                </span>
              </div>
              {error && (
                <p className="text-sm text-red-600 mb-3 text-center" role="alert">
                  {error}
                </p>
              )}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {DIGITS.map((d, i) =>
                  d === "" ? (
                    <span key={`empty-${i}`} aria-hidden className="h-14" />
                  ) : (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleDigit(d)}
                      disabled={verifying}
                      className={`
                        h-14 rounded-xl text-xl font-medium transition-colors
                        ${d === "⌫"
                          ? "bg-gray-200 text-skydark-text hover:bg-gray-300"
                          : "bg-gray-100 text-skydark-text hover:bg-gray-200"}
                        disabled:opacity-60
                      `}
                      aria-label={d === "⌫" ? "Backspace" : d}
                    >
                      {d}
                    </button>
                  )
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={verifying || !canSubmit}
                  className="btn-primary flex-1 disabled:opacity-60"
                >
                  {verifying ? "..." : "OK"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
