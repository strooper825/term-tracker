# Design handoff (Claude Design export, 2026-09-12)

Visual target for Phase 1f. The React components and Tailwind tokens here are the source of
truth for layout and styling; `site/` ports them to TypeScript and replaces every literal in
`src/data/sampleData.js` with a prop sourced from a mart column through the Phase 1d API.
Do not edit this directory to fix the site; edit `site/` and, if the design must change,
re-export from Claude Design.
