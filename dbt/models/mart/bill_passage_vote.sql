-- One row per passage-type roll call on a bill with a page (mart.bill, kind = bill): the result
-- as published and whether it passed, the tally, and the Yea and Nay split by the party letter
-- on each member's vote record (ADR 0009). Questions are matched by macro is_passage_question.
--
-- Party shares divide by Yea plus Nay on the roll call, so a bar for Yea and a bar for Nay are
-- drawn on one scale and together fill 100 percent. The party is the letter recorded with the
-- vote (R, D, I); anything else counts as other.
--
-- is_latest_in_chamber marks the roll call the journey reads when a chamber voted on passage
-- more than once (H.R. 5371 in the Senate: defeated twice, then passed).
{% set parties = [('R', 'republican'), ('D', 'democratic'), ('I', 'independent')] %}

with passage as (
    select r.*
    from {{ ref('roll_call') }} as r
    inner join {{ ref('bill') }} as b
        on b.congress = r.congress
        and b.bill_type = r.bill_type
        and b.bill_number = r.bill_number
    where b.kind = 'bill'
        and {{ is_passage_question('r.chamber', 'r.question') }}
),

positions as (
    select congress, chamber, session, roll_number, position, party
    from {{ ref('stg_house_member_votes') }}
    union all
    select congress, chamber, session, roll_number, position, party
    from {{ ref('stg_senate_member_votes') }}
),

split as (
    select
        v.congress,
        v.chamber,
        v.session,
        v.roll_number,
        {% for letter, name in parties %}
        count(*) filter (where v.position = 'Yea' and v.party = '{{ letter }}') as yea_{{ name }},
        count(*) filter (where v.position = 'Nay' and v.party = '{{ letter }}') as nay_{{ name }},
        {% endfor %}
        count(*) filter (
            where v.position = 'Yea' and coalesce(v.party, '') not in ('R', 'D', 'I')
        ) as yea_other,
        count(*) filter (
            where v.position = 'Nay' and coalesce(v.party, '') not in ('R', 'D', 'I')
        ) as nay_other
    from positions as v
    inner join passage as p
        on p.congress = v.congress
        and p.chamber = v.chamber
        and p.session = v.session
        and p.roll_number = v.roll_number
    group by v.congress, v.chamber, v.session, v.roll_number
),

joined as (
    select
        p.*,
        {% for letter, name in parties %}
        coalesce(s.yea_{{ name }}, 0) as yea_{{ name }},
        coalesce(s.nay_{{ name }}, 0) as nay_{{ name }},
        {% endfor %}
        coalesce(s.yea_other, 0) as yea_other,
        coalesce(s.nay_other, 0) as nay_other,
        nullif(p.yea_total + p.nay_total, 0) as decided
    from passage as p
    left join split as s
        on s.congress = p.congress
        and s.chamber = p.chamber
        and s.session = p.session
        and s.roll_number = p.roll_number
)

select
    congress,
    bill_type,
    bill_number,
    chamber,
    session,
    roll_number,
    voted_at,
    vote_date,
    question,
    result,
    {{ passage_passed('result') }} as passed,
    -- only the thresholds the source states: House 2/3 votes (suspension) name it in vote_type,
    -- Senate votes carry majority_requirement
    case
        when vote_type like '2/3%' then '2/3 required'
        when majority_requirement in ('2/3', '3/5') then majority_requirement || ' required'
    end as majority_label,
    row_number() over (
        partition by congress, bill_type, bill_number, chamber
        order by voted_at desc nulls last, session desc, roll_number desc
    ) = 1 as is_latest_in_chamber,
    yea_total,
    nay_total,
    present_total,
    not_voting_total,
    round(100.0 * yea_total / decided, 2) as yea_pct,
    round(100.0 * nay_total / decided, 2) as nay_pct,
    {% for letter, name in parties %}
    yea_{{ name }},
    nay_{{ name }},
    round(100.0 * yea_{{ name }} / decided, 2) as yea_{{ name }}_pct,
    round(100.0 * nay_{{ name }} / decided, 2) as nay_{{ name }}_pct,
    {% endfor %}
    yea_other,
    nay_other,
    round(100.0 * yea_other / decided, 2) as yea_other_pct,
    round(100.0 * nay_other / decided, 2) as nay_other_pct,
    source,
    source_url,
    fetched_at
from joined
