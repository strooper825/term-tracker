# Term Tracker — handoff

Two page layouts, one component per card, plus design tokens.

    src/
      pages/MemberDashboard.jsx    # /members/:bioguideId
      pages/MembersIndex.jsx       # /members
      components/                  # one file per card / region
      data/eventTypes.js           # the FOUR v1 event types
      data/sampleData.js           # shape reference — replace with API data
    tailwind.config.js             # design tokens (colors, type scale, spacing)

Conventions
- Tailwind only; tokens live in tailwind.config.js. No inline styles except
  data-driven widths/heights (progress bar, timeline bars).
- All numeric UI carries `.tnum` (tabular figures).
- Party color is used ONLY on party badges. Never as page chrome, never on
  vote positions (YEA/NAY are bold dark ink).
- Badges never rely on color alone — the party word is always present.
- v1 renders FOUR event types: vote, sponsor, cosponsor, committee.
  `event.speech` (#B0407A) is reserved for Phase 3 (Congressional Record);
  do not render or synthesize speech events.
- Every number is expected to arrive with a source URL; `SourceLink` renders it.
