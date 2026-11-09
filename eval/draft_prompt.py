"""Réplica en Python del flujo `recommend_build` (src-tauri/src/recommend.rs).

Sirve para evaluar la tarjeta de build con el draft estructurado sin compilar la
app. Si cambia `build_prompt` o `validate` en Rust, actualiza también esto.
"""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from pathlib import Path

BASE = "https://ddragon.leagueoflegends.com"
LOCALE = "es_MX"
FILES = ("champion.json", "item.json", "runesReforged.json")

SCHEMA = """{
  "summary": "1-2 frases: la idea de la build para ESTA partida",
  "starting_items": ["ítem inicial", "..."],
  "core_items": ["ítem 1", "ítem 2", "ítem 3"],
  "boots": "botas",
  "situational": [{"item": "ítem", "when": "cuándo y contra quién comprarlo"}],
  "runes": {
    "primary_tree": "rama principal", "keystone": "piedra angular",
    "primary": ["runa", "runa", "runa"],
    "secondary_tree": "rama secundaria", "secondary": ["runa", "runa"]
  },
  "summoner_spells": ["Destello", "..."],
  "skill_order": {"max": ["Q", "E", "W"], "first_levels": "p. ej. Q-E-W"},
  "game_plan": {"early": "...", "mid": "...", "late": "..."},
  "matchup_tips": ["consejo concreto contra el rival de línea", "..."],
  "threats": [{"champion": "rival", "why": "por qué es peligroso y cómo jugarlo"}],
  "caveat": "una sola línea de duda si la hay, o null"
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
        names = set()
        for i in items.values():
            if (
                i.get("maps", {}).get("11")
                and i.get("gold", {}).get("purchasable")
                and i.get("inStore") is not False
                and not i.get("requiredChampion")
                and not i.get("requiredAlly")
            ):
                names.add(i["name"])
        self.items = sorted(names)
        self.item_keys = {normalize(n) for n in self.items}
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


def build_prompt(draft: dict, data: GameData) -> str:
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
        "Todo lo que recomiendes debe ser válido en este parche.\n",
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
    p.append("\nÍTEMS VÁLIDOS EN ESTE PARCHE (usa estos nombres exactos):\n" + ", ".join(data.items))
    p.append("\nRUNAS VÁLIDAS (rama: fila de piedras angulares | resto):")
    for t in data.rune_trees:
        rows = [", ".join(r["name"] for r in s["runes"]) for s in t["slots"]]
        p.append(f"- {t['name']}: {' | '.join(rows)}")
    p.append(
        "\nINSTRUCCIONES:\n"
        "- Da UNA recomendación concreta y completa: página de runas entera, 3 ítems principales en orden, "
        'botas, iniciales, hechizos y orden de habilidades. Nada de "la que prefieras" ni "mira u.gg".\n'
        "- Adáptala a ESTOS rivales (daño, curación, CC, tanques) y explica en \"situational\" y \"threats\" "
        "qué cambia contra cada amenaza.\n"
        f"- Si usas búsqueda web, usa solo datos del parche {data.patch} y descarta los de parches anteriores.\n"
        '- Si dudas de algo, ponlo en "caveat" en una sola línea; no lo repartas por toda la respuesta.\n'
        "- Responde SOLO con un objeto JSON válido, sin texto antes ni después, con esta forma:\n" + SCHEMA
    )
    return "\n".join(p) + "\n"


def parse_card(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def invalid_names(card: dict, data: GameData) -> list[str]:
    bad = []
    items = list(card.get("starting_items") or []) + list(card.get("core_items") or [])
    items.append(card.get("boots") or "")
    items += [(s or {}).get("item", "") for s in card.get("situational") or []]
    bad += [f"ítem {n}" for n in items if n and normalize(n) not in data.item_keys]
    r = card.get("runes") or {}
    for t in (r.get("primary_tree"), r.get("secondary_tree")):
        if t and normalize(t) not in data.tree_keys:
            bad.append(f"rama {t}")
    for n in [r.get("keystone")] + list(r.get("primary") or []) + list(r.get("secondary") or []):
        if n and normalize(n) not in data.rune_keys:
            bad.append(f"runa {n}")
    return bad


def render_card(card: dict) -> str:
    """Convierte la tarjeta en texto para que el juez la lea como la vería el jugador."""
    r = card.get("runes") or {}
    sk = card.get("skill_order") or {}
    gp = card.get("game_plan") or {}
    lines = [
        card.get("summary", ""),
        "",
        f"Iniciales: {', '.join(card.get('starting_items') or [])}",
        f"Build principal: {' > '.join(card.get('core_items') or [])}",
        f"Botas: {card.get('boots', '')}",
        "Situacionales:",
        *[f"- {s.get('item')}: {s.get('when')}" for s in card.get("situational") or []],
        f"Runas: {r.get('primary_tree')} ({r.get('keystone')}; {', '.join(r.get('primary') or [])}) + "
        f"{r.get('secondary_tree')} ({', '.join(r.get('secondary') or [])})",
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
