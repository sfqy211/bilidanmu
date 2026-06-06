import { forwardRef } from "react";
import { useProxyImage } from "@/hooks/useProxyImage";

interface ProxiedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  persistent?: boolean;
}

export const ProxiedImage = forwardRef<HTMLImageElement, ProxiedImageProps>(
  ({ src: rawSrc, persistent, ...props }, ref) => {
    const src = useProxyImage(rawSrc, persistent);
    return <img ref={ref} src={src} {...props} />;
  }
);

ProxiedImage.displayName = "ProxiedImage";
