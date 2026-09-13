export default function Breadcrumb({ name }) {
  return (
    <nav className="flex items-center gap-[7px] text-meta text-ink3">
      <a href="/members" className="text-ink2">Members</a>
      <span className="text-[#C6C3BC]">/</span>
      <span>{name}</span>
    </nav>
  );
}
