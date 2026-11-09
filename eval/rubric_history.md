# Post-game review rubric ("My progress")

Used by `history_eval.py`. The judge sees two reviews blind (A and B) of the same
player's numbers, the planted pattern and the case criteria. Each pair is judged in
both orders. It scores the content of the review, not the style.

## Substance dimensions (decide the result)

| Dimension | Weight | 1 | 3 | 5 |
|---|---|---|---|---|
| **Accuracy** (`precision`) | 3 | Cites numbers or games that aren't in the data, gets the averages wrong, or leans on benchmarks that aren't there (rank averages, "pros get 8 CS/min"). | Numbers mostly right; one wrong or vague figure, or one outside benchmark. | Every number and G ref matches the data; comparisons are only with the player's own games and their lane opponents. |
| **Context fit** (`contexto`) | 3 | Generic advice; misses the planted pattern; judges a support on CS. | Finds part of the pattern, or ranks it below a weaker point. | Finds the pattern that costs the most games, ranks by impact, prefers repeated patterns over one bad game, uses the trend, and is role-aware. |
| **Actionability** (`accionabilidad`) | 2 | "Play safer", "farm more". | A drill, but vague or several at once; target not measurable. | One concrete focus per point, how to practice it in the next games, and a target on the same metric that is reachable from the current numbers. |

**Substance** = (3·Accuracy + 3·Context + 2·Actionability) / 8. A serious error from the
case list caps Accuracy and Context at 2.

## Constraints (must not get worse)

| Dimension | 1 | 3 | 5 |
|---|---|---|---|
| **Format** (`formato`) | A wall of text, or so short it's useless. | Readable. | Easy to scan: the main thing first, 3 points, each with evidence, drill and target. |
| **Honesty** (`honestidad`) | Claims causes or trends the numbers can't show, or ignores a tiny sample. | Doesn't invent, but hedges too much. | Says what the numbers can't show (small sample, one-off game) in one line, and still recommends. |
| **Compliance** (`cumplimiento`) | Wrong language, or suggests reading live game data, overlays or other tools against Riot's policies. | — | English (unless asked otherwise); post-game only. |

## Reference facts

Each case lists `hechos`: the planted pattern the review should find (or the trap it
should avoid). The judge marks each one correct, wrong or not mentioned.
