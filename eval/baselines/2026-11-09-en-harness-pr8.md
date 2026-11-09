# Evaluación del coach: `harness` contra `baseline`

## Ejecución

- fecha: `2026-11-09T08:43:29`
- git_sha: `a5ea2ac`
- prompt_sha256: `fb6112e4e900`
- cli_version: `2.1.319 (Claude Code)`
- modelo: `claude-sonnet-5-5`
- modelo_juez: `claude-opus-5-5`
- parche: `26.22`
- seed: `7`
- juicios_por_par: `2`

## `harness` contra `baseline`

- Casos válidos: 26 (juicios fallidos o casos con error: 0)
- Fondo (precisión, contexto, accionabilidad): **3.87** contra **3.49**; diferencia media 0.38, IC 95 % bootstrap [0.10, 0.64]
- Victorias / derrotas / empates: 15 / 5 / 6; test de signos p = 0.021
- Consistencia al invertir el orden A/B: 88 %; ruido del juez (desv. típica media de la diferencia): 0.32
- Restricciones (no peor que el rival por más de 0,25): formato +0.08, honestidad +0.35, cumplimiento -0.06
- Veredicto: **superior** (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)

### Por dimensión

| Dimensión | harness | baseline |
|---|---|---|
| precision | 3.52 | 3.35 |
| contexto | 3.79 | 3.56 |
| accionabilidad | 4.50 | 3.60 |
| formato | 3.83 | 3.75 |
| honestidad | 4.15 | 3.81 |
| cumplimiento | 4.85 | 4.90 |

### Hechos de referencia

| | harness | baseline |
|---|---|---|
| acertados % | 73 | 77 |
| fallados % | 8 | 3 |

### Por categoría

| Categoría | casos | harness | baseline | aviso |
|---|---|---|---|---|
| build_situacional | 6 | 3.78 | 3.44 |  |
| honestidad | 4 | 3.91 | 3.41 |  |
| idioma | 1 | 2.50 | 2.62 | pocos casos |
| matchup | 5 | 4.04 | 3.45 |  |
| momento_partida | 5 | 3.94 | 3.92 |  |
| tutorial | 5 | 3.96 | 3.39 |  |

### Casos

| Caso | Categoría | harness | baseline | diferencia ± juez | Resultado |
|---|---|---|---|---|---|
| build-01-vs-ap-burst | build_situacional | 4.25 | 3.81 | 0.44 ± 0.27 | gana harness |
| build-02-antiheal | build_situacional | 3.56 | 3.62 | -0.06 ± 0.44 | empate (cambia con el orden) |
| build-03-tanky-enemy | build_situacional | 3.56 | 4.00 | -0.44 ± 0.44 | empate |
| build-04-player-profile | build_situacional | 2.62 | 2.25 | 0.38 ± 0.18 | gana harness |
| matchup-01-top | matchup | 4.25 | 3.31 | 0.94 ± 0.44 | gana harness |
| matchup-02-mid | matchup | 4.25 | 2.94 | 1.31 ± 0.09 | gana harness |
| matchup-03-jungle | matchup | 3.62 | 3.62 | 0.00 ± 0.00 | empate |
| ingame-01-behind | momento_partida | 4.25 | 4.62 | -0.38 ± 0.00 | gana baseline |
| ingame-02-objective | momento_partida | 3.75 | 4.00 | -0.25 ± 0.71 | empate (cambia con el orden) |
| ingame-03-teamfight | momento_partida | 4.81 | 4.19 | 0.62 ± 0.00 | gana harness |
| macro-01-wave | tutorial | 4.12 | 3.56 | 0.56 ± 0.09 | gana harness |
| trap-01-fake-item | honestidad | 3.94 | 2.94 | 1.00 ± 0.71 | gana harness |
| trap-02-live-data | honestidad | 4.06 | 2.94 | 1.12 ± 1.24 | empate |
| build-05-vs-assassins | build_situacional | 4.44 | 3.75 | 0.69 ± 0.44 | gana harness |
| build-06-full-ad | build_situacional | 4.25 | 3.19 | 1.06 ± 0.27 | gana harness |
| matchup-04-bot | matchup | 3.81 | 4.19 | -0.38 ± 0.00 | gana baseline |
| matchup-05-teemo | matchup | 4.25 | 3.19 | 1.06 ± 0.27 | gana harness |
| ingame-04-soul | momento_partida | 2.88 | 4.19 | -1.31 ± 0.27 | gana baseline |
| ingame-05-position | momento_partida | 4.00 | 2.62 | 1.38 ± 0.53 | gana harness |
| macro-02-slowpush | tutorial | 4.12 | 3.00 | 1.12 ± 0.18 | gana harness |
| macro-03-wards | tutorial | 3.62 | 4.12 | -0.50 ± 0.18 | gana baseline |
| macro-04-after-kill | tutorial | 4.31 | 3.38 | 0.94 ± 0.44 | gana harness |
| macro-05-lasthit | tutorial | 3.62 | 2.88 | 0.75 ± 0.00 | gana harness |
| trap-03-exact-winrate | honestidad | 3.81 | 3.38 | 0.44 ± 0.27 | gana harness |
| trap-04-fake-ability | honestidad | 3.81 | 4.38 | -0.56 ± 0.27 | gana baseline |
| lang-01-spanish-requested | idioma | 2.50 | 2.62 | -0.12 ± 0.53 | empate (cambia con el orden) |

## Veredictos del juez (orden A = variante principal)

- **build-01-vs-ap-burst** (harness contra baseline): B adapts more fully to the magic-burst and CC comp: it puts Maw earlier and offers Mercury's and Mercurial against the CC. A is more accurate and more current on Jinx's core build and gives more concrete teamfight advice. The substance comes out roughly even, with A slightly ahead on accuracy and B ahead on context.
  - Datos señalados: B: 'Take flat Health over the second adaptive shard' is wrong because flat Health isn't an option in the second shard row (it offers Adaptive, Move Speed and Health Scaling); B: Kraken Slayer as Jinx's first item isn't wrong but looks off-meta; current sources (patches 26.16-26.20) show Hexoptics C44 as the standard first item; B: Cull as a starter is not verified for 26.22 (last seen changed in 26.9); B: the Cut Down justification ('Ornn-sized tanks on your side') makes no sense, since allied tanks don't affect Cut Down; A: Hexoptics C44 as Jinx's core first item was verified for patches 26.16-26.20 but not for 26.22 itself; A: the claim that sources list 'patch 26.17 to 26.19' is confusing noise and not verified
- **build-02-antiheal** (harness contra baseline): Both correctly name Executioner's Calling and Chempunk Chainsword and say when to buy them, and neither mentions where Aatrox's healing comes from. A is more decisive and easier to act on but slows Darius's spike by rushing Chempunk. B protects the power curve and handles more scenarios but delays anti-heal against Aatrox and invents a component, so they come out roughly even, with A slightly ahead on actionability.
  - Datos señalados: B: Chempunk Chainsword recipe described as 'Executioner's Calling + Bone Chiming-style stats': no such component exists, invented; B: Chempunk Chainsword cost of roughly 2,800g: not verified for patch 26.22; A and B: Executioner's Calling cost of 800g: not verified for patch 26.22; A: Legend: Alacrity as Darius's rune choice: not verified as standard for patch 26.22; A: Plated Steelcaps justified because Warwick is AD: partly misleading, since a large share of Warwick's damage (Q) is magic
- **build-03-tanky-enemy** (harness contra baseline): Both give a similar anti-tank plan with a concrete order at 18 minutes. B wins on accuracy because A makes a factual error about Kraken Slayer and contradicts itself on crit. A uses Vayne's W more explicitly to pick targets.
  - Datos señalados: Kraken Slayer dealing true damage on every third hit is wrong (Answer A); 'Stop building crit' while recommending Lord Dominik's Regards is self-contradictory (Answer A); That Terminus, Mercurial Scimitar, Lord Dominik's and Kraken Slayer are all in the shop on patch 26.22 is not verified (Answer B; Answer A for the last two); Terminus giving both armor and magic penetration is not verified for patch 26.22 (Answer B)
- **build-04-player-profile** (harness contra baseline): Both answers name a removed support starting item, but A's core build is still valid (Locket first, a complete rune page) and its engage steps are concrete and clear for a Silver player. B's first item doesn't exist and its secondary-tree and item advice is vague, so A wins clearly.
  - Datos señalados: Relic Shield as the starting support item: removed in 2024, replaced by World Atlas (A and B); Bulwark of the Mountain as the first completed item: removed with the Relic Shield line (B); Patch 26.22 Thresh nerf (AD 56 to 54, lower ultimate damage): verified as correct (A); Font of Life described as healing 'you' when you or your ADC hit the target: it actually heals the allies who attack the marked enemy (A, minor)
- **matchup-01-top** (harness contra baseline): A is the stronger answer. It is more concrete and more accurate, with a full setup, a trade sequence for level 3, a back timing and a jungler warning. B has good wave and Vitals advice but recommends an item that no longer exists and describes Counter Strike imprecisely.
  - Datos señalados: B: Divine Sunderer was removed from the game (replaced by Sundered Sky in the 2024 preseason item changes); B: says Counter Strike (E) reduces Fiora's auto damage; it actually dodges basic attacks (only area damage is reduced); A: says to back at about 1100 gold and buy Phage plus Plated Steelcaps, which together cost more than that; A: skill order W max then E (not verified for patch 26.22); A: rune page Grasp/Shield Bash/Bone Plating/Overgrowth plus Alacrity/Last Stand (not verified for patch 26.22); Both: neither says that if Riposte blocks Jax's E stun, Jax gets stunned
- **matchup-02-mid** (harness contra baseline): A wins on substance: its runes are valid and its Zhonya's timing for Zed's mark is concrete and correct. B suggests a rune page that can't be built and hedges on the key interaction. Neither answer clearly explains when Ahri is stronger than Zed in lane.
  - Datos señalados: B: Bone Plating + Second Wind together is impossible, because both are in the same Resolve row; B: Eyeball Collection appears to have been removed from Domination (replaced by Grisly Mementos); not verified for patch 26.22; B: lists Lost Chapter as an early armor buy, but it has no armor; A: 'Luden's Echo' looks like an outdated name (renamed Luden's Companion); not verified for patch 26.22; A: cites Lolalytics pages from patches 15.3/15.5, which don't apply to patch 26.22
- **matchup-03-jungle** (harness contra baseline): Both give the same safe full-clear path and correctly avoid fighting Lee early. B is a bit tighter and gets the Q isolation fact right, with practical tracking timings, but it has a level-4 evolution error. A makes a clearer level-6/item power-spike claim and suggests concrete items, but it misstates Q as an escape tool and is padded with stale stats, so overall the two are close to a tie with a slight edge to B.
  - Datos señalados: A: 'leap away with Q or E': Kha'Zix's Q (Taste Their Fear) is a targeted damage ability, not a leap; only E is mobility; A: 'invisibility and a double jump' after level 6 mixes up R (invisibility) with the evolved E reset; level 6 gives no double jump by default; B: 'hit level 4 on time with your evolution plan': Kha'Zix's evolutions come from R ranks (6/11/16), not level 4; A: Lolalytics 51.35% and Metasrc 26.11 48.35% Kha'Zix vs Lee win rates: not verified, and from old patches by A's own admission; A: Mobalytics rune page (Dark Harvest, Sudden Impact, Grisly Mementos, Treasure Hunter) and items Edge of Night → Serylda's Grudge → Guardian Angel: not verified for patch 26.22
- **ingame-01-behind** (harness contra baseline): Both answers recommend the same correct, affordable purchase and give similar lane advice. B is slightly better: it fits the case more closely (explicit AD reasoning, why not Lost Chapter, boots chosen by enemy comp) and stays shorter for a mid-game question.
  - Datos señalados: Seeker's Armguard costing about 1000g in patch 26.22 (A and B): not verified; Lost Chapter costing 1300g in patch 26.22 (B): not verified; Zhonya's finishing from Seeker's Armguard plus Needlessly Large Rod, with any extra combine cost (B): not verified for patch 26.22
- **ingame-02-objective** (harness contra baseline): Both answers decide clearly and reason correctly from the ADC's respawn timer and the gold deficit. A wins slightly on actionability because it gives a concrete alternative for the window, and B wins slightly on context by covering the enemy jungler, TP and Smite. The difference is within noise, so this is effectively a tie.
  - Datos señalados: Both answers: a death timer of about 30-40s at minute 24 is plausible for levels 13-15, but the exact value is not verified for patch 26.22; Neither answer: the premise says Baron spawns at about 24:40, but it normally spawns at 20:00 in recent patches; neither answer points out the mismatch (not verified for 26.22)
- **ingame-03-teamfight** (harness contra baseline): Both pick the right priority (Jinx, ideally with Lux/Nami in the same ult) and correctly reject Darius/Viego. A wins slightly on accuracy and actionability with its Flash-ult threshold and engage/disengage cases, while B has small mechanical mistakes about the ult's shape and casting through CC.
  - Datos señalados: B: describes Malphite's R as a 'cone'; it's a circular AoE knock-up where Malphite lands, not a cone; B: 'you can use it through Lux's snare or Nami's bubble' is misleading; the dash is unstoppable once cast, but Malphite can't start R while rooted or airborne (B's next sentence partly corrects this)
- **macro-01-wave** (harness contra baseline): Both are correct and neither confuses freezing with slow pushing. A wins because it is more actionable: it gives the explicit 3-4 minion target and clear steps for adjusting the wave.
  - Datos señalados: A: 'minions only move forward when they have something to fight' is an oversimplification, not strictly wrong; B: 'don't freeze when the enemy has way more minions' is loosely stated, since a freeze needs the enemy wave to be bigger (it only breaks when the wave is so big it crashes into your tower)
- **trap-02-live-data** (harness contra baseline): A is the better answer for a player: decisive, fully policy-safe and immediately actionable, with one factual slip about the scoreboard. B is mostly accurate but aims at the developer instead of the player, and it sends the user toward third-party overlays whose policy status it admits it can't confirm.
  - Datos señalados: A: the in-game scoreboard does not show whether enemy summoner spells are on cooldown; it only shows which spells they have (wrong); A: '~4:30 with one source' is loose; Cosmic Insight (18 haste) gives about 4:14 and Ionian Boots (10 haste) about 4:33, and A flagged these as unverified (approximate); B: Blitz, Porofessor and Mobalytics manual summoner-timer features being currently allowed under Riot policy (not verified; Riot made overlays remove enemy ultimate timers in 2025, and the search found no clear ruling on manual summoner timers); B: the Live Client Data API does not expose enemy summoner spell cooldowns (likely correct, not verified for 26.22)
- **build-05-vs-assassins** (harness contra baseline): Both give the same core advice: armor boots, a Seeker's Armguard rush and Zhonya's. A wins because it gets the key Zed counterplay right (stasis before Death Mark pops), while B gets that timing backwards, a real mechanical mistake for the most dangerous of the three threats.
  - Datos señalados: B: 'use Zhonya's after the mark pops' is wrong. You should go into stasis just before Death Mark detonates so the damage is negated.; A: the cost of Plated Steelcaps is given as '~900g'. It has been about 1100-1200g in recent seasons. Not verified for 26.22.; A: says to buy the support item on the first back. Lux usually buys it at game start. Minor error.; B: 'Cloth Armor + Stopwatch' as a first-back option assumes Stopwatch can be bought in the shop. Not verified for 26.22.; A/B: Seeker's Armguard as a Zhonya's component at about 1000g. Not verified for 26.22.
- **build-06-full-ad** (harness contra baseline): A wins: it gives a valid rune page and a concrete, matchup-justified item order. B has the right defensive idea but makes rune and shard errors and leaves too much up to the player.
  - Datos señalados: B: Bone Plating and Conditioning are in the same Resolve row, so the primary page as written can't be selected; B: an 'armor' stat shard no longer exists in the current shard system (armor and MR shards were removed in 2024); A: Q>W>E skill order is debatable for Sett, but not counted as an error (not verified); A: the cited u.gg/Mobalytics/Lolalytics snapshots (Patch 26.11, 14.24, 16.9, 16.21) were not verified and aren't for patch 26.22
- **matchup-04-bot** (harness contra baseline): Both answers give safe plans for levels 1-3 that respect Thresh's hook, and neither recommends extended trades. B fits the matchup better because it uses the range gap and the trap to punish Draven's axe-catching, while A is more defensive and more generic but handles uncertainty more honestly.
  - Datos señalados: A: Lethal Tempo as Caitlyn's rune for patch 26.22 is not verified (A itself says its source is patch 26.20 with a small sample); B: 'Draven's axe stacks' is imprecise; the passive stacks are Adoration, and axes are tracked through Spinning Axe; A: mentioning Thresh's lantern as something that wrecks your all-in is a vague but plausible point (it can save Draven), not a wrong fact
- **ingame-04-soul** (harness contra baseline): B is better: it explains why the Soul is valuable, gets the Soul and Elder sequence right, and sets clear conditions for fighting or not. A is shorter and clear, but it gets the fallback wrong and never explains the Soul's value.
  - Datos señalados: A: says that after giving up this dragon the enemy's Soul is 'only one more dragon away' and that you can fight for the next one. Taking this dragon gives them Soul, and the next dragon is Elder.
- **ingame-05-position** (harness contra baseline): A wins: it puts the decision in the first line, its anti-Zed sequence is more precise, and it gives one conditional item instead of vague categories. B covers similar positioning ideas but is longer, less actionable on the build, and has a confused Q-form tip.
  - Datos señalados: B: 'Fight with minigun passive stacks when he's out of range, and swap to rockets' gets the forms backwards; Fishbones (rockets) is the long-range form for when the enemy is out of minigun range; A: Guardian Angel being in the shop with its current stats on 26.22 is not verified
- **macro-02-slowpush** (harness contra baseline): Both define slow pushing correctly and neither confuses it with freezing. A wins: its steps are more concrete and useful for a beginner, and it has fewer doubtful claims, while B is vaguer and adds a few misleading points.
  - Datos señalados: B: listing 'set up a level 2 or level 6 advantage' as a slow-push use is a misfit; level spikes come from fast pushes or wave timing, not from slow-pushing.; B: saying the crashed wave 'costs them gold' is misleading; the enemy can still last-hit under tower and mainly loses some minions to tower shots and time.; B: 'A big wave coming to you means you're taking damage' mixes up the direction; a slow push sends the wave toward the enemy.; A: 'An enemy under their tower can't escape your jungler' and 'farming safely isn't possible' are both overstated; tower dives carry risk, and farming under tower is harder but still possible.
- **macro-03-wards** (harness contra baseline): B is more accurate: it states and explains the one-ward limit that A leaves unmentioned and doubts, and it gives a clearer routine for when to buy and where to place. A is solid but weaker on accuracy and too cautious.
  - Datos señalados: A: 'trinket-slot-free ward' is confusing; a Control Ward sits in a regular item slot (minor); A: 'usually put down 2 to 4 per game' is far too low for a support (minor, bad advice); A: says the price and the active cap may have changed; this is unnecessary doubt, since the cap is 1 per player; B: 'If you see an enemy Control Ward, sweep it' is wrong, because Control Wards are always visible and you just attack them (minor); B: 'Always carry one' and 'an unplaced Control Ward in your inventory is wasted' sit awkwardly together, though the intent is clear (minor)
- **macro-04-after-kill** (harness contra baseline): A wins. It ranks its options and ties each one to a condition the player can check (wave state, HP or gold, jungler position), and it covers pushing, recalling and invading with vision. B stays general, talks about objectives the player said don't exist, and hedges more.
  - Datos señalados: B: 'take the tower on the nearest lane where their laner is missing' is vague and could push a mid laner to leave their own wave and go hit another lane's tower. It's not a factual error, just weak advice.
- **macro-05-lasthit** (harness contra baseline): A is more accurate: it gives correct per-minion gold values and a reasonable CS-lead conversion, and it says what it couldn't verify. B states the key rule more clearly but contains a large error in its gold math and a false claim that gold per CS is fixed, so A wins on substance.
  - Datos señalados: A: 'last-hit key (default X)'. As far as I know, LoL has no default last-hit keybind (not verified); A: suggests that only the last hitter gets the 'full' gold, as if others got part of it. In fact nobody else gets that minion's gold; B: '1 CS/min difference is about 600 gold over 10 minutes'. That is wrong: 10 CS is roughly 170-250 gold; B: 'the gold per CS stays the same all game'. That is wrong: cannon minion gold goes up over time
- **trap-03-exact-winrate** (harness contra baseline): Neither answer makes the serious error: A only gives numbers with a source and a caveat about the patch, and B gives none. A wins on actionability and context because it shows what the sources say and exactly how to filter for the real figure, while B is honest but vague and leaks internal harness detail.
  - Datos señalados: A: Metabot figures of 52.2% overall and 49.7% Diamond labeled patch 26.13 (not verified; A itself says the patch is stale); A: LoLalytics snippet labeled patch 16.21 with a 52.03% Diamond+ average across all champions (not verified; the 16.x label looks like a stale or mismatched patch number); A: LoLalytics leaderboard showing 55.71% for the top 470 Yone players (not verified); A: lolstats.gg showing 51% in Diamond with no patch, from a bot-role page, which is an unusual role for Yone (not verified)
- **trap-04-fake-ability** (harness contra baseline): Both handle the made-up ability correctly and neither invents a description. B wins narrowly because it is accurate and concise and ends with a useful clarifying question. A buries the correct answer under unverified patch figures that it tells the player not to rely on.
  - Datos señalados: A: Patch 26.5 Garen Q movement speed duration values (1.4/1.95/2.5/3.05/3.6s) and +2% total AD on E: not verified; A: Patch 25.11 W cooldown reduced and R damage decreased, plus the claim that W loses the 10% bonus resistances: not verified; A: Perseverance cooldown change from 7 to 8 seconds: not verified (A flags this itself); A: 'no full Garen rework in 2026': not verified
- **lang-01-spanish-requested** (harness contra baseline): A's matchup content is a bit stronger and more decisive, with an early Zhonya's and a clear item order, but answering in English after an explicit Spanish request is a serious error that caps its accuracy and context. B complies with the language request and gives sound, if more hedged, advice, so B wins.
  - Datos señalados: Eyeball Collection (A and B): reportedly replaced by Grisly Mementos in Season 2025; not verified for patch 26.22; Relentless Hunter (B): still present after its 14.10 nerf, but its presence in patch 26.22 is not verified; Taste of Blood and Ultimate Hunter (A): not verified for patch 26.22; u.gg stats cited by A (patch 26.7 50.47% WR; 46.6% Fizz WR over 161 games; patch 15.17 Phase Rush page): not verified, and not the current patch 26.22; Seeker's Armguard as a first-back component (B): plausible, but not verified for patch 26.22

## Coste y herramientas

| Variante | Coste USD | Llamadas a herramientas | Errores |
|---|---|---|---|
| harness | 1.02 | 21 | 0 |
| baseline | 0.46 | 0 | 0 |
| juez | 4.03 | — | — |

## Casos omitidos

- shot-01-shop: caso con pantallazo; usa --with-images
- shot-02-minimap: caso con pantallazo; usa --with-images
- shot-03-scoreboard: caso con pantallazo; usa --with-images
- shot-04-champ-select: caso con pantallazo; usa --with-images
