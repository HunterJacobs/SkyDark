import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

export interface PhotoItem {
  id: string;
  url: string;
  caption: string;
}

// Default photos: bundled images in public/default-photos (barn, nature, farm, etc.)
const BASE = "/skydark/default-photos/";
const INITIAL_PHOTOS: PhotoItem[] = [
  { id: "1", url: `${BASE}1.png`, caption: "Family" },
  { id: "2", url: `${BASE}2.png`, caption: "Trip" },
  { id: "3", url: `${BASE}3.png`, caption: "" },
  { id: "4", url: `${BASE}4.png`, caption: "" },
  { id: "5", url: `${BASE}5.png`, caption: "" },
  { id: "6", url: `${BASE}6.png`, caption: "" },
  { id: "7", url: `${BASE}7.png`, caption: "" },
  { id: "8", url: `${BASE}8.png`, caption: "" },
];

interface PhotosContextValue {
  photos: PhotoItem[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoItem[]>>;
}

const PhotosContext = createContext<PhotosContextValue | null>(null);

export function PhotosProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<PhotoItem[]>(INITIAL_PHOTOS);
  const value: PhotosContextValue = { photos, setPhotos };
  return (
    <PhotosContext.Provider value={value}>{children}</PhotosContext.Provider>
  );
}

export function usePhotosContext(): PhotosContextValue {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotosContext must be used within PhotosProvider");
  return ctx;
}
