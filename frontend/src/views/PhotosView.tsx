import { useState, useRef } from "react";
import { usePhotosContext } from "../contexts/PhotosContext";
import { useAppContext } from "../contexts/AppContext";
import PinPrompt from "../components/Common/PinPrompt";
import CloseIcon from "../components/Common/CloseIcon";

export default function PhotosView() {
  const { photos, setPhotos } = usePhotosContext();
  const { setScreensaverTriggered, isFeatureLocked, verifyPin } = useAppContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const maxSizeBytes = 1.5 * 1024 * 1024; // 1.5 MB per image so localStorage stays usable
    let added = 0;
    files.forEach((file, idx) => {
      if (file.size > maxSizeBytes) return;
      const id = `upload-${Date.now()}-${idx}`;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPhotos((prev) => [{ id, url: dataUrl, caption: "" }, ...prev]);
        added += 1;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleImportClick = () => {
    if (isFeatureLocked("importPhotos")) {
      setShowPinPrompt(true);
      return;
    }
    uploadRef.current?.click();
  };

  const handlePinVerify = (pin: string): boolean => {
    if (!verifyPin(pin)) return false;
    setShowPinPrompt(false);
    uploadRef.current?.click();
    return true;
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPhotos((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item && item.url.startsWith("blob:")) URL.revokeObjectURL(item.url);
      return prev.filter((p) => p.id !== id);
    });
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="h-full">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-skydark-text">Photos</h2>
        <div className="flex items-center gap-2">
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
            aria-hidden
          />
          <button
            type="button"
            onClick={handleImportClick}
            className="btn-secondary"
          >
            Import photos
          </button>
          <button
            type="button"
            onClick={() => setScreensaverTriggered(true)}
            disabled={photos.length === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sleep
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative group aspect-[3/2] rounded-card overflow-hidden shadow-skydark"
          >
            <button
              type="button"
              onClick={() => setSelectedId(photo.id)}
              className="absolute inset-0 w-full h-full focus:ring-2 focus:ring-skydark-accent focus:ring-inset"
            >
              <img
                src={photo.url}
                alt={photo.caption || "Photo"}
                className="w-full h-full object-cover hover:shadow-skydark-hover transition-shadow"
              />
            </button>
            <button
              type="button"
              onClick={(e) => handleDelete(e, photo.id)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center text-lg font-bold opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-red-600"
              aria-label="Delete photo"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {selectedId && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedId(null)}
        >
          <img
            src={photos.find((p) => p.id === selectedId)?.url}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <PinPrompt
        open={showPinPrompt}
        onClose={() => setShowPinPrompt(false)}
        onVerify={handlePinVerify}
        title="Enter PIN to import photos"
      />
    </div>
  );
}
