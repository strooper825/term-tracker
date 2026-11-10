{#-
  The dates that bound the tracked Congress, derived from its number so that moving to the next
  Congress is one change (vars.current_congress) and the dates cannot drift from it. Congress N
  convenes at noon on January 3 of 1789 + 2(N - 1) and ends at noon on January 3 two years on
  (20th Amendment). A term or session that ends on the start date is over; one that starts on
  the end date has not begun; so models compare with > start and < end.
-#}
{% macro congress_start_date() -%}
    '{{ 1789 + 2 * (var('current_congress') | int - 1) }}-01-03'::date
{%- endmacro %}

{% macro congress_end_date() -%}
    '{{ 1789 + 2 * (var('current_congress') | int) }}-01-03'::date
{%- endmacro %}
