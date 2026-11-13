# Evaluación del coach: `draft` contra `harness`

## Ejecución

- fecha: `2026-11-09T08:36:33`
- git_sha: `a5ea2ac`
- prompt_sha256: `a3f17da8e88a`
- cli_version: `2.1.319 (Claude Code)`
- modelo: `claude-sonnet-5-5`
- modelo_juez: `claude-opus-5-5`
- parche: `26.22`
- seed: `7`
- juicios_por_par: `2`

## `draft` contra `harness`

- Casos válidos: 2 (juicios fallidos o casos con error: 0)
- Fondo (precisión, contexto, accionabilidad): **3.97** contra **3.12**; diferencia media 0.84, IC 95 % bootstrap [0.38, 1.31]
- Victorias / derrotas / empates: 2 / 0 / 0; test de signos p = 0.250
- Consistencia al invertir el orden A/B: 100 %; ruido del juez (desv. típica media de la diferencia): 0.49
- Restricciones (no peor que el rival por más de 0,25): formato -0.25, honestidad +0.50, cumplimiento +0.00
- Veredicto: **superior** (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)

### Por dimensión

| Dimensión | draft | harness |
|---|---|---|
| precision | 3.75 | 2.75 |
| contexto | 4.00 | 3.25 |
| accionabilidad | 4.25 | 3.50 |
| formato | 3.25 | 3.50 |
| honestidad | 4.00 | 3.50 |
| cumplimiento | 3.00 | 3.00 |

### Hechos de referencia

| | draft | harness |
|---|---|---|
| acertados % | 100 | 100 |
| fallados % | 0 | 0 |

### Por categoría

| Categoría | casos | draft | harness | aviso |
|---|---|---|---|---|
| idioma | 1 | 3.94 | 2.62 | pocos casos |
| matchup | 1 | 4.00 | 3.62 | pocos casos |

### Casos

| Caso | Categoría | draft | harness | diferencia ± juez | Resultado |
|---|---|---|---|---|---|
| matchup-02-mid | matchup | 4.00 | 3.62 | 0.38 ± 0.00 | gana draft |
| lang-01-spanish-requested | idioma | 3.94 | 2.62 | 1.31 ± 0.97 | gana draft |

## Veredictos del juez (orden A = variante principal)

- **matchup-02-mid** (draft contra harness): On substance the two are close. A is a little more accurate and more detailed about the moment of Zed's R (Barrier timing, using charm after he lands behind you, W cooldown windows), while B is easier to scan but recommends a removed rune. Both fail compliance because they answer in Spanish to an English question.
  - Datos señalados: B: Eyeball Collection (Coleccionista de globos oculares) was removed from the Domination tree in V25.S1.1, so it is not a valid rune on patch 26.22; A: 'Eco de Luden' is the old name; the item has been Luden's Companion (Compañero de Luden) since 2024; A: es_MX ability names 'Impulso espiritual' (Ahri R) and 'Fuego zorro' (Ahri W): not verified; B: es_MX name 'Carrera espiritual' for Ahri R: not verified; B: Lolalytics patch 16.7 win rate of 51.18% for Ahri vs Zed: not verified, and it does not match patch 26.22
- **lang-01-spanish-requested** (draft contra harness): A fits the Fizz matchup better: it explains how to play around Fizz's E, when to use Molten Shield, and when to call the jungler, and its build and runes are complete. B makes the stronger call on Zhonya's but gives generic, possibly outdated runes and fills the answer with outdated source notes.
  - Datos señalados: B: 'Colección de globos oculares' (Eyeball Collection) may have been replaced by Grisly Mementos; not verified for 26.22; B: 'Cazador de tesoros' (Treasure Hunter) is still in the game as of 26.22; not verified; A: es_MX names 'Maldad' (Malignance), 'Antorcha de Fuegoscuro' (Blackfire Torch) and 'Zapatos de Lanzahechizos' (Sorcerer's Shoes); not verified; A: 'Recuerdos Macabros' (Grisly Mementos) is still in the game as of 26.22; not verified; B: the u.gg page showing patch 26.7 and the Champsight 48.7% win rate (patch 15.15); not verified and outdated

## Coste y herramientas

| Variante | Coste USD | Llamadas a herramientas | Errores |
|---|---|---|---|
| draft | 0.27 | 4 | 0 |
| harness | 0.13 | 3 | 0 |
| juez | 0.56 | — | — |

## Nombres fuera del parche en la tarjeta (tras la ronda de corrección)

- Ninguno
