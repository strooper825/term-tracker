{#-
  Human label for a bill or amendment from the Congress.gov type and number:
  hr 4735 -> "H.R. 4735", s 2274 -> "S. 2274", hjres 5 -> "H.J.Res. 5", samdt 6683 -> "S.Amdt. 6683".
-#}
{% macro bill_label(bill_type, bill_number) -%}
    case {{ bill_type }}
        when 'hr' then 'H.R. '
        when 's' then 'S. '
        when 'hres' then 'H.Res. '
        when 'sres' then 'S.Res. '
        when 'hjres' then 'H.J.Res. '
        when 'sjres' then 'S.J.Res. '
        when 'hconres' then 'H.Con.Res. '
        when 'sconres' then 'S.Con.Res. '
        when 'hamdt' then 'H.Amdt. '
        when 'samdt' then 'S.Amdt. '
        when 'suamdt' then 'S.Amdt. '
        else upper({{ bill_type }}) || ' '
    end || {{ bill_number }}
{%- endmacro %}
