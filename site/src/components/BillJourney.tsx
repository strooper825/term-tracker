// Vote journey on the bill page (ADR 0009): the stages mart.bill_journey_stage shows for this bill,
// in order, each read from a passage roll call or a Library of Congress action code. It is not a
// bill status and predicts nothing: a stage with nothing on record reads Pending, and a failed
// vote or a veto with nothing after it is the last stage drawn. Every label, date, tally and bar
// width arrives from the mart through src/lib/model.ts.
import type { JourneyStageModel, JourneyTone, VoteBarModel } from '@/lib/model';

const TONE: Record<JourneyTone, { dot: string; line: string; status: string }> = {
  done: { dot: 'bg-ink2 border-ink2', line: 'border-ink2', status: 'text-ink' },
  failed: { dot: 'bg-[#8A2F2E] border-[#8A2F2E]', line: 'border-[#8A2F2E]', status: 'text-[#8A2F2E]' },
  neutral: { dot: 'bg-card border-ink3', line: 'border-ink3', status: 'text-ink2' },
  pending: { dot: 'bg-card border-rule', line: 'border-rule', status: 'text-ink4' },
};

function VoteBars({ bars }: { bars: VoteBarModel[] }) {
  return (
    <div className="flex flex-col gap-[7px]">
      {bars.map((bar) => (
        <div key={bar.label} className="flex flex-col gap-[3px]">
          <div className="flex justify-between items-baseline gap-2 text-meta tnum">
            <span className="text-ink2">{bar.heading}</span>
            <span className="text-ink3 whitespace-nowrap">{bar.breakdown}</span>
          </div>
          {/* The fundraising card's bar, one segment per party in party colours. Segment widths
              are shares of Yea plus Nay, so the Yea and Nay bars share one scale. */}
          <div
            role="img"
            aria-label={bar.ariaLabel}
            className="h-1.5 bg-[#EDEBE6] rounded-[3px] overflow-hidden flex"
          >
            {bar.segments.map((segment) => (
              <div
                key={segment.party}
                data-party={segment.party}
                className="h-full"
                style={{ width: `${segment.pct}%`, background: segment.color }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Stage({ stage }: { stage: JourneyStageModel }) {
  const tone = TONE[stage.tone];
  return (
    <li
      data-stage={stage.key}
      className={`min-w-0 flex flex-col gap-1.5 pl-4 pb-5 border-l-2 md:border-l-0 md:border-t-2 md:pl-0 md:pt-3 md:pb-0 md:pr-4 ${tone.line}`}
    >
      <div className="flex items-center gap-2 -ml-[21px] md:ml-0 md:-mt-[19px]">
        <span aria-hidden className={`flex-none w-2.5 h-2.5 rounded-full border-2 ${tone.dot}`} />
        <span className="text-label uppercase tracking-[0.05em] text-ink3 bg-card md:pr-1.5">
          {stage.label}
        </span>
      </div>
      <div className={`text-sm font-semibold ${tone.status}`}>{stage.statusLabel}</div>
      {stage.date && <div className="text-meta text-ink3 tnum">{stage.date}</div>}
      {stage.detail && <div className="text-meta text-ink3 leading-snug">{stage.detail}</div>}
      {stage.vote && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-sm font-semibold tnum">{stage.vote.tally}</span>
            <a
              href={stage.vote.href}
              className="text-meta text-ink2 underline decoration-rule underline-offset-2"
            >
              {stage.vote.linkLabel}
            </a>
          </div>
          {stage.vote.majority && <div className="text-micro text-ink4">{stage.vote.majority}</div>}
          <VoteBars bars={stage.vote.bars} />
        </div>
      )}
      {stage.endsJourney && (
        <div className="text-micro text-ink4 leading-snug">
          Nothing is recorded after this vote.
        </div>
      )}
    </li>
  );
}

export function BillJourney({ stages }: { stages: JourneyStageModel[] }) {
  return (
    <section aria-labelledby="journey-title" className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-ruleSoft flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="journey-title" className="text-card font-semibold m-0">
          Vote journey
        </h2>
        <span className="text-meta text-ink3">Recorded roll calls and enactment actions</span>
      </div>
      <ol
        className="m-0 list-none px-[18px] pt-5 pb-4 pl-[26px] md:pl-[18px] md:pt-7 grid grid-cols-1 md:grid-flow-col md:auto-cols-fr"
      >
        {stages.map((stage) => (
          <Stage key={stage.key} stage={stage} />
        ))}
      </ol>
    </section>
  );
}
