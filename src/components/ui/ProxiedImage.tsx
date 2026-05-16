import { forwardRef } from "react";
import { useProxyImage } from "@/hooks/useProxyImage";

interface ProxiedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
}

export const ProxiedImage = forwardRef<HTMLImageElement, ProxiedImageProps>(
  ({ src: rawSrc, ...props }, ref) => {
    const src = useProxyImage(rawSrc);
    return <img ref={ref} src={src} {...props} />;
  }
);

ProxiedImage.displayName = "ProxiedImage";
