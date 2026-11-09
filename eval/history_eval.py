#!/usr/bin/env python3
"""Evaluates the post-game review ("My progress", `src-tauri/src/history.rs`) against the
plain model given the same numbers.

There's no Riot key in CI, so the players are synthetic: each case generates 20 (or fewer)
games with one or two planted patterns (early solo deaths, CS deficit, thrown leads, low
control wards on a support...), and the judge knows what was planted.

Variants:
  harness   like the app: coach system prompt (prompts.rs, English) + `review_prompt`
            (rules, summary, per-game lines, JSON shape) + web search tool; JSON answer
            parsed like `parse_report`, with one correction round, then rendered as text.
  baseline  the same model, no system prompt, no tools, asked in plain words for the 3
            things to work on with drills, given the SAME numbers (summary + per-game lines).

Usage:
  python3 eval/history_eval.py --judge-model claude-opus-5-5
  python3 eval/history_eval.py --only hist-03-adc-thrown-leads --print-prompt
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_eval as R  # noqa: E402

ROOT = R.ROOT
THROWN_LEAD_GOLD = 1500

# ---------------------------------------------------------------- port of history.rs


def num(x) -> str:
    """Rust `Display` for f32: 25.0 -> "25", 0.62 -> "0.62"."""
    if isinstance(x, bool):
        return str(x).lower()
    if isinstance(x, float):
        return str(int(x)) if x.is_integer() else repr(round(x, 4))
    return str(x)


def opt(x) -> str:
    return "n/a" if x is None else num(x)


def signed(x) -> str:
    return "n/a" if x is None else f"{x:+d}"


def threw_lead(g) -> bool:
    return not g["win"] and g["team_gold_diff_15"] is not None and g["team_gold_diff_15"] >= THROWN_LEAD_GOLD


def _mean(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 2) if xs else None


def averages(games):
    m = lambda f: _mean([f(g) for g in games])  # noqa: E731
    return {
        "games": len(games),
        "win_rate": m(lambda g: 1.0 if g["win"] else 0.0),
        "cs_per_min": m(lambda g: g["cs_per_min"]),
        "cs_at_10": m(lambda g: g["cs_at_10"]),
        "cs_diff_10": m(lambda g: g["cs_diff_10"]),
        "gold_diff_15": m(lambda g: g["gold_diff_15"]),
        "kill_participation": m(lambda g: g["kill_participation"]),
        "deaths": m(lambda g: float(g["deaths"])),
        "early_deaths": m(lambda g: g["early_deaths"]),
        "solo_deaths": m(lambda g: g["solo_deaths"]),
        "vision_per_min": m(lambda g: g["vision_per_min"]),
        "control_wards": m(lambda g: float(g["control_wards"])),
        "damage_share": m(lambda g: g["damage_share"]),
        "first_item_min": m(lambda g: g["first_item_min"]),
    }


def counts(games, key):
    out = []
    for g in games:
        k = g[key]
        if not k:
            continue
        c = next((c for c in out if c["name"] == k), None)
        if c:
            c["games"] += 1
            c["wins"] += int(g["win"])
        else:
            out.append({"name": k, "games": 1, "wins": int(g["win"])})
    out.sort(key=lambda c: -c["games"])  # stable, like Rust sort_by_key
    return out


def summarize(games):
    split = min(len(games), 5)
    with_opp = [g["cs_diff_10"] for g in games if g["cs_diff_10"] is not None]
    return {
        "all": averages(games),
        "recent": averages(games[:split]),
        "earlier": averages(games[split:]),
        "roles": counts(games, "role"),
        "champions": counts(games, "champion")[:5],
        "behind_at_10": (sum(1 for d in with_opp if d < 0), len(with_opp)),
        "thrown_leads": [f"G{i + 1}" for i, g in enumerate(games) if threw_lead(g)],
    }


QUEUES = {420: "Ranked Solo/Duo", 440: "Ranked Flex", 400: "Normal Draft", 430: "Normal Blind", 480: "Swiftplay", 490: "Quickplay"}


def averages_line(a) -> str:
    return (
        f"games {a['games']}, win rate {opt(a['win_rate'])}, CS/min {opt(a['cs_per_min'])}, CS@10 {opt(a['cs_at_10'])}, "
        f"CS diff@10 vs lane opponent {opt(a['cs_diff_10'])}, gold diff@15 vs lane opponent {opt(a['gold_diff_15'])}, "
        f"kill participation {opt(a['kill_participation'])}, deaths {opt(a['deaths'])}, deaths before 14:00 {opt(a['early_deaths'])}, "
        f"solo deaths {opt(a['solo_deaths'])}, vision score/min {opt(a['vision_per_min'])}, "
        f"control wards bought {opt(a['control_wards'])}, team damage share {opt(a['damage_share'])}, "
        f"first legendary item at minute {opt(a['first_item_min'])}"
    )


FIX = False  # --fix: proposed prompt changes (wins vs losses split, no CS for supports)


def data_block(games, fix: bool | None = None) -> str:
    """Everything after the rules in `review_prompt`: summary and per-game lines."""
    fix = FIX if fix is None else fix
    s = summarize(games)
    p = f"\nAverages over all games: {averages_line(s['all'])}\n"
    if fix:
        wins = [g for g in games if g["win"]]
        losses = [g for g in games if not g["win"]]
        if wins and losses:
            p += f"In wins: {averages_line(averages(wins))}\n"
            p += f"In losses: {averages_line(averages(losses))}\n"
    if s["earlier"]["games"] > 0:
        p += f"Last {s['recent']['games']} games: {averages_line(s['recent'])}\n"
        p += f"Games before those: {averages_line(s['earlier'])}\n"
    lst = lambda cs: ", ".join(f"{c['name']} ({c['games']} games, {c['wins']} wins)" for c in cs)  # noqa: E731
    p += f"Roles: {lst(s['roles'])}\n"
    p += f"Most played champions: {lst(s['champions'])}\n"
    if fix:
        laners = [g["cs_diff_10"] for g in games if g["role"] != "UTILITY" and g["cs_diff_10"] is not None]
        if laners:
            p += f"Behind the lane opponent in CS at 10: {sum(1 for d in laners if d < 0)} of {len(laners)} games (support games not counted)\n"
    else:
        p += f"Behind the lane opponent in CS at 10: {s['behind_at_10'][0]} of {s['behind_at_10'][1]} games\n"
    if s["thrown_leads"]:
        p += f"Lost after the team led by {THROWN_LEAD_GOLD}+ gold at 15:00: {', '.join(s['thrown_leads'])}\n"
    p += "\nGames:\n"
    for i, g in enumerate(games):
        deaths = ", ".join(num(m) for m in g["death_minutes"])
        fi = None if g["first_item_min"] is None else f"min {num(g['first_item_min'])}"
        cs = f"CS/min {num(g['cs_per_min'])} | CS@10 {opt(g['cs_at_10'])} (diff {signed(g['cs_diff_10'])})"
        if fix and g["role"] == "UTILITY":
            cs = "CS not judged (support)"
        p += (
            f"G{i + 1} | {QUEUES.get(g['queue_id'], 'Other')} | {g['champion']} {g['role'] or '?'} vs {g['opponent'] or '?'} | "
            f"{'Win' if g['win'] else 'Loss'} | {num(g['minutes'])} min | KDA {g['kills']}/{g['deaths']}/{g['assists']} | "
            f"KP {num(g['kill_participation'])} | {cs} | "
            f"gold diff@15 {signed(g['gold_diff_15'])} | team gold diff@15 {signed(g['team_gold_diff_15'])} | "
            f"deaths at minute [{deaths}], before 14:00 {opt(g['early_deaths'])}, solo {opt(g['solo_deaths'])} | "
            f"vision/min {num(g['vision_per_min'])}, wards placed {g['wards_placed']}, wards killed {g['wards_killed']}, "
            f"control wards {g['control_wards']} | damage share {num(g['damage_share'])} | first legendary item {opt(fi)}\n"
        )
    return p


RULES = (
    "\nFind the 3 pain points that would most improve this player's results, ordered by impact.\n"
    "Rules:\n"
    "- Use only the numbers below. Don't search the web.\n"
    "- Don't compare with rank averages, pro players or benchmarks you don't have here. Compare only with "
    "the player's own games (their trend, their best and worst games) and with their lane opponents in "
    'these games (the "diff" numbers).\n'
    "- Prefer patterns that repeat across several games over a single bad game.\n"
    "- Each pain point must cite the exact numbers and the games (G refs) that show it.\n"
    "- The drill is something concrete to practice in the next games (one focus, how to do it). "
    "The target uses the same metric, is measurable, and is reachable from their current numbers.\n"
    "- Consider the role and champions: a support isn't judged on CS, a jungler's CS diff is against the "
    "enemy jungler.\n"
    "- Also name one real strength, with its numbers.\n"
)

SHAPE = (
    "\nReply with ONLY a JSON object, no text before or after, in this shape:\n"
    '{"headline": "one sentence: the main thing to fix",\n '
    '"strength": "one real strength, with its numbers",\n '
    '"pain_points": [{"title": "short name", "metric": "the metric it\'s measured by", '
    '"evidence": "the numbers and games that show it", "why": "why it costs games", '
    '"drill": "what to practice in the next games", "target": "measurable goal", '
    '"games": ["G1", "G4"]}]}\n'
    "Exactly 3 pain points. Keys in English; the text values in the answer language."
)


def review_prompt(riot_id: str, games) -> str:
    p = (
        f"Post-game review. These are the last {len(games)} finished Summoner's Rift games of the player {riot_id}, "
        "computed by the app from Riot's official match data (Match-V5). G1 is the most recent game.\n"
    )
    return p + RULES + data_block(games) + SHAPE


def baseline_prompt(games) -> str:
    return (
        f"These are the numbers of my last {len(games)} League of Legends games (Summoner's Rift, G1 is the most "
        "recent), from Riot's match data. What are the 3 things I should work on to win more, and how do I "
        "practice them?\n" + data_block(games, fix=False)
    )


def parse_report(text: str, games):
    obj = R.parse_json(text)
    if not obj:
        return None, "no JSON object in the answer"
    pts, bad_refs, n_refs = [], 0, 0
    for p in obj.get("pain_points") or []:
        if not isinstance(p, dict) or not str(p.get("title", "")).strip() or not str(p.get("drill", "")).strip():
            continue
        refs = []
        for r in p.get("games") or []:
            n_refs += 1
            m = re.fullmatch(r"[Gg](\d+)", str(r).strip())
            if m and 1 <= int(m.group(1)) <= len(games):
                if r not in refs:
                    refs.append(str(r).strip().upper())
            else:
                bad_refs += 1
        pts.append({k: str(p.get(k, "")).strip() for k in ("title", "metric", "evidence", "why", "drill", "target")} | {"games": refs})
        if len(pts) == 3:
            break
    if not pts:
        return None, "the answer has no pain points"
    return {
        "headline": str(obj.get("headline", "")).strip(),
        "strength": str(obj.get("strength", "")).strip(),
        "pain_points": pts,
        "n_points_raw": len(obj.get("pain_points") or []),
        "bad_refs": bad_refs,
        "n_refs": n_refs,
    }, None


def render_report(rep) -> str:
    """Text the judge sees, in the order the Progress screen shows it."""
    out = [rep["headline"], "", f"Keep doing: {rep['strength']}", ""]
    for i, p in enumerate(rep["pain_points"], 1):
        out += [
            f"{i}. {p['title']} ({p['metric']})",
            f"   Evidence: {p['evidence']}",
            f"   Why it costs games: {p['why']}",
            f"   Drill: {p['drill']}",
            f"   Target: {p['target']}",
            f"   Games: {', '.join(p['games'])}",
            "",
        ]
    return "\n".join(out).strip()


# ---------------------------------------------------------------- synthetic players

BASE = {
    #           cs/min cs@10 vis  wards cw  dmg   kp    item
    "TOP":     (7.0, 70, 0.62, 9, 1, 0.25, 0.45, 14.5),
    "JUNGLE":  (5.9, 56, 0.95, 10, 2, 0.20, 0.62, 13.5),
    "MIDDLE":  (7.6, 76, 0.70, 9, 1, 0.28, 0.55, 14.0),
    "BOTTOM":  (8.1, 79, 0.55, 8, 1, 0.30, 0.56, 13.5),
    "UTILITY": (1.2, 12, 2.30, 32, 4, 0.12, 0.66, 16.0),
}
OPP = {
    "TOP": ["Darius", "Garen", "Sett", "Camille", "Fiora", "Malphite", "Ornn", "Jax"],
    "JUNGLE": ["Lee Sin", "Viego", "Kha'Zix", "Graves", "Vi", "Amumu", "Hecarim"],
    "MIDDLE": ["Ahri", "Syndra", "Yone", "Zed", "Orianna", "Viktor", "Sylas"],
    "BOTTOM": ["Jinx", "Kai'Sa", "Ezreal", "Caitlyn", "Jhin", "Miss Fortune"],
    "UTILITY": ["Thresh", "Nautilus", "Lulu", "Leona", "Karma", "Rakan"],
}


def make_game(rng, i, role, champ, *, win=None, cs_diff=0.0, gold=0.0, team_gold=0.0, deaths=5.0, early=None,
              solo_frac=0.3, late_deaths=False, kp=None, item=None, cs_mult=1.0, vis=None, cw=None, dmg=None):
    cpm, cs10, v, wards, cwb, ds, kpb, it = BASE[role]
    minutes = round(rng.uniform(24, 36), 1)
    tg = round(rng.gauss(team_gold, 1500))
    if win is None:
        win = rng.random() < 0.5 + max(-0.35, min(0.35, tg / 8000))
    nd = max(0, round(rng.gauss(deaths, 1.3)))
    if early is None:
        mins = sorted(round(rng.uniform(3, minutes - 1), 1) for _ in range(nd))
    else:
        ne = min(nd, max(0, round(rng.gauss(early, 0.6))))
        lo = 22 if late_deaths else 14
        mins = sorted([round(rng.uniform(3, 13.9), 1) for _ in range(ne)] + [round(rng.uniform(lo, minutes - 0.5), 1) for _ in range(nd - ne)])
    ed = sum(1 for m in mins if m < 14)
    solo = min(nd, round(nd * solo_frac + rng.uniform(-0.5, 0.5)))
    cdiff = None if role == "UTILITY" and rng.random() < 0 else round(rng.gauss(cs_diff, 6))
    c10 = max(0, round(rng.gauss(cs10 * cs_mult, 6)))
    return {
        "id": f"EUW1_{7100000000 + i}",
        "ended_at": 0,
        "queue_id": 420,
        "minutes": minutes,
        "champion": champ,
        "role": role,
        "win": bool(win),
        "kills": max(0, round(rng.gauss(5 if role != "UTILITY" else 1.5, 2.5))),
        "deaths": nd,
        "assists": max(0, round(rng.gauss(7 if role != "UTILITY" else 14, 3))),
        "kill_participation": round(min(0.95, max(0.15, rng.gauss(kp if kp is not None else kpb, 0.07))), 2),
        "cs_per_min": round(max(0.3, rng.gauss(cpm * cs_mult, 0.5 if role != "UTILITY" else 0.3)), 1),
        "cs_at_10": c10,
        "opponent": rng.choice(OPP[role]),
        "cs_diff_10": cdiff,
        "gold_diff_15": round(rng.gauss(gold, 450)),
        "team_gold_diff_15": tg,
        "vision_per_min": round(max(0.1, rng.gauss(vis if vis is not None else v, 0.12)), 2),
        "wards_placed": max(0, round(rng.gauss(wards * minutes / 30, 2))),
        "wards_killed": max(0, round(rng.gauss(2 if role != "UTILITY" else 5, 1.2))),
        "control_wards": max(0, round(rng.gauss(cw if cw is not None else cwb, 0.8))),
        "damage_share": round(min(0.5, max(0.05, rng.gauss(dmg if dmg is not None else ds, 0.03))), 2),
        "early_deaths": ed,
        "solo_deaths": solo,
        "death_minutes": mins,
        "first_item_min": round(rng.gauss(item if item is not None else it, 0.9), 1),
    }


def player(case_id: str):
    rng = random.Random(case_id)
    g = []
    if case_id == "hist-01-top-early-solo":
        for i in range(20):
            g.append(make_game(rng, i, "TOP", rng.choice(["Renekton", "Darius", "Renekton", "Aatrox"]),
                               cs_diff=6, gold=-350, deaths=6, early=2.6, solo_frac=0.55))
    elif case_id == "hist-02-mid-cs-deficit":
        for i in range(20):
            g.append(make_game(rng, i, "MIDDLE", rng.choice(["Syndra", "Orianna", "Syndra", "Ahri"]),
                               cs_diff=-14, gold=-650, cs_mult=0.78, kp=0.66, deaths=4.5, early=1.0))
    elif case_id == "hist-03-adc-thrown-leads":
        thrown = {1, 3, 4, 8, 11, 15, 17}
        for i in range(20):
            if i in thrown:
                x = make_game(rng, i, "BOTTOM", rng.choice(["Jinx", "Kai'Sa"]), win=False, cs_diff=10, gold=600,
                              team_gold=2800, deaths=8, early=0.4, late_deaths=True, solo_frac=0.5)
                x["team_gold_diff_15"] = max(x["team_gold_diff_15"], 1700)
            else:
                x = make_game(rng, i, "BOTTOM", rng.choice(["Jinx", "Kai'Sa", "Jinx"]), cs_diff=8, gold=450,
                              team_gold=600, deaths=4, early=0.6)
                if x["team_gold_diff_15"] >= THROWN_LEAD_GOLD:
                    x["win"] = True
            g.append(x)
    elif case_id == "hist-04-support-control-wards":
        for i in range(20):
            low = rng.random() < 0.6
            g.append(make_game(rng, i, "UTILITY", rng.choice(["Thresh", "Nautilus", "Thresh"]),
                               win=rng.random() < (0.3 if low else 0.7), cw=0.2 if low else 3,
                               vis=1.35 if low else 2.1, cs_diff=-25, deaths=6, early=2.0, solo_frac=0.25))
    elif case_id == "hist-05-jungle-low-kp":
        for i in range(20):
            x = make_game(rng, i, "JUNGLE", rng.choice(["Graves", "Kindred", "Graves"]), kp=0.39, item=18.0,
                          cs_diff=-9, gold=-500, deaths=4)
            x["win"] = x["kill_participation"] >= 0.45 or (x["kill_participation"] >= 0.36 and rng.random() < 0.4)
            g.append(x)
    elif case_id == "hist-06-improving-deaths":
        for i in range(20):
            recent = i < 5
            g.append(make_game(rng, i, "MIDDLE", rng.choice(["Viktor", "Orianna"]), win=(rng.random() < 0.8) if recent else (rng.random() < 0.33),
                               deaths=3.0 if recent else 8.5, early=0.8 if recent else 3.0, cs_diff=-8, gold=-300))
    elif case_id == "hist-07-small-sample":
        for i, (role, ch) in enumerate([("TOP", "Garen"), ("MIDDLE", "Annie"), ("JUNGLE", "Warwick"), ("MIDDLE", "Annie")]):
            g.append(make_game(rng, i, role, ch, deaths=6, early=1.5))
    elif case_id == "hist-08-one-outlier":
        for i in range(20):
            x = make_game(rng, i, "BOTTOM", rng.choice(["Ezreal", "Jhin", "Ezreal"]), cs_mult=0.8, item=16.6,
                          dmg=0.2, deaths=3, early=0.5, cs_diff=-6)
            if i == 2:
                x.update(deaths=13, kills=0, win=False, early_deaths=6, solo_deaths=7,
                         death_minutes=[4.1, 6.3, 8.0, 9.9, 11.2, 13.5, 16.0, 18.4, 21.0, 23.3, 25.7, 28.1, 30.2])
            g.append(x)
    else:
        raise KeyError(case_id)
    return g


CASES = [
    {
        "id": "hist-01-top-early-solo",
        "planted": "Top laner who wins CS at 10 but dies early and alone: ~2.6 deaths before 14:00 per game, more than half solo; gold diff@15 negative despite the CS lead.",
        "criterios": [
            "The first pain point is the early / solo deaths (deaths before 14:00, solo deaths), citing the averages and several G refs.",
            "Connects the deaths to the negative gold diff@15 despite the positive CS diff@10.",
            "The drill is concrete for a top laner (e.g. track the enemy jungler, ward the river/tri-bush at 2:45-3:15, back on a timer before overextending past the river), and the target is per game on the same metric and reachable (e.g. ≤1.5 deaths before 14:00).",
            "The strength is the positive CS diff@10 (with numbers).",
        ],
        "errores_graves": ["Compares with rank averages, pro players or numbers not in the data (e.g. 'Gold players average 7 CS/min')", "Cites numbers or games that don't exist in the data"],
        "hechos": ["Flags deaths before 14:00 or solo deaths as a pain point", "Says the CS diff@10 is positive / a strength (not a weakness)"],
    },
    {
        "id": "hist-02-mid-cs-deficit",
        "planted": "Mid laner behind in CS at 10 in most games (~-14 diff), low CS/min, gold diff@15 ~-650; kill participation high (~0.66).",
        "criterios": [
            "The first pain point is laning CS (CS diff@10 / CS@10), citing the 'behind in X of Y games' line and numbers.",
            "Notes the high kill participation as a strength, or that roaming might cost CS, without inventing causes the data can't show.",
            "Concrete farming drill (e.g. last-hit practice tool, count CS at 5/10 min, wave management before roams) with a reachable target on the same metric (e.g. CS diff@10 ≥ -5).",
        ],
        "errores_graves": ["Compares with rank averages, pro players or numbers not in the data", "Cites numbers or games that don't exist in the data"],
        "hechos": ["Flags CS diff@10 / CS@10 as the main pain point", "Names kill participation as a strength"],
    },
    {
        "id": "hist-03-adc-thrown-leads",
        "planted": "ADC who wins lane (CS diff +8, gold +500) but loses 7 games after the team led by 1500+ gold at 15:00; in those games deaths are many and late (after 22 min).",
        "criterios": [
            "The first pain point is the thrown leads (the listed G refs) and the late deaths in those games.",
            "Uses the death minutes to show the deaths come after 20-22 minutes in the thrown games.",
            "Mid/late game drill for an ADC (e.g. position behind the frontline, don't facecheck, group for objectives, reset before Baron/Dragon), target measurable (e.g. ≤4 deaths after 20:00 in games ahead at 15).",
            "The strength is laning (CS diff, gold diff@15).",
        ],
        "errores_graves": ["Says the problem is laning or CS", "Compares with rank averages, pro players or numbers not in the data", "Cites numbers or games that don't exist in the data"],
        "hechos": ["Identifies the thrown leads (losses after leading at 15)", "Points out that the deaths in those games are late (after ~20 min)", "Names laning (CS diff / gold diff) as a strength"],
    },
    {
        "id": "hist-04-support-control-wards",
        "planted": "Support: most games with 0 control wards and low vision/min, and those games are mostly lost; games with 2+ control wards are mostly won. CS is low, which is normal for a support.",
        "criterios": [
            "A pain point is control wards / vision, showing the link with wins (games with 0 control wards vs games with more).",
            "Doesn't treat the support's low CS or negative CS diff@10 as a problem.",
            "Concrete support drill (e.g. buy a control ward on every back, place it at a set spot before objectives) with a target such as ≥2 control wards per game.",
        ],
        "errores_graves": ["Tells the support to raise their CS or CS/min", "Compares with rank averages, pro players or numbers not in the data", "Cites numbers or games that don't exist in the data"],
        "hechos": ["Flags control wards / vision as a pain point", "Links low control wards or vision with the losses", "Does NOT criticize the support's CS"],
    },
    {
        "id": "hist-05-jungle-low-kp",
        "planted": "Jungler with low kill participation (~0.39) and a late first legendary item (~18 min); the games with higher KP are won. CS diff@10 vs the enemy jungler ~-9.",
        "criterios": [
            "The first pain point is kill participation / map impact, showing that wins come with higher KP.",
            "Mentions the late first item and/or the CS deficit vs the enemy jungler as connected clear/tempo problems.",
            "Jungle drill (e.g. plan the first clear and gank on a timer, track the enemy jungler, play towards the lane with priority) with a target such as KP ≥ 0.50.",
            "Treats the CS diff as against the enemy jungler, not a lane opponent.",
        ],
        "errores_graves": ["Compares with rank averages, pro players or numbers not in the data", "Cites numbers or games that don't exist in the data"],
        "hechos": ["Flags low kill participation as a pain point", "Mentions the late first legendary item (~18 min)", "Links higher KP to the wins"],
    },
    {
        "id": "hist-06-improving-deaths",
        "planted": "Mid laner whose deaths dropped a lot in the last 5 games (~3 vs ~8.5 before) and who won most of them. Persistent problem: CS diff@10 ~-8 in most games.",
        "criterios": [
            "Recognizes the improvement in deaths in the last 5 games (strength or trend) with the numbers from the last-5 vs earlier lines.",
            "Doesn't present the deaths as the main current problem without saying they already improved; the persistent CS deficit at 10 is a pain point.",
            "Drills and targets build on the current (last-5) numbers.",
        ],
        "errores_graves": ["Ignores that the deaths already improved and makes them the main problem as if they were current", "Compares with rank averages, pro players or numbers not in the data", "Cites numbers or games that don't exist in the data"],
        "hechos": ["Notes that deaths dropped in the last 5 games", "Flags the CS diff@10 deficit as a pain point"],
    },
    {
        "id": "hist-07-small-sample",
        "planted": "Only 4 games on 3 different roles and champions. Any 'pattern' is weak.",
        "criterios": [
            "Says the sample is small and the points are tentative, and asks for more games (or suggests one role) without refusing to help.",
            "Doesn't claim trends (there is no last-5 vs earlier split) or role-specific patterns the 4 games can't show.",
            "Still gives concrete drills for the few signals there are.",
        ],
        "errores_graves": ["Claims a trend or a strong repeated pattern from 4 games without flagging the sample size", "Cites numbers or games that don't exist in the data"],
        "hechos": ["Flags that 4 games are too few for solid patterns"],
    },
    {
        "id": "hist-08-one-outlier",
        "planted": "ADC with one disaster game (G3, 0/13) but otherwise ~3 deaths; the repeated problems are low CS (cs ~0.8x, CS diff@10 ~-6) and a late first legendary item (~16.6 min) with low damage share (~0.20).",
        "criterios": [
            "Doesn't build a pain point on the single 0/13 game (G3), or says it's a one-off.",
            "Flags the repeated farming / late first item problem with numbers across many games.",
            "Concrete drill and reachable target (e.g. first item before 15:00, CS diff@10 ≥ 0).",
        ],
        "errores_graves": ["Makes deaths the main pain point based on the single G3 game", "Compares with rank averages, pro players or numbers not in the data", "Cites numbers or games that don't exist in the data"],
        "hechos": ["Treats G3 as an outlier, not a pattern", "Flags the late first legendary item", "Flags low CS / CS diff@10"],
    },
]

RIOT_ID = "Player#EUW"


def judge_case(case, games) -> dict:
    """The shape `run_eval.judge_once` expects."""
    return {
        **case,
        "prompt": (
            "Post-game review. The player wants the 3 things to work on from their last games, with drills. "
            "The coach was given ONLY these numbers (computed from Riot's match data). Check every number and G ref "
            "the answer cites against them.\n" + data_block(games, fix=False)
            + f"\n\n(Evaluator note, not shown to the coach: the data was generated with this planted pattern: {case['planted']})"
        ),
    }


# ---------------------------------------------------------------- run


def run_harness(games, system_file, model):
    prompt = review_prompt(RIOT_ID, games)
    out = R.run_claude(prompt, system_file=system_file, tools="WebSearch", model=model, timeout=600)
    rep, err = (parse_report(out["text"], games) if out["ok"] else (None, out.get("error")))
    first = out
    corrected = False
    if rep is None and out["ok"]:
        corrected = True
        fix = (
            prompt + "\n\nYOUR PREVIOUS ANSWER:\n" + out["text"]
            + f"\n\nYour answer couldn't be read ({err}). Reply again with ONLY the complete JSON object, in the same shape."
        )
        out = R.run_claude(fix, system_file=system_file, tools="WebSearch", model=model, timeout=600)
        rep, err = (parse_report(out["text"], games) if out["ok"] else (None, out.get("error")))
    return {
        "ok": rep is not None,
        "text": render_report(rep) if rep else "",
        "raw": out.get("text", ""),
        "error": err,
        "corrected": corrected,
        "searches": len(first.get("tool_calls") or []) + (len(out.get("tool_calls") or []) if corrected else 0),
        "report": rep,
        "cost_usd": (first.get("cost_usd") or 0) + ((out.get("cost_usd") or 0) if corrected else 0),
    }


def run_baseline(games, model):
    out = R.run_claude(baseline_prompt(games), system_file=None, tools="", model=model, timeout=600)
    return {"ok": out["ok"], "text": out["text"], "error": out.get("error"), "cost_usd": out.get("cost_usd")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model")
    ap.add_argument("--judge-model")
    ap.add_argument("--judge-repeats", type=int, default=1)
    ap.add_argument("--only")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--prompts", type=Path, default=ROOT / "src-tauri/src/providers/prompts.rs")
    ap.add_argument("--print-prompt", action="store_true", help="print the harness prompt of each case and exit")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--fix", action="store_true", help="harness with the proposed prompt changes (wins vs losses lines, no CS for supports)")
    args = ap.parse_args()
    global FIX
    FIX = args.fix

    cases = [c for c in CASES if not args.only or c["id"] in args.only.split(",")]
    if args.print_prompt:
        for c in cases:
            print(f"===== {c['id']}\n{review_prompt(RIOT_ID, player(c['id']))}\n")
        return

    out_dir = ROOT / "eval/results" / ("history-" + ("fix-" if args.fix else "") + dt.datetime.now().strftime("%Y%m%d-%H%M%S"))
    out_dir.mkdir(parents=True, exist_ok=True)
    system_file = out_dir / "coach_system.txt"
    system_file.write_text(R.load_coach_prompt(args.prompts, "en"), encoding="utf-8")
    rubric = (ROOT / "eval/rubric_history.md").read_text(encoding="utf-8")

    def one(case):
        games = player(case["id"])
        with cf.ThreadPoolExecutor(2) as ex:
            fh = ex.submit(run_harness, games, system_file, args.model)
            fb = ex.submit(run_baseline, games, args.model)
            h, b = fh.result(), fb.result()
        rounds = []
        if h["ok"] and b["ok"]:
            rounds = R.judge_pair(judge_case(case, games), h["text"], b["text"], rubric, args.judge_model, None, "n/a (post-game stats review, no patch facts needed)", args.judge_repeats)
        res = {"id": case["id"], "harness": h, "baseline": b, "rounds": rounds, "summary": R.summarize_case(rounds) if rounds else None}
        with open(out_dir / "results.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(res, ensure_ascii=False) + "\n")
        print(f"done {case['id']}: {(res['summary'] or {}).get('diff')}", file=sys.stderr)
        return res

    with cf.ThreadPoolExecutor(args.jobs) as ex:
        results = list(ex.map(one, cases))

    lines = ["# Post-game review: harness vs plain model", "", f"Judge: {args.judge_model or 'default'}; cases: {len(results)}", ""]
    lines += ["| case | Δ substance | result | harness subst. | baseline subst. | format Δ | honesty Δ | facts harness | facts baseline | JSON fixed | bad G refs | searches |", "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    diffs, wins, losses, cons = [], 0, 0, {k: [] for k in R.RESTRICCIONES}
    for r in results:
        s = r["summary"]
        if not s:
            lines.append(f"| {r['id']} | error: {r['harness'].get('error') or r['baseline'].get('error')} |")
            continue
        diffs.append(s["diff"])
        wins += s["result"] == 1
        losses += s["result"] == -1
        for k in cons:
            cons[k].append(s["dims"]["main"][k] - s["dims"]["other"][k])
        fh = s["hechos"]["main"]
        fb = s["hechos"]["other"]
        rep = r["harness"]["report"] or {}
        lines.append(
            f"| {r['id']} | {s['diff']:+.2f} | {'win' if s['result'] == 1 else 'loss' if s['result'] == -1 else 'tie'} | "
            f"{s['dims']['main']['fondo']:.2f} | {s['dims']['other']['fondo']:.2f} | "
            f"{s['dims']['main']['formato'] - s['dims']['other']['formato']:+.1f} | {s['dims']['main']['honestidad'] - s['dims']['other']['honestidad']:+.1f} | "
            f"{fh.count('acertado')}/{len(fh)} | {fb.count('acertado')}/{len(fb)} | {'yes' if r['harness']['corrected'] else 'no'} | "
            f"{rep.get('bad_refs', '—')}/{rep.get('n_refs', '—')} | {r['harness']['searches']} |"
        )
    lo, hi = R.bootstrap_ci(diffs, args.seed)
    lines += [
        "",
        f"Mean Δ substance: {R.fmt(R.mean(diffs))} (95% CI {R.fmt(lo)} to {R.fmt(hi)}); wins/ties/losses {wins}/{len(diffs) - wins - losses}/{losses}; sign test p={R.sign_test_p(wins, losses):.3f}",
        "Constraint Δ (harness − baseline): " + ", ".join(f"{k} {R.fmt(R.mean(v))}" for k, v in cons.items()),
        "",
        "## Verdicts",
        "",
    ]
    for r in results:
        for rd in r["rounds"]:
            if "veredicto" in rd:
                lines.append(f"- **{r['id']}** ({'harness=A' if rd['main_first'] else 'harness=B'}): {rd['veredicto']}")
                for x in rd.get("datos_incorrectos") or []:
                    lines.append(f"  - wrong/unverified: {x}")
    report = "\n".join(lines) + "\n"
    (out_dir / "report.md").write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
