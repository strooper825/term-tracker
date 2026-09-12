{#-
  Congress number in session on a given date. Congress N convenes on January 3 of year
  1789 + 2(N-1); dates before January 3 of an odd year still belong to the previous Congress.
-#}
{% macro congress_number(date_expr) -%}
    (
        floor(
            (
                extract(year from {{ date_expr }})
                - case
                    when extract(month from {{ date_expr }}) = 1
                        and extract(day from {{ date_expr }}) < 3
                    then 1 else 0
                  end
                - 1789
            ) / 2
        ) + 1
    )::int
{%- endmacro %}
