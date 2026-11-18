'use client';

// The national map of the States section (ADR 0035): each state coloured by who controls its
// government. Hover shows the state's governor and control; a click opens the state's page. The
// shapes are the homepage's site/public/maps/national.json; control comes from the build's
// GET /api/v1/states. Puerto Rico is not on the drawing and is listed beside it.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NationalMap } from './RepresentationMap';
import { CONTROL_FILL, CONTROL_LEGEND, type Control } from '@/lib/states';
import { PARTY_FILL } from '@/lib/seats';

export interface ControlMapState {
  state: string;
  name: string;
  control: Control;
  controlLabel: string;
  governor: string | null;
}

const SPLIT = 'url(#state-split)';
const fillFor = (control: Control) => (control === 'split' ? SPLIT : CONTROL_FILL[control]);

function Swatch({ control }: { control: Control }) {
  const background =
    control === 'split'
      ? `repeating-linear-gradient(135deg, ${PARTY_FILL.R} 0 3px, ${PARTY_FILL.D} 3px 6px)`
      : CONTROL_FILL[control];
  return <span aria-hidden className="w-3.5 h-3.5 rounded-sm flex-none" style={{ background }} />;
}

export function StateControlMap({ states }: { states: ControlMapState[] }) {
  const [map, setMap] = useState<NationalMap | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/maps/national.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((doc: NationalMap) => setMap(doc))
      .catch(() => setFailed(true));
  }, []);

  const byAbbr = useMemo(() => new Map(states.map((s) => [s.state, s])), [states]);
  const offMap = states.filter((s) => map && !map.states.some((m) => m.abbr === s.state));
  const W = map?.w ?? 960;
  const H = map?.h ?? 600;
  const hovered = hover ? byAbbr.get(hover) : undefined;
  const outline = hover ? map?.states.find((s) => s.abbr === hover)?.d : undefined;

  const keyAt = (target: EventTarget | null) =>
    target instanceof Element ? (target.closest('[data-key]')?.getAttribute('data-key') ?? null) : null;

  const placeCard = (): React.CSSProperties => {
    const r = frame.current?.getBoundingClientRect();
    const fx = r && pointer.x > r.width * 0.6 ? 'calc(-100% - 14px)' : '14px';
    const fy = r && pointer.y > r.height * 0.5 ? 'calc(-100% - 14px)' : '14px';
    return { left: pointer.x, top: pointer.y, transform: `translate(${fx}, ${fy})` };
  };

  return (
    <section aria-labelledby="control-map-heading" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 id="control-map-heading" className="m-0 text-[22px] font-bold text-ink">
          Who controls each state
        </h2>
        <p className="m-0 text-[14px] text-ink2">
          A party has control when it holds the governorship and a majority in every chamber of the
          legislature. Click a state to see its governor and legislature.
        </p>
      </div>

      <div
        ref={frame}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse') return;
          const r = frame.current!.getBoundingClientRect();
          setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
          setHover(keyAt(e.target));
        }}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => {
          const key = keyAt(e.target);
          if (key && byAbbr.has(key)) window.location.assign(`/states/${key.toLowerCase()}`);
        }}
        className="relative w-full overflow-hidden bg-card border border-rule rounded-card select-none"
        style={{ aspectRatio: `${W} / ${H}` }}
      >
        {map ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Map of the states, coloured by which party controls each state government"
            className="block w-full h-full"
          >
            <defs>
              <pattern id="state-split" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(45)">
                <rect width="12" height="12" fill={PARTY_FILL.D} />
                <rect width="6" height="12" fill={PARTY_FILL.R} />
              </pattern>
            </defs>
            {map.states.map((s) => {
              const st = byAbbr.get(s.abbr);
              return (
                <path
                  key={s.abbr}
                  data-key={s.abbr}
                  d={s.d}
                  fillRule="evenodd"
                  fill={st ? fillFor(st.control) : '#ECEEF3'}
                  stroke="#FFFFFF"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  className="cursor-pointer"
                />
              );
            })}
            {outline && (
              <path d={outline} fillRule="evenodd" fill="none" stroke="#1A1A19" strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" pointerEvents="none" />
            )}
          </svg>
        ) : (
          <p className="absolute inset-0 m-0 flex items-center justify-center text-[14px] text-ink2">
            {failed ? 'The map could not load. The list below has every state.' : 'Loading map…'}
          </p>
        )}
        {hovered && (
          <div
            className="absolute z-10 w-[250px] flex flex-col gap-1 px-3.5 py-3 bg-card border border-rule rounded-card shadow-[0_10px_28px_rgba(26,26,25,0.16)] pointer-events-none text-ink"
            style={placeCard()}
          >
            <span className="text-[16px] font-bold">{hovered.name}</span>
            <span className="flex items-center gap-1.5 text-body">
              <Swatch control={hovered.control} />
              {hovered.controlLabel}
            </span>
            {hovered.governor && <span className="text-meta text-ink2">{hovered.governor}</span>}
            <span className="text-meta text-ink2">Click to open the state</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <ul aria-label="Legend" className="m-0 p-0 list-none flex flex-wrap gap-x-[18px] gap-y-1.5 text-[13px] text-ink2">
          {CONTROL_LEGEND.filter((l) => states.some((s) => s.control === l.key)).map((l) => (
            <li key={l.key} className="flex items-center gap-1.5">
              <Swatch control={l.key} />
              {l.label}
            </li>
          ))}
        </ul>
        {offMap.length > 0 && (
          <p className="m-0 text-[13px] text-ink2">
            <span className="font-semibold text-ink">Not on the map: </span>
            {offMap.map((s, i) => (
              <span key={s.state}>
                {i > 0 && ' · '}
                <a href={`/states/${s.state.toLowerCase()}`} className="text-navy underline decoration-rule underline-offset-2 hover:decoration-navy">
                  {s.name}
                </a>{' '}
                ({s.controlLabel.toLowerCase()})
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
