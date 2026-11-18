// One state legislative chamber's members (/states/{abbr}/{chamber}, ADR 0035): a card per seated
// legislator with photo, party, district, how to reach them, the service Open States records, and
// their committee seats. Server component; finding and sorting is the client RosterFilter, which
// reorders these cards rather than re-rendering them.
import { formatDate } from '@/lib/format';
import {
  addressLine,
  committeeLine,
  districtName,
  groupFill,
  groupName,
  groupOf,
  legislatorAnchor,
  rosterPath,
  socialLinks,
  termYears,
  titlePlural,
  type StateLegislatorProfile,
  type StateOffice,
  type StateRosterChamber,
  type StateRosterResponse,
} from '@/lib/states';
import { RosterFilter } from './RosterFilter';
import { PageShell } from './SiteFrame';
import { StateLegislatorPhoto } from './StateLegislatorPhoto';

export interface StateRosterProps {
  roster: StateRosterResponse;
  chamber: StateRosterChamber;
  sourceDate: string | null;
  lastUpdated: string | null;
}

const LINK = 'text-navy underline decoration-rule underline-offset-2';
const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;
const NOTE: Record<string, string> = {
  'at-large': 'At-large seat',
  floterial: 'Floterial district',
  'non-voting': 'Non-voting member',
};

function partyWord(l: StateLegislatorProfile): string {
  if (l.party === 'I') return groupName(l.party_group === 'Independent' ? null : l.party_group, 'I');
  return groupName(null, l.party);
}

function Office({ label, office }: { label: string; office: StateOffice }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label uppercase text-ink2">{label}</dt>
      <dd className="m-0 text-meta text-ink tnum">
        {office.address && <span className="block">{addressLine(office.address)}</span>}
        {office.phone && (
          <a href={`tel:${office.phone.replace(/[^0-9+]/g, '')}`} className={LINK}>
            {office.phone}
          </a>
        )}
      </dd>
    </div>
  );
}

function Card({ l, bicameral, archived }: { l: StateLegislatorProfile; bicameral: boolean; archived: boolean }) {
  const anchor = legislatorAnchor(l.district, l.name);
  const social = socialLinks(l.social);
  const party = partyWord(l);
  const search = [l.name, districtName(l.district), party, ...l.committees.map((c) => c.name)].join(' ').toLowerCase();
  const sortName = `${l.family_name ?? l.name} ${l.name}`.toLowerCase();
  return (
    <li
      id={anchor}
      data-search={search}
      data-name={sortName}
      className="scroll-mt-20 border border-rule rounded-card bg-card px-4 py-4 flex flex-col gap-3 target:outline target:outline-2 target:outline-navy"
    >
      <div className="flex gap-3">
        <StateLegislatorPhoto src={l.image_url} name={l.name} />
        <div className="min-w-0 flex flex-col gap-1">
          <h2 className="m-0 text-[17px] font-bold text-ink leading-snug">
            <a href={`#${anchor}`} className="text-ink hover:underline">
              {l.name}
            </a>
          </h2>
          <span className="flex items-center gap-2 flex-wrap">
            <span
              className="text-label font-semibold uppercase text-white px-[7px] py-0.5 rounded-chip max-w-[220px] truncate"
              style={{ background: groupFill(groupOf(l.party, l.party_label)) }}
              title={l.party_basis === 'registration' ? `${party} (party registration)` : party}
            >
              {party}
            </span>
            <span className="text-meta text-ink">{districtName(l.district)}</span>
          </span>
          {l.district_note && NOTE[l.district_note] && !/at.?large/i.test(l.district) && (
            <span className="text-meta text-ink2">{NOTE[l.district_note]}</span>
          )}
        </div>
      </div>

      {(l.email || l.capitol_office || l.district_office || l.website_url || social.length > 0) && (
        <dl className="m-0 flex flex-col gap-2">
          {l.email && (
            <div className="flex flex-col">
              <dt className="text-label uppercase text-ink2">Email</dt>
              <dd className="m-0 text-meta break-all">
                <a href={`mailto:${l.email}`} className={LINK}>
                  {l.email}
                </a>
              </dd>
            </div>
          )}
          {l.capitol_office && <Office label="Capitol office" office={l.capitol_office} />}
          {l.district_office && <Office label="District office" office={l.district_office} />}
          {(l.website_url || social.length > 0) && (
            <div className="flex flex-col">
              <dt className="text-label uppercase text-ink2">Online</dt>
              <dd className="m-0 text-meta flex flex-wrap gap-x-3 gap-y-0.5">
                {l.website_url && (
                  <a href={l.website_url} {...NEW_TAB} className={LINK}>
                    Official page ↗<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
                {social.map((s) => (
                  <a key={s.label} href={s.href} {...NEW_TAB} className={LINK}>
                    {s.label}
                    <span className="sr-only">: {s.handle} (opens in a new tab)</span>
                  </a>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}

      {l.terms.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <h3 className="m-0 text-label uppercase text-ink2">Service on record</h3>
          <ul className="m-0 p-0 list-none text-meta text-ink tnum">
            {l.terms.map((t, i) => (
              <li key={i}>
                {t.chamber_name ?? t.chamber}
                {t.district ? `, ${districtName(t.district)}` : ''}
                {' · '}
                {termYears(t) ?? 'dates not recorded'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!archived && (
        <div className="flex flex-col gap-0.5">
          <h3 className="m-0 text-label uppercase text-ink2">Committees</h3>
          {l.committees.length > 0 ? (
            <ul className="m-0 p-0 list-none text-meta text-ink">
              {l.committees.map((c) => (
                <li key={`${c.chamber}-${c.name}`}>{committeeLine(c, bicameral)}</li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-meta text-ink2">None recorded.</p>
          )}
        </div>
      )}
    </li>
  );
}

export function StateRoster({ roster, chamber, sourceDate, lastUpdated }: StateRosterProps) {
  const listId = 'roster';
  const bicameral = roster.chambers.length > 1;
  const archived = roster.chambers.every((c) => c.legislators.every((l) => l.committees.length === 0));
  const byRegistration = chamber.legislators.some((l) => l.party_basis === 'registration');
  const plural = titlePlural(chamber.title, chamber.legislators.length).replace(/^\d+ /, '');
  return (
    <PageShell active="States" lastUpdated={lastUpdated}>
      <section className="px-7 pt-6 pb-6 border-b border-rule flex items-end justify-between gap-x-6 gap-y-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <p className="text-label uppercase text-ink2 m-0">
            <a href="/states" className="text-ink2 hover:text-ink">
              States
            </a>
            {' › '}
            <a href={`/states/${roster.state.toLowerCase()}`} className="text-ink2 hover:text-ink">
              {roster.name}
            </a>
          </p>
          <h1 className="text-title font-semibold text-ink m-0">
            {chamber.chamber === 'legislature' ? chamber.name : `${roster.name} ${chamber.name}`}
          </h1>
          <p className="m-0 text-meta text-ink2 tnum">
            {chamber.seats} seats
            {chamber.vacant > 0 ? ` · ${chamber.vacant} vacant` : ''}
          </p>
          {byRegistration && (
            <p className="m-0 text-meta text-ink">Officially nonpartisan. Members are shown by their party registration.</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {bicameral && (
            <nav aria-label="Chambers" className="flex gap-1.5">
              {roster.chambers.map((c) => (
                <a
                  key={c.slug}
                  href={rosterPath(roster.state, c.slug)}
                  aria-current={c.slug === chamber.slug ? 'page' : undefined}
                  className={`text-meta font-semibold px-3 py-1.5 rounded-ctl border ${
                    c.slug === chamber.slug ? 'bg-ink text-white border-ink' : 'bg-card text-ink border-rule hover:bg-canvas'
                  }`}
                >
                  {c.name}
                </a>
              ))}
            </nav>
          )}
          <p className="m-0 text-meta text-ink2 tnum">As of {formatDate(roster.as_of)}</p>
        </div>
      </section>

      <main>
        <div className="px-4 md:px-7 pt-6 pb-7 bg-canvas flex flex-col gap-5">
          <RosterFilter listId={listId} total={chamber.legislators.length} noun={plural} />
          <ul id={listId} className="m-0 p-0 list-none grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start">
            {chamber.legislators.map((l) => (
              <Card key={l.person_id} l={l} bicameral={bicameral} archived={archived} />
            ))}
          </ul>
        </div>
        <p className="px-7 pb-6 text-label uppercase text-ink2 m-0 leading-relaxed">
          Legislators, contact details{archived ? '' : ', committees'} and service: Open States (Plural
          Open), public domain{sourceDate ? `, read ${formatDate(sourceDate)}` : ''}. Photos load from
          each legislature&rsquo;s website. Service on record is often incomplete for earlier terms.
          Offices move, so check the official page before you write or visit.
        </p>
      </main>
    </PageShell>
  );
}
