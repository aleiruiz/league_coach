#!/usr/bin/env python3
"""Compara las respuestas del harness de League Coach contra el mismo modelo sin harness.

Usa el CLI oficial de Claude Code con la sesión del usuario (`claude auth login`),
igual que la app. Solo usa la biblioteca estándar de Python.

Variantes:
  harness      igual que la app: prompt del coach (src-tauri/src/providers/prompts.rs)
               + herramientas WebSearch/WebFetch.
  baseline     el mismo modelo sin prompt del coach y sin herramientas.
  baseline_web el mismo modelo sin prompt del coach, con WebSearch/WebFetch
               (sirve para separar el efecto del prompt del de la búsqueda web).

Ejemplos:
  python3 eval/run_eval.py                       # todos los casos de texto
  python3 eval/run_eval.py --only build-01-vs-ap-burst,ingame-01-behind
  python3 eval/run_eval.py --variants harness,baseline_web
  python3 eval/run_eval.py --with-images         # incluye los casos con pantallazo
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import datetime as dt
import json
import mimetypes
import random
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_TOOLS = "WebSearch,WebFetch"
WEIGHTS = {
    "precision": 3,
    "contexto": 3,
    "accionabilidad": 2,
    "formato": 1,
    "honestidad": 1,
    "cumplimiento": 1,
}


def load_coach_prompt(path: Path) -> str:
    """Extrae la constante COACH de prompts.rs, aplicando las continuaciones `\\` de Rust."""
    src = path.read_text(encoding="utf-8")
    m = re.search(r'pub const COACH: &str = "(.*?)";', src, re.S)
    if not m:
        sys.exit(f"No encontré `pub const COACH` en {path}")
    body = re.sub(r"\\\n\s*", "", m.group(1))
    return body.replace('\\"', '"').replace("\\n", "\n")


def build_message(prompt: str, image: Path | None) -> str:
    content: list[dict] = []
    if image:
        media = mimetypes.guess_type(image.name)[0] or "image/png"
        data = base64.b64encode(image.read_bytes()).decode()
        content.append(
            {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}}
        )
    content.append({"type": "text", "text": prompt})
    msg = {"type": "user", "message": {"role": "user", "content": content}}
    return json.dumps(msg) + "\n"


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
        "claude",
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--no-session-persistence",
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
    with tempfile.TemporaryDirectory(prefix="coach-eval-") as cwd:
        try:
            proc = subprocess.run(
                args,
                input=build_message(prompt, image),
                capture_output=True,
                text=True,
                cwd=cwd,
                timeout=timeout,
                encoding="utf-8",
            )
        except subprocess.TimeoutExpired:
            return {"ok": False, "text": "", "error": f"timeout ({timeout}s)"}

    result, tool_uses = None, 0
    for line in proc.stdout.splitlines():
        try:
            v = json.loads(line)
        except json.JSONDecodeError:
            continue
        if v.get("type") == "result":
            result = v
        elif v.get("type") == "assistant":
            content = (v.get("message") or {}).get("content") or []
            tool_uses += sum(1 for b in content if b.get("type") in ("tool_use", "server_tool_use"))
    if not result:
        return {"ok": False, "text": "", "error": (proc.stderr or proc.stdout)[-800:]}
    return {
        "ok": not result.get("is_error") and result.get("subtype") == "success",
        "text": result.get("result", ""),
        "error": None if not result.get("is_error") else result.get("result"),
        "cost_usd": result.get("total_cost_usd"),
        "duration_ms": result.get("duration_ms"),
        "web_searches": tool_uses,
    }


JUDGE_TEMPLATE = """Eres un juez experto en League of Legends (nivel Diamante+, conoces el parche actual).
Vas a evaluar dos respuestas de un coach a la misma pregunta de un jugador. No sabes qué
sistema generó cada una. Puedes usar la búsqueda web para verificar ítems, runas o
mecánicas del parche actual si dudas de algún dato. Sé estricto con los datos inventados.

## Rubric
{rubric}

## Pregunta del jugador
{prompt}
{image_note}
## Criterios esperados para este caso
{criterios}

## Errores graves para este caso
{errores}

## Respuesta A
{a}

## Respuesta B
{b}

Devuelve SOLO un objeto JSON, sin texto alrededor, con esta forma:
{{"A": {{"precision": n, "contexto": n, "accionabilidad": n, "formato": n, "honestidad": n,
"cumplimiento": n, "errores_graves": ["..."], "comentario": "una frase"}},
 "B": {{...igual...}},
 "datos_incorrectos": ["dato inventado o erróneo y en qué respuesta"],
 "veredicto": "una o dos frases comparando A y B"}}
"""


def weighted(scores: dict) -> float:
    total = sum(WEIGHTS[k] * float(scores.get(k, 1)) for k in WEIGHTS)
    return round(total / sum(WEIGHTS.values()), 2)


def parse_json(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def judge(case: dict, ans_x: str, ans_y: str, rubric: str, model: str | None, image: Path | None):
    """Devuelve (scores_x, scores_y, raw). Aleatoriza qué respuesta es A."""
    swap = random.random() < 0.5
    a, b = (ans_y, ans_x) if swap else (ans_x, ans_y)
    prompt = JUDGE_TEMPLATE.format(
        rubric=rubric,
        prompt=case["prompt"],
        image_note="\n(El jugador adjuntó el pantallazo que ves en este mensaje.)\n" if image else "",
        criterios="\n".join(f"- {c}" for c in case.get("criterios", [])),
        errores="\n".join(f"- {c}" for c in case.get("errores_graves", [])) or "- (ninguno)",
        a=a or "(sin respuesta)",
        b=b or "(sin respuesta)",
    )
    out = run_claude(prompt, system_file=None, tools=WEB_TOOLS, model=model, image=image, timeout=600)
    data = parse_json(out["text"]) if out["ok"] else None
    if not data or "A" not in data or "B" not in data:
        return None, None, out
    sa, sb = data["A"], data["B"]
    for s in (sa, sb):
        s["total"] = weighted(s)
    sx, sy = (sb, sa) if swap else (sa, sb)
    return sx, sy, {"swap": swap, **data, "cost_usd": out.get("cost_usd")}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cases", default=str(ROOT / "eval" / "cases.json"))
    ap.add_argument("--rubric", default=str(ROOT / "eval" / "rubric.md"))
    ap.add_argument("--prompt-rs", default=str(ROOT / "src-tauri" / "src" / "providers" / "prompts.rs"))
    ap.add_argument("--only", help="ids separados por comas")
    ap.add_argument("--variants", default="harness,baseline", help="la primera se compara contra cada una de las demás")
    ap.add_argument("--model", help="modelo para las respuestas (por defecto el del CLI)")
    ap.add_argument("--judge-model", help="modelo del juez (por defecto el del CLI)")
    ap.add_argument("--with-images", action="store_true", help="incluir casos con pantallazo")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--out", default=str(ROOT / "eval" / "results"))
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    if not shutil.which("claude"):
        sys.exit("No encuentro `claude` en el PATH. Instala Claude Code e inicia sesión con `claude auth login`.")
    random.seed(args.seed)

    cases = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    if args.only:
        wanted = set(args.only.split(","))
        cases = [c for c in cases if c["id"] in wanted]
    rubric = Path(args.rubric).read_text(encoding="utf-8")
    variants = args.variants.split(",")

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = Path(args.out) / stamp
    out_dir.mkdir(parents=True, exist_ok=True)
    coach_file = out_dir / "coach-prompt.md"
    coach_file.write_text(load_coach_prompt(Path(args.prompt_rs)), encoding="utf-8")

    def variant_cfg(name: str):
        return {
            "harness": dict(system_file=coach_file, tools=WEB_TOOLS),
            "baseline": dict(system_file=None, tools=""),
            "baseline_web": dict(system_file=None, tools=WEB_TOOLS),
        }[name]

    runnable, skipped = [], []
    for c in cases:
        img = c.get("imagen")
        if img:
            path = ROOT / img
            if not args.with_images:
                skipped.append((c["id"], "caso con pantallazo; usa --with-images"))
                continue
            if not path.exists():
                skipped.append((c["id"], f"falta la imagen {img}"))
                continue
        runnable.append(c)

    def run_case(c: dict) -> dict:
        image = ROOT / c["imagen"] if c.get("imagen") else None
        answers = {v: run_claude(c["prompt"], model=args.model, image=image, **variant_cfg(v)) for v in variants}
        judged = {}
        main_v = variants[0]
        for other in variants[1:]:
            sx, sy, raw = judge(c, answers[main_v]["text"], answers[other]["text"], rubric, args.judge_model, image)
            judged[other] = {"main": sx, "other": sy, "raw": raw}
        print(f"  ✓ {c['id']}", file=sys.stderr)
        return {"case": c, "answers": answers, "judged": judged}

    print(f"Ejecutando {len(runnable)} casos ({', '.join(variants)}) → {out_dir}", file=sys.stderr)
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        results = list(ex.map(run_case, runnable))

    (out_dir / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    report = render_report(results, variants, skipped)
    (out_dir / "report.md").write_text(report, encoding="utf-8")
    print(report)


def render_report(results: list[dict], variants: list[str], skipped: list) -> str:
    main_v = variants[0]
    lines = [f"# Evaluación del coach: `{main_v}` contra {', '.join(f'`{v}`' for v in variants[1:])}", ""]
    for other in variants[1:]:
        rows, wins, losses, ties, cats = [], 0, 0, 0, {}
        sm, so = [], []
        for r in results:
            j = r["judged"].get(other, {})
            a, b = j.get("main"), j.get("other")
            cid, cat = r["case"]["id"], r["case"]["categoria"]
            if not a or not b:
                rows.append(f"| {cid} | {cat} | — | — | error del juez |")
                continue
            ta, tb = a["total"], b["total"]
            sm.append(ta)
            so.append(tb)
            cats.setdefault(cat, []).append((ta, tb))
            if abs(ta - tb) < 0.25:
                ties += 1
                res = "empate"
            elif ta > tb:
                wins += 1
                res = f"gana {main_v}"
            else:
                losses += 1
                res = f"gana {other}"
            rows.append(f"| {cid} | {cat} | {ta} | {tb} | {res} |")
        mean = lambda xs: round(sum(xs) / len(xs), 2) if xs else 0
        decided = wins + losses
        win_rate = round(100 * wins / decided) if decided else 0
        lines += [
            f"## `{main_v}` contra `{other}`",
            "",
            f"- Media: **{mean(sm)}** contra **{mean(so)}** (diferencia {round(mean(sm) - mean(so), 2)})",
            f"- Resultado: {wins} victorias, {losses} derrotas, {ties} empates (tasa de victoria {win_rate} % sin empates)",
        ]
        weak = [c for c, v in cats.items() if mean([x for x, _ in v]) < mean([y for _, y in v])]
        ok = win_rate >= 70 and mean(sm) - mean(so) >= 0.5 and not weak
        lines.append(f"- Criterio de éxito del rubric: **{'cumple' if ok else 'no cumple'}**")
        if weak:
            lines.append(f"- Categorías donde pierde: {', '.join(weak)}")
        lines += ["", f"| Caso | Categoría | {main_v} | {other} | Resultado |", "|---|---|---|---|---|", *rows, ""]
        lines += ["### Por categoría", "", f"| Categoría | {main_v} | {other} |", "|---|---|---|"]
        for c, v in sorted(cats.items()):
            lines.append(f"| {c} | {mean([x for x, _ in v])} | {mean([y for _, y in v])} |")
        lines.append("")
    lines += ["## Veredictos del juez", ""]
    for r in results:
        for other, j in r["judged"].items():
            raw = j.get("raw") or {}
            v = raw.get("veredicto") if isinstance(raw, dict) else None
            bad = raw.get("datos_incorrectos") if isinstance(raw, dict) else None
            if v:
                # El juez ve A/B; traducimos a nombres de variante.
                a_is_main = not raw.get("swap")
                v = v.replace("Respuesta A", "A").replace("Respuesta B", "B")
                tag = f"(A = {main_v if a_is_main else other}, B = {other if a_is_main else main_v})"
                lines.append(f"- **{r['case']['id']}** {tag}: {v}")
                if bad:
                    lines.append(f"  - Datos incorrectos: {'; '.join(map(str, bad))}")
    lines += ["", "## Coste y uso de herramientas", "", "| Variante | Coste USD | Usos de búsqueda/lectura web | Errores |", "|---|---|---|---|"]
    for v in variants:
        cost = sum((r["answers"][v].get("cost_usd") or 0) for r in results)
        webs = sum((r["answers"][v].get("web_searches") or 0) for r in results)
        errs = sum(1 for r in results if not r["answers"][v]["ok"])
        lines.append(f"| {v} | {cost:.2f} | {webs} | {errs} |")
    if skipped:
        lines += ["", "## Casos omitidos", ""] + [f"- {cid}: {why}" for cid, why in skipped]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
