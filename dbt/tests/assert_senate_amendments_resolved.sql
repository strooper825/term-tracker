{{ config(severity='warn') }}
-- A Senate amendment the ingest could not match to the report it replaces (ADR 0026). eFD does
-- not say which report an amendment amends, so ingest.senate_efd matches them by the rows they
-- share and refuses to guess when that does not decide it. Both reports then stay listed and both
-- sets of trades are shown, so a trade may appear twice: this names the amendment for a person to
-- check against eFD. An amendment whose original predates the tracked Congress is not listed.
select report_id, bioguide_id, report_for, amendment, filing_date, supersedes_note, source_url
from {{ ref('stg_senate_ptr_reports') }}
where amendment > 0
  and supersedes is null
  and supersedes_note like 'not resolved%'
