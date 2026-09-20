-- One row per state and House district in an ACS 5-year release (raw.acs_estimate), the
-- values typed and the Census "could not compute" sentinels turned into null (macro
-- acs_number). Every estimate has a margin of error `_moe` at the 90 percent level. Percent
-- columns (`*_pct`) are the Data Profile's own; race counts are B03002 (Hispanic or Latino
-- origin by race, non-overlapping) and are turned into shares in mart.constituency_demographics.
-- A district code that is not two digits (the Census's "ZZ", the part of a state with no
-- district) is not a place anyone represents; it is left out here as well as at load (the
-- 2026-09-20 nightly stored such rows before the loader skipped them).
with base as (
    select
        acs_year,
        congress,
        geoid,
        kind,
        payload ->> 'name' as name,
        payload -> 'profile' as p,
        payload -> 'detail' as d,
        source_url,
        fetched_at
    from {{ source('raw', 'acs_estimate') }}
)

select
    acs_year,
    congress,
    geoid,
    kind,
    substr(geoid, 1, 2) as fips_state,
    case
        when kind = 'district'
        then case when substr(geoid, 3, 2) in ('00', '98') then 0 else substr(geoid, 3, 2)::int end
    end as district,
    name,
    {{ acs_number("p ->> 'DP05_0001E'") }} as population,
    {{ acs_number("p ->> 'DP05_0001M'") }} as population_moe,
    {{ acs_number("p ->> 'DP05_0018E'") }} as median_age,
    {{ acs_number("p ->> 'DP05_0018M'") }} as median_age_moe,
    {{ acs_number("p ->> 'DP03_0062E'") }} as median_household_income,
    {{ acs_number("p ->> 'DP03_0062M'") }} as median_household_income_moe,
    {{ acs_number("p ->> 'DP02_0001E'") }} as households,
    {{ acs_number("p ->> 'DP02_0001M'") }} as households_moe,
    {{ acs_number("p ->> 'DP02_0068PE'") }} as bachelors_or_higher_pct,
    {{ acs_number("p ->> 'DP02_0068PM'") }} as bachelors_or_higher_pct_moe,
    {{ acs_number("p ->> 'DP02_0067PE'") }} as high_school_or_higher_pct,
    {{ acs_number("p ->> 'DP02_0067PM'") }} as high_school_or_higher_pct_moe,
    {{ acs_number("p ->> 'DP03_0009PE'") }} as unemployment_pct,
    {{ acs_number("p ->> 'DP03_0009PM'") }} as unemployment_pct_moe,
    {{ acs_number("p ->> 'DP03_0128PE'") }} as poverty_pct,
    {{ acs_number("p ->> 'DP03_0128PM'") }} as poverty_pct_moe,
    {{ acs_number("d ->> 'B03002_001E'") }} as race_total,
    {{ acs_number("d ->> 'B03002_003E'") }} as race_white,
    {{ acs_number("d ->> 'B03002_004E'") }} as race_black,
    {{ acs_number("d ->> 'B03002_005E'") }} as race_native,
    {{ acs_number("d ->> 'B03002_006E'") }} as race_asian,
    {{ acs_number("d ->> 'B03002_007E'") }} as race_pacific,
    {{ acs_number("d ->> 'B03002_008E'") }} as race_other,
    {{ acs_number("d ->> 'B03002_009E'") }} as race_multiple,
    {{ acs_number("d ->> 'B03002_012E'") }} as race_hispanic,
    source_url,
    fetched_at
from base
where kind = 'state' or substr(geoid, 3, 2) ~ '^[0-9][0-9]$'
