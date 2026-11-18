'use client';

// Find and sort on a roster page (ADR 0035). The cards are server-rendered in district order;
// this only hides cards that do not match the search and reorders the rest with CSS `order`, so
// no legislator data is passed to the browser twice. Each card carries data-search (name,
// district, party and committees, lower case) and data-name (family name first).
import { useEffect, useState } from 'react';

export function RosterFilter({ listId, total, noun }: { listId: string; total: number; noun: string }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'district' | 'name'>('district');
  const [shown, setShown] = useState(total);

  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    const cards = [...list.querySelectorAll<HTMLElement>('[data-search]')];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const byName = sort === 'name' ? [...cards].sort((a, b) => (a.dataset.name ?? '').localeCompare(b.dataset.name ?? '')) : cards;
    let count = 0;
    byName.forEach((card, i) => {
      const match = words.every((w) => (card.dataset.search ?? '').includes(w));
      card.style.display = match ? '' : 'none';
      card.style.order = String(i);
      if (match) count += 1;
    });
    setShown(count);
  }, [listId, query, sort]);

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <label className="flex flex-col gap-1 text-label uppercase text-ink2">
        Find
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, district, party or committee"
          className="w-[300px] max-w-full text-base normal-case text-ink border border-rule rounded-ctl px-2.5 py-1.5 bg-card"
        />
      </label>
      <label className="flex flex-col gap-1 text-label uppercase text-ink2">
        Sort by
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as 'district' | 'name')}
          className="text-base normal-case text-ink border border-rule rounded-ctl px-2.5 py-1.5 bg-card"
        >
          <option value="district">District</option>
          <option value="name">Last name</option>
        </select>
      </label>
      <p className="m-0 pb-1.5 text-meta text-ink2 tnum" aria-live="polite">
        {shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`}
      </p>
    </div>
  );
}
