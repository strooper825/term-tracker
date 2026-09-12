"""Nightly ingestion: fetch each source, store payloads in the raw schema as JSONB.

Every load is an idempotent upsert keyed on the source's natural key, so re-running a
night is safe. Transformation happens in dbt, not here.
"""
