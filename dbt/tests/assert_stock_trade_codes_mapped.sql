{{ config(severity='warn') }}
-- A transaction, owner or asset-type code the ptr_* seeds do not map (ADR 0018). The row is kept
-- and shown by its raw code, never dropped; this names each unmapped code and counts its rows so
-- a person can add it to the seed. A warning, not a failure: the Clerk can add a code at any time.
select 'transaction_type' as kind, transaction_type_code as code, count(*) as rows
from {{ ref('stock_trade') }} as t
where not exists (select 1 from {{ ref('ptr_transaction_types') }} as s where s.code = t.transaction_type_code)
group by 2
union all
select 'owner', owner_code, count(*)
from {{ ref('stock_trade') }} as t
where not exists (select 1 from {{ ref('ptr_owner_codes') }} as s where s.code = t.owner_code)
group by 2
union all
select 'asset_type', asset_type_code, count(*)
from {{ ref('stock_trade') }} as t
where not exists (select 1 from {{ ref('ptr_asset_types') }} as s where s.code = t.asset_type_code)
group by 2
