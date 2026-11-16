{{ config(severity='warn') }}
-- A transaction, owner or asset-type code the seeds do not map (ADR 0018, ADR 0026). The row is
-- kept and shown by its raw code, never dropped; this names each unmapped code and counts its rows
-- so a person can add it to the seed. House asset types are the Clerk's two-letter codes
-- (ptr_asset_types); Senate ones are eFD's words (efd_asset_types). A warning, not a failure:
-- either chamber can add a value at any time.
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
where t.source = 'house_clerk_ptr'
  and not exists (select 1 from {{ ref('ptr_asset_types') }} as s where s.code = t.asset_type_code)
group by 2
union all
select 'senate_asset_type', asset_type_code, count(*)
from {{ ref('stock_trade') }} as t
where t.source = 'senate_efd'
  and not exists (select 1 from {{ ref('efd_asset_types') }} as s where s.code = t.asset_type_code)
group by 2
