{{ config(severity='warn') }}
-- Members of an officially nonpartisan legislature (Nebraska) shown as nonpartisan because
-- seeds/state_party_registration.csv has no row for them: a new senator, or a seat whose holder
-- changed. Add or correct the row (ADR 0035).
select h.state, h.district, h.name
from {{ ref('state_seat_holder') }} as h
where h.is_seated
    and h.state in (select distinct state from {{ ref('state_party_registration') }})
    and h.party_basis <> 'registration'
