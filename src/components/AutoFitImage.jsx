import { useEffect, useState, useRef } from 'react';

// Caches auto-trimmed URLs in memory so it only processes each image once
const trimmedCache = new Map();

export default function AutoFitImage({ src, alt, style = {}, onMouseEnter, onMouseLeave }) {
  const [displaySrc, setDisplaySrc] = useState(trimmedCache.get(src) || src);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (trimmedCache.has(src)) {
      setDisplaySrc(trimmedCache.get(src));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous'; // Allows reading canvas data from Supabase storage
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = 0;
        let maxY = 0;
        let foundPixel = false;

        // Scan pixels for non-transparent content
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha > 15) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              foundPixel = true;
            }
          }
        }

        // If no transparency or already tightly bounded, use original
        if (!foundPixel || (minX <= 5 && minY <= 5 && maxX >= canvas.width - 6 && maxY >= canvas.height - 6)) {
          trimmedCache.set(src, src);
          if (isMounted.current) setDisplaySrc(src);
          return;
        }

        // Add 2% padding
        const pad = Math.round(Math.max(canvas.width, canvas.height) * 0.02);
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropW = Math.min(canvas.width - cropX, (maxX - minX) + pad * 2);
        const cropH = Math.min(canvas.height - cropY, (maxY - minY) + pad * 2);

        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = cropW;
        trimmedCanvas.height = cropH;
        const trimmedCtx = trimmedCanvas.getContext('2d');
        trimmedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const trimmedUrl = trimmedCanvas.toDataURL('image/webp', 0.95);
        trimmedCache.set(src, trimmedUrl);
        if (isMounted.current) setDisplaySrc(trimmedUrl);
      } catch {
        // If CORS or error, gracefully fallback to original
        trimmedCache.set(src, src);
        if (isMounted.current) setDisplaySrc(src);
      }
    };
    img.onerror = () => {
      trimmedCache.set(src, src);
      if (isMounted.current) setDisplaySrc(src);
    };
    img.src = src;

    return () => {
      isMounted.current = false;
    };
  }, [src]);

  return (
    <img
      src={displaySrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  );
}