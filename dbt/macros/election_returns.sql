{#-
  Helpers for the MIT Election Lab constituency returns (ADR 0008).

  election_vote_kind: what a row of the files counts. The files put ballot artefacts in the
  candidate column with several spellings (verified 2026-09-14 across both files):
    blank           blank ballots and undervotes
    over            overvotes, void and spoiled ballots
    mixed           a single row combining blank votes with scattering or void votes; it cannot
                    be split, so it is excluded from valid votes like blank and over votes
    none_of_these   Nevada's "None of these candidates", a valid vote nobody wins
    write_in_other  unnamed write-ins, scattering, and "OTHER" aggregates
    candidate       a named candidate, including a named write-in
-#}
{% macro election_vote_kind(candidate, writein) -%}
    case
        when upper(trim({{ candidate }})) in (
            'BLANK', 'BLANKS', 'BLANK VOTE', 'BLANK VOTES',
            'UNDERVOTE', 'UNDERVOTES', 'UNDER VOTE', 'UNDER VOTES'
        ) then 'blank'
        when upper(trim({{ candidate }})) in (
            'OVERVOTE', 'OVERVOTES', 'OVER VOTE', 'OVER VOTES',
            'VOID', 'VOID VOTE', 'VOID VOTES', 'SPOILED', 'SPOILED VOTES'
        ) then 'over'
        when upper(trim({{ candidate }})) like 'BLANK VOTE%/%' then 'mixed'
        when upper(trim({{ candidate }})) like 'NONE OF THE%' then 'none_of_these'
        when upper(trim({{ candidate }})) in (
            '', 'OTHER', 'OTHERS', 'ALL OTHERS', 'OTHER CANDIDATES', 'SCATTER', 'SCATTERING',
            'MISCELLANEOUS', 'WRITE-IN', 'WRITE-INS', 'WRITEIN', 'WRITE IN', 'WRITE INS',
            'OTHER WRITE-INS', 'WRITE-IN (MISCELLANEOUS)'
        ) then 'write_in_other'
        else 'candidate'
    end
{%- endmacro %}

{#- Valid votes: the denominator of every vote share; blank, over and mixed rows are excluded. -#}
{% macro election_valid_vote_kinds() -%}
    ('candidate', 'write_in_other', 'none_of_these')
{%- endmacro %}

{#-
  Regular federal general election day in a year: the Tuesday next after the first Monday in
  November (2 U.S.C. 7). isodow runs Monday 1 to Sunday 7.
-#}
{% macro general_election_date(year_expr) -%}
    (
        make_date(({{ year_expr }})::int, 11, 1)
        + ((8 - extract(isodow from make_date(({{ year_expr }})::int, 11, 1))::int) % 7)
        + 1
    )
{%- endmacro %}

{#- Party as the card shows it beside a name: D, R, I for the three it abbreviates, else the name. -#}
{% macro party_label(party_detailed) -%}
    case upper(trim({{ party_detailed }}))
        when 'DEMOCRAT' then 'D'
        when 'DEMOCRATIC' then 'D'
        when 'REPUBLICAN' then 'R'
        when 'INDEPENDENT' then 'I'
        else initcap(lower({{ party_detailed }}))
    end
{%- endmacro %}
