import { useEffect, useState } from "react";

/**
 * 从封面图提取环境主色（ dominant saturated color）。
 * 图像经本地代理加载（同源），canvas 不会被污染。
 * 提取失败/无图返回 null，调用方回退默认底色。
 */
export function useAmbientColor(src: string | undefined): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setColor(null);
      return;
    }
    let cancelled = false;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        // 逐像素累计：偏好高饱和、中高亮度的像素（背景色提亮后与页面融合）
        let rSum = 0, gSum = 0, bSum = 0, weight = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;
          const brightness = (r + g + b) / 3;
          // 纯灰像素权重低；过暗/过亮像素几乎不计
          const w = saturation * saturation * (brightness > 24 && brightness < 230 ? 1 : 0.05);
          rSum += r * w;
          gSum += g * w;
          bSum += b * w;
          weight += w;
        }

        if (weight === 0) {
          if (!cancelled) setColor(null);
          return;
        }

        const r = Math.round(rSum / weight);
        const g = Math.round(gSum / weight);
        const b = Math.round(bSum / weight);
        if (!cancelled) setColor(`rgb(${r} ${g} ${b})`);
      } catch {
        // canvas 提取失败（如图像尚未解码）静默回退
      }
    };
    image.onerror = () => {
      if (!cancelled) setColor(null);
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return color;
}
