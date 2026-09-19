// Congress overview page (/congress). Server component: every prop is built at build time in
// src/lib/congress.ts from GET /api/v1/congress/overview. Two halves with a hard break between
// them: chamber composition for all 535 seats, then activity counting only the tracked members.
import { PARTY_COLOR } from '@/data/eventTypes';
import type {
  ChamberBar,
  CompositionSegment,
  CongressModel,
  StatCell,
  TypeSegment,
} from '@/lib/congress';
import { PassedBothTable } from './PassedBothTable';
import { SiteFooter, SiteHeader } from './SiteChrome';

const PARTY_FILL: Record<string, string> = {
  republican: PARTY_COLOR.Republican,
  democratic: PARTY_COLOR.Democratic,
  independent: PARTY_COLOR.Independent,
};

/* A seat nobody holds: hatched, so it reads as absent rather than as a third party. */
const VACANT_FILL =
  'repeating-linear-gradient(135deg, #CCD1D5 0 2px, #ECEEF3 2px 5px)';

const TYPE_FILL: Record<string, { bg: string; text: string }> = {
  house_bill: { bg: '#33477A', text: '#FFFFFF' },
  senate_bill: { bg: '#4C63A0', text: '#FFFFFF' },
  joint_resolution: { bg: '#7F92C4', text: '#1A1A19' },
  other: { bg: '#C2CCDF', text: '#1A1A19' },
};

function fillOf(seg: CompositionSegment) {
  return seg.key === 'vacant' ? { background: VACANT_FILL } : { background: PARTY_FILL[seg.key] };
}

function LegendSwatch({ style }: { style: React.CSSProperties }) {
  return <i aria-hidden className="w-2.5 h-2.5 flex-none rounded-[2px]" style={style} />;
}

/* Width per segment is the mart's seat_pct (seats / chamber seats), so the bar is the data. */
function ChamberBarBlock({ bar }: { bar: ChamberBar }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h3 className="text-heading font-semibold text-ink m-0">{bar.name}</h3>
          <span className="text-label uppercase text-ink3 tnum">{bar.seatsLine}</span>
        </div>
        {bar.marginLabel && (
          <span title={bar.marginTitle} className="text-base font-semibold text-ink2 tnum">
            {bar.marginLabel}
          </span>
        )}
      </div>
      <div
        role="img"
        aria-label={bar.ariaLabel}
        className="flex h-[54px] w-full overflow-hidden rounded-ctl border border-rule"
      >
        {bar.segments.map((seg) => (
          <div
            key={seg.key}
            title={seg.title}
            data-segment={seg.key}
            className="h-full flex items-center px-3 text-base font-semibold text-white tnum overflow-hidden whitespace-nowrap"
            style={{ width: `${seg.widthPct}%`, ...fillOf(seg) }}
          >
            {seg.barLabel}
          </div>
        ))}
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
    <section
      aria-labelledby="composition-title"
      className="border border-rule rounded-card bg-card"
    >
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
              <a href={s.href} className="underline decoration-rule underline-offset-2">
                {s.label}
              </a>
            </span>
          ))}{' '}
          · as of {composition.asOf} · updated manually
        </span>
      </div>
      <div className="px-[18px] py-5 flex flex-col gap-7">
        {composition.chambers.map((bar) => (
          <ChamberBarBlock key={bar.chamber} bar={bar} />
        ))}
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

function StatGrid({ stats }: { stats: StatCell[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 border border-rule rounded-card bg-card overflow-hidden">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`p-4 flex flex-col gap-1.5 border-rule ${i % 2 === 0 ? 'border-r' : ''} lg:border-r ${i % 4 === 3 ? 'lg:border-r-0' : ''} ${i < stats.length - 2 ? 'border-b' : ''} ${i < stats.length - 4 ? '' : 'lg:border-b-0'}`}
        >
          <span className="text-label uppercase text-ink3">{s.label}</span>
          <span className="text-stat font-semibold text-ink tnum">{s.value}</span>
          <span className="text-meta text-ink2 tnum">{s.sub}</span>
          {s.note && <span className="text-meta text-ink3">{s.note}</span>}
        </div>
      ))}
    </div>
  );
}

function TypeBar({ segments }: { segments: TypeSegment[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-label uppercase text-ink3">Introduced by measure type</span>
      <div
        role="img"
        aria-label={`Bills introduced by measure type: ${segments.map((s) => s.legend).join(', ')}`}
        className="flex h-[46px] w-full overflow-hidden rounded-ctl border border-rule"
      >
        {segments.map((seg) => (
          <div
            key={seg.key}
            title={seg.legend}
            data-segment={seg.key}
            className="h-full flex items-center px-3 text-body font-semibold tnum overflow-hidden whitespace-nowrap"
            style={{
              width: `${seg.widthPct}%`,
              background: TYPE_FILL[seg.key].bg,
              color: TYPE_FILL[seg.key].text,
            }}
          >
            {seg.barLabel}
          </div>
        ))}
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-1.5 text-label uppercase text-ink2 tnum">
            <LegendSwatch style={{ background: TYPE_FILL[seg.key].bg }} />
            {seg.legend}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivitySection({ model }: { model: CongressModel }) {
  const { activity } = model;
  return (
    <section
      aria-labelledby="activity-title"
      className="bg-card border-x-4 border-b-4 border-navy px-[18px] py-6 md:px-7 flex flex-col gap-7"
    >
      <div className="flex items-baseline justify-between gap-x-4 gap-y-1 flex-wrap">
        <h2 id="activity-title" className="text-heading font-semibold text-ink m-0">
          {activity.heading} · <span className="text-navy">tracked members</span>
        </h2>
        <span className="text-meta text-ink3 tnum">{activity.meta}</span>
      </div>
      <StatGrid stats={activity.stats} />
      <TypeBar segments={model.types.segments} />
      <div className="border-t border-rule pt-6 flex flex-col gap-3.5">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h3 className="text-heading font-semibold text-ink m-0">Passed both chambers</h3>
          <span className="text-label uppercase text-ink3 tnum">{model.passedBoth.meta}</span>
        </div>
        <PassedBothTable rows={model.passedBoth.rows} />
      </div>
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
          <div className="px-7 pt-7 pb-7 bg-canvas">
            <CompositionCard model={model} />
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
