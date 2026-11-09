# Rubric de calidad del coach

El juez ve dos respuestas a ciegas (A y B), los criterios del caso, los errores
graves y, si los hay, hechos de referencia verificados. Cada par se juzga **en los
dos órdenes** (A/B y B/A) y se promedia, para cancelar el sesgo de posición.
Puntúa el contenido del consejo, no el estilo.

## Dimensiones de fondo (deciden el resultado)

| Dimensión | Peso | 1 | 3 | 5 |
|---|---|---|---|---|
| **Precisión** | 3 | Inventa ítems, runas o habilidades, o describe mecánicas mal. | Correcta en lo general, con algún dato dudoso o de otro parche. | Todo lo que afirma existe y es correcto para el parche indicado. |
| **Adaptación al contexto** | 3 | Respuesta genérica que ignora el draft, el minuto o el oro. | Usa parte del contexto. | Cada recomendación se justifica con una amenaza o un dato concreto del caso. |
| **Accionabilidad** | 2 | Teoría sin pasos, o "la que prefieras" / "mira u.gg". | Pasos, pero vagos ("compra algo defensivo"). | Qué comprar o hacer, en qué orden y cuándo. |

**Fondo** = (3·Precisión + 3·Contexto + 2·Accionabilidad) / 8, de 1 a 5.

Un **error grave** de la lista del caso limita Precisión y Contexto a 2. El script
lo aplica en código a partir de lo que marca el juez.

## Restricciones (no pueden empeorar)

| Dimensión | 1 | 3 | 5 |
|---|---|---|---|
| **Formato según el momento** | Una guía larga para una pregunta en partida, o tan escueta que no sirve. | Longitud aceptable. | En partida: la decisión en la primera línea y pocas líneas. Antes de la partida: estructura clara y fácil de escanear. |
| **Honestidad** | Afirma con seguridad lo que no sabe, **o** se escuda en la duda en vez de recomendar. | Sin inventar, pero con cautela que resta utilidad. | Recomienda con decisión y marca en una línea lo que no puede verificar. |
| **Cumplimiento** | No responde en español o recomienda algo contra las políticas de Riot. | — | En español, sin herramientas prohibidas, sin pedir datos en vivo. |

Citar el parche o una web no sube la nota por sí solo: cuenta solo si el dato es
correcto y útil.

## Hechos de referencia

Algunos casos traen `hechos`: datos verificables que no dependen del parche (o que
indican a qué parche corresponden). El juez marca cada uno como acertado, fallado o
no mencionado. Es una medida de precisión más estable que la nota de 1 a 5.

## Resultado por caso

- Diferencia = fondo(principal) − fondo(rival), promedio de todos los juicios del par.
- **Empate** si |diferencia| < max(0,25; desviación típica entre juicios del par),
  o si el ganador cambia al invertir el orden A/B.

## Criterio de éxito del harness

El harness es **superior** a una variante si:

1. el intervalo de confianza del 95 % (bootstrap por casos) de la diferencia media
   de fondo queda por encima de 0, y
2. en cada restricción no queda por debajo del rival por más de 0,25.

El informe también da el test de signos sobre victorias y derrotas, la
consistencia al invertir el orden y el ruido medido del juez. Las categorías con
menos de 4 casos se muestran como aviso, no como condición.

## Límites conocidos

- Si el juez es el mismo modelo que responde, puede preferir su propio estilo y
  compartir sus huecos de conocimiento. Usa `--judge-model` con otro modelo cuando
  puedas.
- Con unos 25 casos y 2 juicios por par, solo se detectan diferencias de fondo de
  unos 0,4 o más. Diferencias menores son ruido.
- Los casos los escribió el auditor. Conviene que Alei añada algunos propios.
