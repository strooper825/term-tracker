export default function SiteHeader({ active }) {
  const link = (href, label) => (
    <a key={label} href={href}
       className={active === label ? 'text-ink font-semibold' : 'text-ink2 hover:text-ink'}>{label}</a>
  );
  return (
    <header className="flex items-center justify-between gap-6 px-7 py-3.5 border-b border-rule">
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-bold uppercase tracking-[0.14em]">Term Tracker</span>
        <span className="text-[10px] uppercase tracking-[0.08em] text-ink4 border border-rule rounded-chip px-1.5 py-px">working name</span>
      </div>
      <nav className="flex gap-[22px] text-sm">
        {link('/members', 'Members')}
        {link('/about', 'About')}
        {link('/data', 'Data')}
      </nav>
    </header>
  );
}
