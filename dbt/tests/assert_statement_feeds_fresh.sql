{{ config(severity='warn') }}
-- A feed member whose newest statement is over 45 days old, or who has none, is a feed that
-- has probably gone stale or empty (ADR 0015). Only a warning: an office can be quiet, and the
-- site keeps showing what it has. Fixture databases hold no statements, so this test is
-- exercised against a real ingest.
select bioguide_id, label, feed_url, statements, newest_published_at
from {{ ref('statement_source') }}
where mode = 'feed'
  and (newest_published_at is null or newest_published_at < now() - interval '45 days')
