// The Contact tab: how to reach the member's office and where it is, from
// mart.member_contact (congress-legislators). Rows the source has no value for are left out.
import type { ContactModel, ContactRow } from '@/lib/model';
import { SourceLink } from './SiteChrome';

function ContactCard({ title, rows }: { title: string; rows: ContactRow[] }) {
  return (
    <section aria-label={title} className="border border-rule rounded-card bg-card">
      <div className="px-[18px] pt-4 pb-[11px]">
        <h2 className="text-heading font-semibold text-ink m-0">{title}</h2>
      </div>
      <dl className="m-0 flex flex-col">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-6 px-[18px] py-3 border-t border-rule"
          >
            <dt className="text-label uppercase text-ink3 md:w-40 flex-none">{r.label}</dt>
            <dd className="m-0 min-w-0 text-base text-ink break-words tnum">
              {r.href ? (
                <a
                  href={r.href}
                  {...(r.href.startsWith('http')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  className="text-navy underline decoration-rule underline-offset-2"
                >
                  {r.value}
                </a>
              ) : (
                r.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ContactTab({ contact }: { contact: ContactModel }) {
  return (
    <div className="flex flex-col gap-5 max-w-[820px]">
      {contact.reach.length > 0 && <ContactCard title="Reach the office" rows={contact.reach} />}
      {contact.visit.length > 0 && <ContactCard title="Visit or write" rows={contact.visit} />}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-meta text-ink3 m-0">
          Official office information as recorded by congress-legislators. Offices move, so check
          the member&rsquo;s website before you write or visit.
        </p>
        {contact.sourceUrl && <SourceLink href={contact.sourceUrl} />}
      </div>
    </div>
  );
}
