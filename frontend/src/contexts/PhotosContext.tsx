/**
 * Photos for the gallery and the sleep-mode slideshow.
 *
 * Photos live in Home Assistant (Media > My Media > Calendar Images) so they
 * survive reloads and are shared by every display. Until the family adds their
 * own, a few bundled sample photos are shown instead.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSkydarkDataContext } from "./SkydarkDataContext";
import { deletePhoto, fetchPhotos, uploadPhoto } from "../lib/skyDarkApi";
import { prepareImageForUpload } from "../lib/imageUpload";

export interface PhotoItem {
  id: string;
  url: string;
  caption: string;
  /** Bundled sample photo (not stored in Home Assistant, can't be deleted). */
  sample?: boolean;
}

const SAMPLE_PHOTO_COUNT = 8;
const SAMPLE_PHOTOS: PhotoItem[] = Array.from({ length: SAMPLE_PHOTO_COUNT }, (_, i) => ({
  id: `sample-${i + 1}`,
  url: `${import.meta.env.BASE_URL}default-photos/${i + 1}.png`,
  caption: "",
  sample: true,
}));

/** Signed photo URLs last 24h; refresh well before they expire. */
const REFRESH_MS = 6 * 60 * 60 * 1000;

export interface UploadResult {
  added: number;
  failed: string[];
}

interface PhotosContextValue {
  /** What to display: the family's photos, or samples if there are none yet. */
  photos: PhotoItem[];
  showingSamples: boolean;
  /** False when photo storage isn't available (e.g. standalone dev mode). */
  storageAvailable: boolean;
  loading: boolean;
  uploading: boolean;
  addPhotos: (files: File[]) => Promise<UploadResult>;
  removePhoto: (id: string) => Promise<void>;
}

const PhotosContext = createContext<PhotosContextValue | null>(null);

export function PhotosProvider({ children }: { children: ReactNode }) {
  const conn = useSkydarkDataContext()?.data?.connection ?? null;
  const [stored, setStored] = useState<PhotoItem[]>([]);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!conn) return;
    try {
      const res = await fetchPhotos(conn);
      setStorageAvailable(res.supported !== false);
      setStored((res.photos ?? []).map((p) => ({ id: p.id, url: p.url, caption: p.caption ?? "" })));
    } catch {
      // Older integration version or not loaded: fall back to samples.
      setStorageAvailable(false);
    } finally {
      setLoading(false);
    }
  }, [conn]);

  useEffect(() => {
    if (!conn) {
      setLoading(false);
      return;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [conn, refresh]);

  const addPhotos = useCallback(
    async (files: File[]): Promise<UploadResult> => {
      const failed: string[] = [];
      if (!conn || !storageAvailable) {
        return { added: 0, failed: files.map((f) => f.name) };
      }
      setUploading(true);
      const added: PhotoItem[] = [];
      try {
        for (const file of files) {
          try {
            const dataUrl = await prepareImageForUpload(file);
            const { photo } = await uploadPhoto(conn, dataUrl);
            added.push({ id: photo.id, url: photo.url, caption: photo.caption ?? "" });
          } catch {
            failed.push(file.name);
          }
        }
      } finally {
        setUploading(false);
      }
      if (added.length) setStored((prev) => [...added.reverse(), ...prev]);
      return { added: added.length, failed };
    },
    [conn, storageAvailable]
  );

  const removePhoto = useCallback(
    async (id: string) => {
      if (!conn) return;
      await deletePhoto(conn, id);
      setStored((prev) => prev.filter((p) => p.id !== id));
    },
    [conn]
  );

  const value = useMemo<PhotosContextValue>(() => {
    const showingSamples = stored.length === 0;
    return {
      photos: showingSamples ? SAMPLE_PHOTOS : stored,
      showingSamples,
      storageAvailable,
      loading,
      uploading,
      addPhotos,
      removePhoto,
    };
  }, [stored, storageAvailable, loading, uploading, addPhotos, removePhoto]);

  return <PhotosContext.Provider value={value}>{children}</PhotosContext.Provider>;
}

export function usePhotosContext(): PhotosContextValue {
  const ctx = useContext(PhotosContext);
  if (!ctx) throw new Error("usePhotosContext must be used within PhotosProvider");
  return ctx;
}
