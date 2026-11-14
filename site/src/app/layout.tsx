import type { Metadata, Viewport } from 'next';
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

// JetBrains Mono Bold, latin subset, for the [Term] wordmark only (OFL 1.1, licence beside it;
// taken from @fontsource/jetbrains-mono 5.3.0). Local for the same reason as Plex.
const mono = localFont({
  src: [{ path: '../fonts/jetbrains-mono-latin-700-normal.woff2', weight: '700', style: 'normal' }],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Term',
  description: 'Term dashboards for members of Congress, refreshed nightly from public records.',
  // The [T] mark, from site/brand via scripts/build-icons.mjs.
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = { themeColor: '#1a1a19' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plex.variable} ${mono.variable}`}>
      <body className="font-sans text-ink bg-canvas m-0">{children}</body>
    </html>
  );
}
