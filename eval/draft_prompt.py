"""Réplica en Python del flujo `recommend_build` (src-tauri/src/recommend.rs, versión de #7).

Sirve para evaluar la tarjeta de build con el draft estructurado sin compilar la
app. Si cambia `analysis_prompt`, `card_prompt` o `validate` en Rust, actualiza también esto.
"""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from pathlib import Path

BASE = "https://ddragon.leagueoflegends.com"
LOCALE = "es_MX"
FILES = ("champion.json", "item.json", "runesReforged.json", "summoner.json")
SHARDS = [
    ["Fuerza adaptable", "Velocidad de ataque", "Velocidad de habilidades"],
    ["Fuerza adaptable", "Velocidad de movimiento", "Vida escalable"],
    ["Vida", "Tenacidad y resistencia a ralentizaciones", "Vida escalable"],
]

SCHEMA = """{
  "answer": "respuesta a las NOTAS DEL JUGADOR, tan larga como pida la pregunta (lo esencial del análisis), o \\"\\" si no hay notas",
  "summary": "UNA frase: la idea de la build para ESTA partida",
  "starting_items": ["ítem inicial", "..."],
  "core_items": ["ítem 1", "ítem 2", "ítem 3"],
  "boots": "botas",
  "situational": [{"item": "ítem", "when": "cuándo y contra quién comprarlo"}],
  "runes": {
    "primary_tree": "rama principal", "keystone": "piedra angular",
    "primary": ["runa", "runa", "runa"],
    "secondary_tree": "rama secundaria", "secondary": ["runa", "runa"],
    "shards": ["fragmento ofensivo", "fragmento flexible", "fragmento defensivo"]
  },
  "summoner_spells": ["Destello", "..."],
  "skill_order": {"max": ["Q", "E", "W"], "first_levels": "p. ej. Q-E-W"},
  "game_plan": {"early": "...", "mid": "...", "late": "..."},
  "matchup_tips": ["consejo concreto contra el rival de línea", "..."],
  "threats": [{"champion": "rival", "why": "por qué es peligroso y cómo jugarlo"}],
  "caveat": "una sola línea de duda si la hay, o null",
  "stats": [{"site": "u.gg", "url": "URL exacta de la página que leíste", "patch": "parche que muestra la página",
             "about": "qué mide: p. ej. Jax top, o Jax vs Darius", "win_rate": 51.2, "pick_rate": 6.3,
             "ban_rate": 4.1, "games": 12345, "tier": "A", "rank": "Esmeralda+"}]
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


def fetch(dest: Path, version: str | None = None) -> Path:
    """Descarga un snapshot de Data Dragon (es_MX) a dest/<versión>/."""
    if not version:
        with urllib.request.urlopen(f"{BASE}/api/versions.json", timeout=20) as r:
            version = json.load(r)[0]
    out = dest / version
    out.mkdir(parents=True, exist_ok=True)
    for f in FILES:
        with urllib.request.urlopen(f"{BASE}/cdn/{version}/data/{LOCALE}/{f}", timeout=30) as r:
            (out / f).write_bytes(r.read())
    return out


class GameData:
    def __init__(self, folder: Path):
        self.version = folder.name
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
        return "daño mágico (AP)"
    if a >= m + 3:
        return "daño físico (AD)"
    return "daño mixto"


def _tanky(c: dict) -> bool:
    return c["defense"] >= 7 or "Tank" in c["tags"]


def _describe(c: dict) -> str:
    tank = ", resistente" if _tanky(c) else ""
    return f"{c['name']} [{'/'.join(c['tags'])}; {_damage(c)}{tank}]"


def analysis_prompt(draft: dict, data: GameData) -> str:
    """Paso 1 (analysis_prompt de #6): análisis libre con búsqueda, sin listas ni esquema."""
    def get(cid: str) -> dict:
        if cid not in data.champions:
            raise KeyError(f"Campeón desconocido en Data Dragon: {cid}")
        return data.champions[cid]

    me = get(draft["champion"])
    allies = [get(a) for a in draft.get("allies", [])]
    enemies = [get(e) for e in draft.get("enemies", [])]
    lane = get(draft["lane_opponent"]) if draft.get("lane_opponent") else None

    p = [
        f"PARCHE ACTUAL: {data.patch} (versión de Data Dragon {data.version}). "
        "Todo lo que recomiendes debe ser válido en este parche. Algunas webs muestran el parche con la versión "
        f"del cliente ({data.version.rsplit('.', 1)[0]}): es el mismo parche, no lo descartes.\n",
        f"TU CAMPEÓN: {_describe(me)} — rol {draft['role']}",
    ]
    if lane:
        p.append(f"RIVAL DE LÍNEA: {_describe(lane)}")
    p.append("\nALIADOS (tu equipo, NO son rivales):")
    p += [f"- {_describe(a)}" for a in allies] or ["- (sin definir)"]
    p.append("\nRIVALES (equipo enemigo):")
    if enemies:
        p += [f"- {_describe(e)}" for e in enemies]
        ap = sum("AP" in _damage(e) for e in enemies)
        ad = sum("AD" in _damage(e) for e in enemies)
        tanks = sum(_tanky(e) for e in enemies)
        p.append(
            f"Perfil rival: {len(enemies)} rivales: {ap} con daño mágico, {ad} con daño físico, "
            f"{len(enemies) - ap - ad} mixtos, {tanks} resistentes."
        )
    else:
        p.append("- (sin definir)")
    if (draft.get("notes") or "").strip():
        p.append(f"\nNOTAS DEL JUGADOR: {draft['notes'].strip()}")
    me_name, role, patch = me["name"], draft["role"], data.patch
    p.append(
        "\nINSTRUCCIONES:\n"
        f"- PRIMERO, si tienes búsqueda web, busca la build de {me_name} {role} en el parche {patch} (u.gg, op.gg, "
        f"Mobalytics, Lolalytics…) y, si hay rival de línea, el matchup. Usa solo datos del parche {patch}; descarta "
        "los de parches anteriores, y no escribas cifras (win rate, pick rate, partidas): las cifras van aparte, en la "
        "tarjeta, donde se comprueban contra tu búsqueda.\n"
        "- Si hay NOTAS DEL JUGADOR, lo primero y lo principal es responder a fondo lo que preguntan o lo que cambia "
        "por esa situación (minuto, oro, marcador…), como lo haría un coach en el chat.\n"
        "- Después, más corta, la build para ESTA partida: página de runas entera con fragmentos, 2 hechizos, "
        "iniciales, 3 ítems principales en orden, botas y orden de habilidades. En situacionales, plan, claves del "
        "matchup y amenazas pon solo lo que cambia por ESTOS rivales (daño, curación, CC, tanques), no consejos "
        'genéricos. Nada de "la que prefieras" ni "mira u.gg".\n'
        "- No afirmes nada de lo que no estés seguro: mejor menos ítems situacionales y bien elegidos.\n"
        "- Usa los nombres en español del cliente (es_MX). Sé directo; nada de tablas largas."
    )
    return "\n".join(p) + "\n"


def card_prompt(data: GameData, analysis: str | None) -> str:
    """Paso 2 (card_prompt de #6): pasar el análisis a la tarjeta con los nombres del parche."""
    p = []
    if analysis is not None:
        p.append(f"ANÁLISIS:\n{analysis}\n\nPasa este análisis a una tarjeta.")
    else:
        p.append("Pasa TU análisis anterior a una tarjeta.")
    p.append(
        "No vuelvas a buscar ni cambies las decisiones del análisis: solo escríbelas con los nombres exactos de estas listas. Si un "
        "nombre no aparece, usa el equivalente de la lista que más se parezca."
    )
    names = lambda f: ", ".join(n for n, i in data.item_info.items() if f(i))  # noqa: E731
    p.append(
        f"\nÍTEMS DEL PARCHE {data.patch} (no uses componentes):\n"
        f"- INICIALES (solo para starting_items): {names(lambda i: i['starter'] and not i['support'])}\n"
        "- INICIAL DE SOPORTE (obligatorio en starting_items si juegas de soporte, y solo entonces): "
        f"{names(lambda i: i['support'])}\n"
        f"- BOTAS (solo para boots): {names(lambda i: i['completed'] and i['boots'])}\n"
        f"- COMPLETOS (para core_items y situational): {names(lambda i: i['completed'] and not i['boots'])}"
    )
    p.append(f"\nHECHIZOS DE INVOCADOR: {', '.join(data.spells)}")
    p.append(
        "\nRUNAS VÁLIDAS (rama: piedras angulares | fila 1 | fila 2 | fila 3). La piedra angular sale de la "
        "primera fila de la rama principal; las 3 runas principales, una por cada fila de esa rama; las 2 "
        "secundarias, de filas distintas de otra rama:"
    )
    for t in data.rune_trees:
        rows = [", ".join(r["name"] for r in s_["runes"]) for s_ in t["slots"]]
        p.append(f"- {t['name']}: {' | '.join(rows)}")
    p.append("\nFRAGMENTOS (uno por fila, en orden):")
    for i, row in enumerate(SHARDS):
        p.append(f"- Fila {i + 1}: {', '.join(row)}")
    p.append(
        "\nREGLAS:\n"
        '- "answer" es la respuesta a las notas del jugador ("" si no hay notas); "summary", UNA frase. Ningún campo '
        'lleva dudas ni correcciones ("no, mejor…", "ver abajo"): la duda, si la hay, va solo en "caveat".\n'
        '- En "stats" pon SOLO cifras que salieron en los resultados de tu búsqueda web en esta conversación (u.gg, '
        "op.gg, Mobalytics, Lolalytics, League of Graphs o METAsrc), con la URL exacta de ese resultado y el parche "
        'que indique; null en lo que no diga. Si no buscaste, "stats": []. Nunca cifras de memoria: se descartan las '
        "que no correspondan a un resultado de búsqueda.\n"
        "- Responde SOLO con un bloque ```json con esta forma:\n" + SCHEMA
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
    """Nombres fuera del parche, ítems en el hueco equivocado y campos vacíos (como validate + missing)."""
    bad = []
    role = (draft or {}).get("role")

    me = data.champions.get((draft or {}).get("champion", ""))

    def off_type(info):
        """Como off_type de #7: ítem ofensivo del tipo de daño contrario en un campeón claramente AP o AD."""
        if not me:
            return None
        has = lambda t: t in info["tags"]  # noqa: E731
        physical = has("Damage") or has("CriticalStrike")
        a, m = me["attack"], me["magic"]
        if m - a >= 5 and physical and not has("SpellDamage"):
            return "es de daño físico"
        if a - m >= 5 and has("SpellDamage") and not physical:
            return "es de poder de habilidad"
        return None

    def item(n, slot):
        if not n:
            return
        name = data.item_keys.get(normalize(n))
        if not name:
            bad.append(f"ítem {n} no existe")
            return
        info = data.item_info[name]
        if slot == "start" and not info["starter"] and not info["completed"]:
            bad.append(f"{name} es un componente, no un ítem inicial")
        elif slot == "start" and info["completed"]:
            bad.append(f"{name} no es un ítem inicial")
        elif slot == "start" and info["support"] and role != "support":
            bad.append(f"{name} es el inicial de soporte y tu rol es {role}")
        elif slot == "core" and off_type(info):
            bad.append(f"{name} {off_type(info)} y {me['name']} hace {_damage(me)}")
        elif slot == "boots" and not info["boots"]:
            bad.append(f"{name} no son botas")

    for n in card.get("starting_items") or []:
        item(n, "start")
    for n in card.get("core_items") or []:
        item(n, "core")
    item(card.get("boots") or "", "boots")
    for s_ in card.get("situational") or []:
        item((s_ or {}).get("item", ""), "core")
    starts = [data.item_keys.get(normalize(n)) for n in card.get("starting_items") or []]
    if role == "support" and starts and not any(n and data.item_info[n]["support"] for n in starts):
        bad.append("como soporte, los iniciales deben incluir el ítem de soporte")
    r = card.get("runes") or {}
    for t in (r.get("primary_tree"), r.get("secondary_tree")):
        if t and normalize(t) not in data.tree_keys:
            bad.append(f"rama {t}")
    for n in [r.get("keystone")] + list(r.get("primary") or []) + list(r.get("secondary") or []):
        if n and normalize(n) not in data.rune_keys:
            bad.append(f"runa {n}")
    if draft is not None:
        blank = lambda t: not str(t or "").strip()  # noqa: E731
        notes = not blank(draft.get("notes"))
        gp = card.get("game_plan") or {}
        for cond, what in [
            (notes and blank(card.get("answer")), '"answer": responde a las notas del jugador'),
            (blank(card.get("summary")), '"summary"'),
            (not card.get("starting_items"), '"starting_items"'),
            (len(card.get("core_items") or []) < 3, '"core_items": van 3 ítems completos'),
            (blank(card.get("boots")) and draft.get("champion") != "Cassiopeia", '"boots"'),
            (blank(r.get("primary_tree")) or blank(r.get("keystone")) or not r.get("primary"), "la rama principal"),
            (blank(r.get("secondary_tree")) or not r.get("secondary"), "la rama secundaria"),
            (not r.get("shards"), "los 3 fragmentos"),
            (len(card.get("summoner_spells") or []) != 2, '"summoner_spells": van 2 hechizos'),
            (not (card.get("skill_order") or {}).get("max"), '"skill_order.max"'),
            (blank(gp.get("early")) or blank(gp.get("mid")) or blank(gp.get("late")), '"game_plan"'),
        ]:
            if cond:
                bad.append(f"Falta {what}")
    return bad


def render_card(card: dict) -> str:
    """Convierte la tarjeta en texto para que el juez la lea como la vería el jugador."""
    r = card.get("runes") or {}
    sk = card.get("skill_order") or {}
    gp = card.get("game_plan") or {}
    lines = [
        *([f"Respuesta a tus notas: {card['answer']}"] if (card.get("answer") or "").strip() else []),
        card.get("summary", ""),
        "",
        f"Iniciales: {', '.join(card.get('starting_items') or [])}",
        f"Build principal: {' > '.join(card.get('core_items') or [])}",
        f"Botas: {card.get('boots', '')}",
        "Situacionales:",
        *[f"- {s.get('item')}: {s.get('when')}" for s in card.get("situational") or []],
        f"Runas: {r.get('primary_tree')} ({r.get('keystone')}; {', '.join(r.get('primary') or [])}) + "
        f"{r.get('secondary_tree')} ({', '.join(r.get('secondary') or [])}); "
        f"fragmentos: {', '.join(r.get('shards') or [])}",
        f"Hechizos: {' + '.join(card.get('summoner_spells') or [])}",
        f"Habilidades: maximizar {' > '.join(sk.get('max') or [])}; primeros niveles {sk.get('first_levels', '')}",
        f"Plan: early: {gp.get('early', '')} | mid: {gp.get('mid', '')} | late: {gp.get('late', '')}",
        "Claves del matchup:",
        *[f"- {t}" for t in card.get("matchup_tips") or []],
        "Amenazas:",
        *[f"- {t.get('champion')}: {t.get('why')}" for t in card.get("threats") or []],
    ]
    if card.get("caveat"):
        lines.append(f"Duda: {card['caveat']}")
    return "\n".join(lines)
