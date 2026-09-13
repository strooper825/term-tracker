export default function SiteFooter({ lastUpdated = 'Sep 12, 2026 06:00 UTC' }) {
  return (
    <footer className="border-t border-rule px-7 pt-5 pb-7 flex flex-col gap-1.5">
      <p className="text-meta text-ink3">
        Data from Congress.gov, Senate.gov, and the unitedstates/congress-legislators
        project. Last updated {lastUpdated}.
      </p>
      <a href="/data-dictionary" className="text-meta">Data dictionary ↗</a>
    </footer>
  );
}
