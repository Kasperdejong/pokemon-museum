import { useEffect, useState, useRef } from 'react';

const fitCache = new Map();

export default function AutoFitImage({ src, alt, style = {}, onMouseEnter, onMouseLeave }) {
  const [fit, setFit] = useState(
    fitCache.get(src) || { scale: 1, origin: '50% 50%', shiftX: 0, shiftY: 0 }
  );
  const [hovered, setHovered] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (fitCache.has(src)) {
      setFit(fitCache.get(src));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 100;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);

        const data = ctx.getImageData(0, 0, size, size).data;
        let minX = size, minY = size, maxX = 0, maxY = 0;
        let found = false;

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (data[(y * size + x) * 4 + 3] > 15) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              found = true;
            }
          }
        }

        // If image has an opaque background or already touches edges, keep normal
        if (!found || (minX <= 3 && minY <= 3 && maxX >= size - 4 && maxY >= size - 4)) {
          const defaultFit = { scale: 1, origin: '50% 50%', shiftX: 0, shiftY: 0 };
          fitCache.set(src, defaultFit);
          if (isMounted.current) setFit(defaultFit);
          return;
        }

        const contentW = (maxX - minX) / size;
        const contentH = (maxY - minY) / size;
        const maxDim = Math.max(contentW, contentH);

        // Full maximum bigness (fills 95% of the card, up to 1.75x zoom)
        const calculatedScale = Math.min(1.75, Math.max(1, 0.95 / maxDim));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Check where the edges land at full zoom
        const topEdge = centerY - calculatedScale * (centerY - minY);
        const bottomEdge = centerY + calculatedScale * (maxY - centerY);
        const leftEdge = centerX - calculatedScale * (centerX - minX);
        const rightEdge = centerX + calculatedScale * (maxX - centerX);

        // Nudge only if an edge would clip outside the card (prevents Piplup's head from cutting off)
        let shiftY = 0;
        if (topEdge < 2) {
          shiftY = Math.round(2 - topEdge);
        } else if (bottomEdge > 98) {
          shiftY = Math.round(98 - bottomEdge);
        }

        let shiftX = 0;
        if (leftEdge < 2) {
          shiftX = Math.round(2 - leftEdge);
        } else if (rightEdge > 98) {
          shiftX = Math.round(98 - rightEdge);
        }

        const result = {
          scale: calculatedScale,
          origin: `${Math.round(centerX)}% ${Math.round(centerY)}%`,
          shiftX,
          shiftY
        };

        fitCache.set(src, result);
        if (isMounted.current) setFit(result);
      } catch {
        const fallback = { scale: 1, origin: '50% 50%', shiftX: 0, shiftY: 0 };
        fitCache.set(src, fallback);
        if (isMounted.current) setFit(fallback);
      }
    };

    img.onerror = () => {
      const fallback = { scale: 1, origin: '50% 50%', shiftX: 0, shiftY: 0 };
      fitCache.set(src, fallback);
      if (isMounted.current) setFit(fallback);
    };

    img.src = src;

    return () => {
      isMounted.current = false;
    };
  }, [src]);

  // Hover boost: scales an extra 1.08x and cleanly cuts off at the frame on hover
  const activeScale = hovered ? fit.scale * 1.08 : fit.scale;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      style={{
        ...style,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        transformOrigin: fit.origin,
        transform: `translate(${fit.shiftX}%, ${fit.shiftY}%) scale(${activeScale})`,
        transition: 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)'
      }}
      onMouseEnter={(e) => {
        setHovered(true);
        if (onMouseEnter) onMouseEnter(e);
      }}
      onMouseLeave={(e) => {
        setHovered(false);
        if (onMouseLeave) onMouseLeave(e);
      }}
    />
  );
}