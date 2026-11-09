# Coach quality rubric

The judge sees two answers blind (A and B), the case criteria, the serious errors
and, when available, verified reference facts. Each pair is judged **in both
orders** (A/B and B/A) and averaged, to cancel position bias. It scores the
content of the advice, not the style.

## Substance dimensions (decide the result)

| Dimension | Weight | 1 | 3 | 5 |
|---|---|---|---|---|
| **Accuracy** (`precision`) | 3 | Invents items, runes or abilities, or gets mechanics wrong. | Generally right, with a doubtful or outdated detail. | Everything it states exists and is correct for the given patch. |
| **Context fit** (`contexto`) | 3 | Generic answer that ignores the draft, the minute or the gold. | Uses part of the context. | Every recommendation is justified by a concrete threat or fact from the case. |
| **Actionability** (`accionabilidad`) | 2 | Theory with no steps, or "whatever you prefer" / "check u.gg". | Steps, but vague ("buy something defensive"). | What to buy or do, in what order and when. |

**Substance** = (3·Accuracy + 3·Context + 2·Actionability) / 8, from 1 to 5.

A **serious error** from the case list caps Accuracy and Context at 2. The script
applies this in code from what the judge flags.

## Constraints (must not get worse)

| Dimension | 1 | 3 | 5 |
|---|---|---|---|
| **Format for the moment** (`formato`) | A long guide for an in-game question, or so terse it is useless. | Acceptable length. | In game: the decision in the first line and few lines. Before the game: clear, easy-to-scan structure. |
| **Honesty** (`honestidad`) | States confidently what it doesn't know, **or** hides behind doubt instead of recommending. | Doesn't invent, but caution reduces usefulness. | Recommends decisively and flags in one line what it can't verify. |
| **Compliance** (`cumplimiento`) | Wrong language, or recommends something against Riot's policies. | — | In English by default, or in the language the player explicitly asked for; no forbidden tools; never asks for live game data. |

Citing the patch or a website doesn't raise the score by itself: it only counts if
the fact is correct and useful.

## Language

The coach answers in **English by default** and switches to another language only
when the player asks for it. Item, rune and ability names follow the language of the
answer (official en_US names in English; official es_MX or English names in
Spanish). The case `lang-01-spanish-requested` checks the switch.

## Reference facts

Some cases include `hechos` (facts): verifiable data that doesn't depend on the
patch (or that states which patch it belongs to). The judge marks each one as
correct, wrong or not mentioned. It is a more stable accuracy measure than the
1-5 score.

## Per-case result

- Difference = substance(main) − substance(rival), averaged over all judgments of the pair.
- **Tie** if |difference| < max(0.25, standard deviation across the pair's judgments),
  or if the winner flips when the A/B order is reversed.

## Success criterion for the harness

The harness is **superior** to a variant if:

1. the 95 % confidence interval (bootstrap over cases) of the mean substance
   difference is above 0, and
2. on each constraint it is not below the rival by more than 0.25.

The report also gives the sign test on wins and losses, consistency when the order
is reversed, and the measured judge noise. Categories with fewer than 4 cases are
shown as a warning, not as a condition.

## Known limits

- If the judge is the same model that answers, it may prefer its own style and share
  its knowledge gaps. Use `--judge-model` with another model when you can.
- With about 25 cases and 2 judgments per pair, only substance differences of about
  0.4 or more are detectable. Smaller differences are noise.
- The cases were written by the auditor and translated from Spanish. Alei should add
  some of their own.
