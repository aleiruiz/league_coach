# Evaluación de calidad del coach

Comprueba que el harness (prompt del coach + búsqueda web, tal como lo lanza la app)
da mejores respuestas que el mismo modelo sin harness.

- `cases.json`: casos de prueba (builds situacionales, matchups, momentos de partida,
  tutoriales, trampas de honestidad y pantallazos), cada uno con criterios esperados
  y errores graves.
- `rubric.md`: dimensiones, pesos y criterio de éxito.
- `run_eval.py`: ejecuta cada caso en cada variante con el CLI de Claude Code y pide a
  un juez (el mismo CLI, con búsqueda web para verificar datos) que puntúe a ciegas.

## Uso

Requisitos: Python 3.9+ y Claude Code con sesión iniciada (`claude auth login`).
Cada ejecución completa gasta uso de tu suscripción (unas 40 consultas).

```sh
python3 eval/run_eval.py                                   # harness contra baseline
python3 eval/run_eval.py --variants harness,baseline,baseline_web
python3 eval/run_eval.py --only ingame-01-behind,trap-02-live-data
python3 eval/run_eval.py --with-images                     # casos con pantallazo
```

El informe queda en `eval/results/<fecha>/report.md` y las respuestas completas en
`results.json` de la misma carpeta.

## Pantallazos

Los casos `shot-*` necesitan imágenes reales en `eval/images/` (no se incluyen en el
repo). Haz capturas propias del inventario/tienda, del minimapa y del marcador (Tab),
guárdalas con el nombre que indica cada caso y ejecuta con `--with-images`. El script
manda la imagen al CLI como bloque `image` por `--input-format stream-json`, que es
la misma vía que tendrá que usar la app para pegar pantallazos.

## Al cambiar el harness

Vuelve a ejecutar la evaluación cuando cambie `src-tauri/src/providers/prompts.rs`,
las herramientas que recibe el modelo o el contexto que se inyecta (draft, perfil del
jugador). El script lee el prompt directamente de `prompts.rs`.
