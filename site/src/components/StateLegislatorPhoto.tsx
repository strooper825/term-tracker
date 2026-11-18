'use client';

// A state legislator's photo, linked from the legislature's own site (Open States records the
// URL). Many of those sites are slow or refuse some requests, so a photo that fails shows the
// member's initials instead. http:// photos are asked for over https, as the browser would on
// this https page anyway. As with MemberPhoto, a load that fails before React attaches onError
// is caught by checking the element once it mounts.
import { useEffect, useRef, useState } from 'react';
import { initials } from '@/lib/states';

const BOX = 'w-16 h-20 flex-none rounded-ctl border border-rule';

export function StateLegislatorPhoto({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(!src);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed || !src) {
    return (
      <div aria-hidden className={`${BOX} bg-[#DEDCD6] flex items-center justify-center text-heading font-semibold text-ink2`}>
        {initials(name)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src.replace(/^http:\/\//, 'https://')}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`${BOX} object-cover object-top bg-[#DEDCD6]`}
      onError={() => setFailed(true)}
    />
  );
}
