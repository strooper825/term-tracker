/** Design tokens for Term Tracker, copied from design/tailwind.config.js (Claude Design export).
 *  Only the content globs differ. Light theme only. Party colors are reserved for party badges
 *  and the member's own vote positions, never page chrome. Event-type colors stay separable
 *  under deuteranopia/protanopia and avoid collision with party red/blue.
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
        lockBg: '#F8F7F4',
        lockRule: '#DEDCD6',
        lockInk: '#B4B1A9',
        party: { r: '#B9302F', d: '#1F4E9C', i: '#5F6B3A' },
        partyTint: { r: '#FBF0EF', d: '#EEF3FB' },
        event: {
          vote: '#B45309',
          sponsor: '#0E7C66',
          cosponsor: '#6D4AA8',
          committee: '#4B5566',
          speech: '#B0407A', // RESERVED for Phase 3; not rendered in v1
        },
      },
      fontFamily: { sans: ['var(--font-plex)', '"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
      fontSize: {
        micro: ['9.5px', { lineHeight: '1.2' }],
        label: ['10.5px', { lineHeight: '1.2', letterSpacing: '0.07em' }],
        meta: ['11.5px', { lineHeight: '1.5' }],
        sm: ['12.5px', { lineHeight: '1.45' }],
        base: ['13.5px', { lineHeight: '1.4' }],
        card: ['14px', { lineHeight: '1.3', letterSpacing: '0.01em' }],
        stat: ['27px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        name: ['27px', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
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
