// Vote journey on the bill page (ADR 0009): the stages mart.bill_journey_stage shows for this bill,
// in order, each read from a passage roll call or a Library of Congress action code. It is not a
// bill status and predicts nothing: a stage with nothing on record reads Pending, and a failed
// vote or a veto with nothing after it is the last stage drawn. Every label, date, tally and bar
// width arrives from the mart through src/lib/model.ts.
//
// Two views over the same stages: a compact stepper (every stage, one line each) and a dedicated
// vote card per chamber that actually held a recorded roll call (House vote / Senate vote).
// Layout and colors were read directly off the "Bill Detail Redesign" mockup; type sizes now pull
// from the site's shared scale (tailwind.config.js) instead -- see design-audit-cleanup.
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
      <span className={`font-semibold ${filled ? 'text-heading' : 'text-base'}`}>
        {stage.statusLabel}
      </span>
      {stage.vote && (
        <>
          {' '}
          <span className={`text-body tnum ${filled ? 'text-white/70' : 'text-ink2'}`}>
            {stage.vote.tally}
          </span>
        </>
      )}
      {stage.detail && (
        <span className={`text-body ${filled ? 'text-white/70' : 'text-ink2'}`}>
          {' '}
          · {stage.detail}
        </span>
      )}
    </>
  );
  return (
    <li data-stage={stage.key} className="relative">
      <div
        className={`min-w-0 flex flex-col gap-1.5 px-4 py-3 rounded-ctl border ${
          filled ? 'bg-[#2B3238] border-[#2B3238] text-white' : `bg-card border-rule ${tone.text}`
        }`}
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="flex items-baseline gap-3 min-w-0 flex-wrap">
            <span
              className={`text-label uppercase w-[112px] flex-none ${
                filled ? 'text-white/70' : 'text-ink2'
              }`}
            >
              {stage.label}
            </span>
            <span className="leading-snug">{primary}</span>
          </span>
          {stage.date && (
            <span
              className={`text-meta tnum whitespace-nowrap ${filled ? 'text-white/60' : 'text-ink3'}`}
            >
              {stage.date}
            </span>
          )}
        </div>
        {stage.endsJourney && (
          <div className={`text-meta pl-[112px] leading-snug ${filled ? 'text-white/60' : 'text-ink4'}`}>
            Nothing is recorded after this vote.
          </div>
        )}
      </div>
      {!last && (
        <span
          aria-hidden
          className="absolute left-[38px] -bottom-[16px] text-meta text-ink3 leading-none"
        >
          ↓
        </span>
      )}
    </li>
  );
}

export function JourneyStepper({
  stages,
  durationDays,
}: {
  stages: JourneyStageModel[];
  durationDays: number | null;
}) {
  return (
    <section aria-labelledby="journey-title" className="border border-rule rounded-card bg-[#ECEEF0]">
      <div className="px-6 pt-5 pb-3 flex items-baseline justify-between gap-3 flex-wrap">
        <h2 id="journey-title" className="text-heading font-semibold text-ink m-0">
          Journey
        </h2>
        <span className="text-meta text-ink3">
          Recorded roll calls and enactment actions
          {durationDays !== null && ` · ${formatNumber(durationDays)} days`}
        </span>
      </div>
      <ol className="m-0 list-none px-4 pb-5 flex flex-col gap-[18px]">
        {stages.map((stage, i) => (
          <StepperRow key={stage.key} stage={stage} last={i === stages.length - 1} />
        ))}
      </ol>
    </section>
  );
}

/** The whole vote as one bar -- Yea segments, then Nay, then Not voting -- so the chamber's split
 *  reads as a single line. The leading segment in each direction (the party that cast more votes
 *  that way) carries its own inline white label; a segment too narrow to hold its label safely
 *  just contributes to the legend below, same as every non-leading segment. */
function VoteBar({ bar }: { bar: VoteBarModel }) {
  return (
    <div className="flex flex-col gap-[15px]">
      <div
        role="img"
        aria-label={bar.ariaLabel}
        className="h-[28.5px] rounded-[3px] overflow-hidden flex"
      >
        {bar.segments.map((segment) => (
          <div
            key={segment.key}
            data-party={segment.party ?? 'other'}
            data-direction={segment.direction}
            className={`h-full flex items-center min-w-0 ${
              segment.direction === 'Nay' ? 'justify-end' : 'justify-start'
            }`}
            style={{ width: `${segment.pct}%`, background: segment.color }}
          >
            {segment.isLeader && segment.pct >= 14 && (
              <span className="text-meta font-semibold text-white whitespace-nowrap px-[9px] tnum">
                {segment.barLabel}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="h-px bg-rule" />
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {bar.segments.map((segment) => (
          <span key={segment.key} className="flex items-center gap-2 text-meta">
            <span
              aria-hidden
              className="inline-block w-[10px] h-[10px] rounded-[2px] flex-none"
              style={{ background: segment.color }}
            />
            <span className="text-ink2">{segment.legendLabel}</span>
            <span className="text-ink font-semibold tnum">{formatNumber(segment.count)}</span>
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
      <div className="px-6 pt-5 pb-5 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 id={titleId} className="text-heading font-semibold text-ink m-0">
            {title}
          </h2>
          <span className="text-meta text-ink3">
            {[question, date].filter(Boolean).join(' · ')}
          </span>
        </div>

        <div className="flex items-baseline gap-2.5 flex-wrap">
          <span className={`text-display font-black ${resultColor}`}>{statusLabel}</span>
          <span className="text-heading font-medium text-ink2 tnum">{vote.tally}</span>
          {vote.tiebreak && <span className="text-meta text-ink2">VP tiebreak</span>}
          {vote.majority && <span className="text-meta text-ink2">{vote.majority}</span>}
        </div>

        <VoteBar bar={vote.bar} />

        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex gap-6">
            {(
              [
                ['Yea', vote.yeaCount, 'text-ink'],
                ['Nay', vote.nayCount, 'text-ink'],
                ['Not voting', vote.notVotingCount, 'text-ink3'],
              ] as const
            ).map(([label, count, valueColor]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-label uppercase text-ink2">{label}</span>
                <span className={`text-stat font-semibold tnum leading-none ${valueColor}`}>
                  {formatNumber(count)}
                </span>
              </div>
            ))}
          </div>
          <a
            href={vote.href}
            className="text-label uppercase font-semibold text-ink underline decoration-[#C9CED2] underline-offset-4"
          >
            {vote.linkLabel} →
          </a>
        </div>
      </div>
    </section>
  );
}

export function BillJourney({
  stages,
  durationDays,
}: {
  stages: JourneyStageModel[];
  durationDays: number | null;
}) {
  const voteStages = stages.filter(
    (s): s is JourneyStageModel & { vote: JourneyVoteModel } => s.vote !== null,
  );
  return (
    <div className="flex flex-col gap-5 min-w-0">
      <JourneyStepper stages={stages} durationDays={durationDays} />
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
