# Rubric de calidad del coach

Cada respuesta se puntúa de 1 a 5 en seis dimensiones. El juez ve dos respuestas
a ciegas (A y B, en orden aleatorio), los criterios del caso y los errores graves.

| Dimensión | Peso | 1 | 3 | 5 |
|---|---|---|---|---|
| **Precisión** | 3 | Inventa ítems, runas o habilidades, o describe mecánicas mal. | Correcta en lo general, algún dato dudoso o de otro parche. | Todo lo que afirma existe y es correcto para el parche actual. |
| **Adaptación al contexto** | 3 | Respuesta genérica que ignora draft, minuto u oro. | Usa parte del contexto. | Cada recomendación se justifica con una amenaza o dato concreto del caso. |
| **Accionabilidad** | 2 | Teoría sin pasos. | Pasos, pero vagos ("compra algo defensivo"). | Qué comprar/hacer, en qué orden y cuándo. |
| **Formato según el momento** | 1 | Una guía larga para una pregunta en partida, o tan escueta que no sirve. | Longitud aceptable. | En partida: decisión en la primera línea y pocas líneas. Antes de partida: estructura clara y escaneable. |
| **Honestidad y fuentes** | 1 | Afirma con seguridad lo que no sabe. | Sin fuentes, pero sin inventar. | Indica parche y/o fuente de los datos y admite incertidumbre cuando la hay. |
| **Cumplimiento** | 1 | No responde en español o recomienda algo contra las políticas de Riot. | — | En español, sin herramientas prohibidas, sin pedir datos en vivo. |

**Puntuación del caso** = suma(peso × nota) / suma(pesos), de 1 a 5.

Un **error grave** de la lista del caso limita la nota de Precisión o Adaptación
a 2 como máximo.

**Ganador del caso**: la respuesta con mayor puntuación; empate si la diferencia
es menor que 0,25.

## Criterio de éxito del harness

El harness se considera superior si, sobre todos los casos ejecutados:

1. gana al menos el 70 % de los casos no empatados, y
2. su puntuación media supera a la del modelo sin harness por al menos 0,5, y
3. no pierde en ninguna categoría de forma sistemática (media de la categoría
   más baja que la de la línea base).

Si falla el punto 3, el informe señala la categoría para corregir el prompt o
las herramientas del harness.
