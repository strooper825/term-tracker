// One state legislative chamber as a bar of seats (ADR 0035): who controls it in words, then the
// seats by party with the majority and supermajority lines marked. Server component; the model
// is buildChamberBar in src/lib/states.ts.
import { buildChamberBar, partyFill, type StateChamber, type StateParty } from '@/lib/states';

/* A seat nobody holds: hatched, so it reads as absent rather than as a third party. */
const VACANT_FILL = 'repeating-linear-gradient(135deg, #CCD1D5 0 2px, #ECEEF3 2px 5px)';

const fillOf = (party: StateParty | 'V') =>
  party === 'V' ? { background: VACANT_FILL } : { background: partyFill(party) };

function Pill({ text, party }: { text: string; party: StateParty | null }) {
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

function Marker({ pct, label, chamber, kind }: { pct: number; label: string; chamber: string; kind: string }) {
  return (
    <div
      data-marker={`${chamber}-${kind}`}
      className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
      style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
    >
      <span className="text-meta text-ink2 whitespace-nowrap tnum">{label}</span>
      <span aria-hidden className={`flex-1 w-0.5 ${kind === 'majority' ? 'bg-ink' : 'bg-ink2'}`} />
    </div>
  );
}

export function StateChamberBar({ chamber }: { chamber: StateChamber }) {
  const bar = buildChamberBar(chamber);
  // the two labels collide when the lines are close (a 3/5 threshold in a small chamber)
  const apart = bar.supermajorityPct - bar.majorityPct >= 14;
  return (
    <div className="flex flex-col gap-2.5" data-chamber={bar.chamber}>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <h3 className="text-heading font-semibold text-ink m-0">{bar.name}</h3>
        <span className="text-meta text-ink2 tnum">{bar.seatsLine}</span>
      </div>
      <div className="flex flex-col gap-1.5 items-start">
        <Pill text={bar.headline} party={bar.headlineParty} />
        <p className="text-meta text-ink2 m-0 tnum">{bar.detail}</p>
      </div>
      <div className="relative pt-6 pb-1">
        <Marker pct={bar.majorityPct} label={bar.majorityLabel} chamber={bar.chamber} kind="majority" />
        {chamber.control_kind !== 'nonpartisan' && (
          <Marker
            pct={bar.supermajorityPct}
            label={apart ? bar.supermajorityLabel : ''}
            chamber={bar.chamber}
            kind="supermajority"
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
              style={{ width: `${seg.widthPct}%`, ...fillOf(seg.party) }}
            >
              {seg.barLabel && <span className="px-3">{seg.barLabel}</span>}
            </div>
          ))}
        </div>
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1.5">
        {bar.segments.map((seg) => (
          <li key={seg.key} className="flex items-center gap-1.5 text-meta text-ink2 tnum">
            <i aria-hidden className="w-2.5 h-2.5 flex-none rounded-[2px]" style={fillOf(seg.party)} />
            {seg.legend}
          </li>
        ))}
      </ul>
    </div>
  );
}
