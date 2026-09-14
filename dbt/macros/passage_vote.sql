{#-
  Passage-type roll calls (ADR 0009), recognised from the question text as each chamber
  publishes it. Verified 2026-09-14 against every roll call loaded for the 119th Congress:

    House   On Passage
            On Agreeing to the Resolution[, as Amended]
            On Motion to Suspend the Rules and Pass|Agree[, as Amended]
    Senate  On Passage of the Bill <document>
            On the Joint Resolution <document>
            On the Resolution <document>
            On the Concurrent Resolution <document>

  Not passage: cloture, motions to proceed, recommit, commit, table, discharge, reconsider,
  concurring in the other chamber's amendment, and votes to override a veto.
-#}
{% macro is_passage_question(chamber, question) -%}
    (
        (
            {{ chamber }} = 'house'
            and (
                {{ question }} in (
                    'On Passage',
                    'On Agreeing to the Resolution',
                    'On Agreeing to the Resolution, as Amended'
                )
                or {{ question }} ~ '^On Motion to Suspend the Rules and (Pass|Agree)(, as Amended)?$'
            )
        )
        or (
            {{ chamber }} = 'senate'
            and {{ question }}
                ~ '^On (Passage of the Bill|the Joint Resolution|the Resolution|the Concurrent Resolution) '
        )
    )
{%- endmacro %}

{#-
  Whether a passage roll call passed, from its result as published. Null for any other string,
  which the dbt test assert_bill_passage_vote_consistent turns into a build failure rather than
  a guess.
-#}
{% macro passage_passed(result) -%}
    case
        when {{ result }} in (
            'Passed',
            'Bill Passed',
            'Joint Resolution Passed',
            'Resolution Agreed to',
            'Concurrent Resolution Agreed to'
        ) then true
        when {{ result }} in (
            'Failed',
            'Bill Defeated',
            'Joint Resolution Defeated',
            'Resolution Rejected',
            'Concurrent Resolution Rejected'
        ) then false
    end
{%- endmacro %}
