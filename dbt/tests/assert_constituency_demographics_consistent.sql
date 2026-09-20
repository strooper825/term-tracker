-- A demographics row must be usable as published: a positive population, percents between 0
-- and 100, and race and ethnicity shares that sum to 100 (they come from one table whose
-- categories do not overlap, so anything else means a mapped variable is wrong).
select acs_year, geoid, population, race_total
from {{ ref('constituency_demographics') }}
where population <= 0
    or bachelors_or_higher_pct not between 0 and 100
    or high_school_or_higher_pct not between 0 and 100
    or unemployment_pct not between 0 and 100
    or poverty_pct not between 0 and 100
    or (
        race_total > 0
        and abs(
            coalesce(race_white_pct, 0) + coalesce(race_black_pct, 0) + coalesce(race_native_pct, 0)
            + coalesce(race_asian_pct, 0) + coalesce(race_pacific_pct, 0)
            + coalesce(race_other_pct, 0) + coalesce(race_multiple_pct, 0)
            + coalesce(race_hispanic_pct, 0) - 100
        ) > 0.5
    )
