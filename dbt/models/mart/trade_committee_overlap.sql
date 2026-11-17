-- One row per trade and committee where the traded company's industry is one that committee
-- oversees under the narrow mapping (ADR 0032): the member sat on the committee in the Congress
-- of the trade date, and the company's SIC code falls in a range committee_industries maps to
-- it. A note of overlap, never a finding: the site words it "In an industry the {committee}
-- oversees" and links to the methods page. Committee seats carry no dates, so a member who
-- changed committees within a Congress is matched on the seats recorded for it.
select
    t.bioguide_id,
    t.doc_id,
    t.row_number,
    t.trade_date,
    t.ticker,
    t.company,
    t.sic,
    i.committee_thomas_id,
    c.name as committee_name,
    i.industry,
    i.basis
from {{ ref('stock_trade') }} as t
inner join {{ ref('committee_membership') }} as m
    on m.bioguide_id = t.bioguide_id
   -- A Congress begins on 3 January of an odd year (1789 + 2 * (n - 1)).
   and m.congress = (extract(year from t.trade_date - 2)::int - 1789) / 2 + 1
inner join {{ ref('committee_industries') }} as i
    on i.committee_thomas_id = m.committee_thomas_id
   and t.sic between i.sic_from and i.sic_to
inner join {{ ref('committee') }} as c on c.thomas_id = i.committee_thomas_id
