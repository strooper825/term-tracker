-- At most one FEC candidate id per tracked member matches the chamber of the latest term;
-- the loader stops on two (ingest/sources/fec.py), and this catches the same case in the mart.
with latest_term as (
    select distinct on (bioguide_id) bioguide_id, chamber
    from {{ ref('term') }}
    order by bioguide_id, start_date desc
)

select cand.bioguide_id, count(*) as candidates
from {{ ref('stg_fec_candidates') }} as cand
inner join latest_term as t on t.bioguide_id = cand.bioguide_id
where cand.office = case t.chamber when 'house' then 'H' else 'S' end
group by 1
having count(*) > 1
