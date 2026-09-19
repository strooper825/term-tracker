# 0012. Chamber composition is a hand-maintained seed, cross-checked against congress-legislators

Date: 2026-09-19
Status: Accepted

## Context

The Congress overview page (`/congress`) opens with the party split of all 535 seats. Nothing
in the pipeline holds that: every mart table is scoped to the tracked members, and
`raw.legislator` lists current members only, so an empty seat is simply absent from it.
The brief for the page assumed a composition ADR and seed already existed. Neither does: there
is no composition ADR in the repo or on any branch (`0008` is election-context sources, on an
unmerged branch), and `seed.*` holds only `fips`, `tracked_members` and `key_dates`.

Checked 2026-09-19, and the sources disagree with each other more than the page can tolerate:

- `raw.legislator` (congress-legislators, ingested 2026-09-16), latest term of each of the 539
  current members: House 218 Republican, 214 Democratic, 1 Independent who caucuses with
  Republicans (Kiley, see verification-notes.md), plus 6 delegates; Senate 53 Republican,
  45 Democratic, 2 Independents who caucus with Democrats (Sanders, King).
- The House Clerk's member page reports the same House split (218 / 214 / 1, two vacancies).
- The house.gov representatives directory, read through a page summariser, gave 222 Republican
  and 210 Democratic. That reading is wrong (a summariser counting rows of an HTML list), and
  is recorded here only because it shows a hand count from a web page is not trustworthy on
  its own.
- Senate.gov's party-division page agrees with the Senate figures above.

The mockup's own header reads "Seated 535 of 535 · 3 vacancies", which contradicts itself, and
its example figures (219 R / 213 D / 3 vacant) are placeholders, not the current House.

## Decision

1. **`seed.composition_seats`** holds one row per chamber and party group (`republican`,
   `democratic`, `independent`, `vacant`) with `seats` and, for independents, `caucus_with`.
   It is hand-maintained, because no source we ingest lists vacancies, and it is the only
   input to the composition figures.
2. **Provenance is dbt vars**, as for `fips` and `key_dates`: `composition_as_of` and the two
   source URLs (Clerk of the House, Senate.gov). The page prints "as of" from the seed; it never
   substitutes the build date.
3. **Every figure on the page is a mart column.** `mart.chamber_composition` carries each row's
   share of the chamber (`seat_pct`, what the bar's width is), `mart.chamber_majority` the seats
   caucusing with each party, the majority threshold (`chamber seats / 2 + 1`, so 218 and 51:
   the constitutional count, held constant when seats are vacant), the margin and the party
   ahead.
4. **Independents count with the party they caucus with** for the margin, and are drawn as their
   own segment with the caucus written out. This is the rule ADR 0005 already applies to party
   unity.
5. **Drift is a warning, not a failure.** `assert_composition_matches_legislators` compares the
   seed with the party counts in `raw.legislator` and warns on a difference. It cannot fail the
   build: a swearing-in between manual updates would otherwise take down the nightly ingest,
   which is the failure mode ADR 0011 was written for. Seat-total tests do fail the build
   (House 435, Senate 100), since a seed that does not add up is a typing error.

## Consequences

- The composition goes stale silently between edits; the page shows the seed's as-of date, and
  the warning tells whoever runs the build that congress-legislators has moved.
- Delegates and the Resident Commissioner are not among the 435 or the 535 and are not in the
  seed. They are in `raw.legislator`, so the drift check counts voting members only.
- Seeded 2026-09-19 as of 2026-09-19: House 218 R, 214 D, 1 I (caucus R), 2 vacant; Senate
  53 R, 45 D, 2 I (caucus D), 0 vacant. Seated 533 of 535.
