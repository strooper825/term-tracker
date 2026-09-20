'use client';

// The Constituency tab: who a member represents. A map of the district or state with county lines
// (finished SVG paths from mart.member_constituency, drawn as they are: no projection, no
// simplifying, no geometry here) and the ACS demographics beside it. The map needs one piece of
// state, which view is showing, so this file is a client component; everything it renders is
// still in the static HTML. County names are the native hover text of an SVG <title>.
import { useState } from 'react';
import type { ConstituencyModel, DemographicsModel, MapViewModel, RaceRow } from '@/lib/model';
import { SourceLink } from './SiteChrome';

function ViewToggle({
  views,
  active,
  onSelect,
}: {
  views: MapViewModel[];
  active: string;
  onSelect: (key: MapViewModel['key']) => void;
}) {
  return (
    <div role="group" aria-label="Map view" className="inline-flex border border-rule rounded-ctl overflow-hidden">
      {views.map((v, i) => (
        <button
          key={v.key}
          type="button"
          aria-pressed={active === v.key}
          onClick={() => onSelect(v.key)}
          className={`text-label uppercase px-3 py-[7px] ${i > 0 ? 'border-l border-rule' : ''} ${
            active === v.key ? 'bg-navy text-white' : 'bg-card text-ink2 hover:bg-ruleSoft'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

function MapSvg({ view, place }: { view: MapViewModel; place: string }) {
  const inDistrictView = view.key === 'district';
  return (
    <svg
      viewBox={view.viewBox}
      role="img"
      aria-label={view.ariaLabel}
      className="block w-full max-w-[520px] max-h-[460px] mx-auto"
      fillRule="evenodd"
    >
      <path d={view.outline} className={inDistrictView ? 'fill-navy/10' : 'fill-ruleSoft'} />
      {view.district && (
        <path d={view.district} className="fill-navy/80 stroke-navy" strokeWidth={1} vectorEffect="non-scaling-stroke">
          <title>{place}</title>
        </path>
      )}
      {view.counties.map((c) => (
        <path
          key={c.geoid}
          d={c.d}
          className={`fill-transparent hover:fill-navy/15 ${inDistrictView ? 'stroke-navy/40' : 'stroke-ink4'}`}
          strokeWidth={0.75}
          vectorEffect="non-scaling-stroke"
        >
          <title>{c.name}</title>
        </path>
      ))}
      <path
        d={view.outline}
        className={`fill-none pointer-events-none ${inDistrictView ? 'stroke-navy' : 'stroke-ink2'}`}
        strokeWidth={inDistrictView ? 1.75 : 1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MapCard({ model }: { model: ConstituencyModel }) {
  const [active, setActive] = useState(model.views[0].key);
  const view = model.views.find((v) => v.key === active) ?? model.views[0];
  return (
    <section aria-label="Map" className="border border-rule rounded-card bg-card p-[18px] md:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-heading font-semibold text-ink m-0">{model.place}</h2>
        {model.views.length > 1 && <ViewToggle views={model.views} active={view.key} onSelect={setActive} />}
      </div>
      <MapSvg view={view} place={model.place} />
      <p className="text-meta text-ink3 m-0">
        {model.boundaryCongress ? `${model.boundaryCongress} district lines. ` : ''}
        Hover a county to see its name.
      </p>
    </section>
  );
}

const RACE_TINTS = ['#33477A', '#4C63A0', '#7F92C4', '#C2CCDF', '#8A877F', '#A6A39C', '#C6C3BC', '#E0DDD7'];

function RaceBar({ rows }: { rows: RaceRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label="Race and ethnicity shares" className="flex h-3 rounded-chip overflow-hidden">
        {rows.map((r, i) => (
          <i key={r.key} title={`${r.label}: ${r.text}`} style={{ width: `${r.pct}%`, background: RACE_TINTS[i] }} />
        ))}
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2 text-body text-ink">
            <i className="w-[9px] h-[9px] rounded-[1px] flex-none" style={{ background: RACE_TINTS[i] }} />
            <span className="min-w-0">{r.label}</span>
            <span className="ml-auto tnum text-ink2">{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DemographicsCard({ model, d }: { model: ConstituencyModel; d: DemographicsModel }) {
  return (
    <section aria-label="Demographics" className="border border-rule rounded-card bg-card p-[18px] md:p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="text-label uppercase text-ink3">
          {model.area === 'district' ? 'People in the district' : 'People in the state'}
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-title font-semibold text-ink tnum">{d.population.value}</span>
          {d.population.margin && (
            <span className="text-meta text-ink3 tnum" title="Margin of error at 90 percent confidence">
              {d.population.margin}
            </span>
          )}
        </div>
        <div className="text-meta text-ink3">{d.period} American Community Survey estimate</div>
      </div>

      <dl className="m-0 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
        {d.facts.map((f) => (
          <div key={f.label} className="flex flex-col gap-0.5 border-t border-rule pt-3">
            <dt className="text-label uppercase text-ink3">{f.label}</dt>
            <dd className="m-0 flex items-baseline gap-2 flex-wrap">
              <span className="text-stat font-semibold text-ink tnum">{f.value}</span>
              {f.margin && (
                <span className="text-meta text-ink3 tnum" title="Margin of error at 90 percent confidence">
                  {f.margin}
                </span>
              )}
            </dd>
            {f.note && <div className="text-meta text-ink3">{f.note}</div>}
          </div>
        ))}
      </dl>

      {d.race.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-rule pt-4">
          <h3 className="text-label uppercase text-ink3 m-0">Race and ethnicity</h3>
          <RaceBar rows={d.race} />
          <p className="text-meta text-ink3 m-0">
            Each group other than Hispanic or Latino excludes Hispanic residents, so the shares
            sum to 100.
          </p>
        </div>
      )}
    </section>
  );
}

export function ConstituencyTab({ model }: { model: ConstituencyModel }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 items-start">
        {model.views.length > 0 && <MapCard model={model} />}
        {model.demographics && <DemographicsCard model={model} d={model.demographics} />}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-meta text-ink3 m-0 max-w-[80ch]">
          Boundaries are the Census Bureau&rsquo;s cartographic boundary files, drawn from the
          districts in force this Congress. Demographics are five-year survey estimates with a
          margin of error, not counts; a figure marked &ldquo;±&rdquo; could be off by that much.
        </p>
        <div className="flex gap-2 flex-wrap">
          {model.sources.map((s) => (
            <SourceLink key={s.href} href={s.href} title={s.label} />
          ))}
        </div>
      </div>
    </div>
  );
}
