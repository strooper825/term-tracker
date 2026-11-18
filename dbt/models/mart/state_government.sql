-- Each state's government on the States section's day (ADR 0035): its governor (DC's mayor) and
-- who controls it. control is the governor's party (R, D, or I for one other party, as in Puerto
-- Rico) when that same party group also controls every chamber with a majority or more; N when
-- the legislature is nonpartisan (Nebraska); split otherwise, including when a chamber is run by
-- a coalition or no party holds its majority.
with as_of as (
    select {{ states_as_of() }} as day
),

governor as (
    select distinct on (r.state)
        r.state,
        r.person_id,
        r.start_date,
        r.end_date
    from {{ ref('stg_state_roles') }} as r
    cross join as_of
    where r.chamber = 'governor'
        and coalesce(r.start_date, '0001-01-01'::date) <= as_of.day
        and (r.end_date is null or r.end_date >= as_of.day)
    order by r.state, r.start_date desc nulls last
),

governor_party as (
    select distinct on (pa.person_id)
        pa.person_id,
        pa.party_label,
        case when pa.party = 'N' then 'I' else pa.party end as party,
        case
            when pa.party in ('R', 'D') then pa.party
            when pa.party_label ilike 'independent%' or pa.party_label ilike 'nonpartisan'
                then 'Independent'
            else split_part(pa.party_label, '/', 1)
        end as party_group
    from {{ ref('stg_state_parties') }} as pa
    cross join as_of
    where (pa.start_date is null or pa.start_date <= as_of.day)
        and (pa.end_date is null or pa.end_date >= as_of.day)
    order by pa.person_id, pa.party_index desc
),

chambers as (
    select
        c.state,
        min(c.legislature_name) as legislature_name,
        count(*) as n_chambers,
        count(*) filter (where c.control_kind = 'nonpartisan') as n_nonpartisan,
        bool_or(c.by_registration) as by_registration,
        count(*) filter (where c.control_group = gp.party_group) as n_with_governor
    from {{ ref('state_chamber') }} as c
    left join governor as g on g.state = c.state
    left join governor_party as gp on gp.person_id = g.person_id
    group by c.state
)

select
    f.state_abbr as state,
    f.state_name,
    c.legislature_name,
    g.person_id as governor_person_id,
    p.name as governor_name,
    p.image_url as governor_image_url,
    p.website_url as governor_website_url,
    gp.party_label as governor_party_label,
    gp.party as governor_party,
    g.start_date as governor_start_date,
    case f.state_abbr when 'DC' then 'Mayor' else 'Governor' end as executive_title,
    case
        when c.n_nonpartisan = c.n_chambers then 'N'
        when gp.party_group <> 'Independent' and c.n_with_governor = c.n_chambers then gp.party
        else 'split'
    end as control,
    -- true when control is read from members' party registration in an officially nonpartisan
    -- legislature (Nebraska)
    c.by_registration,
    (select day from as_of) as as_of,
    p.source_url,
    p.fetched_at
from {{ ref('fips') }} as f
inner join chambers as c on c.state = f.state_abbr
left join governor as g on g.state = f.state_abbr
left join {{ ref('stg_state_people') }} as p on p.person_id = g.person_id
left join governor_party as gp on gp.person_id = g.person_id
