{#-
  An ACS value as a number, or null. The Census API sends every value as a string, and marks
  a value that could not be computed with a large negative sentinel (-666666666 no sample,
  -999999999 too few observations, -888888888 not applicable, -222222222 and -333333333 for
  medians it could not place, -555555555 for a margin it could not compute). Anything below
  -100,000,000 is one of those; no real ACS figure is that negative.
-#}
{% macro acs_number(expr) -%}
    case
        when ({{ expr }}) ~ '^-?[0-9]+(\.[0-9]+)?$' and ({{ expr }})::numeric > -100000000
        then ({{ expr }})::numeric
    end
{%- endmacro %}
