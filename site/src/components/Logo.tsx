// The [Term] wordmark: live text, not an image, in the one monospace face the site loads.
// Construction rules (site/brand/README.md): square brackets in the accent, the word in the text
// color, bold mono, tight tracking. Never below 16px; smaller places use the [T] favicon mark.

const SIZES = {
  header: 'text-[17px] md:text-[20px]',
  footer: 'text-[18px]',
  hero: 'text-[54px]',
} as const;

export function Logo({
  size = 'header',
  tone = 'light',
  href = '/',
}: {
  size?: keyof typeof SIZES;
  /** `dark` for ink backgrounds: white word, lighter brackets. */
  tone?: 'light' | 'dark';
  /** Where the wordmark links; null renders it as plain text. */
  href?: string | null;
}) {
  const className = `${SIZES[size]} font-mono font-bold tracking-[-0.04em] leading-none whitespace-nowrap inline-block ${
    tone === 'dark' ? 'text-white' : 'text-ink'
  }`;
  const bracket = tone === 'dark' ? 'text-navyOnDark' : 'text-navy';
  const word = (
    <>
      <span className={bracket} aria-hidden="true">
        [
      </span>
      Term
      <span className={bracket} aria-hidden="true">
        ]
      </span>
    </>
  );
  return href === null ? (
    <span className={className} aria-label="Term">
      {word}
    </span>
  ) : (
    <a href={href} className={`${className} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-navy`} aria-label="Term — home">
      {word}
    </a>
  );
}
