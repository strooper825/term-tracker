'use client';

// The owner's notice across the top of every page (site/content/site.json, edited at /admin).
// A visitor can dismiss it; that is remembered in their browser for this message only, so a
// new message shows again. It also takes itself down after its end date between deploys.
import { useEffect, useState } from 'react';
import { bannerExpired, type Banner } from '@/lib/banner';

export const BANNER_KEY = 'term-banner-dismissed';

export function SiteBanner({ banner }: { banner: Banner }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(BANNER_KEY) === banner.message;
    } catch {
      /* storage refused: the banner simply shows */
    }
    setHidden(dismissed || bannerExpired(banner.until));
  }, [banner]);

  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(BANNER_KEY, banner.message);
    } catch {
      /* not remembered */
    }
  };
  const external = /^https?:/.test(banner.linkUrl);
  return (
    <div
      role="region"
      aria-label="Site notice"
      className={`flex items-center justify-center gap-3 pl-6 pr-3 py-1.5 text-[14px] ${
        banner.quiet ? 'bg-lockBg text-ink border-b border-lockRule' : 'bg-navy text-white'
      }`}
    >
      <p className="m-0 py-1.5 text-center">
        {banner.message}
        {banner.linkUrl && (
          <>
            {' '}
            <a
              href={banner.linkUrl}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className={`font-semibold underline ${banner.quiet ? 'text-navy hover:text-ink' : 'text-white hover:text-white'}`}
            >
              {banner.linkText}
              {external && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
          </>
        )}
      </p>
      <button
        type="button"
        aria-label="Dismiss the notice"
        onClick={dismiss}
        className="flex-none w-11 h-11 inline-flex items-center justify-center bg-transparent border-0 cursor-pointer text-current"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
