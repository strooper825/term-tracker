// One state's government (/states/{abbr}, ADR 0035): who controls it, the governor, each chamber's
// seats as a bar, and the legislature map. Server component; the map is the client
// StateLegislatureMap, which loads its rows from /states/data/{abbr}.json.
import { formatDate } from '@/lib/format';
import { controlLabel, groupName, partyFill, type StateSummary } from '@/lib/states';
import { PageShell } from './SiteFrame';
import { StateChamberBar } from './StateChamberBar';
import { StateLegislatureMap } from './StateLegislatureMap';

export interface StatePageProps {
  summary: StateSummary;
  legislatureName: string;
  asOf: string;
  sourceDate: string | null;
  lastUpdated: string | null;
}

function GovernorCard({ summary }: { summary: StateSummary }) {
  const g = summary.governor;
  const title = g?.title ?? (summary.state === 'DC' ? 'Mayor' : 'Governor');
  const party = g?.party ?? null;
  return (
    <section aria-labelledby="governor-heading" className="border border-rule rounded-card bg-card px-[18px] py-4 flex flex-col gap-2">
      <h2 id="governor-heading" className="m-0 text-label uppercase text-ink2">
        {title}
      </h2>
      {g ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[20px] font-bold text-ink">{g.name}</span>
          {party && (
            <span
              className="text-label font-semibold uppercase text-white px-[7px] py-0.5 rounded-chip"
              style={{ background: partyFill(party) }}
            >
              {party === 'I' ? groupName(g.party_label?.split('/')[0] ?? null, 'I') : groupName(null, party)}
            </span>
          )}
          {g.start_date && <span className="text-meta text-ink2">Current term began {formatDate(g.start_date)}</span>}
          {g.website_url && (
            <a href={g.website_url} target="_blank" rel="noopener noreferrer" className="text-meta text-navy underline decoration-rule underline-offset-2">
              Official website ↗<span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
      ) : (
        <p className="m-0 text-body text-ink2">Open States has not recorded who holds the office.</p>
      )}
    </section>
  );
}

export function StatePage({ summary, legislatureName, asOf, sourceDate, lastUpdated }: StatePageProps) {
  const control = controlLabel(summary);
  return (
    <PageShell active="States" lastUpdated={lastUpdated}>
      <section className="px-7 pt-6 pb-6 border-b border-rule flex items-end justify-between gap-x-6 gap-y-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <p className="text-label uppercase text-ink2 m-0">
            <a href="/states" className="text-ink2 hover:text-ink">
              States
            </a>
          </p>
          <h1 className="text-title font-semibold text-ink m-0">{summary.name}</h1>
          <p className="m-0 text-[15px] font-semibold text-ink" data-control={summary.control}>
            {control}
          </p>
        </div>
        <p className="m-0 text-meta text-ink2 tnum">As of {formatDate(asOf)}</p>
      </section>

      <main>
        <div className="px-4 md:px-7 pt-7 pb-7 bg-canvas flex flex-col gap-7">
          <GovernorCard summary={summary} />

          <section aria-labelledby="legislature-heading" className="border border-rule rounded-card bg-card">
            <h2 id="legislature-heading" className="m-0 px-[18px] pt-4 pb-3 border-b border-ruleSoft text-heading font-semibold text-ink">
              {legislatureName}
            </h2>
            <div className="px-[18px] py-5 flex flex-col gap-8">
              {summary.chambers.map((c) => (
                <StateChamberBar key={c.chamber} chamber={c} />
              ))}
            </div>
          </section>

          <StateLegislatureMap
            abbr={summary.state}
            chambers={summary.chambers.map((c) => ({ chamber: c.chamber, name: c.name, title: c.title }))}
          />
        </div>
        <p className="px-7 pb-6 text-label uppercase text-ink2 m-0 leading-relaxed">
          {summary.governor?.title ?? 'Governor'} and legislators: Open States (Plural Open), public
          domain{sourceDate ? `, read ${formatDate(sourceDate)}` : ''}. A majority is more than half
          of all seats, vacant ones included; a supermajority is the share needed to override a veto.
        </p>
      </main>
    </PageShell>
  );
}
