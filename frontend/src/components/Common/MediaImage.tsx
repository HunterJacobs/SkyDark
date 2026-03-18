/**
 * Image component that resolves media-source:// URLs for display.
 * Use for photos stored in Home Assistant Media > My Media > Calendar Images.
 */

import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import { useSkydarkDataContext } from "../../contexts/SkydarkDataContext";

interface MediaImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

export default function MediaImage({ src, ...props }: MediaImageProps) {
  const conn = useSkydarkDataContext()?.data?.connection ?? null;
  const resolvedSrc = useResolvedMediaUrl(src, conn);
  return <img src={resolvedSrc} {...props} />;
}
