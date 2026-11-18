// One state legislative chamber as a bar of seats (ADR 0035): who controls it in words, then the
// seats by party with the majority and supermajority lines marked. Server component; the model
// is buildChamberBar in src/lib/states.ts.
import { buildChamberBar, type StateChamber, type StateParty } from '@/lib/states';

/* A seat nobody holds: hatched, so it reads as absent rather than as a third party. */
const VACANT_FILL = 'repeating-linear-gradient(135deg, #CCD1D5 0 2px, #ECEEF3 2px 5px)';

const fillOf = (seg: { party: StateParty | 'V'; fill: string }) =>
  seg.party === 'V' ? { background: VACANT_FILL } : { background: seg.fill };

function Pill({ text, party, fill }: { text: string; party: StateParty | null; fill: string | null }) {
  if (fill) {
    // a party other than the national two: its own colour (Puerto Rico's PNP)
    return (
      <span
        className="inline-block text-base font-semibold border rounded-ctl px-2.5 py-1 leading-snug bg-card"
        style={{ color: fill, borderColor: fill }}
      >
        {text}
      </span>
    );
  }
  const tone =
    party === 'R'
      ? 'bg-partyTint-r text-party-r border-party-r/40'
      : party === 'D'
        ? 'bg-partyTint-d text-party-d border-party-d/40'
        : party === 'I'
          ? 'bg-[#F3EFF8] text-party-i border-party-i/40'
          : 'bg-lockBg text-ink2 border-rule';
  return (
    <span className={`inline-block text-base font-semibold border rounded-ctl px-2.5 py-1 leading-snug ${tone}`}>
      {text}
    </span>
  );
}

type Side = 'center' | 'before' | 'after';

/* A threshold line, its label above the bar. With two lines each label sits on the side away from
   the other line, so on a narrow screen they cannot run into each other. */
function Marker({ pct, label, chamber, kind, side }: { pct: number; label: string; chamber: string; kind: string; side: Side }) {
  const place =
    side === 'before'
      ? { right: 0, paddingRight: 4 }
      : side === 'after'
        ? { left: 0, paddingLeft: 4 }
        : { left: 0, transform: 'translateX(-50%)' };
  return (
    <div
      data-marker={`${chamber}-${kind}`}
      className="absolute top-0 bottom-0 w-0 pointer-events-none"
      style={{ left: `${pct}%` }}
    >
      <span className="absolute top-0 text-meta text-ink2 whitespace-nowrap tnum leading-5" style={place}>
        {label}
      </span>
      <span aria-hidden className={`absolute top-5 bottom-0 -left-px w-0.5 ${kind === 'majority' ? 'bg-ink' : 'bg-ink2'}`} />
    </div>
  );
}

export function StateChamberBar({ chamber }: { chamber: StateChamber }) {
  const bar = buildChamberBar(chamber);
  const both = chamber.control_kind !== 'nonpartisan';
  // labels sit on the far side of each line; only lines almost on top of each other share one label
  const apart = Math.abs(bar.supermajorityPct - bar.majorityPct) >= 4;
  const superFirst = bar.supermajorityPct < bar.majorityPct;
  const majoritySide: Side = !both || !apart ? 'center' : superFirst ? 'after' : 'before';
  return (
    <div className="flex flex-col gap-2.5" data-chamber={bar.chamber}>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h3 className="text-heading font-semibold text-ink m-0">{bar.name}</h3>
        <span className="text-meta text-ink2 tnum">{bar.seatsLine}</span>
      </div>
      <div className="flex flex-col gap-1.5 items-start">
        <Pill text={bar.headline} party={bar.headlineParty} fill={bar.headlineFill} />
        {bar.basisNote && <p className="text-meta text-ink m-0">{bar.basisNote}</p>}
        <p className="text-meta text-ink2 m-0 tnum">{bar.detail}</p>
      </div>
      <div className="relative pt-6 pb-1">
        <Marker pct={bar.majorityPct} label={bar.majorityLabel} chamber={bar.chamber} kind="majority" side={majoritySide} />
        {both && (
          <Marker
            pct={bar.supermajorityPct}
            label={apart ? bar.supermajorityLabel : ''}
            chamber={bar.chamber}
            kind="supermajority"
            side={superFirst ? 'before' : 'after'}
          />
        )}
        <div
          role="img"
          aria-label={bar.ariaLabel}
          className="flex h-[46px] w-full overflow-hidden rounded-ctl outline outline-1 outline-rule"
        >
          {bar.segments.map((seg) => (
            <div
              key={seg.key}
              title={seg.legend}
              data-segment={seg.party}
              className="h-full flex-none flex items-center text-base font-semibold text-white tnum overflow-hidden whitespace-nowrap"
              style={{ width: `${seg.widthPct}%`, ...fillOf(seg) }}
            >
              {seg.barLabel && <span className="px-3">{seg.barLabel}</span>}
            </div>
          ))}
        </div>
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1.5">
        {bar.segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-1.5 text-meta text-ink2 tnum">
            <i aria-hidden className="w-2.5 h-2.5 flex-none rounded-[2px]" style={fillOf(seg)} />
            {seg.legend}
          </li>
        ))}
      </ul>
    </div>
  );
}
