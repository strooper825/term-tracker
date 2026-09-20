-- Who lives in a constituency: one row per state and House district per ACS 5-year release
-- (natural key acs_year, fips_state, district; district null is the state, 0 at large, ADR 0001).
-- `congress` is the Congress whose district lines the release uses (119 for 2020-2024), which
-- is what ties a row to a member's term (ADR 0015). Every estimate carries its margin of error
-- (`_moe`, 90 percent confidence); a null is a value the Census could not compute. Race and
-- ethnicity shares are of the B03002 total, so the eight categories sum to 100.
select
    acs_year,
    congress,
    fips_state,
    district,
    geoid,
    kind,
    name,
    (acs_year - 4)::text || '-' || acs_year::text as period,
    population,
    population_moe,
    median_age,
    median_age_moe,
    median_household_income,
    median_household_income_moe,
    households,
    households_moe,
    bachelors_or_higher_pct,
    bachelors_or_higher_pct_moe,
    high_school_or_higher_pct,
    high_school_or_higher_pct_moe,
    unemployment_pct,
    unemployment_pct_moe,
    poverty_pct,
    poverty_pct_moe,
    race_total,
    round(100 * race_white / nullif(race_total, 0), 2) as race_white_pct,
    round(100 * race_black / nullif(race_total, 0), 2) as race_black_pct,
    round(100 * race_native / nullif(race_total, 0), 2) as race_native_pct,
    round(100 * race_asian / nullif(race_total, 0), 2) as race_asian_pct,
    round(100 * race_pacific / nullif(race_total, 0), 2) as race_pacific_pct,
    round(100 * race_other / nullif(race_total, 0), 2) as race_other_pct,
    round(100 * race_multiple / nullif(race_total, 0), 2) as race_multiple_pct,
    round(100 * race_hispanic / nullif(race_total, 0), 2) as race_hispanic_pct,
    'census_acs' as source,
    source_url,
    fetched_at
from {{ ref('stg_acs_estimates') }}
