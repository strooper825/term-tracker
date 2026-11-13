'use client';

// The homepage map (ADR 0022): every state and House district, colored by the party that holds
// it. Hover shows who holds a seat, a click opens their profile (a tracked member's dashboard,
// otherwise their official website), and in the Senate view a click pins the state's card so
// either senator can be chosen. On a touch screen a tap pins the card in both views.
//
// The shapes are site/public/maps/national.json (ingest/national_map.py, Census boundaries);
// who holds each seat comes from the build's GET /congress/seats, so the colors follow the
// nightly data. The map never scrolls: zoom with the buttons or a pinch, then drag to move.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DELEGATE_STATES,
  PARTY_FILL,
  PARTY_WORD,
  houseKey,
  indexSeats,
  senateFill,
  stripeId,
  type MapSeat,
  type PartyLetter,
} from '@/lib/seats';
import { ordinal } from '@/lib/format';
import { MemberPhoto } from './MemberPhoto';

interface StateShape {
  fips: string;
  abbr: string;
  name: string;
  d: string;
}
interface DistrictShape {
  abbr: string;
  district: number;
  d: string;
}
export interface NationalMap {
  w: number;
  h: number;
  congress: number;
  states: StateShape[];
  districts: DistrictShape[];
}

type View = 'house' | 'senate';
type Point = { x: number; y: number };

const MAX_ZOOM = 8;
const NO_VOTE = '#ECEEF3';
const LETTERS: PartyLetter[] = ['D', 'I', 'R', 'V'];
const PAIRS: PartyLetter[][] = LETTERS.flatMap((a, i) => LETTERS.slice(i + 1).map((b) => [a, b]));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function fillOf(letters: PartyLetter[] | null): string {
  if (!letters) return NO_VOTE;
  return letters.length === 1 ? PARTY_FILL[letters[0]] : `url(#${stripeId(letters)})`;
}

/** All the colored shapes. Memoized on everything but hover, so moving the pointer re-renders
 *  only the outline and the card. Each path carries its key for the pointer handlers. */
const Shapes = memo(function Shapes({
  map,
  view,
  fills,
}: {
  map: NationalMap;
  view: View;
  fills: Map<string, string>;
}) {
  if (view === 'senate') {
    return (
      <g>
        {map.states.map((s) => (
          <path key={s.abbr} data-key={s.abbr} d={s.d} fillRule="evenodd" fill={fills.get(s.abbr)} stroke="#FFFFFF" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="cursor-pointer" />
        ))}
      </g>
    );
  }
  return (
    <g>
      {map.districts.map((d) => {
        const key = houseKey(d.abbr, d.district);
        return (
          <path key={key} data-key={key} d={d.d} fillRule="evenodd" fill={fills.get(key)} stroke="#FFFFFF" strokeWidth={0.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="cursor-pointer" />
        );
      })}
      <g pointerEvents="none">
        {map.states.map((s) => (
          <path key={s.abbr} d={s.d} fillRule="evenodd" fill="none" stroke="#FFFFFF" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
      </g>
    </g>
  );
});

function Badge({ party }: { party: PartyLetter }) {
  if (party === 'V') return null;
  return (
    <span
      className="flex-none text-label font-semibold uppercase text-white px-[7px] py-0.5 rounded-chip"
      style={{ background: PARTY_FILL[party] }}
    >
      {PARTY_WORD[party]}
    </span>
  );
}

function SeatRow({ seat, link }: { seat: MapSeat; link: boolean }) {
  // a House card's title already names the district; a Senate card needs senior/junior
  const detail = [seat.chamber === 'senate' ? seat.seatLabel : null, seat.partyNote].filter(Boolean).join(' · ');
  const body = (
    <>
      <MemberPhoto photoUrl={seat.photoUrl} bioguideId={seat.bioguideId} className="w-9 h-9 rounded-full" />
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="text-[14px] font-semibold leading-snug">{seat.name}</span>
        {(detail || link) && (
          <span className="text-meta text-ink2">
            {detail}
            {link && `${detail ? ' · ' : ''}${seat.external ? 'Official website ↗' : 'View profile →'}`}
          </span>
        )}
      </span>
      <Badge party={seat.party} />
    </>
  );
  if (!link) return <span className="flex items-center gap-2.5 pt-2 border-t border-ruleSoft">{body}</span>;
  return (
    <a
      href={seat.href}
      {...(seat.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-center gap-2.5 py-2 border-t border-ruleSoft text-ink hover:bg-canvas"
    >
      {body}
      {seat.external && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
}

interface CardModel {
  kicker: string;
  title: string;
  seats: MapSeat[];
  empty: string | null;
  hint: string;
}

export function RepresentationMap({ seats, congress }: { seats: MapSeat[]; congress: number }) {
  const [map, setMap] = useState<NationalMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>('house');
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
    /** The shape under the pointer when it went down: capture retargets later events. */
    downKey: string | null;
    moved: boolean;
    pinch: { dist: number; zoom: number } | null;
  }>({ pointers: new Map(), start: null, center: null, downKey: null, moved: false, pinch: null });

  useEffect(() => {
    fetch('/maps/national.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((doc: NationalMap) => setMap(doc))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPinned(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pinned]);

  const index = useMemo(() => indexSeats(seats), [seats]);
  const W = map?.w ?? 960;
  const H = map?.h ?? 600;

  const fills = useMemo(() => {
    const out = new Map<string, string>();
    if (!map) return out;
    if (view === 'senate') {
      for (const s of map.states) out.set(s.abbr, fillOf(senateFill(index.senate.get(s.abbr), s.abbr)));
    } else {
      for (const d of map.districts) {
        const key = houseKey(d.abbr, d.district);
        const seat = index.house.get(key);
        out.set(key, DELEGATE_STATES.has(d.abbr) ? NO_VOTE : PARTY_FILL[seat?.party ?? 'V']);
      }
    }
    return out;
  }, [map, view, index]);

  const viewport = useCallback(
    (z: number, c: Point | null) => {
      const vw = W / z;
      const vh = H / z;
      const cx = clamp(c?.x ?? W / 2, vw / 2, W - vw / 2);
      const cy = clamp(c?.y ?? H / 2, vh / 2, H - vh / 2);
      return { vw, vh, cx, cy };
    },
    [W, H],
  );
  const vp = viewport(zoom, center);

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
    const key = g.downKey;
    if (!key) {
      setPinned(null);
      return;
    }
    const at = local(e);
    const seat = view === 'house' ? index.house.get(key) : undefined;
    if (e.pointerType === 'mouse' && view === 'house') {
      if (!seat) return;
      if (seat.external) window.open(seat.href, '_blank', 'noopener,noreferrer');
      else window.location.assign(seat.href);
      return;
    }
    setPinned({ key, at });
    setHover(null);
  };

  const cardFor = (key: string): CardModel | null => {
    if (view === 'senate') {
      const state = map?.states.find((s) => s.abbr === key);
      if (!state) return null;
      const senators = index.senate.get(key) ?? [];
      return {
        kicker: 'Senate',
        title: state.name,
        seats: senators,
        empty: key === 'DC' ? 'Washington, D.C. has no senators.' : senators.length === 0 ? 'Both seats are vacant.' : null,
        hint: senators.length ? 'Click to choose a senator' : '',
      };
    }
    const [abbr, district] = key.split('-');
    const seat = index.house.get(key);
    const stateName = map?.states.find((s) => s.abbr === abbr)?.name ?? abbr;
    const seatLabel = abbr === 'DC' ? 'Delegate' : Number(district) === 0 ? 'At-large district' : `District ${district}`;
    return {
      kicker: `House · ${stateName}`,
      title: seatLabel,
      seats: seat ? [seat] : [],
      empty: seat ? null : 'This seat is vacant.',
      hint: seat ? (abbr === 'DC' ? 'Can speak but not vote on the floor. ' : '') + (seat.external ? 'Click for their official website' : 'Click to open their profile') : '',
    };
  };

  const placeCard = (at: Point): React.CSSProperties => {
    const r = frame.current?.getBoundingClientRect();
    const fx = r && at.x > r.width * 0.6 ? 'calc(-100% - 14px)' : '14px';
    const fy = r && at.y > r.height * 0.5 ? 'calc(-100% - 14px)' : '14px';
    return { left: at.x, top: at.y, transform: `translate(${fx}, ${fy})` };
  };

  const hoverCard = hover && !pinned ? cardFor(hover) : null;
  const pinnedCard = pinned ? cardFor(pinned.key) : null;
  const outlineKey = pinned?.key ?? hover;
  const outline = outlineKey
    ? view === 'senate'
      ? map?.states.find((s) => s.abbr === outlineKey)?.d
      : map?.districts.find((d) => houseKey(d.abbr, d.district) === outlineKey)?.d
    : undefined;

  const chamberButton = (key: View, label: string) => (
    <button
      type="button"
      aria-pressed={view === key}
      onClick={() => {
        setView(key);
        setHover(null);
        setPinned(null);
      }}
      className={`min-h-[44px] px-[22px] border-0 text-[14px] font-semibold cursor-pointer ${
        view === key ? 'bg-navy text-white' : 'bg-card text-navy hover:bg-canvas'
      }`}
    >
      {label}
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

  return (
    <section aria-labelledby="map-heading" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="map-heading" className="m-0 text-[22px] font-bold text-ink">
            Who represents you
          </h2>
          <p className="m-0 text-[14px] text-ink2">
            <span className="hidden md:inline">
              {view === 'senate'
                ? 'Hover over a state to see its senators, then click it to choose a profile.'
                : 'Hover over a district to see its representative, then click to open their profile.'}
            </span>
            <span className="md:hidden">
              {view === 'senate'
                ? 'Tap a state to see its senators. Zoom in with + or a pinch.'
                : 'Tap a district to see its representative. Zoom in with + or a pinch.'}
            </span>
          </p>
        </div>
        <div role="group" aria-label="Chamber" className="inline-flex border-[1.5px] border-navy rounded-card overflow-hidden">
          {chamberButton('house', 'House')}
          {chamberButton('senate', 'Senate')}
        </div>
      </div>

      <div
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        className={`relative w-full overflow-hidden bg-card border border-rule rounded-card select-none ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ aspectRatio: `${W} / ${H}`, touchAction: 'none' }}
      >
        {map ? (
          <svg
            viewBox={`${vp.cx - vp.vw / 2} ${vp.cy - vp.vh / 2} ${vp.vw} ${vp.vh}`}
            role="img"
            aria-label={
              view === 'senate'
                ? 'Map of the states, colored by the party of their senators'
                : 'Map of the House districts, colored by the party that holds each seat'
            }
            className="block w-full h-full"
          >
            <defs>
              {PAIRS.map((pair) => (
                <pattern key={stripeId(pair)} id={stripeId(pair)} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                  <rect width="5" height="5" fill={PARTY_FILL[pair[1]]} />
                  <rect width="2.5" height="5" fill={PARTY_FILL[pair[0]]} />
                </pattern>
              ))}
            </defs>
            <Shapes map={map} view={view} fills={fills} />
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

        {hoverCard && (
          <div
            className="absolute z-10 w-[270px] flex flex-col gap-1.5 px-3.5 py-3 bg-card border border-rule rounded-card shadow-[0_10px_28px_rgba(26,26,25,0.16)] pointer-events-none text-ink"
            style={placeCard(pointer)}
          >
            <span className="text-label font-semibold uppercase text-ink2">{hoverCard.kicker}</span>
            <span className="text-[16px] font-bold">{hoverCard.title}</span>
            {hoverCard.seats.map((s) => (
              <SeatRow key={s.key} seat={s} link={false} />
            ))}
            {hoverCard.empty && <span className="text-body text-ink2">{hoverCard.empty}</span>}
            {hoverCard.hint && <span className="text-meta text-ink2">{hoverCard.hint}</span>}
          </div>
        )}

        {pinned && pinnedCard && (
          <div
            data-overlay
            role="dialog"
            aria-label={`${pinnedCard.kicker}: ${pinnedCard.title}`}
            className="absolute z-20 w-[290px] flex flex-col gap-1 px-3.5 py-3 bg-card border border-rule rounded-card shadow-[0_10px_28px_rgba(26,26,25,0.18)] text-ink"
            style={placeCard(pinned.at)}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="flex flex-col">
                <span className="text-label font-semibold uppercase text-ink2">{pinnedCard.kicker}</span>
                <span className="text-[16px] font-bold">{pinnedCard.title}</span>
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPinned(null)}
                className="w-8 h-8 -mr-1.5 border-0 bg-transparent text-[18px] text-ink2 cursor-pointer hover:text-ink"
              >
                ×
              </button>
            </span>
            {pinnedCard.seats.map((s) => (
              <SeatRow key={s.key} seat={s} link />
            ))}
            {pinnedCard.empty && <span className="text-body text-ink2">{pinnedCard.empty}</span>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <ul aria-label="Legend" className="m-0 p-0 list-none flex flex-wrap gap-x-[18px] gap-y-1.5 text-[13px] text-ink2">
          {(['R', 'D', 'I'] as PartyLetter[]).map((p) => (
            <li key={p} className="flex items-center gap-1.5">
              <span aria-hidden className="w-3.5 h-3.5 rounded-sm" style={{ background: PARTY_FILL[p] }} />
              {PARTY_WORD[p]}
            </li>
          ))}
          {view === 'senate' && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="w-3.5 h-3.5 rounded-sm" style={{ background: `repeating-linear-gradient(135deg, ${PARTY_FILL.R} 0 3px, ${PARTY_FILL.D} 3px 6px)` }} />
              Split by party
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="w-3.5 h-3.5 rounded-sm border border-lockRule" style={{ background: NO_VOTE }} />
            Vacant or no voting member
          </li>
        </ul>
        {map && (
          <p className="m-0 text-meta text-ink2">
            District lines: Census Bureau, {ordinal(map.congress)} Congress
            {map.congress !== congress ? '. Some states have redrawn theirs since.' : '.'}
          </p>
        )}
      </div>

      {view === 'house' && index.territories.length > 0 && (
        <p className="m-0 text-[13px] text-ink2 leading-relaxed">
          <span className="font-semibold text-ink">Non-voting seats not on the map: </span>
          {index.territories.map((s, i) => (
            <span key={s.key}>
              {i > 0 && ' · '}
              <a
                href={s.href}
                {...(s.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-navy underline decoration-rule underline-offset-2 hover:decoration-navy"
              >
                {s.stateName}: {s.name}
              </a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
