import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

// Self-hosted at build time by next/font: the built site loads no third-party fonts.
const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
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
