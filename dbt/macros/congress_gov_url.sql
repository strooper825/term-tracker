{#-
  Public Congress.gov page for a bill or amendment, e.g.
  https://www.congress.gov/bill/119th-congress/house-bill/4735
  https://www.congress.gov/amendment/119th-congress/senate-amendment/6683
-#}
{% macro congress_gov_url(kind, congress, bill_type, bill_number) -%}
    'https://www.congress.gov/' || {{ kind }} || '/' || {{ congress }}::text
    || case
        when {{ congress }} % 100 between 11 and 13 then 'th'
        when {{ congress }} % 10 = 1 then 'st'
        when {{ congress }} % 10 = 2 then 'nd'
        when {{ congress }} % 10 = 3 then 'rd'
        else 'th'
    end
    || '-congress/'
    || case {{ bill_type }}
        when 'hr' then 'house-bill'
        when 's' then 'senate-bill'
        when 'hres' then 'house-resolution'
        when 'sres' then 'senate-resolution'
        when 'hjres' then 'house-joint-resolution'
        when 'sjres' then 'senate-joint-resolution'
        when 'hconres' then 'house-concurrent-resolution'
        when 'sconres' then 'senate-concurrent-resolution'
        when 'hamdt' then 'house-amendment'
        when 'samdt' then 'senate-amendment'
        when 'suamdt' then 'senate-amendment'
        else {{ bill_type }}
    end
    || '/' || {{ bill_number }}
{%- endmacro %}
