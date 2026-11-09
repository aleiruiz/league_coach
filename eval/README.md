# Evaluación de calidad del coach

Comprueba que el harness (prompt del coach, búsqueda web y, en la variante `draft`,
el draft estructurado con datos del parche) da mejores consejos que el mismo modelo
sin harness.

- `cases.json`: 28 casos (builds situacionales, matchups, momentos de partida,
  tutoriales, trampas de honestidad y 3 de pantallazo). Cada caso trae criterios,
  errores graves y, cuando se pueden verificar, `hechos` de referencia. Los de build
  y matchup traen también un `draft` estructurado.
- `rubric.md`: dimensiones de fondo, restricciones, tratamiento estadístico y límites.
- `run_eval.py`: ejecuta cada caso en cada variante con el CLI de Claude Code, aislado
  de tu configuración (sin CLAUDE.md, memorias, hooks ni MCP), y pide a un juez que
  puntúe cada par en los dos órdenes.
- `draft_prompt.py`: réplica en Python de `recommend_build` (`src-tauri/src/recommend.rs`).
  Si cambia el prompt de Rust, actualízala.
- `baselines/`: informes de referencia guardados a mano. Las corridas completas quedan
  en `eval/results/` (ignorado por git).

## Uso

Requisitos: Python 3.10+ y Claude Code con sesión iniciada (`claude auth login`).
Una corrida completa de harness contra baseline hace unas 100 consultas (respuestas
y 2 juicios por caso) y gasta uso de tu suscripción.

**Windows** (PowerShell, desde la carpeta del repo):

```powershell
py eval\run_eval.py
py eval\run_eval.py --variants harness,baseline,baseline_web
py eval\run_eval.py --only ingame-01-behind,trap-02-live-data
py eval\run_eval.py --variants draft,baseline --fetch-ddragon
```

Usa `py`, no `python3`: en Windows `python3` suele abrir la Microsoft Store. El script
encuentra `claude.cmd` solo.

**macOS / Linux**: lo mismo con `python3 eval/run_eval.py ...`.

Opciones útiles:

- `--judge-model <modelo>`: usa un juez distinto del modelo que responde (recomendado).
- `--judge-repeats 2`: 4 juicios por par en lugar de 2, menos ruido y el doble de coste.
- `--patch 26.22`: le dice al juez el parche. Con `--fetch-ddragon` se toma de Data Dragon.

El informe queda en `eval/results/<fecha>/report.md`. Cada caso se guarda en
`results.jsonl` en cuanto termina, junto con `meta.json` (commit, hash del prompt,
versión del CLI, modelos y parche). Si un caso falla, el resto sigue y puedes
repetirlo con `--only`.

## Variante `draft` (pantalla Partida)

Reproduce "Recomendar build": parche actual, aliados y rivales por separado, perfil
de daño rival, listas de ítems y runas válidos, y respuesta JSON. La tarjeta se pasa
a texto para el juez, y el informe lista los nombres que no existen en el parche.
Hace una ronda de corrección como la app (JSON ilegible o nombres fuera del parche).

Necesita Data Dragon: `--fetch-ddragon` descarga el último parche a `eval/ddragon/`,
o usa `--ddragon <carpeta>` con una carpeta que tenga `champion.json`, `item.json` y
`runesReforged.json` (es_MX) y cuyo nombre sea la versión, por ejemplo `16.22.1`.
La app guarda esa misma caché en su carpeta de datos.

## Pantallazos

Los casos `shot-*` necesitan capturas reales, que no se suben al repo. Ponlas en
`eval/images/` con el id del caso y cualquier extensión (`shot-01-shop.jpg`), o
pásalas con `--image shot-01-shop=C:\ruta\captura.png`, y añade `--with-images`.

En Windows:

- `Win+Shift+S` copia al portapapeles y no guarda archivo. Pega en Paint y guárdalo.
- `Win+ImprPant` guarda en `Imágenes\Capturas de pantalla`.
- La tecla de captura del juego (`F12` por defecto) guarda en la carpeta
  `Screenshots` de la instalación de League of Legends.

Si una imagen pasa de 3,5 MB, el script avisa: guárdala como JPG o recórtala.

## Al cambiar el harness

Vuelve a ejecutar cuando cambien `prompts.rs`, `recommend.rs`, las herramientas del
modelo o el contexto que se inyecta. Compara con `baselines/` y guarda ahí el informe
nuevo si quieres fijarlo como referencia.
