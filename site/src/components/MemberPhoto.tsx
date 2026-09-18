'use client';

// A member's official photo, with a fallback for the rare case where Congress.gov's own image
// cache 404s for a sitting member (seen for Scott Perry, P000605): the bioguide.congress.gov
// photo endpoint is tried next, and only then the plain placeholder circle every other member
// falls back to when photoUrl is null.
//
// The page is static HTML (output: export), so the browser starts loading the img.src from the
// server-rendered markup before React hydrates and attaches onError below -- on a slow or
// already-failed image, the load can finish (and fail) before that listener exists to catch it.
// The onLoad/useEffect check below covers that race by inspecting the element directly once
// mounted, in addition to onError catching any failure that happens after.
import { useEffect, useRef, useState } from 'react';

export function MemberPhoto({
  photoUrl,
  bioguideId,
  className,
}: {
  photoUrl: string | null;
  bioguideId: string;
  className: string;
}) {
  const fallbackUrl = `https://bioguide.congress.gov/photo/${bioguideId}.jpg`;
  const [src, setSrc] = useState(photoUrl ?? fallbackUrl);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const advance = () => {
    setSrc((current) => (current === fallbackUrl ? current : fallbackUrl));
    if (src === fallbackUrl) setFailed(true);
  };

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      advance();
    }
    // Only checked once, right after this src mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (failed) {
    return <div className={`bg-[#DEDCD6] border border-rule flex-none ${className}`} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className={`object-cover bg-[#DEDCD6] border border-rule flex-none ${className}`}
      onError={advance}
    />
  );
}
