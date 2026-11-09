#!/usr/bin/env python3
"""Compara las respuestas del harness de League Coach contra el mismo modelo sin harness.

Usa el CLI oficial de Claude Code con la sesión del usuario (`claude auth login`),
igual que la app. Solo usa la biblioteca estándar de Python (3.10+).

Variantes:
  harness      igual que el chat de la app: prompt del coach (src-tauri/src/providers/prompts.rs)
               + búsqueda web.
  draft        igual que "Recomendar build" (recommend.rs): draft estructurado + parche +
               listas de ítems y runas de Data Dragon, respuesta en JSON. Solo en los casos
               con campo "draft"; necesita Data Dragon (--ddragon o --fetch-ddragon).
  baseline     el mismo modelo sin prompt del coach y sin herramientas.
  baseline_web el mismo modelo sin prompt del coach, con búsqueda web
               (sirve para separar el efecto del prompt del de la búsqueda web).

Todas las variantes y el juez corren aislados de la configuración del usuario
(sin CLAUDE.md, memorias, hooks, plugins ni MCP), como la app.

Ejemplos:
  py eval/run_eval.py                                    # harness contra baseline
  py eval/run_eval.py --only build-01-vs-ap-burst,ingame-01-behind
  py eval/run_eval.py --variants harness,baseline,baseline_web
  py eval/run_eval.py --with-images --image shot-01-shop=C:/capturas/tienda.jpg
  py eval/run_eval.py --variants draft,baseline --fetch-ddragon
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import datetime as dt
import hashlib
import json
import math
import mimetypes
import os
import random
import re
import shutil
import signal
import statistics
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import draft_prompt  # noqa: E402

# En Windows resuelve claude.cmd / claude.exe (subprocess sin shell no usa PATHEXT).
CLAUDE = shutil.which("claude")
# La app solo da búsqueda web al modelo (claude_code.rs).
WEB_TOOLS = "WebSearch"
# Aísla cada llamada de la configuración del usuario, igual que la app.
ISOLATION = ["--strict-mcp-config", "--setting-sources=", "--disable-slash-commands", "--permission-mode", "dontAsk"]
# base64 crece un 33 %; la API acepta unos 5 MB por imagen.
MAX_IMAGE_BYTES = 3_500_000

# Dimensiones de fondo (deciden el resultado) y restricciones (no pueden empeorar).
FONDO = {"precision": 3, "contexto": 3, "accionabilidad": 2}
RESTRICCIONES = ["formato", "honestidad", "cumplimiento"]
DIMS = list(FONDO) + RESTRICCIONES
MIN_POR_CATEGORIA = 4


# ---------------------------------------------------------------- utilidades


def load_coach_prompt(path: Path, lang: str = "en") -> str:
    """Extracts COACH from prompts.rs (Rust `\\` continuations applied) plus the answer-language
    line that `prompts::coach(lang)` appends since #8."""
    src = path.read_text(encoding="utf-8")
    m = re.search(r'(?:pub )?const COACH: &str = "(.*?)";', src, re.S)
    if not m:
        sys.exit(f"`const COACH` not found in {path}")
    body = re.sub(r"\\\n\s*", "", m.group(1))
    body = body.replace('\\"', '"').replace("\\n", "\n")
    if "pub fn coach(lang" in src:
        body += "\n- " + draft_prompt.ANSWER_INSTRUCTION[lang]
    return body


def sh(cmd: list[str]) -> str:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", timeout=30).stdout.strip()
    except Exception:  # noqa: BLE001
        return ""


def build_message(prompt: str, image: Path | None) -> str:
    content: list[dict] = []
    if image:
        size = image.stat().st_size
        if size > MAX_IMAGE_BYTES:
            print(
                f"Aviso: {image.name} pesa {size / 1e6:.1f} MB y puede superar el límite de la API. "
                "Guárdala como JPG o recórtala.",
                file=sys.stderr,
            )
        media = mimetypes.guess_type(image.name)[0] or "image/png"
        data = base64.b64encode(image.read_bytes()).decode()
        content.append({"type": "image", "source": {"type": "base64", "media_type": media, "data": data}})
    content.append({"type": "text", "text": prompt})
    return json.dumps({"type": "user", "message": {"role": "user", "content": content}}) + "\n"


def _kill_tree(proc: subprocess.Popen) -> None:
    # En Windows matar cmd.exe deja vivo al node hijo; taskkill /T se lleva el árbol.
    if os.name == "nt":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    else:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def run_claude(
    prompt: str,
    *,
    system_file: Path | None,
    tools: str,
    model: str | None,
    image: Path | None = None,
    timeout: int = 300,
) -> dict:
    args = [
        CLAUDE or "claude",
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--no-session-persistence",
        *ISOLATION,
        "--tools",
        tools,
    ]
    if tools:
        args += ["--allowedTools", tools]
    if system_file:
        args += ["--append-system-prompt-file", str(system_file)]
    if model:
        args += ["--model", model]

    # Directorio vacío, como el workspace propio de la app.
    with tempfile.TemporaryDirectory(prefix="coach-eval-", ignore_cleanup_errors=True) as cwd:
        popen_kw = (
            {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
        )
        proc = subprocess.Popen(
            args,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=cwd,
            **popen_kw,
        )
        try:
            stdout, stderr = proc.communicate(build_message(prompt, image), timeout=timeout)
        except subprocess.TimeoutExpired:
            _kill_tree(proc)
            proc.communicate()
            return {"ok": False, "text": "", "error": f"timeout ({timeout}s)"}

    result, init, tool_calls = None, None, []
    for line in stdout.splitlines():
        try:
            v = json.loads(line)
        except json.JSONDecodeError:
            continue
        if v.get("type") == "system" and v.get("subtype") == "init":
            # Deja constancia de qué tuvo de verdad cada llamada.
            init = {k: v.get(k) for k in ("model", "tools", "mcp_servers")}
        elif v.get("type") == "assistant":
            for b in (v.get("message") or {}).get("content") or []:
                if b.get("type") in ("tool_use", "server_tool_use"):
                    tool_calls.append({"name": b.get("name"), "input": b.get("input")})
        elif v.get("type") == "result":
            result = v
    if not result:
        return {"ok": False, "text": "", "error": (stderr or stdout)[-800:], "init": init}
    return {
        "ok": not result.get("is_error") and result.get("subtype") == "success",
        "text": result.get("result", ""),
        "error": result.get("result") if result.get("is_error") else None,
        "cost_usd": result.get("total_cost_usd"),
        "duration_ms": result.get("duration_ms"),
        "tool_calls": tool_calls,
        "init": init,
    }


def parse_json(text: str) -> dict | None:
    """Primer objeto JSON decodificable del texto (tolera texto o ```json alrededor)."""
    dec = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch == "{":
            try:
                obj, _ = dec.raw_decode(text, i)
            except json.JSONDecodeError:
                continue
            if isinstance(obj, dict):
                return obj
    return None


# ---------------------------------------------------------------- juez

JUDGE_TEMPLATE = """You are an expert League of Legends judge. You will evaluate two answers from a
coach to the same player question. You don't know which system produced each one.

Game patch for this evaluation: {patch}. Your knowledge may be outdated: if you doubt
a patch fact, verify it with web search; if you can't verify it, don't count it as
right or wrong, and list it in "datos_incorrectos" as "not verified".
The coach must answer in English unless the player explicitly asked for another
language; then it must answer in that language. Item, rune and ability names follow
the answer's language: official en_US names in English, official es_MX or English
names in Spanish (e.g. "Hacha Hogareña"). Don't treat a name as invented just because
you don't recognize it; verify it or mark it "not verified".
Score the CONTENT of the advice, not the style: citing sources or the patch doesn't
make up for recommending something weak or wrong.

## Rubric
{rubric}

## Player question
{prompt}
{image_note}
## Expected criteria for this case
{criterios}

## Serious errors for this case
{errores}

## Reference facts (verified, to measure accuracy)
{hechos}

## Answer A
{a}

## Answer B
{b}

Return ONLY a JSON object, with no surrounding text, in this shape (integer scores from 1 to 5).
Keep the keys exactly as written; write the text values in English:
{{"A": {{"precision": n, "contexto": n, "accionabilidad": n, "formato": n, "honestidad": n,
"cumplimiento": n, "errores_graves": ["serious error from the list that it commits, if any"],
"hechos": ["acertado|fallado|no_mencionado", "... one per reference fact, in order"],
"comentario": "one sentence"}},
 "B": {{...same...}},
 "datos_incorrectos": ["invented, wrong or unverified fact and which answer"],
 "veredicto": "one or two sentences comparing A and B"}}
"""


def clean_scores(s: object, n_hechos: int) -> dict | None:
    """Valida las notas del juez y aplica en código la regla de errores graves del rubric."""
    if not isinstance(s, dict):
        return None
    out = {}
    for k in DIMS:
        v = s.get(k)
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not 1 <= v <= 5:
            return None
        out[k] = int(round(v))
    graves = [str(g) for g in (s.get("errores_graves") or []) if str(g).strip()]
    if graves:
        out["precision"] = min(out["precision"], 2)
        out["contexto"] = min(out["contexto"], 2)
    hechos = s.get("hechos") if isinstance(s.get("hechos"), list) else []
    out["hechos"] = [str(h).strip().lower() for h in hechos][:n_hechos]
    out["errores_graves"] = graves
    out["comentario"] = s.get("comentario", "")
    out["fondo"] = round(sum(FONDO[k] * out[k] for k in FONDO) / sum(FONDO.values()), 3)
    return out


def judge_once(case: dict, first: str, second: str, rubric: str, model: str | None, image: Path | None, patch: str):
    hechos = case.get("hechos") or []
    prompt = JUDGE_TEMPLATE.format(
        patch=patch,
        rubric=rubric,
        prompt=case["prompt"],
        image_note="\n(The player attached the screenshot you see in this message.)\n" if image else "",
        criterios="\n".join(f"- {c}" for c in case.get("criterios", [])),
        errores="\n".join(f"- {c}" for c in case.get("errores_graves", [])) or "- (none)",
        hechos="\n".join(f"{i + 1}. {h}" for i, h in enumerate(hechos)) or "(none for this case)",
        a=first or "(sin respuesta)",
        b=second or "(sin respuesta)",
    )
    out = run_claude(prompt, system_file=None, tools=WEB_TOOLS, model=model, image=image, timeout=600)
    data = parse_json(out["text"]) if out["ok"] else None
    sa = clean_scores(data.get("A"), len(hechos)) if data else None
    sb = clean_scores(data.get("B"), len(hechos)) if data else None
    meta = {
        "cost_usd": out.get("cost_usd"),
        "init": out.get("init"),
        "busquedas": [c.get("input") for c in out.get("tool_calls") or []],
    }
    if not sa or not sb:
        return None, None, {"error": out.get("error") or "salida del juez inválida", "raw": out["text"][-1500:], **meta}
    return sa, sb, {
        "datos_incorrectos": data.get("datos_incorrectos") or [],
        "veredicto": data.get("veredicto", ""),
        **meta,
    }


def judge_pair(case, ans_main, ans_other, rubric, model, image, patch, repeats):
    """Juzga el par en los dos órdenes (A/B y B/A), `repeats` veces cada uno."""
    rounds = []
    for _ in range(repeats):
        for main_first in (True, False):
            a, b = (ans_main, ans_other) if main_first else (ans_other, ans_main)
            sa, sb, meta = judge_once(case, a, b, rubric, model, image, patch)
            if sa is None:
                rounds.append({"main_first": main_first, "error": meta})
                continue
            sm, so = (sa, sb) if main_first else (sb, sa)
            rounds.append({"main_first": main_first, "main": sm, "other": so, **meta})
    return rounds


# ---------------------------------------------------------------- estadística


def mean(xs):
    return sum(xs) / len(xs) if xs else float("nan")


def bootstrap_ci(diffs, seed, n=5000):
    if len(diffs) < 2:
        return (float("nan"), float("nan"))
    rng = random.Random(seed)
    ms = sorted(mean([rng.choice(diffs) for _ in diffs]) for _ in range(n))
    return (ms[int(0.025 * n)], ms[int(0.975 * n) - 1])


def sign_test_p(wins, losses):
    """p de una cola de que `wins` o más victorias salgan por azar (p=0,5)."""
    n = wins + losses
    if n == 0:
        return 1.0
    return sum(math.comb(n, k) for k in range(wins, n + 1)) / 2**n


def summarize_case(rounds):
    ok = [r for r in rounds if "main" in r]
    if not ok:
        return None
    diffs = [r["main"]["fondo"] - r["other"]["fondo"] for r in ok]
    d = mean(diffs)
    sd = statistics.stdev(diffs) if len(diffs) > 1 else 0.0
    by_order = {mf: mean([x for r, x in zip(ok, diffs) if r["main_first"] == mf]) for mf in (True, False)}
    both_orders = all(not math.isnan(v) for v in by_order.values())
    consistent = both_orders and (by_order[True] > 0) == (by_order[False] > 0)
    tie_band = max(0.25, sd)
    if abs(d) < tie_band or (both_orders and not consistent):
        res = 0
    else:
        res = 1 if d > 0 else -1
    dims = {
        side: {k: mean([r[side][k] for r in ok]) for k in DIMS + ["fondo"]} for side in ("main", "other")
    }
    hechos = {side: [h for r in ok for h in r[side]["hechos"]] for side in ("main", "other")}
    return {
        "diff": d,
        "sd": sd,
        "result": res,
        "consistent": consistent,
        "n_judgments": len(ok),
        "n_errors": len(rounds) - len(ok),
        "dims": dims,
        "hechos": hechos,
    }


# ---------------------------------------------------------------- informe


def fmt(x, nd=2):
    return "—" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.{nd}f}"


def render_report(results, variants, skipped, meta, seed):
    main_v = variants[0]
    lines = [f"# Evaluación del coach: `{main_v}` contra {', '.join(f'`{v}`' for v in variants[1:])}", ""]
    lines += ["## Ejecución", ""]
    for k in ("fecha", "git_sha", "prompt_sha256", "cli_version", "modelo", "modelo_juez", "parche", "seed", "juicios_por_par"):
        lines.append(f"- {k}: `{meta.get(k)}`")
    lines.append("")
    for other in variants[1:]:
        rows, per_case, cats = [], [], {}
        for r in results:
            cid, cat = r["case"]["id"], r["case"]["categoria"]
            if r.get("error"):
                rows.append(f"| {cid} | {cat} | — | — | — | error: {r['error'][:60]} |")
                continue
            s = summarize_case(r["judged"].get(other, []))
            if not s:
                rows.append(f"| {cid} | {cat} | — | — | — | error del juez |")
                continue
            per_case.append(s)
            cats.setdefault(cat, []).append(s)
            res = {1: f"gana {main_v}", -1: f"gana {other}", 0: "empate"}[s["result"]]
            if not s["consistent"]:
                res += " (cambia con el orden)"
            rows.append(
                f"| {cid} | {cat} | {fmt(s['dims']['main']['fondo'])} | {fmt(s['dims']['other']['fondo'])} "
                f"| {fmt(s['diff'])} ± {fmt(s['sd'])} | {res} |"
            )
        diffs = [s["diff"] for s in per_case]
        wins = sum(s["result"] == 1 for s in per_case)
        losses = sum(s["result"] == -1 for s in per_case)
        ties = len(per_case) - wins - losses
        lo, hi = bootstrap_ci(diffs, seed)
        p = sign_test_p(wins, losses)
        consistency = mean([1.0 if s["consistent"] else 0.0 for s in per_case]) * 100 if per_case else float("nan")
        judge_sd = mean([s["sd"] for s in per_case])
        n_err = sum(s["n_errors"] for s in per_case) + sum(1 for r in results if r.get("error"))
        restr = {
            k: mean([s["dims"]["main"][k] for s in per_case]) - mean([s["dims"]["other"][k] for s in per_case])
            for k in RESTRICCIONES
        }
        restr_ok = all(v >= -0.25 for v in restr.values())
        superior = not math.isnan(lo) and lo > 0 and restr_ok
        lines += [
            f"## `{main_v}` contra `{other}`",
            "",
            f"- Casos válidos: {len(per_case)} (juicios fallidos o casos con error: {n_err})",
            f"- Fondo (precisión, contexto, accionabilidad): **{fmt(mean([s['dims']['main']['fondo'] for s in per_case]))}** "
            f"contra **{fmt(mean([s['dims']['other']['fondo'] for s in per_case]))}**; "
            f"diferencia media {fmt(mean(diffs))}, IC 95 % bootstrap [{fmt(lo)}, {fmt(hi)}]",
            f"- Victorias / derrotas / empates: {wins} / {losses} / {ties}; test de signos p = {fmt(p, 3)}",
            f"- Consistencia al invertir el orden A/B: {fmt(consistency, 0)} %; ruido del juez (desv. típica media de la diferencia): {fmt(judge_sd)}",
            "- Restricciones (no peor que el rival por más de 0,25): "
            + ", ".join(f"{k} {'+' if v >= 0 else ''}{fmt(v)}" for k, v in restr.items()),
            f"- Veredicto: **{'superior' if superior else 'no se demuestra que sea superior'}**"
            " (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)",
            "",
            "### Por dimensión",
            "",
            f"| Dimensión | {main_v} | {other} |",
            "|---|---|---|",
        ]
        for k in DIMS:
            lines.append(
                f"| {k} | {fmt(mean([s['dims']['main'][k] for s in per_case]))} | {fmt(mean([s['dims']['other'][k] for s in per_case]))} |"
            )
        hm = [h for s in per_case for h in s["hechos"]["main"]]
        ho = [h for s in per_case for h in s["hechos"]["other"]]
        if hm or ho:
            pct = lambda hs, k: fmt(100 * hs.count(k) / len(hs), 0) if hs else "—"  # noqa: E731
            lines += [
                "",
                "### Hechos de referencia",
                "",
                f"| | {main_v} | {other} |",
                "|---|---|---|",
                f"| acertados % | {pct(hm, 'acertado')} | {pct(ho, 'acertado')} |",
                f"| fallados % | {pct(hm, 'fallado')} | {pct(ho, 'fallado')} |",
            ]
        lines += ["", "### Por categoría", "", f"| Categoría | casos | {main_v} | {other} | aviso |", "|---|---|---|---|---|"]
        for c, ss in sorted(cats.items()):
            a = mean([s["dims"]["main"]["fondo"] for s in ss])
            b = mean([s["dims"]["other"]["fondo"] for s in ss])
            note = "pocos casos" if len(ss) < MIN_POR_CATEGORIA else ("pierde" if a < b else "")
            lines.append(f"| {c} | {len(ss)} | {fmt(a)} | {fmt(b)} | {note} |")
        lines += ["", "### Casos", "", f"| Caso | Categoría | {main_v} | {other} | diferencia ± juez | Resultado |", "|---|---|---|---|---|---|", *rows, ""]

    lines += ["## Veredictos del juez (orden A = variante principal)", ""]
    for r in results:
        for other, rounds in (r.get("judged") or {}).items():
            for rd in rounds:
                if rd.get("main_first") and rd.get("veredicto"):
                    lines.append(f"- **{r['case']['id']}** ({main_v} contra {other}): {rd['veredicto']}")
                    bad = rd.get("datos_incorrectos")
                    if bad:
                        lines.append(f"  - Datos señalados: {'; '.join(map(str, bad))}")
                    break
    lines += ["", "## Coste y herramientas", "", "| Variante | Coste USD | Llamadas a herramientas | Errores |", "|---|---|---|---|"]
    for v in variants:
        ans = [r["answers"][v] for r in results if v in (r.get("answers") or {})]
        cost = sum(a.get("cost_usd") or 0 for a in ans)
        calls = sum(len(a.get("tool_calls") or []) for a in ans)
        errs = sum(1 for a in ans if not a.get("ok"))
        lines.append(f"| {v} | {cost:.2f} | {calls} | {errs} |")
    jc = sum(rd.get("cost_usd") or 0 for r in results for rr in (r.get("judged") or {}).values() for rd in rr)
    lines.append(f"| juez | {jc:.2f} | — | — |")
    if "draft" in variants:
        bad = [(r["case"]["id"], n) for r in results for n in (r.get("answers") or {}).get("draft", {}).get("invalid", [])]
        lines += ["", "## Nombres fuera del parche en la tarjeta (tras la ronda de corrección)", ""]
        lines += [f"- {cid}: {n}" for cid, n in bad] or ["- Ninguno"]
    if skipped:
        lines += ["", "## Casos omitidos", ""] + [f"- {cid}: {why}" for cid, why in skipped]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cases", default=str(ROOT / "eval" / "cases.json"))
    ap.add_argument("--rubric", default=str(ROOT / "eval" / "rubric.md"))
    ap.add_argument("--prompt-rs", default=str(ROOT / "src-tauri" / "src" / "providers" / "prompts.rs"))
    ap.add_argument("--only", help="ids separados por comas")
    ap.add_argument("--variants", default="harness,baseline", help="la primera se compara contra cada una de las demás")
    ap.add_argument("--model", help="modelo para las respuestas (por defecto el del CLI)")
    ap.add_argument("--judge-model", help="modelo del juez; mejor uno distinto al que responde")
    ap.add_argument("--judge-repeats", type=int, default=1, help="juicios por orden; cada par se juzga en A/B y B/A")
    ap.add_argument("--with-images", action="store_true", help="incluir casos con pantallazo")
    ap.add_argument("--image", action="append", default=[], metavar="ID=RUTA", help="imagen para un caso de pantallazo")
    ap.add_argument("--patch", help="parche que se le dice al juez (por defecto el de Data Dragon si se usa)")
    ap.add_argument("--ddragon", help="carpeta con los JSON de Data Dragon de un idioma; su nombre es la versión")
    ap.add_argument("--lang", default="en", choices=["en", "es"],
                    help="app language (Settings): answer-language line of the coach and draft prompts; es needs es_MX Data Dragon")
    ap.add_argument("--locale", default=draft_prompt.LOCALE, help="idioma de Data Dragon para --fetch-ddragon (en_US; es_MX para probar español)")
    ap.add_argument("--fetch-ddragon", action="store_true", help="descargar el último Data Dragon a eval/ddragon/")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--out", default=str(ROOT / "eval" / "results"))
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    # En Windows la consola o la redirección usan cp1252; forzamos UTF-8.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except AttributeError:
            pass
    if not CLAUDE:
        sys.exit("No encuentro `claude` en el PATH. Instala Claude Code e inicia sesión con `claude auth login`.")

    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    if args.only:
        wanted = set(args.only.split(","))
        cases = [c for c in cases if c["id"] in wanted]
    rubric = Path(args.rubric).read_text(encoding="utf-8")
    variants = args.variants.split(",")
    images = dict(x.split("=", 1) for x in args.image)

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = Path(args.out) / stamp
    out_dir.mkdir(parents=True, exist_ok=True)
    coach_text = load_coach_prompt(Path(args.prompt_rs), args.lang)
    coach_file = out_dir / "coach-prompt.md"
    coach_file.write_text(coach_text, encoding="utf-8")

    data = None
    folder = Path(args.ddragon) if args.ddragon else None
    if args.fetch_ddragon:
        folder = draft_prompt.fetch(ROOT / "eval" / "ddragon", locale=args.locale)
    if folder:
        data = draft_prompt.GameData(folder, args.lang)
        print(f"Data Dragon {data.version} (parche {data.patch})", file=sys.stderr)
    if "draft" in variants and not data:
        sys.exit("La variante draft necesita Data Dragon: usa --fetch-ddragon o --ddragon <carpeta>.")
    patch = args.patch or (data.patch if data else "desconocido (no supongas uno concreto)")

    cfg = {
        "harness": dict(system_file=coach_file, tools=WEB_TOOLS),
        "draft": dict(system_file=coach_file, tools=WEB_TOOLS),
        "baseline": dict(system_file=None, tools=""),
        "baseline_web": dict(system_file=None, tools=WEB_TOOLS),
    }

    def answer(c: dict, v: str, image: Path | None) -> dict:
        if v != "draft":
            return run_claude(c["prompt"], model=args.model, image=image, **cfg[v])
        # Paso 1 (#6): análisis libre con búsqueda web, como una pregunta al coach.
        first = run_claude(draft_prompt.analysis_prompt(c["draft"], data), model=args.model, image=image, **cfg[v])
        if not first["ok"]:
            return {**first, "invalid": []}
        analysis = first["text"].strip()
        # Paso 2: pasar el análisis a la tarjeta. La app lo hace en la misma sesión;
        # sin sesión (aquí) pega el análisis en el pedido, que es su otra rama.
        prompt = draft_prompt.card_prompt(data, analysis)
        out = run_claude(prompt, model=args.model, image=image, **cfg[v])
        out = {**out, "cost_usd": (first.get("cost_usd") or 0) + (out.get("cost_usd") or 0),
               "tool_calls": (first.get("tool_calls") or []) + (out.get("tool_calls") or [])}
        card = draft_prompt.parse_card(out["text"]) if out["ok"] else None
        # Igual que recommend_build: una ronda de corrección si el JSON no se lee,
        # hay nombres fuera del parche o en el hueco equivocado, o faltan campos.
        reason = None
        if out["ok"] and card is None:
            reason = "Your answer couldn't be read as JSON."
        elif card is not None:
            bad = draft_prompt.invalid_names(card, data, c["draft"])
            if bad:
                reason = (f"There are problems with patch {data.patch}: {'; '.join(bad)}. "
                          "Fix them using only the valid lists.")
        if reason:
            fix = run_claude(
                f"{prompt}\n\nYOUR PREVIOUS ANSWER:\n{out['text']}\n\n{reason} "
                "Without searching again, reply again with ONLY the complete JSON object, in the same shape.",
                model=args.model, image=image, **cfg[v],
            )
            fixed = draft_prompt.parse_card(fix["text"]) if fix["ok"] else None
            if fixed is not None:
                card = fixed
                out = {**fix, "cost_usd": (out.get("cost_usd") or 0) + (fix.get("cost_usd") or 0),
                       "tool_calls": (out.get("tool_calls") or []) + (fix.get("tool_calls") or []), "corrected": True}
        out["analysis"] = analysis
        if card is None:
            return {**out, "ok": False, "error": out.get("error") or "JSON ilegible", "invalid": []}
        return {**out, "raw": out["text"], "text": draft_prompt.render_card(card, data.lang), "invalid": draft_prompt.invalid_names(card, data, c["draft"])}

    runnable, skipped = [], []
    for c in cases:
        if c.get("imagen"):
            if not args.with_images:
                skipped.append((c["id"], "caso con pantallazo; usa --with-images"))
                continue
            path = Path(images[c["id"]]) if c["id"] in images else None
            if not path:
                found = sorted((ROOT / "eval" / "images").glob(f"{c['id']}.*"))
                path = found[0] if found else None
            if not path or not path.exists():
                skipped.append((c["id"], "falta la imagen (ponla en eval/images/<id>.* o usa --image)"))
                continue
            c = {**c, "_image": str(path)}
        if "draft" in variants and not c.get("draft"):
            skipped.append((c["id"], "sin campo draft (la variante draft solo aplica a builds y matchups)"))
            continue
        runnable.append(c)

    jsonl = out_dir / "results.jsonl"

    def run_case(c: dict) -> dict:
        image = Path(c["_image"]) if c.get("_image") else None
        try:
            answers = {v: answer(c, v, image) for v in variants}
            judged = {
                other: judge_pair(c, answers[variants[0]]["text"], answers[other]["text"], rubric,
                                  args.judge_model, image, patch, args.judge_repeats)
                for other in variants[1:]
            }
            res = {"case": c, "answers": answers, "judged": judged}
            print(f"  ok {c['id']}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 - un caso no debe tirar toda la corrida
            res = {"case": c, "error": f"{type(e).__name__}: {e}"}
            print(f"  ERROR {c['id']}: {res['error']}", file=sys.stderr)
        with open(jsonl, "a", encoding="utf-8") as f:
            f.write(json.dumps(res, ensure_ascii=False) + "\n")
        return res

    print(f"Ejecutando {len(runnable)} casos ({', '.join(variants)}) -> {out_dir}", file=sys.stderr)
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        results = list(ex.map(run_case, runnable))
    order = {c["id"]: i for i, c in enumerate(runnable)}
    results.sort(key=lambda r: order[r["case"]["id"]])

    def first_init(key):
        for r in results:
            for a in (r.get("answers") or {}).values() if key == "answers" else (
                rd for rr in (r.get("judged") or {}).values() for rd in rr
            ):
                if (a.get("init") or {}).get("model"):
                    return a["init"]["model"]
        return None

    meta = {
        "fecha": dt.datetime.now().isoformat(timespec="seconds"),
        "git_sha": sh(["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"]),
        "prompt_sha256": hashlib.sha256(coach_text.encode()).hexdigest()[:12],
        "cli_version": sh([CLAUDE, "--version"]),
        "modelo": args.model or first_init("answers"),
        "modelo_juez": args.judge_model or first_init("judged"),
        "parche": patch,
        "ddragon": data.version if data else None,
        "seed": args.seed,
        "juicios_por_par": 2 * args.judge_repeats,
        "variantes": variants,
        "args": vars(args),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    report = render_report(results, variants, skipped, meta, args.seed)
    (out_dir / "report.md").write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
