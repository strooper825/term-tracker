// Vote journey on the bill page (ADR 0009): the stages mart.bill_journey_stage shows for this bill,
// in order, each read from a passage roll call or a Library of Congress action code. It is not a
// bill status and predicts nothing: a stage with nothing on record reads Pending, and a failed
// vote or a veto with nothing after it is the last stage drawn. Every label, date, tally and bar
// width arrives from the mart through src/lib/model.ts.
//
// Two views over the same stages: a compact stepper (every stage, one line each) and a dedicated
// vote card per chamber that actually held a recorded roll call (House vote / Senate vote).
import type { JourneyStageModel, JourneyTone, JourneyVoteModel, VoteBarModel } from '@/lib/model';
import { formatNumber } from '@/lib/format';

const TONE: Record<JourneyTone, { text: string }> = {
  done: { text: 'text-ink' },
  failed: { text: 'text-[#8A2F2E]' },
  neutral: { text: 'text-ink2' },
  pending: { text: 'text-ink4' },
};

function StepperRow({ stage, last }: { stage: JourneyStageModel; last: boolean }) {
  const tone = TONE[stage.tone];
  const filled = stage.key === 'became_law' && stage.tone === 'done';
  const primary = (
    <>
      <span className="font-semibold">{stage.statusLabel}</span>
      {stage.vote && (
        <>
          {' '}
          <span className="tnum">{stage.vote.tally}</span>
        </>
      )}
      {stage.detail && <span className="opacity-80"> · {stage.detail}</span>}
    </>
  );
  return (
    <li
      data-stage={stage.key}
      className={`min-w-0 flex flex-col gap-1 px-4 py-3 rounded-ctl ${
        filled ? 'bg-ink text-[#FDFDFC]' : `bg-card ${tone.text}`
      } ${!last ? `border-b ${filled ? 'border-ink' : 'border-ruleSoft'}` : ''}`}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="flex items-baseline gap-3 min-w-0 flex-wrap">
          <span
            className={`text-label uppercase tracking-[0.05em] w-[92px] flex-none ${
              filled ? 'text-[#FDFDFC]/70' : 'text-ink3'
            }`}
          >
            {stage.label}
          </span>
          <span className="text-sm leading-snug">{primary}</span>
        </span>
        {stage.date && (
          <span className="text-meta tnum opacity-80 whitespace-nowrap">{stage.date}</span>
        )}
      </div>
      {stage.endsJourney && (
        <div className={`text-micro pl-[104px] leading-snug ${filled ? 'opacity-70' : 'text-ink4'}`}>
          Nothing is recorded after this vote.
        </div>
      )}
    </li>
  );
}

export function JourneyStepper({ stages }: { stages: JourneyStageModel[] }) {
  return (
    <section aria-labelledby="journey-title" className="border border-rule rounded-card bg-canvas">
      <div className="px-[18px] pt-4 pb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="journey-title" className="text-card font-semibold m-0">
          Vote journey
        </h2>
        <span className="text-meta text-ink3">Recorded roll calls and enactment actions</span>
      </div>
      <ol className="m-0 list-none px-3 pb-3 flex flex-col gap-px">
        {stages.map((stage, i) => (
          <StepperRow key={stage.key} stage={stage} last={i === stages.length - 1} />
        ))}
      </ol>
    </section>
  );
}

function VoteBarRow({ bar }: { bar: VoteBarModel }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-baseline gap-2 text-sm">
        <span className="font-semibold tnum">{bar.heading}</span>
      </div>
      <div
        role="img"
        aria-label={bar.ariaLabel}
        className="h-2.5 bg-ruleSoft rounded-[3px] overflow-hidden flex"
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
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-meta text-ink2">
        {bar.segments.map((segment) => (
          <span key={segment.party} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-[2px]"
              style={{ background: segment.color }}
            />
            {bar.label} · {segment.party} {formatNumber(segment.count)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The House Vote / Senate Vote card: the one recorded passage roll call a chamber stage reads
 *  (ADR 0009), read large. `chamber` and `title` come from the journey stage itself. */
function VoteCard({
  stageKey,
  title,
  question,
  date,
  statusLabel,
  tone,
  vote,
}: {
  stageKey: string;
  title: string;
  question: string | null;
  date: string | null;
  statusLabel: string;
  tone: JourneyTone;
  vote: JourneyVoteModel;
}) {
  const resultColor = TONE[tone].text;
  const titleId = `${stageKey}-title`;
  return (
    <section aria-labelledby={titleId} className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-3 border-b border-ruleSoft flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id={titleId} className="text-card font-semibold m-0">
          {title}
        </h2>
        <span className="text-meta text-ink3 uppercase tracking-[0.03em]">
          {[question, date].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="px-[18px] py-4 flex flex-col gap-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`text-stat font-semibold ${resultColor}`}>{statusLabel}</span>
          <span className="text-stat font-semibold tnum text-ink3">{vote.tally}</span>
          {vote.majority && <span className="text-meta text-ink4">{vote.majority}</span>}
        </div>
        <div className="flex flex-col gap-3">
          {vote.bars.map((bar) => (
            <VoteBarRow key={bar.label} bar={bar} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-1 border-t border-ruleSoft">
          {(
            [
              ['Yea', vote.yeaCount],
              ['Nay', vote.nayCount],
              ['Not voting', vote.notVotingCount],
            ] as const
          ).map(([label, count]) => (
            <div key={label} className="flex flex-col gap-0.5 pt-3">
              <span className="text-label uppercase tracking-[0.05em] text-ink3">{label}</span>
              <span className="text-stat font-semibold tnum">{formatNumber(count)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <a
            href={vote.href}
            className="text-meta text-ink2 underline decoration-rule underline-offset-2"
          >
            {vote.linkLabel} →
          </a>
        </div>
      </div>
    </section>
  );
}

export function BillJourney({ stages }: { stages: JourneyStageModel[] }) {
  const voteStages = stages.filter(
    (s): s is JourneyStageModel & { vote: JourneyVoteModel } => s.vote !== null,
  );
  return (
    <div className="flex flex-col gap-5 min-w-0">
      <JourneyStepper stages={stages} />
      {voteStages.map((stage) => (
        <VoteCard
          key={stage.key}
          stageKey={stage.key}
          title={stage.label}
          question={stage.detail}
          date={stage.date}
          statusLabel={stage.statusLabel}
          tone={stage.tone}
          vote={stage.vote}
        />
      ))}
    </div>
  );
}
