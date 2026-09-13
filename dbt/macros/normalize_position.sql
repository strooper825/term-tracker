{#-
  Collapse the upstream vote vocabularies to Yea / Nay / Present / Not Voting / Other.
  House recorded votes say Aye/No; Speaker elections record a candidate name (counted as a
  vote cast, hence Other); Senate impeachment trials say Guilty / Not Guilty. See ADR 0004.
-#}
{% macro normalize_position(expr) -%}
    case
        when {{ expr }} in ('Yea', 'Aye') then 'Yea'
        when {{ expr }} in ('Nay', 'No') then 'Nay'
        when {{ expr }} = 'Present' then 'Present'
        when {{ expr }} = 'Not Voting' then 'Not Voting'
        else 'Other'
    end
{%- endmacro %}
