import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// IBM Plex Sans, latin subset, from the files in src/fonts (OFL 1.1, licence beside them; taken
// from @fontsource/ibm-plex-sans 5.3.0). Not next/font/google: that downloads the font from
// Google on every build, and when the download failed the build failed and the nightly's deploy
// with it (2026-10-01, 2026-11-10). The built site loads no third-party fonts either way.
const plex = localFont({
  src: [
    { path: '../fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/ibm-plex-sans-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Term Tracker',
  description: 'Term dashboards for members of Congress, refreshed nightly from public records.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plex.variable}>
      <body className="font-sans text-ink bg-canvas m-0">{children}</body>
    </html>
  );
}
