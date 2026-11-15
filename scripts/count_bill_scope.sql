-- Read-only count for batch planning (2026-11-15): how many bill and amendment pages the mart
-- would keep if the candidates below were added to seed.tracked_members. Mirrors the rule in
-- dbt/models/staging/stg_bill_scope.sql. Changes nothing. Not part of the nightly.
\set ON_ERROR_STOP on
\pset footer off
-- Postgres refuses CREATE in a read-only session, so the temporary tables come first; from
-- the SET on, the session can write to nothing else.
create temp table cand (bioguide_id text primary key, name text, chamber text);
create temp table touch (bill_type text, bill_number int, bioguide_id text);
create index on touch (bioguide_id);
create temp table cur (bill_type text, bill_number int);
create temp table added (bill_type text, bill_number int, bioguide_id text, chamber text);
set default_transaction_read_only = on;

insert into cand values
    ('T000250', 'John Thune', 'S'),
    ('S000148', 'Charles E. Schumer', 'S'),
    ('C001035', 'Susan M. Collins', 'S'),
    ('M001111', 'Patty Murray', 'S'),
    ('C000880', 'Mike Crapo', 'S'),
    ('F000479', 'John Fetterman', 'S'),
    ('S001176', 'Steve Scalise', 'H'),
    ('E000294', 'Tom Emmer', 'H'),
    ('C001101', 'Katherine M. Clark', 'H'),
    ('A000371', 'Pete Aguilar', 'H'),
    ('C001053', 'Tom Cole', 'H'),
    ('D000216', 'Rosa L. DeLauro', 'H'),
    ('S001195', 'Jason Smith', 'H'),
    ('J000289', 'Jim Jordan', 'H'),
    ('R000606', 'Jamie Raskin', 'H'),
    ('R000575', 'Mike Rogers', 'H'),
    ('S000510', 'Adam Smith', 'H'),
    ('P000034', 'Frank Pallone, Jr.', 'H'),
    ('W000187', 'Maxine Waters', 'H'),
    ('M001199', 'Brian J. Mast', 'H'),
    ('F000450', 'Virginia Foxx', 'H'),
    ('A000375', 'Jodey C. Arrington', 'H'),
    ('T000467', 'Glenn Thompson', 'H'),
    ('T000193', 'Bennie G. Thompson', 'H'),
    ('S000185', 'Robert C. "Bobby" Scott', 'H'),
    ('B001323', 'Nicholas J. Begich III', 'H'),
    ('S001183', 'David Schweikert', 'H'),
    ('S001148', 'Michael K. Simpson', 'H'),
    ('S000929', 'Victoria Spartz', 'H'),
    ('H001091', 'Ashley Hinson', 'H'),
    ('D000629', 'Sharice Davids', 'H'),
    ('G000592', 'Jared F. Golden', 'H'),
    ('Z000018', 'Ryan K. Zinke', 'H'),
    ('H001066', 'Steven Horsford', 'H'),
    ('P000614', 'Chris Pappas', 'H'),
    ('L000273', 'Teresa Leger Fernandez', 'H'),
    ('F000482', 'Julie Fedorchak', 'H'),
    ('B001326', 'Janelle S. Bynum', 'H'),
    ('M001223', 'Seth Magaziner', 'H'),
    ('C000537', 'James E. Clyburn', 'H'),
    ('J000301', 'Dusty Johnson', 'H'),
    ('B001309', 'Tim Burchett', 'H'),
    ('M001213', 'Blake D. Moore', 'H'),
    ('B001318', 'Becca Balint', 'H'),
    ('M001205', 'Carol D. Miller', 'H'),
    ('H001096', 'Harriet M. Hageman', 'H');

-- every (bill, member) pair of the Congress: the sponsor on the bill, and each cosponsor
insert into touch
select b.bill_type, b.bill_number::int, b.payload -> 'sponsors' -> 0 ->> 'bioguideId' as bioguide_id
from raw.bill as b
where b.congress = 119
union
select c.bill_type, c.bill_number::int, x.value ->> 'bioguideId'
from raw.bill_cosponsors as c
cross join lateral jsonb_array_elements(c.payload) as x (value)
where c.congress = 119;

insert into cur
select bill_type, bill_number::int from staging.stg_bill_scope where congress = 119;

insert into added
select distinct t.bill_type, t.bill_number, c.bioguide_id, c.chamber
from touch as t
inner join cand as c using (bioguide_id)
where not exists (
    select 1 from cur where cur.bill_type = t.bill_type and cur.bill_number = t.bill_number
);

\echo '### Totals'
select
    (select count(*) from raw.bill where congress = 119) as bills_in_congress,
    (select count(*) from cur) as pages_today,
    (select count(*) from (select distinct bill_type, bill_number from added) as a) as added_by_all,
    (select count(*) from (select distinct bill_type, bill_number from added where chamber = 'S') as a) as added_by_senators_alone,
    (select count(*) from (select distinct bill_type, bill_number from added where chamber = 'H') as a) as added_by_house_alone,
    (select count(*) from (select distinct bill_type, bill_number from added
        where bioguide_id not in ('B001298', 'N000191', 'T000487', 'M001238')) as a) as added_without_bacon_neguse_tokuda_mcbride;

\echo '### Pages by type, today and with all candidates'
select bill_type,
    count(*) filter (where today) as today,
    count(*) as with_all
from (
    select bill_type, bill_number, true as today from cur
    union all
    select distinct bill_type, bill_number, false from added
) as u
group by bill_type
order by with_all desc;

\echo '### Per candidate: bills touched, pages not on the site today, pages only this candidate brings'
with only_one as (
    select bill_type, bill_number, min(bioguide_id) as bioguide_id
    from added
    group by bill_type, bill_number
    having count(*) = 1
)
select c.chamber, c.name, c.bioguide_id,
    (select count(*) from touch as t where t.bioguide_id = c.bioguide_id) as touched,
    (select count(*) from added as a where a.bioguide_id = c.bioguide_id) as new_pages,
    (select count(*) from only_one as o where o.bioguide_id = c.bioguide_id) as only_this_member
from cand as c
order by only_this_member desc;
