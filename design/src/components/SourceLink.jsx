export default function SourceLink({ href, title = 'View source record on Congress.gov' }) {
  return (
    <a href={href} title={title}
       className="flex-none text-meta text-ink3 border border-rule rounded-chip px-1.5 py-0.5">
      source ↗
    </a>
  );
}
