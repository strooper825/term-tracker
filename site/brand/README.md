# Term logo

The site is **Term** (formerly Term Tracker). The logo is the bracketed wordmark **`[Term]`**: a term
is a span with a fixed start and end, so the word sits inside square brackets, set in a monospace
face so it reads like a value in a data record.

## Rules

1. Square brackets only, never round, curly or angle.
2. Brackets in the accent (`navy`, #33477A), the word in the text color (`ink`, #1A1A19). Never the
   reverse, never both the same. On the ink footer: white word, `navyOnDark` (#7F8DB5) brackets.
3. JetBrains Mono Bold (`font-mono`), tracking −0.04em, title case `Term`.
4. No icon beside it and no tagline inside the brackets; the name is the mark.
5. Never below 16px. Smaller places (browser tab, app icons) use the `[T]` mark below.

Contrast with the site's colors: brackets on the sheet 8.9:1, word on the sheet 17.1:1, brackets on
the ink footer 5.3:1, `[T]` brackets on the navy avatar 4.4:1 (graphic, needs 3:1).

The wordmark is live text, not an image: `src/components/Logo.tsx`
(`<Logo size="header|footer|hero" tone="light|dark" />`).

## The `[T]` mark

| File | Use |
|---|---|
| `favicon.svg` | 16px grid, pixel-snapped; browser tab. Follows the OS light/dark theme by itself. |
| `mark.svg` | 48px grid; 24px and up. Inline in HTML it takes `currentColor` and `--term-accent`. |
| `app-icon.svg` | Mark on an ink square; source of the apple-touch and PWA icons. |
| `avatar.svg` | Mark on a navy circle; social profile picture. |

Each is drawn for its size; don't scale one into the other. The files hard-code the colors above
because CSS variables don't reach an SVG loaded as a favicon or `<img>`.

After changing any of them, regenerate the files in `public/` and commit them:

```bash
node scripts/build-icons.mjs
```

Not done yet: social/OG share images with the live wordmark.
