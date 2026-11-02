import { useCallback, useEffect, useRef, useState } from "react";
import { usePhotosContext } from "../contexts/PhotosContext";
import { useAppContext } from "../contexts/AppContext";
import PinPrompt from "../components/Common/PinPrompt";
import { usePinGate } from "../hooks/usePinGate";
import CloseIcon from "../components/Common/CloseIcon";
import Modal from "../components/Common/Modal";

export default function PhotosView() {
  const { photos, showingSamples, storageAvailable, loading, uploading, addPhotos, removePhoto } =
    usePhotosContext();
  const { setScreensaverTriggered } = useAppContext();
  const { runIfUnlocked, pinPromptProps } = usePinGate();
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setMessage(null);
    const { added, failed } = await addPhotos(files);
    if (failed.length) {
      setMessage({
        kind: "error",
        text:
          added > 0
            ? `Added ${added} photo${added === 1 ? "" : "s"}. Couldn't add: ${failed.join(", ")}`
            : `Couldn't add ${failed.length === 1 ? failed[0] : `${failed.length} photos`}. Check that they're images and try again.`,
      });
    } else {
      setMessage({ kind: "info", text: `Added ${added} photo${added === 1 ? "" : "s"}.` });
    }
  };

  const openPicker = () => runIfUnlocked("importPhotos", () => uploadRef.current?.click());
  const askDelete = (id: string) => runIfUnlocked("importPhotos", () => setToDelete(id));

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await removePhoto(toDelete);
      setViewIndex(null);
      setToDelete(null);
    } catch {
      setMessage({ kind: "error", text: "Couldn't delete that photo. Try again." });
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const step = useCallback(
    (delta: number) =>
      setViewIndex((i) => (i === null || photos.length === 0 ? i : (i + delta + photos.length) % photos.length)),
    [photos.length]
  );

  useEffect(() => {
    if (viewIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewIndex(null);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewIndex, step]);

  const viewing = viewIndex !== null ? photos[viewIndex] : null;

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-skydark-text">Photos</h2>
          <p className="text-sm text-skydark-text-secondary">
            {showingSamples
              ? "Sample photos — add your own to use them in sleep mode."
              : `${photos.length} photo${photos.length === 1 ? "" : "s"} in sleep mode`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={uploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
            multiple
            onChange={handleUpload}
            className="hidden"
            aria-hidden
            tabIndex={-1}
          />
          {storageAvailable && (
            <button type="button" onClick={openPicker} disabled={uploading} className="btn-secondary">
              {uploading ? "Adding…" : "Add photos"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setScreensaverTriggered(true)}
            disabled={photos.length === 0}
            className="btn-primary"
          >
            Start sleep mode
          </button>
        </div>
      </div>

      {!storageAvailable && !loading && (
        <p className="mb-4 rounded-card bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Photo storage isn't available here. Adding photos needs SkyDark running inside Home Assistant.
        </p>
      )}
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mb-4 rounded-card px-4 py-3 text-sm ${
            message.kind === "error"
              ? "bg-red-50 border border-red-200 text-red-800"
              : "bg-skydark-accent-bg text-skydark-text"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {photos.map((photo, index) => (
          <div key={photo.id} className="relative aspect-[3/2] rounded-card overflow-hidden bg-gray-100 shadow-skydark">
            <button
              type="button"
              onClick={() => setViewIndex(index)}
              className="absolute inset-0 w-full h-full focus-visible:ring-2 focus-visible:ring-skydark-accent focus-visible:ring-inset"
              aria-label={`View photo ${index + 1}`}
            >
              <img
                src={photo.url}
                alt={photo.caption || ""}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 hover:scale-[1.03]"
              />
            </button>
            {!photo.sample && (
              <button
                type="button"
                onClick={() => askDelete(photo.id)}
                className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-red-600 focus-visible:bg-red-600"
                aria-label={`Delete photo ${index + 1}`}
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {storageAvailable && (
          <button
            type="button"
            onClick={openPicker}
            disabled={uploading}
            className="aspect-[3/2] rounded-card border-2 border-dashed border-gray-300 text-skydark-text-secondary hover:border-skydark-accent hover:text-skydark-accent flex flex-col items-center justify-center gap-1 transition-colors"
          >
            <span className="text-3xl leading-none" aria-hidden>+</span>
            <span className="text-sm font-medium">{uploading ? "Adding…" : "Add photos"}</span>
          </button>
        )}
      </div>

      {viewing && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={() => setViewIndex(null)}
        >
          <img
            src={viewing.url}
            alt={viewing.caption || ""}
            className="max-w-full max-h-full object-contain p-4"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setViewIndex(null)}
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25"
            aria-label="Close photo"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 text-white text-2xl hover:bg-white/25"
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/15 text-white text-2xl hover:bg-white/25"
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Delete this photo?" variant="center">
        <div className="space-y-4">
          <p className="text-sm text-skydark-text-secondary">
            It will be removed from sleep mode and deleted from Home Assistant media.
          </p>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setToDelete(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={confirmDelete} disabled={deleting} className="btn-danger">
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </Modal>

      <PinPrompt {...pinPromptProps} title="Enter PIN to change photos" />
    </div>
  );
}
