/** Design tokens for Term Tracker, copied from design/tailwind.config.js (Claude Design export).
 *  Only the content globs differ. Light theme only. Party colors are reserved for party badges
 *  and the member's own vote positions, never page chrome or a UI accent: red and blue mean
 *  Republican/Yea and Democratic/Nay and nothing else. `navy` is the site's own accent (wordmark,
 *  term-progress and fundraising bars, "Chair"/"On the ballot" emphasis); event-type colors are
 *  a ramp on that one hue, not a separate hue per type -- see src/data/eventTypes.ts.
 *
 *  Type scale (design-audit-cleanup): nine named tiers, nothing below `micro`. Earlier passes
 *  had every card pulling its own one-off px values, extracted 1:1 from two dense mockup PDFs
 *  designed at print density -- readable in a PDF viewer, not at a real screen distance. Every
 *  component now names a tier instead of a pixel: micro (10, least-important captions) - label
 *  (11, short uppercase category tags: "ATTENDANCE", "YEA") - meta (12, dates, tallies, secondary
 *  metadata) - body (13.5, descriptive/list text) - base (15, primary row text: feed headlines,
 *  committee names) - heading (17, every card h2, uniformly -- this used to split three ways:
 *  12 / 13.5 / 16.5) - stat (21, every stat number on the site, was 15 in some places and 27 in
 *  others) - title (27, page h1s) - display (28, the one outcome headline per card, e.g. a vote's
 *  "Passed"/"Failed"). Long lines lost `uppercase`: all-caps helps a 2-3 word tag read as "this is
 *  a category," but hurts word-shape recognition on anything sentence-length, so it stays on
 *  `label`-tier tags only, never on a `meta` or `body` line.
 */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F6F5F2',
        sheet: '#FDFDFC',
        card: '#FFFFFF',
        rule: '#E6E4DF',
        ruleSoft: '#F0EEE9',
        ink: '#1A1A19',
        ink2: '#57564F',
        ink3: '#8A877F',
        ink4: '#A6A39C',
        lockBg: '#ECEEF3',
        lockRule: '#CCD1D5',
        lockInk: '#676E75',
        navy: '#33477A',
        party: { r: '#B9302F', d: '#1F4E9C', i: '#57564F' },
        partyTint: { r: '#FBF0EF', d: '#EEF3FB' },
        event: {
          vote: '#33477A',
          sponsor: '#4C63A0',
          cosponsor: '#7F92C4',
          committee: '#C2CCDF',
          speech: '#26355E', // RESERVED for Phase 3; not rendered in v1
        },
      },
      fontFamily: { sans: ['var(--font-plex)', '"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
      fontSize: {
        micro: ['10px', { lineHeight: '1.3' }],
        label: ['11px', { lineHeight: '1.3', letterSpacing: '0.06em' }],
        meta: ['12px', { lineHeight: '1.45' }],
        body: ['13.5px', { lineHeight: '1.55' }],
        base: ['15px', { lineHeight: '1.45' }],
        heading: ['17px', { lineHeight: '1.3' }],
        stat: ['21px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        title: ['27px', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        display: ['28px', { lineHeight: '1', letterSpacing: '-0.015em' }],
      },
      spacing: { section: '28px', card: '18px', row: '11px', gutter: '28px' },
      borderRadius: { card: '6px', chip: '3px', ctl: '4px' },
      gridTemplateColumns: {
        main: 'minmax(0,2fr) minmax(0,1fr)',
        stats: 'repeat(6, minmax(0,1fr))',
        statsMobile: 'repeat(3, minmax(0,1fr))',
        locked: 'repeat(4, minmax(0,1fr))',
      },
      screens: { sm: '390px', md: '768px', lg: '1024px', xl: '1280px' },
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({ '.tnum': { fontVariantNumeric: 'tabular-nums' } });
    },
  ],
};
