// Writes the favicon and app-icon files in public/ from the logo sources in brand/.
// Run by hand after changing a brand SVG (`node scripts/build-icons.mjs`); the outputs are committed,
// so the build itself never runs this.
import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const brand = (name) => join(root, 'brand', name);
const pub = (name) => join(root, 'public', name);

// The tab icon: the 16px-grid drawing, which follows the OS light/dark theme on its own.
copyFileSync(brand('favicon.svg'), pub('favicon.svg'));

// The PNG fallback for browsers without SVG favicons: the 48px-grid mark on transparent.
// Loaded as a file, so its CSS-variable and currentColor fills need the literal colors.
const mark = readFileSync(brand('mark.svg'), 'utf8')
  .replace('var(--term-accent, #33477a)', '#33477a')
  .replace('fill: currentColor', 'fill: #1a1a19');
await sharp(Buffer.from(mark), { density: 384 }).resize(32, 32).png().toFile(pub('favicon-32.png'));

// Home-screen and PWA icons: the mark on an ink square.
for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  await sharp(brand('app-icon.svg'), { density: 384 }).resize(size, size).png().toFile(pub(file));
}
console.log('wrote public/favicon.svg, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png');
