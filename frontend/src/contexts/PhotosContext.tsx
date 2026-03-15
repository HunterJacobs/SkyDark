import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

export interface PhotoItem {
  id: string;
  url: string;
  caption: string;
}

const STORAGE_KEY = "skydark_photos";

// Default photos on first-ever load: bundled images in public/default-photos (1–8)
const BASE = "/skydark/default-photos/";
const DEFAULT_PHOTOS: PhotoItem[] = [
  { id: "1", url: `${BASE}1.png`, caption: "Family" },
  { id: "2", url: `${BASE}2.png`, caption: "Trip" },
  { id: "3", url: `${BASE}3.png`, caption: "" },
  { id: "4", url: `${BASE}4.png`, caption: "" },
  { id: "5", url: `${BASE}5.png`, caption: "" },
  { id: "6", url: `${BASE}6.png`, caption: "" },
  { id: "7", url: `${BASE}7.png`, caption: "" },
  { id: "8", url: `${BASE}8.png`, caption: "" },
];

function loadStoredPhotos(): PhotoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PHOTOS;
    const parsed = JSON.parse(raw) as PhotoItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PHOTOS;
    return parsed;
  } catch {
    return DEFAULT_PHOTOS;
  }
}

function savePhotos(photos: PhotoItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
  } catch {
    // ignore quota or disabled localStorage
  }
}

interface PhotosContextValue {
  photos: PhotoItem[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoItem[]>>;
}

const PhotosContext = createContext<PhotosContextValue | null>(null);

export function PhotosProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<PhotoItem[]>(loadStoredPhotos);

  useEffect(() => {
    savePhotos(photos);
  }, [photos]);

  const setPhotosPersisted = useCallback<React.Dispatch<React.SetStateAction<PhotoItem[]>>>((action) => {
    setPhotos((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      return next;
    });
  }, []);

  const value: PhotosContextValue = { photos, setPhotos: setPhotosPersisted };
  return (
    <PhotosContext.Provider value={value}>{children}</PhotosContext.Provider>
  );
}

export function usePhotosContext(): PhotosContextValue {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotosContext must be used within PhotosProvider");
  return ctx;
}
