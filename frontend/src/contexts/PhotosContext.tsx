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

const INITIAL_PHOTOS: PhotoItem[] = [
  { id: "1", url: "https://picsum.photos/1920/1080?random=1", caption: "Family" },
  { id: "2", url: "https://picsum.photos/1920/1080?random=2", caption: "Trip" },
  { id: "3", url: "https://picsum.photos/1920/1080?random=3", caption: "" },
  { id: "4", url: "https://picsum.photos/1920/1080?random=4", caption: "" },
  { id: "5", url: "https://picsum.photos/1920/1080?random=5", caption: "" },
  { id: "6", url: "https://picsum.photos/1920/1080?random=6", caption: "" },
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
