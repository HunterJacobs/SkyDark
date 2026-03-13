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

// Placeholder: 1x1 transparent pixel (works fully offline; real photos come from HA backend)
const PLACEHOLDER_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

const INITIAL_PHOTOS: PhotoItem[] = [
  { id: "1", url: PLACEHOLDER_DATA_URI, caption: "Family" },
  { id: "2", url: PLACEHOLDER_DATA_URI, caption: "Trip" },
  { id: "3", url: PLACEHOLDER_DATA_URI, caption: "" },
  { id: "4", url: PLACEHOLDER_DATA_URI, caption: "" },
  { id: "5", url: PLACEHOLDER_DATA_URI, caption: "" },
  { id: "6", url: PLACEHOLDER_DATA_URI, caption: "" },
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
