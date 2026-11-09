# Evaluación del coach: `draft` contra `baseline`

## Ejecución

- fecha: `2026-11-09T07:30:32`
- git_sha: `99433b0`
- prompt_sha256: `bbb5de50c37d`
- cli_version: `2.1.319 (Claude Code)`
- modelo: `claude-sonnet-5-5`
- modelo_juez: `claude-opus-5-5`
- parche: `26.22`
- seed: `7`
- juicios_por_par: `2`

## `draft` contra `baseline`

- Casos válidos: 12 (juicios fallidos o casos con error: 0)
- Fondo (precisión, contexto, accionabilidad): **2.91** contra **3.68**; diferencia media -0.77, IC 95 % bootstrap [-1.32, -0.12]
- Victorias / derrotas / empates: 3 / 9 / 0; test de signos p = 0.981
- Consistencia al invertir el orden A/B: 100 %; ruido del juez (desv. típica media de la diferencia): 0.25
- Restricciones (no peor que el rival por más de 0,25): formato -1.29, honestidad -0.25, cumplimiento +0.17
- Veredicto: **no se demuestra que sea superior** (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)

### Por dimensión

| Dimensión | draft | baseline |
|---|---|---|
| precision | 2.67 | 3.38 |
| contexto | 2.71 | 3.83 |
| accionabilidad | 3.58 | 3.92 |
| formato | 2.50 | 3.79 |
| honestidad | 3.62 | 3.88 |
| cumplimiento | 5.00 | 4.83 |

### Hechos de referencia

| | draft | baseline |
|---|---|---|
| acertados % | 52 | 72 |
| fallados % | 10 | 8 |

### Por categoría

| Categoría | casos | draft | baseline | aviso |
|---|---|---|---|---|
| build_situacional | 6 | 3.12 | 3.56 | pierde |
| matchup | 5 | 2.81 | 3.70 | pierde |
| momento_partida | 1 | 2.12 | 4.31 | pocos casos |

### Casos

| Caso | Categoría | draft | baseline | diferencia ± juez | Resultado |
|---|---|---|---|---|---|
| build-01-vs-ap-burst | build_situacional | 3.25 | 4.00 | -0.75 ± 0.00 | gana baseline |
| build-02-antiheal | build_situacional | 2.50 | 3.81 | -1.31 ± 0.27 | gana baseline |
| build-03-tanky-enemy | build_situacional | 2.25 | 3.81 | -1.56 ± 0.27 | gana baseline |
| build-04-player-profile | build_situacional | 3.06 | 2.50 | 0.56 ± 0.27 | gana draft |
| matchup-01-top | matchup | 2.50 | 4.31 | -1.81 ± 0.27 | gana baseline |
| matchup-02-mid | matchup | 3.56 | 3.00 | 0.56 ± 0.44 | gana draft |
| matchup-03-jungle | matchup | 3.12 | 4.00 | -0.88 ± 0.18 | gana baseline |
| ingame-01-behind | momento_partida | 2.12 | 4.31 | -2.19 ± 0.27 | gana baseline |
| build-05-vs-assassins | build_situacional | 3.44 | 4.44 | -1.00 ± 0.53 | gana baseline |
| build-06-full-ad | build_situacional | 4.25 | 2.81 | 1.44 ± 0.27 | gana draft |
| matchup-04-bot | matchup | 2.81 | 4.00 | -1.19 ± 0.27 | gana baseline |
| matchup-05-teemo | matchup | 2.06 | 3.19 | -1.12 ± 0.00 | gana baseline |

## Veredictos del juez (orden A = variante principal)

- **build-01-vs-ap-burst** (draft contra baseline): B gana por adaptación: es la única que propone resistencia mágica real (Malmortius, Botas de Mercurio) y runas de supervivencia contra el burst de Syndra, Kennen y Elise. A da un plan de partida más completo, pero su núcleo con Filo de la Noche es flojo para Jinx y no protege contra la magia.
  - Datos señalados: B: 'resistencia mágica en la fila defensiva' de fragmentos; desde la reforma de 2024 la fila defensiva es vida / vida escalable / tenacidad y resistencia a ralentizaciones, y ya no hay fragmento de RM.; B: Immortal Shieldbow sigue en PC según lo que pude encontrar (solo consta su eliminación en Wild Rift), pero no verificado para 26.22.; A: Filo de la Noche como 3.er ítem principal de Jinx; el ítem existe, pero es de letalidad y no tiene sinergia con su escalado de crítico, así que es una elección mala más que un dato falso.; A: llama 'coconut (E)' al capullo de Elise, una traducción errónea.; A: 'Vas favorecida contra Kai'Sa' es una afirmación de matchup no verificada.; A: 'ataca al objetivo más cercano (Cadencia Letal)' no se deduce de la runa.; A y B: build y runas no verificadas en 26.22 (lo reconocen las dos).
- **build-02-antiheal** (draft contra baseline): B gana con claridad: recomienda la antisanación correcta para un luchador AD (Llamado del Verdugo y luego Chempunk) y dice cuándo comprarla. A comete el error grave de recomendar Recordatorio Mortal, un ítem de tirador, y describe mal la curación de Aatrox.
  - Datos señalados: A: Recordatorio Mortal es un ítem de tirador con críticos y no es la antisanación adecuada para Darius; A: dice que la curación de Aatrox viene de su Q y que pelear en el borde de la Q reduce lo que cura; en realidad cura con la pasiva, la E y la R; A: 'Cuchilla Oscura' como nombre es_MX de Black Cleaver: no verificado; B: dice que la pasiva de Soraka cura; su pasiva da velocidad de movimiento hacia aliados heridos, y la curación viene de la W y la R; B: dice que Aatrox cura con la Q y omite la E, que es su fuente principal de curación junto con la pasiva y la R; B: se contradice sobre el momento: primero dice 'primer o segundo back', luego 'en línea no la necesitas' y luego 'tras tu primer objeto principal'; B: que Chempunk Chainsword y Llamado del Verdugo sigan existiendo en el parche 26.22, y sus precios: no verificado
- **build-03-tanky-enemy** (draft contra baseline): B gana con claridad: responde a la pregunta del minuto 18 con una prioridad de ítems justificada y consejos para la pelea. A solo se adapta en la primera línea y el resto es una guía genérica desde el inicio, demasiado larga para una pregunta en partida.
  - Datos señalados: B: describe Recuerdos de Lord Dominik con daño extra contra enemigos con mucha vida (Giant Slayer); en versiones recientes es solo penetración de armadura. No verificado para 26.22.; B: dice que Terminus 'reduce armadura y resistencia mágica del objetivo'; en versiones recientes da penetración por acumulaciones, no reduce resistencias. No verificado para 26.22.; A: 'Filo del Infinito solo si ellos aún tienen poca armadura' y 'el resto tiene poco daño a distancia: puedes jugar agresiva' son razonamientos flojos o contradictorios para este caso.; A: la página de runas con Valor (Coraza Ósea, Crecimiento Excesivo) es poco habitual en Vayne. No verificado para 26.22.
- **build-04-player-profile** (draft contra baseline): B explica mejor cómo enganchar sin morir, se adapta mejor al nivel Plata y se lee más fácil, pero comete un error grave al recomendar un ítem inicial que ya no existe. A acierta el ítem inicial, pero arma una página de runas imposible, usa jerga sin explicar y su formato es confuso. Le doy una ligera ventaja a B por contexto y formato, aunque el tope por el error grave deja ambas casi empatadas.
  - Datos señalados: B: 'Escudo Reliquia' como ítem inicial. Fue eliminado con la unificación de ítems de soporte en Mapamundi; hoy no existe.; B: 'Acondicionamiento' y 'Crecimiento excesivo' están en la misma fila de Valor/Resolución y no se pueden elegir juntas.; B: 'Tu gancho tiene más alcance que casi todo su poke' es falso: la Q de Ezreal llega más lejos que la Q de Thresh.; B: 'Galletas' y 'Calzado mágico' juntas en Inspiración. No verificado si siguen en la misma fila en 26.22.; A: 'Fuente de Vida' y 'Coraza Ósea' están en la misma fila de Valor, así que la página es inválida.; A: 'Cazador Implacable' e 'Inquebrantable' siguen existiendo en 26.22: no verificado.; A: 'Relicario de los Solari de Hierro'. En es_MX suele llamarse 'Medallón de los Solari de Hierro': nombre no verificado.; A: 'repítelo en 15 s'. El enfriamiento de la Q de Thresh en 26.22 no está verificado.; A: Reloj de Arena de Zhonya en Thresh soporte es una recomendación floja, no un dato falso.
- **matchup-01-top** (draft contra baseline): B es claramente mejor: describe bien la interacción entre la E de Jax y la W de Fiora (bloquea el aturdimiento y lo devuelve), da un plan por niveles que se puede seguir y cubre oleada y jungla. A se dedica sobre todo a la build, apenas trata los primeros 6 niveles y mete un situacional erróneo.
  - Datos señalados: A: recomendar Báculo del Vacío (penetración mágica) como situacional en Jax no tiene sentido para el campeón; A: 'no pelees antes del nivel 3' junto con 'maximizar W > Q > E' y la línea de Leyenda: Linaje / Leyenda: Tenacidad: no verificado para el parche 26.22; A: el nombre 'Réplica' para la W de Fiora no está verificado en la localización es_MX; B: 'gran parte de su daño viene de los Vitals, que son autos' es una simplificación: la Q de Fiora también activa Vitals y no es un ataque básico; B: 'Controlar el freeze te favorece' es vago y no explica cómo ni dónde congelar
- **matchup-02-mid** (draft contra baseline): Están muy igualadas en lo esencial: las dos describen bien la R de Zed y el uso de Zhonya. A es algo más útil porque da build, orden y runas actuales, aunque sea desordenada y meta la Cota de Espinas. B está mejor estructurada pero incluye una runa obsoleta y deja la decisión en manos de webs externas.
  - Datos señalados: B: 'Recolector de globos oculares' (Eyeball Collection) se eliminó en la pretemporada de 2024 y la sustituyó Recuerdos Macabros; no lo verifiqué con búsqueda contra el parche 26.22; A: 'Cota de Espinas' como ítem de armadura para Ahri es un mal consejo; la opción AP contra Zed es Zhonya o su componente; B: 'si gasta mucha energía en Q/W su all-in no tendrá potencia para la R' es engañoso: la R de Zed no cuesta energía; A y B: no verifiqué contra el parche 26.22 las runas y los ítems (Maldad, Impacto repentino, etc.)
- **matchup-03-jungle** (draft contra baseline): B gana porque contesta lo que se preguntó, la ruta y qué hacer con el invade, con más detalle y mejor adaptada a la poca prioridad. A tiene más contenido de build, pero apenas trata la ruta. Ninguna dice cuándo llegan las evoluciones, y B además manda a u.gg en vez de recomendar.
  - Datos señalados: A: 'Cuchilla Oscura' como ítem de letalidad en es_MX para el parche 26.22: no verificado; A: 'Cachorro de Rasgafuegos' como nombre es_MX de la mascota de jungla: no verificado; A: la build Cuchilla Oscura > Cicloespada Voltaica > Filo de la Noche como óptima en 26.22: no verificado; A: 'si Lee entra antes del nivel 3' y luego 'evita el 1v1 hasta el nivel 6' es poco coherente, aunque no es falso; B: la ruta completa Rojo→Krugs→Raptors→Lobos→Azul→Gromp como estándar en 26.22: no verificado, aunque es plausible
- **ingame-01-behind** (draft contra baseline): B es claramente mejor: da una compra concreta que cabe en 1300 de oro, enfocada en armadura contra Zed, y un plan corto para volver a la línea. A responde con una guía de build completa, inadecuada en partida, y nunca resuelve qué comprar con el oro que hay.
  - Datos señalados: A: el Zhonya se presenta como la compra inmediata, pero no se puede pagar con 1300 de oro y la respuesta no lo aclara; A: Cota de Espinas como opción situacional para Ahri; el objeto existe, pero no es una buena compra para una maga AP; A: runa 'Recuerdos Macabros' en Dominación en el parche 26.22: no verificado; B: precio del Seeker's Armguard (~1000) y que siga siendo componente del Zhonya en el parche 26.22: no verificado (la respuesta misma lo advierte); B: frase redundante 'si te sobran ~200-300' después de haber incluido ya el Centinela de Control en la compra
- **build-05-vs-assassins** (draft contra baseline): B gana: la armadura temprana tiene un momento de compra concreto, el uso de Zhonya se adapta a cada asesino y el consejo de posicionamiento es más específico. A acierta con Zhonya, pero es más genérica, repite secciones y tiene un orden de habilidades dudoso. Ninguna comete el error grave de recomendar resistencia mágica.
  - Datos señalados: B: decir que las Punteras de Acero Revestidas 'rinden poco' porque estos asesinos hacen daño con habilidades es engañoso; su armadura también reduce el daño físico de las habilidades; B: el Medallón de los Solari de Hierro como alternativa a Zhonya para Lux es una elección poco habitual y discutible; B: usa nombres de ítems en inglés en vez de la localización es_MX (no es un error de contenido); A: subir W en segundo lugar (E > W > Q) es poco estándar en Lux, que suele subir Q en segundo lugar; A: Mandato Imperial: no verificado que siga existiendo en el parche 26.22; A: 'Mapamundi' como ítem inicial de soporte: nombre es_MX no verificado; A y B: no se verificó la duración de la estasis de Zhonya (2,5 s), las estadísticas de los ítems ni sus precios en el parche 26.22
- **build-06-full-ad** (draft contra baseline): A gana: da una build ordenada y concreta, adaptada al full AD sin sacrificar el daño de Sett, y marca en una línea lo que no pudo verificar. B acierta en lo general, pero deja el primer ítem abierto, no fija un orden y se contradice con las botas.
  - Datos señalados: B: pone 'Ninja Tabi' como situacional cuando ya recomendó Plated Steelcaps; son el mismo ítem (Botas de acero reforzado), así que se contradice; B: Phase Rush en Sett es poco habitual y no está justificado; no verificado para 26.22; B: no verificado que Sunfire Aegis y Trinity Force existan con esos nombres o sigan siendo viables en Sett en 26.22; A: no verificado que Golpe de Gracia y Leyenda: Celeridad sigan en la rama Precisión en 26.22; A: el orden de habilidades Q > W > E es discutible; muchas guías suben E antes que W (no verificado para 26.22); A: 'Sett es mejor que Darius en los primeros niveles' es discutible; el matchup suele considerarse favorable a Darius en trades largos; A: Corazón de Hielo es una opción rara en Sett, aunque aporta armadura
- **matchup-04-bot** (draft contra baseline): B responde lo que se preguntó: plan por nivel, respeto al gancho con súbditos y castigo con alcance. A gasta casi todo en una guía de build y lo poco que dice de niveles 1-3 es demasiado pasivo. Ninguna recomienda intercambios largos. B es claramente superior en contexto y accionabilidad.
  - Datos señalados: B: la E de Draven (Abran Paso) empuja a los lados y ralentiza, pero no aturde; A: dice 'su Q y Hacha Giratoria' como si fueran dos cosas, pero Hacha Giratoria es la propia Q de Draven; A: Cadencia Letal como runa clave de Caitlyn en el parche 26.22: no verificado; A: Cazador de Tesoros como secundaria y la build Matakrakens > Filo del Infinito > Recuerdos de Lord Dominik para el parche 26.22: no verificado (la propia respuesta admite que no tiene datos del parche)
- **matchup-05-teemo** (draft contra baseline): B gana: describe bien la ceguera y da un plan de línea coherente con el matchup, aunque no menciona el escudo pasivo y en ítems se queda en algo vago. A comete un error grave con la ceguera, plantea usar la R antes del nivel 6 y su build no sirve contra el daño mágico de Teemo.
  - Datos señalados: A: dice que se puede pelear con la R a nivel 3-4; la R de Malphite se aprende a nivel 6; A: 'no gastes hechizo ni Q intentando acertarle' si te ciega; la ceguera no afecta a habilidades; A: Cota de Espinas como segundo ítem 'imprescindible' contra Teemo, que hace sobre todo daño mágico; es un consejo flojo; A: fragmentos Fuerza adaptable x2 en un Malphite tanque; dudoso para este matchup; B: la Q de Malphite (Fragmento Sísmico) ralentiza y roba velocidad de movimiento; la que reduce la velocidad de ataque es la E; B: 'Teemo hace daño mágico en parte'; en realidad hace daño mayormente mágico; B: que la tenacidad de las Botas de Mercurio reduce la ceguera no está verificado para el parche 26.22

## Coste y herramientas

| Variante | Coste USD | Llamadas a herramientas | Errores |
|---|---|---|---|
| draft | 1.88 | 24 | 0 |
| baseline | 0.26 | 0 | 0 |
| juez | 2.17 | — | — |

## Nombres fuera del parche en la tarjeta (tras la ronda de corrección)

- matchup-01-top: Falta "answer": responde a las notas del jugador

## Casos omitidos

- ingame-02-objective: sin campo draft (la variante draft solo aplica a builds y matchups)
- ingame-03-teamfight: sin campo draft (la variante draft solo aplica a builds y matchups)
- macro-01-wave: sin campo draft (la variante draft solo aplica a builds y matchups)
- trap-01-fake-item: sin campo draft (la variante draft solo aplica a builds y matchups)
- trap-02-live-data: sin campo draft (la variante draft solo aplica a builds y matchups)
- ingame-04-soul: sin campo draft (la variante draft solo aplica a builds y matchups)
- ingame-05-position: sin campo draft (la variante draft solo aplica a builds y matchups)
- macro-02-slowpush: sin campo draft (la variante draft solo aplica a builds y matchups)
- macro-03-wards: sin campo draft (la variante draft solo aplica a builds y matchups)
- macro-04-after-kill: sin campo draft (la variante draft solo aplica a builds y matchups)
- macro-05-lasthit: sin campo draft (la variante draft solo aplica a builds y matchups)
- trap-03-exact-winrate: sin campo draft (la variante draft solo aplica a builds y matchups)
- trap-04-fake-ability: sin campo draft (la variante draft solo aplica a builds y matchups)
- shot-01-shop: caso con pantallazo; usa --with-images
- shot-02-minimap: caso con pantallazo; usa --with-images
- shot-03-scoreboard: caso con pantallazo; usa --with-images
- shot-04-champ-select: caso con pantallazo; usa --with-images

---

# Diagnóstico: el análisis del paso 1 solo, contra baseline

Mismas respuestas que arriba; el juez ve el análisis en texto libre en lugar de la tarjeta.

## `analisis` contra `baseline`

- Casos válidos: 12 (juicios fallidos o casos con error: 0)
- Fondo (precisión, contexto, accionabilidad): **2.96** contra **3.69**; diferencia media -0.72, IC 95 % bootstrap [-1.17, -0.26]
- Victorias / derrotas / empates: 1 / 8 / 3; test de signos p = 0.998
- Consistencia al invertir el orden A/B: 83 %; ruido del juez (desv. típica media de la diferencia): 0.38
- Restricciones (no peor que el rival por más de 0,25): formato -1.46, honestidad -0.17, cumplimiento +0.12
- Veredicto: **no se demuestra que sea superior** (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)

### Por dimensión

| Dimensión | analisis | baseline |
|---|---|---|
| precision | 2.79 | 3.33 |
| contexto | 2.67 | 3.83 |
| accionabilidad | 3.67 | 4.00 |
| formato | 2.50 | 3.96 |
| honestidad | 3.62 | 3.79 |
| cumplimiento | 4.96 | 4.83 |

### Hechos de referencia

| | analisis | baseline |
|---|---|---|
| acertados % | 60 | 70 |
| fallados % | 10 | 10 |

### Por categoría

| Categoría | casos | analisis | baseline | aviso |
|---|---|---|---|---|
| build_situacional | 6 | 3.18 | 3.53 | pierde |
| matchup | 5 | 2.85 | 3.79 | pierde |
| momento_partida | 1 | 2.25 | 4.12 | pocos casos |

### Casos

| Caso | Categoría | analisis | baseline | diferencia ± juez | Resultado |
|---|---|---|---|---|---|
| build-03-tanky-enemy | build_situacional | 2.75 | 3.62 | -0.88 ± 0.71 | gana baseline |
| build-02-antiheal | build_situacional | 2.50 | 4.00 | -1.50 ± 0.00 | gana baseline |
| build-01-vs-ap-burst | build_situacional | 3.25 | 3.25 | 0.00 ± 1.06 | empate (cambia con el orden) |
| build-04-player-profile | build_situacional | 2.88 | 2.50 | 0.38 ± 0.53 | empate (cambia con el orden) |
| ingame-01-behind | momento_partida | 2.25 | 4.12 | -1.88 ± 0.18 | gana baseline |
| matchup-01-top | matchup | 2.50 | 4.31 | -1.81 ± 0.62 | gana baseline |
| matchup-03-jungle | matchup | 3.12 | 3.88 | -0.75 ± 0.35 | gana baseline |
| matchup-02-mid | matchup | 3.75 | 3.50 | 0.25 ± 0.00 | gana analisis |
| build-06-full-ad | build_situacional | 3.88 | 3.38 | 0.50 ± 0.53 | empate |
