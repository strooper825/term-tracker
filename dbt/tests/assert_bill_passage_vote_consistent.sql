-- Every passage roll call has a pass or fail reading of its published result (a new result
-- string fails here rather than being guessed), the party split adds up to the tally, and each
-- bill has exactly one latest passage roll call per chamber it voted in (ADR 0009).
select congress, bill_type, bill_number, chamber, 'result not mapped: ' || coalesce(result, 'null')
    as problem
from {{ ref('bill_passage_vote') }}
where passed is null

union all

select congress, bill_type, bill_number, chamber, 'party split does not add up to the tally'
from {{ ref('bill_passage_vote') }}
where yea_republican + yea_democratic + yea_independent + yea_other <> yea_total
    or nay_republican + nay_democratic + nay_independent + nay_other <> nay_total

union all

select congress, bill_type, bill_number, chamber, 'latest roll call count is not 1'
from {{ ref('bill_passage_vote') }}
group by congress, bill_type, bill_number, chamber
having count(*) filter (where is_latest_in_chamber) <> 1
