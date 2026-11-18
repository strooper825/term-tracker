'use client';

// A state's legislature on a map (ADR 0035): every district of one chamber, coloured by the party
// of whoever holds it. Hover shows the district's members; a click (or a tap) pins the card with
// links to their pages on the legislature's site. A district that elects several members and
// splits between parties is striped; an empty seat is grey. Seats with no shape of their own
// (at-large, New Hampshire's floterial districts, non-voting) are listed under the map.
//
// The shapes are site/public/maps/states/{abbr}.json (ingest/state_maps.py, Census boundaries);
// the members are /states/data/{abbr}.json, written by the build from GET /api/v1/states/{abbr}.
// The map never scrolls: zoom with the buttons or a pinch, then drag to move.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  groupFill,
  groupName,
  groupOf,
  indexDistricts,
  seatGroups,
  type DistrictMember,
  type DistrictSeat,
  type ShapelessSeat,
  type StateChamber,
  type StateDrawing,
  type StateMapData,
  type StateParty,
} from '@/lib/states';

type Point = { x: number; y: number };

export interface MapChamber {
  chamber: StateChamber['chamber'];
  name: string;
  title: string;
}

const MAX_ZOOM = 12;
const VACANT = '#ECEEF3';
/** Groups sort Democrats first, other parties by name, then nonpartisan, Republicans, vacant: a
 *  stripe pair is always written the same way round. */
const RANK: Record<string, number> = { D: 0, N: 2, R: 3, V: 4 };
const byRank = (a: string, b: string) => (RANK[a] ?? 1) - (RANK[b] ?? 1) || a.localeCompare(b);
const slug = (g: string) => (g.length === 1 ? g : g.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_'));
const stripeId = (pair: string[]) => `st-stripe-${pair.map(slug).join('-')}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One colour for a single party, stripes of the two commonest parties when the members split,
 *  grey only when every seat is empty: one empty seat of four does not change the colour (the
 *  card says so). */
export function stripePair(groups: string[]): string[] | null {
  const held = groups.filter((g) => g !== 'V');
  const counts = new Map<string, number>();
  for (const g of held.length ? held : groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || byRank(a[0], b[0]));
  if (top.length < 2) return null;
  return [top[0][0], top[1][0]].sort(byRank);
}

export function districtFill(groups: string[]): string {
  const pair = stripePair(groups);
  if (pair) return `url(#${stripeId(pair)})`;
  const held = groups.filter((g) => g !== 'V');
  return held.length ? groupFill(held[0]) : VACANT;
}

export function partyWord(m: Pick<DistrictMember, 'party' | 'partyLabel'>): string {
  if (m.party === 'I') return groupName(m.partyLabel.split('/')[0] || null, 'I');
  return groupName(null, m.party);
}

/** "District 7", "Hillsborough 12", "Ward 1", "District 10" for Idaho's 10A and 10B. */
export function districtLabel(districts: string[]): string {
  const first = districts[0] ?? '';
  const seats = districts.every((d) => /^\d+[A-Z]$/i.test(d)) ? first.replace(/[A-Z]$/i, '') : null;
  const name = seats ?? first;
  return /^\d+$/.test(name) ? `District ${name}` : name;
}

function Badge({ member }: { member: DistrictMember }) {
  return (
    <span
      className="flex-none text-label font-semibold uppercase text-white px-[7px] py-0.5 rounded-chip max-w-[140px] truncate"
      style={{ background: groupFill(groupOf(member.party, member.partyLabel)) }}
    >
      {partyWord(member)}
    </span>
  );
}

function MemberRow({ member, link }: { member: DistrictMember; link: boolean }) {
  const body = (
    <>
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="text-[14px] font-semibold leading-snug">{member.name}</span>
        {link && member.websiteUrl && <span className="text-meta text-ink2">Official page ↗</span>}
      </span>
      <Badge member={member} />
    </>
  );
  if (!link || !member.websiteUrl) {
    return <span className="flex items-center gap-2.5 py-1.5 border-t border-ruleSoft">{body}</span>;
  }
  return (
    <a
      href={member.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 py-1.5 border-t border-ruleSoft text-ink hover:bg-canvas"
    >
      {body}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function SeatCard({
  seat,
  chamber,
  link,
}: {
  seat: Pick<DistrictSeat, 'districts' | 'seats' | 'members'>;
  chamber: MapChamber;
  link: boolean;
}) {
  const vacant = seat.seats - seat.members.length;
  return (
    <>
      <span className="text-label font-semibold uppercase text-ink2">{chamber.name}</span>
      <span className="text-[16px] font-bold">{districtLabel(seat.districts)}</span>
      {seat.seats > 1 && <span className="text-meta text-ink2">Elects {seat.seats} members</span>}
      {seat.members.map((m) => (
        <MemberRow key={`${m.name}-${m.district}`} member={m} link={link} />
      ))}
      {vacant > 0 && (
        <span className="text-body text-ink2 pt-1">
          {seat.seats === 1 ? 'This seat is vacant.' : `${vacant} seat${vacant > 1 ? 's' : ''} vacant.`}
        </span>
      )}
    </>
  );
}

const NOTE_HEADING: Record<string, string> = {
  'at-large': 'At-large seats',
  floterial: 'Floterial districts (each covers several of the districts on the map)',
  'non-voting': 'Non-voting members',
};

export function StateLegislatureMap({ abbr, chambers }: { abbr: string; chambers: MapChamber[] }) {
  const [drawing, setDrawing] = useState<StateDrawing | null>(null);
  const [data, setData] = useState<StateMapData | null>(null);
  const [failed, setFailed] = useState(false);
  const [chamber, setChamber] = useState<MapChamber['chamber']>(chambers[chambers.length - 1].chamber);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<Point | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pointer, setPointer] = useState<Point>({ x: 0, y: 0 });
  const [pinned, setPinned] = useState<{ key: string; at: Point } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    pointers: Map<number, Point>;
    start: Point | null;
    center: Point | null;
    downKey: string | null;
    moved: boolean;
    pinch: { dist: number; zoom: number } | null;
  }>({ pointers: new Map(), start: null, center: null, downKey: null, moved: false, pinch: null });

  useEffect(() => {
    const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    Promise.all([get(`/maps/states/${abbr.toLowerCase()}.json`), get(`/states/data/${abbr.toLowerCase()}.json`)])
      .then(([d, m]: [StateDrawing, StateMapData]) => {
        setDrawing(d);
        setData(m);
      })
      .catch(() => setFailed(true));
  }, [abbr]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pinned]);

  const index = useMemo(() => (data ? indexDistricts(data) : null), [data]);
  const current = chambers.find((c) => c.chamber === chamber) ?? chambers[0];
  const shapes = drawing?.chambers[chamber] ?? [];
  const W = drawing?.w ?? 1000;
  const H = drawing?.h ?? 700;

  const seatFor = (code: string) => index?.byShape.get(`${chamber}|${code}`);
  const fills = useMemo(() => {
    const out = new Map<string, string>();
    for (const [code] of shapes) {
      const seat = index?.byShape.get(`${chamber}|${code}`);
      out.set(code, seat ? districtFill(seatGroups(seat)) : VACANT);
    }
    return out;
  }, [shapes, index, chamber]);
  // the stripe patterns the map uses, and the groups for the legend
  const used = useMemo(() => {
    const groups = new Set<string>();
    const pairs = new Map<string, string[]>();
    for (const [code] of shapes) {
      const seat = index?.byShape.get(`${chamber}|${code}`);
      if (!seat) continue;
      const all = seatGroups(seat);
      const held = all.filter((g) => g !== 'V');
      (held.length ? held : all).forEach((g) => groups.add(g));
      const pair = stripePair(all);
      if (pair) pairs.set(stripeId(pair), pair);
    }
    return { groups: [...groups].sort(byRank), pairs: [...pairs.entries()] };
  }, [shapes, index, chamber]);
  const shapeless: ShapelessSeat[] = (index?.shapeless ?? []).filter((s) => s.chamber === chamber);

  // ---- zoom and drag --------------------------------------------------------------------------
  const vpOf = (z: number, c: Point | null) => {
    const vw = W / z;
    const vh = H / z;
    return {
      vw,
      vh,
      cx: clamp(c?.x ?? W / 2, vw / 2, W - vw / 2),
      cy: clamp(c?.y ?? H / 2, vh / 2, H - vh / 2),
    };
  };
  const vp = vpOf(zoom, center);
  const zoomTo = (z: number) => {
    const next = clamp(z, 1, MAX_ZOOM);
    setZoom(next);
    setCenter(next === 1 ? null : { x: vp.cx, y: vp.cy });
  };
  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = frame.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const keyAt = (target: EventTarget | null) =>
    target instanceof Element ? (target.closest('[data-key]')?.getAttribute('data-key') ?? null) : null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('[data-overlay]')) return;
    const g = gesture.current;
    g.pointers.set(e.pointerId, local(e));
    frame.current?.setPointerCapture?.(e.pointerId);
    if (g.pointers.size === 1) {
      g.start = local(e);
      g.center = { x: vp.cx, y: vp.cy };
      g.downKey = keyAt(e.target);
      g.moved = false;
      g.pinch = null;
    } else if (g.pointers.size === 2) {
      const [a, b] = [...g.pointers.values()];
      g.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      g.moved = true;
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const at = local(e);
    if (g.pointers.has(e.pointerId)) {
      g.pointers.set(e.pointerId, at);
      if (g.pinch && g.pointers.size >= 2) {
        const [a, b] = [...g.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (g.pinch.dist > 0) zoomTo((g.pinch.zoom * dist) / g.pinch.dist);
        return;
      }
      if (g.start && g.center) {
        const dx = at.x - g.start.x;
        const dy = at.y - g.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
        if (g.moved && zoom > 1) {
          const k = vp.vw / frame.current!.getBoundingClientRect().width;
          setCenter({ x: g.center.x - dx * k, y: g.center.y - dy * k });
          setHover(null);
          return;
        }
      }
    }
    if (e.pointerType === 'mouse') {
      setPointer(at);
      setHover(keyAt(e.target));
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const wasTap = g.pointers.size === 1 && !g.moved;
    g.pointers.delete(e.pointerId);
    if (g.pointers.size < 2) g.pinch = null;
    if (!wasTap) return;
    if (!g.downKey) {
      setPinned(null);
      return;
    }
    setPinned({ key: g.downKey, at: local(e) });
    setHover(null);
  };

  const placeCard = (at: Point): React.CSSProperties => {
    const r = frame.current?.getBoundingClientRect();
    const fx = r && at.x > r.width * 0.6 ? 'calc(-100% - 14px)' : '14px';
    const fy = r && at.y > r.height * 0.5 ? 'calc(-100% - 14px)' : '14px';
    return { left: at.x, top: at.y, transform: `translate(${fx}, ${fy})` };
  };

  const emptySeat = (code: string): Pick<DistrictSeat, 'districts' | 'seats' | 'members'> => ({
    districts: [code],
    seats: 1,
    members: [],
  });
  const hoverSeat = hover && !pinned ? (seatFor(hover) ?? emptySeat(hover)) : null;
  const pinnedSeat = pinned ? (seatFor(pinned.key) ?? emptySeat(pinned.key)) : null;
  const outlineKey = pinned?.key ?? hover;
  const outline = outlineKey ? shapes.find(([code]) => code === outlineKey)?.[1] : undefined;

  const chamberButton = (c: MapChamber) => (
    <button
      key={c.chamber}
      type="button"
      aria-pressed={chamber === c.chamber}
      onClick={() => {
        setChamber(c.chamber);
        setHover(null);
        setPinned(null);
      }}
      className={`min-h-[44px] px-[18px] border-0 text-[14px] font-semibold cursor-pointer ${
        chamber === c.chamber ? 'bg-navy text-white' : 'bg-card text-navy hover:bg-canvas'
      }`}
    >
      {c.name}
    </button>
  );
  const zoomButton = (label: string, onClick: () => void, children: React.ReactNode, disabled = false) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="w-9 h-9 md:w-10 md:h-10 inline-flex items-center justify-center border border-rule rounded-ctl bg-card text-ink text-[20px] shadow-[0_2px_6px_rgba(26,26,25,0.08)] cursor-pointer disabled:opacity-40 disabled:cursor-default"
    >
      {children}
    </button>
  );

  const legend: { key: string; label: string; background: string }[] = [
    ...used.groups
      .filter((g) => g !== 'V')
      .map((g) => ({
        key: g,
        label: g === 'Independent' ? 'Independent or other' : groupName(g, g.length === 1 ? (g as StateParty) : 'I'),
        background: groupFill(g),
      })),
    ...(used.pairs.length
      ? [{ key: 'split', label: 'District split between parties', background: `repeating-linear-gradient(135deg, ${groupFill(used.pairs[0][1][1])} 0 3px, ${groupFill(used.pairs[0][1][0])} 3px 6px)` }]
      : []),
    { key: 'V', label: 'Vacant', background: VACANT },
  ];

  return (
    <section aria-labelledby="legislature-map-heading" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="legislature-map-heading" className="m-0 text-[22px] font-bold text-ink">
            Districts
          </h2>
          <p className="m-0 text-[14px] text-ink2">
            <span className="hidden md:inline">Hover over a district to see who represents it; click to keep the card open.</span>
            <span className="md:hidden">Tap a district to see who represents it. Zoom in with + or a pinch.</span>
          </p>
        </div>
        {chambers.length > 1 && (
          <div role="group" aria-label="Chamber" className="inline-flex border-[1.5px] border-navy rounded-card overflow-hidden">
            {chambers.map(chamberButton)}
          </div>
        )}
      </div>

      <div
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        className={`relative w-full overflow-hidden bg-card border border-rule rounded-card select-none ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ aspectRatio: `${W} / ${H}`, maxHeight: '78vh', touchAction: 'none' }}
      >
        {drawing && index ? (
          <svg
            viewBox={`${vp.cx - vp.vw / 2} ${vp.cy - vp.vh / 2} ${vp.vw} ${vp.vh}`}
            role="img"
            aria-label={`Map of the ${current.name} districts, coloured by the party that holds each seat`}
            className="block w-full h-full"
          >
            <defs>
              {used.pairs.map(([id, pair]) => (
                <pattern key={id} id={id} patternUnits="userSpaceOnUse" width={W / 120} height={W / 120} patternTransform="rotate(45)">
                  <rect width={W / 120} height={W / 120} fill={groupFill(pair[1])} />
                  <rect width={W / 240} height={W / 120} fill={groupFill(pair[0])} />
                </pattern>
              ))}
            </defs>
            <g>
              {shapes.map(([code, d]) => (
                <path key={code} data-key={code} d={d} fillRule="evenodd" fill={fills.get(code)} stroke="#FFFFFF" strokeWidth={0.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="cursor-pointer" />
              ))}
            </g>
            <path d={drawing.outline} fillRule="evenodd" fill="none" stroke="#9AA1AA" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            {outline && (
              <path d={outline} fillRule="evenodd" fill="none" stroke="#1A1A19" strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" pointerEvents="none" />
            )}
          </svg>
        ) : (
          <p className="absolute inset-0 m-0 flex items-center justify-center text-[14px] text-ink2">
            {failed ? 'The map could not load. Try reloading the page.' : 'Loading map…'}
          </p>
        )}

        <div data-overlay className="absolute bottom-2 right-2 md:bottom-3 md:right-3 flex flex-row md:flex-col gap-1.5">
          {zoomButton('Zoom in', () => zoomTo(zoom * 1.5), '+', zoom >= MAX_ZOOM)}
          {zoomButton('Zoom out', () => zoomTo(zoom / 1.5), '−', zoom <= 1)}
          {zoomButton(
            'Reset the map',
            () => {
              setZoom(1);
              setCenter(null);
              setPinned(null);
            },
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>,
            zoom === 1 && !pinned,
          )}
        </div>

        {hoverSeat && (
          <div
            className="absolute z-10 w-[270px] flex flex-col gap-1 px-3.5 py-3 bg-card border border-rule rounded-card shadow-[0_10px_28px_rgba(26,26,25,0.16)] pointer-events-none text-ink"
            style={placeCard(pointer)}
          >
            <SeatCard seat={hoverSeat} chamber={current} link={false} />
            <span className="text-meta text-ink2 pt-1">Click to keep this open</span>
          </div>
        )}
        {pinned && pinnedSeat && (
          <div
            data-overlay
            role="dialog"
            aria-label={`${current.name}: ${districtLabel(pinnedSeat.districts)}`}
            className="absolute z-20 w-[290px] max-h-[70%] overflow-y-auto flex flex-col gap-1 px-3.5 py-3 bg-card border border-rule rounded-card shadow-[0_10px_28px_rgba(26,26,25,0.18)] text-ink"
            style={placeCard(pinned.at)}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setPinned(null)}
              className="self-end w-8 h-8 -mr-1.5 -mb-6 border-0 bg-transparent text-[18px] text-ink2 cursor-pointer hover:text-ink"
            >
              ×
            </button>
            <SeatCard seat={pinnedSeat} chamber={current} link />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <ul aria-label="Legend" className="m-0 p-0 list-none flex flex-wrap gap-x-[18px] gap-y-1.5 text-[13px] text-ink2">
          {legend.map((l) => (
            <li key={l.key} className="flex items-center gap-1.5">
              <span aria-hidden className="w-3.5 h-3.5 rounded-sm border border-ruleSoft" style={{ background: l.background }} />
              {l.label}
            </li>
          ))}
        </ul>
        {drawing && <p className="m-0 text-meta text-ink2">District lines: Census Bureau, {drawing.vintage}.</p>}
      </div>

      {shapeless.length > 0 && (
        <div className="flex flex-col gap-3">
          {[...new Set(shapeless.map((s) => s.note))].map((note) => (
            <div key={note} className="flex flex-col gap-1.5">
              <h3 className="m-0 text-[15px] font-semibold text-ink">{NOTE_HEADING[note] ?? 'Other seats'}</h3>
              <ul className="m-0 p-0 list-none grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {shapeless
                  .filter((s) => s.note === note)
                  .map((s) => (
                    <li key={s.district} className="flex flex-col py-1">
                      <span className="text-meta text-ink2">
                        {districtLabel([s.district])}
                        {s.seats > 1 ? ` · ${s.seats} seats` : ''}
                        {s.seats > s.members.length ? ` · ${s.seats - s.members.length} vacant` : ''}
                      </span>
                      {s.members.map((m) => (
                        <MemberRow key={m.name} member={m} link />
                      ))}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
