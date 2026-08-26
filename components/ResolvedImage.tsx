import React, { useEffect, useRef, useState } from 'react';
import { getImageBlobByRef, isImageRef } from '../utils/imageStorage';

type ResolvedImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallbackSrc?: string;
  onResolved?: () => void;
};

const ResolvedImage: React.FC<ResolvedImageProps> = ({ src, fallbackSrc, onResolved, onLoad, onError, ...imgProps }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(fallbackSrc || '');
  const onResolvedRef = useRef(onResolved);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    if (image.complete) {
      onResolvedRef.current?.();
    }
  }, [resolvedSrc]);

  useEffect(() => {
    let isCancelled = false;
    let objectUrl = '';

    const resolveSrc = async () => {
      const source = src?.trim();
      if (!source) {
        const nextFallback = fallbackSrc || '';
        setResolvedSrc(nextFallback);
        if (!nextFallback) onResolvedRef.current?.();
        return;
      }

      if (!isImageRef(source)) {
        setResolvedSrc(source);
        return;
      }

      try {
        const blob = await getImageBlobByRef(source);
        if (!blob || isCancelled) {
          const nextFallback = fallbackSrc || '';
          setResolvedSrc(nextFallback);
          if (!nextFallback) onResolvedRef.current?.();
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      } catch {
        if (!isCancelled) {
          const nextFallback = fallbackSrc || '';
          setResolvedSrc(nextFallback);
          if (!nextFallback) onResolvedRef.current?.();
        }
      }
    };

    resolveSrc();

    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, fallbackSrc]);

  if (!resolvedSrc) return null;
  return (
    <img
      {...imgProps}
      ref={imageRef}
      src={resolvedSrc}
      onLoad={(event) => {
        onLoad?.(event);
        onResolvedRef.current?.();
      }}
      onError={(event) => {
        onError?.(event);
        onResolvedRef.current?.();
      }}
    />
  );
};

export default ResolvedImage;
