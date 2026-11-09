# Evaluación del coach: `draft` contra `baseline`

## Ejecución

- fecha: `2026-11-09T07:56:01`
- git_sha: `f64e9fa`
- prompt_sha256: `bbb5de50c37d`
- cli_version: `2.1.319 (Claude Code)`
- modelo: `claude-sonnet-5-5`
- modelo_juez: `claude-opus-5-5`
- parche: `26.22`
- seed: `7`
- juicios_por_par: `2`

## `draft` contra `baseline`

- Casos válidos: 4 (juicios fallidos o casos con error: 0)
- Fondo (precisión, contexto, accionabilidad): **3.53** contra **3.84**; diferencia media -0.31, IC 95 % bootstrap [-0.91, 0.12]
- Victorias / derrotas / empates: 0 / 2 / 2; test de signos p = 1.000
- Consistencia al invertir el orden A/B: 50 %; ruido del juez (desv. típica media de la diferencia): 0.53
- Restricciones (no peor que el rival por más de 0,25): formato -1.75, honestidad -0.12, cumplimiento +0.25
- Veredicto: **no se demuestra que sea superior** (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)

### Por dimensión

| Dimensión | draft | baseline |
|---|---|---|
| precision | 3.12 | 3.75 |
| contexto | 3.62 | 3.75 |
| accionabilidad | 4.00 | 4.12 |
| formato | 2.38 | 4.12 |
| honestidad | 3.88 | 4.00 |
| cumplimiento | 5.00 | 4.75 |

### Hechos de referencia

| | draft | baseline |
|---|---|---|
| acertados % | 62 | 62 |
| fallados % | 12 | 0 |

### Por categoría

| Categoría | casos | draft | baseline | aviso |
|---|---|---|---|---|
| build_situacional | 2 | 4.00 | 4.06 | pocos casos |
| matchup | 1 | 4.12 | 4.00 | pocos casos |
| momento_partida | 1 | 2.00 | 3.25 | pocos casos |

### Casos

| Caso | Categoría | draft | baseline | diferencia ± juez | Resultado |
|---|---|---|---|---|---|
| build-02-antiheal | build_situacional | 4.25 | 4.12 | 0.12 ± 0.71 | empate (cambia con el orden) |
| build-03-tanky-enemy | build_situacional | 3.75 | 4.00 | -0.25 ± 0.18 | gana baseline |
| ingame-01-behind | momento_partida | 2.00 | 3.25 | -1.25 ± 1.06 | gana baseline |
| matchup-04-bot | matchup | 4.12 | 4.00 | 0.12 ± 0.18 | empate (cambia con el orden) |

## Veredictos del juez (orden A = variante principal)

- **build-02-antiheal** (draft contra baseline): Las dos eligen la antisanación correcta para un luchador AD. A acierta mejor el momento (primera vuelta con 800 de oro), pero trae errores de runas y de mecánica y se extiende de más. B es más precisa, centrada y fácil de escanear, aunque retrasa el componente a la 2.ª vuelta. B gana por poco.
  - Datos señalados: A: Coraza Ósea + Segundo Aire como secundarias no es posible, porque están en la misma fila del árbol Valor.; A: dice que Llamado del Verdugo aplica heridas graves 'al golpearlos con la E'; la E de Darius (Aprehender) no hace daño, así que no lo aplica.; A y B: que Sierraespada Quimpunk siga existiendo en el parche 26.22 y que Llamado del Verdugo cueste 800 de oro: no verificado.; A: 'Leyenda: Celeridad' como nombre es_MX en 26.22: no verificado.
- **build-03-tanky-enemy** (draft contra baseline): Las dos aciertan en lo principal: penetración de armadura con Lord Dominik y Terminus, usar la W y priorizar a Jhin. B gana por formato y precisión: responde al minuto 18 sin repetir la build desde el inicio y no tiene el error de A sobre el daño mágico del rival.
  - Datos señalados: A: 'Solo Maokai hace daño mágico, así que no hace falta resistencia mágica' es falso: Sejuani, Braum y parte del kit de Ornn (W y R) también hacen daño mágico.; A: justifica Recordatorio Mortal por la curación de Sejuani, que apenas se cura; es un argumento flojo.; A y B: los efectos y valores exactos de Terminus, Lord Dominik y BotRK en el parche 26.22 no están verificados.; B: recomendar Maw sin precisar que solo protege del daño mágico (Jhin hace daño físico) es una recomendación poco precisa.; B: 'pelear cerca de Ornn con su equipo juntando items mejorados' es confuso y no aporta nada concreto.
- **ingame-01-behind** (draft contra baseline): B es claramente mejor: la decisión de compra es concreta y está al alcance de los 1300 de oro, con buen formato para la partida. A comete el error grave de responder con una guía larga, se queda en un vago 'compra hacia Zhonya' y elige mal las botas contra Zed.
  - Datos señalados: A: recomienda Botas de Mercurio (resistencia mágica y tenacidad) contra Zed, que hace solo daño físico; lo correcto serían las Botas de Acero Reforzado (armadura); A: 'Hechizo de Hechizos (Encanto)' no es un nombre real; el Encanto de Ahri es su E; A: 'Zed no tiene cómo cerrarte si estás lejos de él' es falso: con la sombra de la W y la R acorta la distancia; A: la runa 'Recuerdos Macabros' de Dominación no está verificada en la localización es_MX; B: no verificado que el Brazal del Buscador (Seeker's Armguard) cueste 1300 de oro o menos en el parche 26.22; la propia respuesta lo advierte; B: la alternativa de Vara Innecesariamente Grande (Needlessly Large Rod) contradice su propio enfoque de supervivencia y no se verificó su precio
- **matchup-04-bot** (draft contra baseline): En contenido están casi igualadas: ninguna recomienda trades largos y las dos respetan el gancho y aprovechan el rango. B gana en formato, porque responde solo lo que se preguntó y se lee fácil. A es más decidida, pero se repite y se alarga con la build.
  - Datos señalados: Hexóptica C44 (A) existe en 2026 y la construye Caitlyn, pero no pude verificar sus estadísticas ni su pasiva en el parche 26.22; Cadencia Letal como runa principal de Caitlyn (A): no verificado para 26.22; no es la elección más habitual; Subir E en nivel 2 según el support (B): es una opción poco común, aunque no es incorrecta

## Coste y herramientas

| Variante | Coste USD | Llamadas a herramientas | Errores |
|---|---|---|---|
| draft | 0.67 | 8 | 0 |
| baseline | 0.09 | 0 | 0 |
| juez | 0.82 | — | — |

## Nombres fuera del parche en la tarjeta (tras la ronda de corrección)

- Ninguno
