// Congress overview page (/congress). Server component: every prop is built at build time in
// src/lib/congress.ts from GET /api/v1/congress/overview. Three parts, in order: chamber
// composition for all 535 seats, the bills that passed both chambers (every bill in the
// database, whoever sponsored it), then a hard break and activity counting only the tracked
// members.
import { PARTY_COLOR } from '@/data/eventTypes';
import type { ChamberBar, CompositionSegment, CongressModel, StatCell } from '@/lib/congress';
import { PassedBothTable } from './PassedBothTable';
import { SiteFooter, SiteHeader } from './SiteChrome';

const PARTY_FILL: Record<string, string> = {
  republican: PARTY_COLOR.Republican,
  democratic: PARTY_COLOR.Democratic,
  independent: PARTY_COLOR.Independent,
};

/* A seat nobody holds: hatched, so it reads as absent rather than as a third party. */
const VACANT_FILL = 'repeating-linear-gradient(135deg, #CCD1D5 0 2px, #ECEEF3 2px 5px)';

function fillOf(seg: CompositionSegment) {
  return seg.key === 'vacant' ? { background: VACANT_FILL } : { background: PARTY_FILL[seg.key] };
}

function LegendSwatch({ style }: { style: React.CSSProperties }) {
  return <i aria-hidden className="w-2.5 h-2.5 flex-none rounded-[2px]" style={style} />;
}

/* Who is in charge, in words, above the bar. Party colour marks the party the sentence is
   about; nobody having a majority reads in neutral ink. */
function ControlPill({ bar }: { bar: ChamberBar }) {
  const tone =
    bar.controlParty === 'republican'
      ? 'bg-partyTint-r text-party-r border-party-r/40'
      : bar.controlParty === 'democratic'
        ? 'bg-partyTint-d text-party-d border-party-d/40'
        : 'bg-lockBg text-ink2 border-rule';
  return (
    <span
      className={`inline-block text-base font-semibold border rounded-ctl px-2.5 py-1 leading-snug ${tone}`}
    >
      {bar.headline}
    </span>
  );
}

/* Width per segment is the mart's seat_pct (seats / chamber seats), so the bar is the data.
   The marker is the majority line, placed at the mart's majority_pct. */
function ChamberBarBlock({ bar }: { bar: ChamberBar }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h3 className="text-heading font-semibold text-ink m-0">{bar.name}</h3>
        <span className="text-label uppercase text-ink3 tnum">{bar.seatsLine}</span>
      </div>
      <div className="flex flex-col gap-1.5 items-start">
        <ControlPill bar={bar} />
        <p className="text-meta text-ink2 m-0 tnum">{bar.detail}</p>
      </div>
      <div className="relative pt-6">
        <div
          data-majority-marker={bar.chamber}
          className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
          style={{ left: `${bar.majorityPct}%`, transform: 'translateX(-50%)' }}
        >
          <span className="text-label uppercase text-ink2 whitespace-nowrap tnum">
            {bar.majorityLabel}
          </span>
          <span aria-hidden className="flex-1 w-0.5 bg-ink" />
        </div>
        <div
          role="img"
          aria-label={bar.ariaLabel}
          className="flex h-[54px] w-full overflow-hidden rounded-ctl outline outline-1 outline-rule"
        >
          {bar.segments.map((seg) => (
            <div
              key={seg.key}
              title={seg.title}
              data-segment={seg.key}
              className="h-full flex-none flex items-center text-base font-semibold text-white tnum overflow-hidden whitespace-nowrap"
              style={{ width: `${seg.widthPct}%`, ...fillOf(seg) }}
            >
              {/* The padding lives on the label, not the segment: a one-seat segment has no
                  label, and padding on it would widen it past its share and squeeze the rest. */}
              {seg.barLabel && <span className="px-3">{seg.barLabel}</span>}
            </div>
          ))}
        </div>
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1.5">
        {bar.segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-1.5 text-label uppercase text-ink2 tnum">
            <LegendSwatch style={fillOf(seg)} />
            {seg.legend}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompositionCard({ model }: { model: CongressModel }) {
  const { composition } = model;
  return (
    <section aria-labelledby="composition-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-ruleSoft flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 id="composition-title" className="text-heading font-semibold text-ink m-0">
            Chamber composition
          </h2>
          <span className="text-label uppercase text-ink2 bg-lockBg border border-rule rounded-chip px-2 py-0.5 tnum">
            All 535 seats
          </span>
        </div>
        <span className="text-meta text-ink3">
          Source:{' '}
          {composition.sources.map((s, i) => (
            <span key={s.href}>
              {i > 0 && ' / '}
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-rule underline-offset-2"
              >
                {s.label}
                <span aria-hidden> ↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </span>
          ))}{' '}
          · as of {composition.asOf} · updated manually
        </span>
      </div>
      <div className="px-[18px] py-5 flex flex-col gap-8">
        {composition.chambers.map((bar) => (
          <ChamberBarBlock key={bar.chamber} bar={bar} />
        ))}
      </div>
    </section>
  );
}

function PassedBothCard({ model }: { model: CongressModel }) {
  const { passedBoth } = model;
  return (
    <section aria-labelledby="passed-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-ruleSoft flex flex-col gap-2">
        <div className="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap">
          <h2 id="passed-title" className="text-heading font-semibold text-ink m-0">
            Passed both chambers
          </h2>
          <span className="text-label uppercase text-ink2 bg-lockBg border border-rule rounded-chip px-2 py-0.5 tnum">
            {passedBoth.chip}
          </span>
          <span className="text-label uppercase text-ink3 tnum">{passedBoth.meta}</span>
        </div>
        <p className="text-meta text-ink3 m-0 max-w-[80ch]">{passedBoth.scope}</p>
      </div>
      <div className="px-[18px] py-4">
        <PassedBothTable rows={passedBoth.rows} />
      </div>
    </section>
  );
}

/* The hard break. Full width of the sheet, solid navy, and set apart from both halves, so a
   reader scrolling past cannot mistake the counts below for counts of all of Congress. */
function ScopeDivider({ scope }: { scope: CongressModel['scope'] }) {
  return (
    <div
      role="separator"
      aria-label="Scope change"
      className="bg-navy text-white px-7 py-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-y-4 border-ink"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <span className="self-start flex-none text-label uppercase font-bold text-navy bg-white rounded-chip px-2.5 py-1">
          Scope change
        </span>
        <p className="text-heading font-semibold m-0 leading-snug">{scope.message}</p>
      </div>
      <a
        href={scope.href}
        className="self-start flex-none text-label uppercase text-white border border-white/70 rounded-ctl px-3.5 py-2 hover:bg-white/10"
      >
        {scope.linkLabel} →
      </a>
    </div>
  );
}

/* Cells sit on a one-pixel grid gap over the rule colour, so the lines between them stay
   right at any column count. */
function StatGrid({ stats }: { stats: StatCell[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-rule border border-rule rounded-card overflow-hidden">
      {stats.map((s) => (
        <div key={s.label} className="bg-card p-4 flex flex-col gap-1.5">
          <span className="text-label uppercase text-ink3">{s.label}</span>
          <span className="text-stat font-semibold text-ink tnum">{s.value}</span>
          <span className="text-meta text-ink2 tnum">{s.sub}</span>
          {s.note && <span className="text-meta text-ink3">{s.note}</span>}
        </div>
      ))}
    </div>
  );
}

function ActivitySection({ model }: { model: CongressModel }) {
  const { activity } = model;
  return (
    <section
      aria-labelledby="activity-title"
      className="bg-card border-x-4 border-b-4 border-navy px-[18px] py-6 md:px-7 flex flex-col gap-5"
    >
      <div className="flex items-baseline justify-between gap-x-4 gap-y-1 flex-wrap">
        <h2 id="activity-title" className="text-heading font-semibold text-ink m-0">
          {activity.heading} · <span className="text-navy">tracked members</span>
        </h2>
        <span className="text-meta text-ink3 tnum">{activity.meta}</span>
      </div>
      <StatGrid stats={activity.stats} />
    </section>
  );
}

export function CongressOverview({
  model,
  lastUpdated,
}: {
  model: CongressModel;
  lastUpdated: string | null;
}) {
  return (
    <div className="min-h-screen bg-canvas flex justify-center">
      <div className="w-full max-w-[1280px] bg-sheet border-x border-rule">
        <SiteHeader active="Congress" />

        <section className="px-7 pt-6 pb-6 border-b border-rule flex items-end justify-between gap-x-6 gap-y-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <p className="text-label uppercase text-ink3 m-0">Overview</p>
            <h1 className="text-title font-semibold text-ink m-0">{model.title}</h1>
          </div>
          <div className="flex flex-col gap-0.5 sm:items-end text-meta text-ink3 tnum">
            <span>{model.dateRange}</span>
            <span>{model.seatedLine}</span>
          </div>
        </section>

        <main>
          <div className="px-7 pt-7 pb-7 bg-canvas flex flex-col gap-7">
            <CompositionCard model={model} />
            <PassedBothCard model={model} />
          </div>
          <ScopeDivider scope={model.scope} />
          <div className="px-7 pt-7 pb-7 bg-canvas">
            <ActivitySection model={model} />
          </div>
          <p className="px-7 pb-6 text-label uppercase text-ink3 m-0 leading-relaxed">
            {model.footnote}
          </p>
        </main>

        <SiteFooter lastUpdated={lastUpdated} />
      </div>
    </div>
  );
}
