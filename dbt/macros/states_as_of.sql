{#-
  The day the States section describes (ADR 0035): today for the live site, a fixed day for an
  archived build (`--vars "{states_as_of: '2026-11-02'}"`, docs/rollover-runbook.md). A role or
  party held on that day counts; one that ended the day before does not.
-#}
{% macro states_as_of() -%}
    {%- if var('states_as_of', none) -%}
        '{{ var('states_as_of') }}'::date
    {%- else -%}
        current_date
    {%- endif -%}
{%- endmacro %}

{#-
  An Open States party label reduced to the federal parties (ADR 0035): the first party of a
  fusion label decides ("Republican/Conservative" is R, "Progressive/Democratic" is I), the
  Democratic-Farmer-Labor party is D, Nebraska's "Nonpartisan" is N, and every other party
  (independents, Puerto Rico's parties, minor parties) is I.
-#}
{% macro state_party_letter(label) -%}
    case
        when split_part({{ label }}, '/', 1) ilike '%republican%' then 'R'
        when split_part({{ label }}, '/', 1) ilike '%democrat%' then 'D'
        when {{ label }} ilike 'nonpartisan' then 'N'
        when {{ label }} is null then null
        else 'I'
    end
{%- endmacro %}
