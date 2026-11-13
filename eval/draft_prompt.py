"""Python replica of the `recommend_build` flow (src-tauri/src/recommend.rs, PR #8: English by default).

Lets the eval score the build card with the structured draft without compiling the
app. When `analysis_prompt`, `card_prompt`, `validate` or `missing` change in Rust,
update this too.
"""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from pathlib import Path

BASE = "https://ddragon.leagueoflegends.com"
LOCALE = "en_US"
LOCALE_OF = {"en": "en_US", "es": "es_MX"}
FILES = ("champion.json", "item.json", "runesReforged.json", "summoner.json")
# Stat shards (not in runesReforged.json), as in ddragon.rs: (English, Spanish).
SHARDS = [
    [("Adaptive Force", "Fuerza adaptable"), ("Attack Speed", "Velocidad de ataque"),
     ("Ability Haste", "Velocidad de habilidades")],
    [("Adaptive Force", "Fuerza adaptable"), ("Move Speed", "Velocidad de movimiento"),
     ("Health Scaling", "Vida escalable")],
    [("Health", "Vida"), ("Tenacity and Slow Resist", "Tenacidad y resistencia a ralentizaciones"),
     ("Health Scaling", "Vida escalable")],
]

# i18n.rs: Lang::answer_instruction.
ANSWER_INSTRUCTION = {
    "en": "Always answer in English.",
    "es": "Always answer in Spanish (Latin American, as in the es_MX game client), using the Spanish in-game names.",
}

SCHEMA = """{
  "answer": "answer to the PLAYER NOTES as 3-6 short markdown bullets (\\"- ...\\"), or \\"\\" if there are no notes",
  "summary": "ONE sentence: the idea of the build for THIS game",
  "starting_items": ["starting item", "..."],
  "core_items": ["item 1", "item 2", "item 3"],
  "boots": "boots",
  "situational": [{"item": "item", "when": "when and against whom to buy it"}],
  "runes": {
    "primary_tree": "primary tree", "keystone": "keystone",
    "primary": ["rune", "rune", "rune"],
    "secondary_tree": "secondary tree", "secondary": ["rune", "rune"],
    "shards": ["offense shard", "flex shard", "defense shard"]
  },
  "summoner_spells": ["spell", "spell"],
  "skill_order": {"max": ["Q", "E", "W"], "first_levels": "e.g. Q-E-W"},
  "game_plan": {"early": "...", "mid": "...", "late": "..."},
  "matchup_tips": ["concrete tip against the lane opponent", "..."],
  "threats": [{"champion": "enemy", "why": "why they are dangerous and how to play it"}],
  "caveat": "a single line of doubt if there is one, or null",
  "stats": [{"site": "u.gg", "url": "exact URL of the page you read", "patch": "patch the page shows",
             "about": "what it measures: e.g. Jax top, or Jax vs Darius", "win_rate": 51.2, "pick_rate": 6.3,
             "ban_rate": 4.1, "games": 12345, "tier": "A", "rank": "Emerald+"}]
}"""


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    return "".join(c.lower() for c in s if c.isalnum())


def patch_name(version: str) -> str:
    parts = version.split(".")
    try:
        major = int(parts[0])
    except (ValueError, IndexError):
        return version
    if len(parts) < 2:
        return version
    return f"{major + 10 if major >= 15 else major}.{parts[1]}"


def fetch(dest: Path, version: str | None = None, locale: str = LOCALE) -> Path:
    """Downloads a Data Dragon snapshot (`locale`) to dest/<locale>/<version>/."""
    if not version:
        with urllib.request.urlopen(f"{BASE}/api/versions.json", timeout=20) as r:
            version = json.load(r)[0]
    out = dest / locale / version
    out.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        with urllib.request.urlopen(f"{BASE}/cdn/{version}/data/{locale}/{f}", timeout=30) as r:
            (out / f).write_bytes(r.read())
    return out


class GameData:
    def __init__(self, folder: Path, lang: str | None = None):
        self.version = folder.name
        # Idioma de la app: el de la carpeta (en_US/es_MX) salvo que se indique.
        self.lang = lang or ("es" if folder.parent.name == "es_MX" else "en")
        self.locale = LOCALE_OF[self.lang]
        self.shards = [[en if self.lang == "en" else es for en, es in row] for row in SHARDS]
        self.patch = patch_name(self.version)
        champs = json.loads((folder / "champion.json").read_text(encoding="utf-8"))["data"]
        self.champions = {
            c["id"]: {
                "name": c["name"],
                "tags": c.get("tags", []),
                "attack": c["info"]["attack"],
                "magic": c["info"]["magic"],
                "defense": c["info"]["defense"],
            }
            for c in champs.values()
        }
        items = json.loads((folder / "item.json").read_text(encoding="utf-8"))["data"]
        store = {
            k: i for k, i in items.items()
            if i.get("maps", {}).get("11")
            and i.get("gold", {}).get("purchasable")
            and i.get("inStore") is not False
            and not i.get("requiredChampion")
            and not i.get("requiredAlly")
            and len(k) <= 4
            and not ("Lane" in i.get("tags", []) and not i.get("from") and not i.get("into")
                     and i.get("gold", {}).get("total", 0) > 500)
        }
        out = {}
        for k, i in sorted(store.items(), key=lambda kv: (kv[1]["name"], kv[0])):
            if i["name"] in out:
                continue
            tags = i.get("tags", [])
            gold = i.get("gold", {}).get("total", 0)
            builds_into = any(t in store for t in i.get("into", []))
            boots = "Boots" in tags
            consumable = "Consumable" in tags or "Trinket" in tags
            starter = not i.get("from") and gold <= 500 and "Trinket" not in tags and ("Lane" in tags or "Jungle" in tags)
            out[i["name"]] = {
                "tags": tags,
                "boots": boots,
                "starter": starter,
                "support": starter and "GoldPer" in tags,
                "completed": not consumable and not starter and ((not builds_into and gold >= 900) or (boots and gold > 300)),
            }
        self.item_info = out
        self.items = list(out)
        self.item_keys = {normalize(n): n for n in self.items}
        spells_path = folder / "summoner.json"
        spells = json.loads(spells_path.read_text(encoding="utf-8"))["data"] if spells_path.exists() else {}
        self.spells = sorted(sp["name"] for sp in spells.values() if "CLASSIC" in sp.get("modes", []))
        self.rune_trees = json.loads((folder / "runesReforged.json").read_text(encoding="utf-8"))
        self.tree_keys = {normalize(t["name"]) for t in self.rune_trees}
        self.rune_keys = {
            normalize(r["name"]) for t in self.rune_trees for s in t["slots"] for r in s["runes"]
        }


def _damage(c: dict) -> str:
    a, m = c["attack"], c["magic"]
    if m >= a + 3:
        return "magic damage (AP)"
    if a >= m + 3:
        return "physical damage (AD)"
    return "mixed damage"


def _tanky(c: dict) -> bool:
    return c["defense"] >= 7 or "Tank" in c["tags"]


def _describe(c: dict) -> str:
    tank = ", durable" if _tanky(c) else ""
    return f"{c['name']} [{'/'.join(c['tags'])}; {_damage(c)}{tank}]"


def analysis_prompt(draft: dict, data: GameData) -> str:
    """Step 1: free-form analysis with web search, no lists or schema."""
    def get(cid: str) -> dict:
        if cid not in data.champions:
            raise KeyError(f"Unknown champion in Data Dragon: {cid}")
        return data.champions[cid]

    me = get(draft["champion"])
    allies = [get(a) for a in draft.get("allies", [])]
    enemies = [get(e) for e in draft.get("enemies", [])]
    lane = get(draft["lane_opponent"]) if draft.get("lane_opponent") else None

    p = [
        f"CURRENT PATCH: {data.patch} (Data Dragon version {data.version}). Everything you recommend must be valid "
        f"on this patch. Some sites show the patch as the client version ({data.version.rsplit('.', 1)[0]}): it is "
        "the same patch, don't discard it.\n",
        f"YOUR CHAMPION: {_describe(me)} — role {draft['role']}",
    ]
    if lane:
        p.append(f"LANE OPPONENT: {_describe(lane)}")
    p.append("\nALLIES (your team, NOT enemies):")
    p += [f"- {_describe(a)}" for a in allies] or ["- (not set)"]
    p.append("\nENEMIES (enemy team):")
    if enemies:
        p += [f"- {_describe(e)}" for e in enemies]
        ap = sum("AP" in _damage(e) for e in enemies)
        ad = sum("AD" in _damage(e) for e in enemies)
        tanks = sum(_tanky(e) for e in enemies)
        p.append(
            f"Enemy profile: {len(enemies)} enemies: {ap} magic damage, {ad} physical damage, "
            f"{len(enemies) - ap - ad} mixed, {tanks} durable."
        )
    else:
        p.append("- (not set)")
    if (draft.get("notes") or "").strip():
        p.append(f"\nPLAYER NOTES: {draft['notes'].strip()}")
    me_name, role, patch = me["name"], draft["role"], data.patch
    p.append(
        "\nINSTRUCTIONS:\n"
        f"- FIRST, if you have web search, look up the {me_name} {role} build for patch {patch} (u.gg, op.gg, "
        f"Mobalytics, Lolalytics…) and, if there is a lane opponent, the matchup. Use only patch {patch} data; discard "
        "older patches, and don't write figures (win rate, pick rate, games): figures go separately, on the card, "
        "where they are checked against your search.\n"
        "- If there are PLAYER NOTES, the first and main thing is to answer in depth what they ask or what changes "
        "because of that situation (minute, gold, score…), as a coach would in chat. If they ask what to buy with "
        "some amount of gold, name the exact purchase that gold affords (a component is fine).\n"
        "- Then, shorter, the build for THIS game: full rune page with shards, 2 summoner spells, starting items, 3 "
        "core items in order, boots and skill order. In situational items, game plan, matchup tips and threats, put "
        "only what changes because of THESE enemies (damage, healing, CC, tanks), not generic advice. No "
        '"whichever you prefer" or "check u.gg".\n'
        "- Don't state anything you aren't sure of: fewer, well-chosen situational items are better.\n"
        f"- Use the in-game names of the {data.locale} client. Be direct; no long tables.\n"
        f"- {ANSWER_INSTRUCTION[data.lang]}"
    )
    return "\n".join(p) + "\n"


def card_prompt(data: GameData, analysis: str | None) -> str:
    """Step 2: turn the analysis into the card with the patch's exact names."""
    p = []
    if analysis is not None:
        p.append(f"ANALYSIS:\n{analysis}\n\nTurn this analysis into a card.")
    else:
        p.append("Turn YOUR previous analysis into a card.")
    p.append(
        "Don't search again or change the analysis' decisions: just write them with the exact names from these "
        "lists. If a name isn't listed, use the closest equivalent from the list."
    )
    names = lambda f: ", ".join(n for n, i in data.item_info.items() if f(i))  # noqa: E731
    p.append(
        f"\nPATCH {data.patch} ITEMS (don't use components):\n"
        f"- STARTERS (only for starting_items): {names(lambda i: i['starter'] and not i['support'])}\n"
        "- SUPPORT STARTER (required in starting_items if you play support, and only then): "
        f"{names(lambda i: i['support'])}\n"
        f"- BOOTS (only for boots): {names(lambda i: i['completed'] and i['boots'])}\n"
        f"- COMPLETED (for core_items and situational): {names(lambda i: i['completed'] and not i['boots'])}"
    )
    p.append(f"\nSUMMONER SPELLS: {', '.join(data.spells)}")
    p.append(
        "\nVALID RUNES (tree: keystones | row 1 | row 2 | row 3). The keystone comes from the first row of the "
        "primary tree; the 3 primary runes, one from each row of that tree; the 2 secondary runes, from different "
        "rows of another tree:"
    )
    for t in data.rune_trees:
        rows = [", ".join(r["name"] for r in s_["runes"]) for s_ in t["slots"]]
        p.append(f"- {t['name']}: {' | '.join(rows)}")
    p.append("\nSHARDS (one per row, in order):")
    for i, row in enumerate(data.shards):
        p.append(f"- Row {i + 1}: {', '.join(row)}")
    p.append(
        "\nRULES:\n"
        '- "answer" is the answer to the player\'s notes ("" if there are none): 3-6 short bullets with what they '
        'have to do, without repeating the runes or the build (they are already on the card); "summary", ONE '
        'sentence. No field carries doubts or corrections ("no, better…", "see below"): the doubt, if any, goes only '
        'in "caveat".\n'
        '- In "stats" put ONLY figures that came up in your web search results in this conversation (u.gg, op.gg, '
        "Mobalytics, Lolalytics, League of Graphs or METAsrc), with the exact URL of that result and the patch it "
        'shows; null for whatever it doesn\'t say. If you didn\'t search, "stats": []. Never figures from memory: '
        "those that don't match a search result are discarded.\n"
        f"- Write the text fields in the answer language: {ANSWER_INSTRUCTION[data.lang]}\n"
        "- Reply ONLY with a ```json block of this shape:\n" + SCHEMA
    )
    return "\n".join(p) + "\n"


def parse_card(text: str) -> dict | None:
    i = text.rfind("```json")
    if i >= 0:
        body = text[i + 7:]
        body = body.split("```", 1)[0]
        a, b = body.find("{"), body.rfind("}")
        if 0 <= a < b:
            try:
                return json.loads(body[a:b + 1])
            except json.JSONDecodeError:
                pass
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def invalid_names(card: dict, data: GameData, draft: dict | None = None) -> list[str]:
    """Names not in the patch, items in the wrong slot and empty fields (like validate + missing, in English)."""
    bad = []
    role = (draft or {}).get("role")

    def item(n, slot):
        if not n:
            return
        name = data.item_keys.get(normalize(n))
        if not name:
            bad.append(f"item \"{n}\" doesn't exist")
            return
        info = data.item_info[name]
        if slot == "start" and not info["starter"] and not info["completed"]:
            bad.append(f"\"{name}\" is a component, not a starting item")
        elif slot == "start" and info["completed"]:
            bad.append(f"\"{name}\" isn't a starting item")
        elif slot == "start" and info["support"] and role != "support":
            bad.append(f"\"{name}\" is the support starter and your role is {role}")
        elif slot == "boots" and not info["boots"]:
            bad.append(f"\"{name}\" aren't boots")

    for n in card.get("starting_items") or []:
        item(n, "start")
    for n in card.get("core_items") or []:
        item(n, "core")
    item(card.get("boots") or "", "boots")
    for s_ in card.get("situational") or []:
        item((s_ or {}).get("item", ""), "core")
    starts = [data.item_keys.get(normalize(n)) for n in card.get("starting_items") or []]
    if role == "support" and starts and not any(n and data.item_info[n]["support"] for n in starts):
        bad.append("as support, the starting items must include the support item")
    r = card.get("runes") or {}
    for t in (r.get("primary_tree"), r.get("secondary_tree")):
        if t and normalize(t) not in data.tree_keys:
            bad.append(f"tree \"{t}\" doesn't exist")
    for n in [r.get("keystone")] + list(r.get("primary") or []) + list(r.get("secondary") or []):
        if n and normalize(n) not in data.rune_keys:
            bad.append(f"rune \"{n}\" doesn't exist")
    if draft is not None:
        blank = lambda t: not str(t or "").strip()  # noqa: E731
        notes = not blank(draft.get("notes"))
        gp = card.get("game_plan") or {}
        for cond, what in [
            (notes and blank(card.get("answer")), '"answer": answer the player\'s notes'),
            (blank(card.get("summary")), '"summary"'),
            (not card.get("starting_items"), '"starting_items"'),
            (len(card.get("core_items") or []) < 3, '"core_items": 3 completed items'),
            (blank(card.get("boots")) and draft.get("champion") != "Cassiopeia", '"boots"'),
            (blank(r.get("primary_tree")) or blank(r.get("keystone")) or not r.get("primary"),
             "the primary rune tree with its keystone and 3 runes"),
            (blank(r.get("secondary_tree")) or not r.get("secondary"), "the secondary tree with 2 runes"),
            (not r.get("shards"), "the 3 shards"),
            (len(card.get("summoner_spells") or []) != 2, '"summoner_spells": 2 spells'),
            (not (card.get("skill_order") or {}).get("max"), '"skill_order.max"'),
            (blank(gp.get("early")) or blank(gp.get("mid")) or blank(gp.get("late")),
             '"game_plan" (early, mid and late)'),
        ]:
            if cond:
                bad.append(f"Missing {what}")
    return bad


LABELS = {
    "en": dict(answer="Answer to your notes", start="Starting items", core="Core build", boots="Boots",
               sit="Situational", runes="Runes", shards="shards", spells="Summoner spells", skills="Skills",
               max="max", first="first levels", plan="Game plan", tips="Matchup tips", threats="Threats",
               caveat="Caveat"),
    "es": dict(answer="Respuesta a tus notas", start="Iniciales", core="Build principal", boots="Botas",
               sit="Situacionales", runes="Runas", shards="fragmentos", spells="Hechizos", skills="Habilidades",
               max="maximizar", first="primeros niveles", plan="Plan", tips="Claves del matchup",
               threats="Amenazas", caveat="Duda"),
}


def render_card(card: dict, lang: str = "en") -> str:
    """Turns the card into text so the judge reads it as the player would see it."""
    L = LABELS[lang]
    r = card.get("runes") or {}
    sk = card.get("skill_order") or {}
    gp = card.get("game_plan") or {}
    lines = [
        *([f"{L['answer']}:\n{card['answer']}"] if (card.get("answer") or "").strip() else []),
        card.get("summary", ""),
        "",
        f"{L['start']}: {', '.join(card.get('starting_items') or [])}",
        f"{L['core']}: {' > '.join(card.get('core_items') or [])}",
        f"{L['boots']}: {card.get('boots', '')}",
        f"{L['sit']}:",
        *[f"- {s.get('item')}: {s.get('when')}" for s in card.get("situational") or []],
        f"{L['runes']}: {r.get('primary_tree')} ({r.get('keystone')}; {', '.join(r.get('primary') or [])}) + "
        f"{r.get('secondary_tree')} ({', '.join(r.get('secondary') or [])}); "
        f"{L['shards']}: {', '.join(r.get('shards') or [])}",
        f"{L['spells']}: {' + '.join(card.get('summoner_spells') or [])}",
        f"{L['skills']}: {L['max']} {' > '.join(sk.get('max') or [])}; {L['first']} {sk.get('first_levels', '')}",
        f"{L['plan']}: early: {gp.get('early', '')} | mid: {gp.get('mid', '')} | late: {gp.get('late', '')}",
        f"{L['tips']}:",
        *[f"- {t}" for t in card.get("matchup_tips") or []],
        f"{L['threats']}:",
        *[f"- {t.get('champion')}: {t.get('why')}" for t in card.get("threats") or []],
    ]
    if card.get("caveat"):
        lines.append(f"{L['caveat']}: {card['caveat']}")
    return "\n".join(lines)
