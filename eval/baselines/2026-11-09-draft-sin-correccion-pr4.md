# Evaluación del coach: `draft` contra `baseline`

## Ejecución

- fecha: `2026-11-09T07:11:29`
- git_sha: `e892a5e`
- prompt_sha256: `bbb5de50c37d`
- cli_version: `2.1.319 (Claude Code)`
- modelo: `claude-sonnet-5-5`
- modelo_juez: `claude-opus-5-5`
- parche: `26.22`
- seed: `7`
- juicios_por_par: `2`

## `draft` contra `baseline`

- Casos válidos: 12 (juicios fallidos o casos con error: 0)
- Fondo (precisión, contexto, accionabilidad): **2.71** contra **3.71**; diferencia media -1.00, IC 95 % bootstrap [-1.59, -0.44]
- Victorias / derrotas / empates: 1 / 8 / 3; test de signos p = 0.998
- Consistencia al invertir el orden A/B: 83 %; ruido del juez (desv. típica media de la diferencia): 0.43
- Restricciones (no peor que el rival por más de 0,25): formato -1.92, honestidad -0.42, cumplimiento -0.08
- Veredicto: **no se demuestra que sea superior** (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)

### Por dimensión

| Dimensión | draft | baseline |
|---|---|---|
| precision | 2.25 | 3.42 |
| contexto | 2.92 | 3.83 |
| accionabilidad | 3.08 | 3.96 |
| formato | 2.17 | 4.08 |
| honestidad | 3.42 | 3.83 |
| cumplimiento | 4.83 | 4.92 |

### Hechos de referencia

| | draft | baseline |
|---|---|---|
| acertados % | 62 | 68 |
| fallados % | 10 | 0 |

### Por categoría

| Categoría | casos | draft | baseline | aviso |
|---|---|---|---|---|
| build_situacional | 6 | 2.44 | 3.96 | pierde |
| matchup | 5 | 3.12 | 3.50 | pierde |
| momento_partida | 1 | 2.25 | 3.25 | pocos casos |

### Casos

| Caso | Categoría | draft | baseline | diferencia ± juez | Resultado |
|---|---|---|---|---|---|
| build-01-vs-ap-burst | build_situacional | 3.12 | 4.00 | -0.88 ± 0.71 | gana baseline |
| build-02-antiheal | build_situacional | 1.38 | 4.31 | -2.94 ± 0.44 | gana baseline |
| build-03-tanky-enemy | build_situacional | 2.44 | 4.00 | -1.56 ± 0.27 | gana baseline |
| build-04-player-profile | build_situacional | 1.00 | 3.62 | -2.62 ± 0.00 | gana baseline |
| matchup-01-top | matchup | 2.81 | 3.62 | -0.81 ± 0.27 | gana baseline |
| matchup-02-mid | matchup | 3.94 | 3.25 | 0.69 ± 0.09 | gana draft |
| matchup-03-jungle | matchup | 3.62 | 3.31 | 0.31 ± 0.44 | empate (cambia con el orden) |
| ingame-01-behind | momento_partida | 2.25 | 3.25 | -1.00 ± 1.06 | empate |
| build-05-vs-assassins | build_situacional | 3.25 | 4.31 | -1.06 ± 0.44 | gana baseline |
| build-06-full-ad | build_situacional | 3.44 | 3.50 | -0.06 ± 0.97 | empate (cambia con el orden) |
| matchup-04-bot | matchup | 2.62 | 4.06 | -1.44 ± 0.44 | gana baseline |
| matchup-05-teemo | matchup | 2.62 | 3.25 | -0.62 ± 0.00 | gana baseline |

## Veredictos del juez (orden A = variante principal)

- **build-01-vs-ap-burst** (draft contra baseline): B es más clara, más coherente y más precisa en runas e ítems contra la ráfaga mágica y el CC. A cubre el contexto y añade un plan de línea, pero tiene errores, contradicciones y un formato difícil de leer.
  - Datos señalados: A: dice que la Q de Kai'Sa puede fallar; la Q de Kai'Sa es autodirigida y no falla; A: Conquistador como piedra angular de Jinx es dudoso, no es lo estándar; A: Filo de la Tormenta, no verificado: según una sola fuente no oficial se retiró en 26.4 y volvió en 26.17; A: la primera línea se contradice ('Manto Anulamagia no', 'Espada del Guardián no') y el razonamiento sobre Placa del Hombre Muerto no tiene sentido; B: Tempo Letal existe según webs de estadísticas en 2026 (verificado de forma parcial)
- **build-02-antiheal** (draft contra baseline): B es claramente superior: identifica la amenaza, da el componente AD correcto, el ítem completo y cuándo comprar cada uno. A es confusa, inventa ítems y no responde de verdad a la pregunta de antisanación.
  - Datos señalados: A: «Hacha Hogareña» y «Rencor» no existen como ítems de antisanación (inventados).; A: «Espada del Rey Arruinado» no aplica Heridas Graves; la mención es confusa y no recomienda ningún ítem antisanación real.; A: Armadura de Warmog como tercer ítem estándar de Darius es dudoso.; B: La Espada de cadena quimiotécnica existía en 26.6 (recibió cambios); no he verificado su estado ni sus estadísticas exactas en 26.22.; B: sugerir mejorar Llamado del Verdugo a Recordatorio mortal (ítem de tirador) no encaja con Darius, aunque solo lo plantea como opción secundaria.
- **build-03-tanky-enemy** (draft contra baseline): B es claramente mejor: responde a la pregunta del minuto 18 con un orden de compra concreto y explica bien la W contra tanques. A mezcla una guía completa desde el inicio con varios datos erróneos o inventados.
  - Datos señalados: A: atribuye el daño verdadero por vida máxima a la pasiva ('Plata de Sombras'), cuando es la W (Saetas de Plata).; A: 'Resplandor Vacío' y 'Rompeavances' no corresponden a objetos reconocibles de Vayne; parecen inventados o confundidos.; A: dice que Matakrakens hace daño extra contra objetivos con mucha vida, pero escala con la vida que le falta al objetivo.; A: dice que Maokai es el único daño mágico, pero Ornn y Sejuani también hacen daño mágico.; A: dice que la pasiva de Braum bloquea proyectiles; eso lo hace su E (Inquebrantable).; A: las runas (Conquistador con Golpe de Gracia) y la vigencia de Terminus o Yun Tal en el parche 26.22 quedan como no verificado.; B: Fauces de Malmortius da un escudo contra daño mágico, no protege del CC encadenado, así que la recomendación está mal justificada.; B: los nombres y efectos de los objetos en el parche 26.22 quedan como no verificado, aunque Lord Dominik y Rey Arruinado (daño por vida actual) son coherentes con su diseño conocido.
- **build-04-player-profile** (draft contra baseline): B gana con claridad. Es el único consejo que se puede usar: runas, ítem y pasos concretos para enganchar sin morir, aunque tiene un error de compatibilidad de runas, una idea equivocada sobre el escudo de Karma y le falta el ítem inicial de soporte. A está incompleta y recomienda un ítem inicial equivocado.
  - Datos señalados: A: Escudo de Doran como ítem inicial de Thresh support es incorrecto; lo que toca es el ítem de soporte que se mejora con oro y da guardianes; A: 'Muerte Ígnea' y 'Medida: Rompeavances' no corresponden a nada coherente de Thresh ni a la build; A: runas 'None'; B: Acondicionamiento y Placas de hueso están en la misma fila de Resolución, así que no se pueden llevar juntas; B: el E de Karma es un escudo de daño, no de hechizos, y no bloquea el gancho de Thresh. El motivo del consejo 'deja que gaste el escudo' está mal planteado; B: 'Su ataque principal tiene un ratio de poke fuerte' es confuso; se refiere al Q de Karma, no a su ataque básico; B: dice que el farol se usa 'antes de entrar' y a la vez que sirve más para salvar al ADC, lo cual se contradice; B: no verificado para el parche 26.22: estadísticas exactas del Candado de los Solari de Hierro y los nombres en español de las runas (por ejemplo, Aftershock se llama 'Réplica')
- **matchup-01-top** (draft contra baseline): Gana B: responde de verdad a cómo jugar los niveles 1-6, con ventanas de trade, oleada y recall, y además es fácil de leer. A parece una guía genérica de build, con el plan de línea escaso y contradictorio. Las dos tienen fallos de precisión parecidos y a las dos les falta que la W de Fiora devuelve el aturdimiento.
  - Datos señalados: A: llama 'Estocada' a la W de Fiora. Estocada es su Q; la W es Riposte. La mecánica que describe es correcta, solo falla el nombre.; A: dice que empuje una oleada grande antes del nivel 3 justo después de decir que farmee bajo su torre. Es un consejo contradictorio.; B: 'aguanta con E para esquivar autos y no aturdir'. Es incorrecto: la E de Jax aturde siempre al terminar o al reactivarla, no se puede usar sin aturdir. Lo cuento como fallo de precisión y no como error grave porque el resto de la descripción de la E es correcto.; B: 'Trinity Force o Triforce' son el mismo ítem, así que no hay alternativa real.; A y B: ninguno dice que la W de Fiora, si bloquea un control inmovilizante como el aturdimiento de la E, aturde a Jax. Es el riesgo principal del matchup.; No verificado: builds, runas y orden de habilidades concretos para el parche 26.22 (no hice búsqueda web).
- **matchup-02-mid** (draft contra baseline): A gana: es más precisa y más accionable, con build, orden y plan por fases sin datos obsoletos. B explica algo mejor el timing contra la R, pero mete una runa eliminada y un ítem de AD inútil para Ahri. Ninguna de las dos explica con claridad cuándo Ahri es más fuerte que Zed en la línea.
  - Datos señalados: B: 'Recolector de Ojos' (Eyeball Collection) se eliminó en el parche 25.S1.1 y lo sustituyó Deep Ward; no existe en el 26.22.; B: 'Filo de la Noche' es un ítem de letalidad/AD y no sirve para Ahri.; B: 'Cazador Ingenioso' como alternativa: no verificado que siga en el juego.; B: dice 'si lo aturdes' cuando la E de Ahri es un encanto, no un aturdimiento (impreciso, menor).; A: 'Tu Q y tu R te sirven para salir de su all-in': la Q no es una herramienta de escape (impreciso).; A: 'Antes del nivel 6 Zed solo te hace poke y no te mata' es dudoso: Zed con Ignición puede matar antes del 6.; A: 'Sabor a Sangre' y 'Recuerdos Macabros' en Dominación: no verificado para el 26.22, aunque Recuerdos Macabros existe desde el 25.S1.1.
- **matchup-03-jungle** (draft contra baseline): Las dos manejan bien el invade de Lee Sin: ceden el camp y contrainvaden el lado opuesto, y ninguna comete el error grave. Las dos se equivocan con el momento de la evolución. B es más clara y se ciñe a lo que se preguntó; A aporta ítems como Filo de la Noche, pero añade build sobrante y algunas recomendaciones flojas. El fondo queda casi empatado y B gana en formato.
  - Datos señalados: A y B: sitúan la ventaja en el nivel 4 con la Q evolucionada o con 'las evoluciones'; Kha'Zix recibe su primer punto de evolución en el nivel 6.; A: recomienda Cota de Espinas para Kha'Zix, una compra situacional muy poco adecuada para un asesino.; A: subir E en segundo lugar (Q>E>W) es dudoso; lo habitual es Q>W>E. No verificado en el parche 26.22.; A: la ruta Rojo-Krugs-Raptors-Lobos-Azul-Gromp hace un recorrido poco eficiente entre los dos lados de la jungla.; B: primero propone ir al scuttle a las 3:15-3:30 y en el resumen dice que no lo conteste sin prioridad (contradicción).; A: runas, ítems y orden de habilidades de la build no verificados en el parche 26.22.
- **ingame-01-behind** (draft contra baseline): Las dos aciertan en lo de fondo: Zed es AD, hay que comprar armadura e ir a Zhonya y jugar bajo torre. B es más útil en partida por formato y accionabilidad, aunque su precio de Seeker's Armguard está mal. A comete el error grave de ser una guía completa e inventa componentes de Zhonya. Ligera ventaja para B.
  - Datos señalados: A: 'Tiara Susurrante' no es un componente de Zhonya. La receta es Seeker's Armguard (1600) + Vara Innecesariamente Grande (1200) + 450 (https://www.riftpatchnotes.com/lol/item/zhonyas-hourglass, https://metabot.gg/en/league/item/3157); A: Cota de Malla no forma parte de la receta de Zhonya. La única armadura de la receta es la Armadura de Tela, dentro de Seeker's Armguard; A: Botas del Hechicero no ayudan a sobrevivir a un Zed 4/0. Las indicadas son Botas Blindadas (Plated Steelcaps); B: Seeker's Armguard cuesta 1600 de oro, no unos 1000 (dato de 26.21; no se pudo confirmar 26.22) (https://www.riftpatchnotes.com/lol/item/seekers-armguard). Con 1300 solo se compran componentes: Armadura de Tela + Tomos Amplificadores; B: propone Mercury's Treads 'según la composición' contra un Zed AD sin aclarar que dan resistencia mágica, no armadura
- **build-05-vs-assassins** (draft contra baseline): B gana: es más corta, se centra en lo que se preguntó (qué defensivo y cuándo) y su núcleo es correcto, con pocos errores. A también acierta con Zhonya y la armadura, pero lo rodea de una guía larga con varios datos falsos o poco apropiados para una soporte.
  - Datos señalados: A: Escudo de Doran como objeto inicial de una soporte (lo normal es el objeto de soporte, Atlas Mundial); A: subir W en segundo lugar (E > W > Q) es raro en Lux; lo habitual es E > Q > W o Q primero; A: Báculo del Arcángel y Presagio de Randuin no encajan en una Lux soporte con poco oro; A: amenaza etiquetada como 'None' en lugar de Talon; A: Zhonya a '~3000 de oro', precio no verificado para el parche 26.22; B: 'si Zed te marca con la ulti, aléjate de tu equipo' no tiene sentido mecánico, porque la ulti de Zed no hace daño en área a los aliados; B: el punto 3 (no añadir defensa si el rival acumula armadura o letalidad) es incoherente; B: que Seeker's Armguard exista como componente comprable en el parche 26.22 no está verificado; B: nombres de objetos y habilidades en inglés dentro de una respuesta en español
- **build-06-full-ad** (draft contra baseline): Ninguna compra resistencia mágica y las dos priorizan la armadura con Grebas o Botas de Placas. A gana por poco: es más decidida y está más adaptada a la partida, con un orden de compra único y consejos concretos contra Darius. B está mejor ordenada, pero deja demasiadas alternativas abiertas y sugiere ítems que no le sirven a Sett, como Corazón Helado y Botas Mágicas.
  - Datos señalados: A: abre con 'Conquistador con Cuchilla Rauda... no', que es una incoherencia, y las runas que da después son Agarre del Perpetuo; A: Rompecascos 'contra Darius si se pone tanque' está mal justificado, porque es un ítem para empujar líneas en solitario; A: el orden de habilidades Q > W > E no está verificado para 26.22; lo habitual en Sett es Q > E > W; B: Corazón Helado da maná, que Sett no aprovecha, y no está verificado que el ítem exista en 26.22; B: Inspiración con Botas Mágicas choca con comprar Botas de Placas en la primera vuelta a base; A y B: no se ha verificado en el parche 26.22 que existan ni cómo están las estadísticas de Stridebreaker, Sundered Sky, Jak'Sho, Warmog y Placa del Hombre Muerto
- **matchup-04-bot** (draft contra baseline): B responde a lo que se pregunta (niveles 1-3) con un plan por nivel claro y fácil de seguir que respeta el gancho y el daño de Draven. A se va a una guía de build genérica, larga y con datos dudosos, así que gana B.
  - Datos señalados: A: 'Hábito del Espectro' no parece un ítem real del juego (no verificado en 26.22); A: Electrocutar como runa clave en Caitlyn es muy poco habitual y tiene poco sentido frente a Precisión (Pies Veloces / Lluvia de Proyectiles); no verificado en 26.22; A: Mezcla un orden de habilidades contradictorio ('Q-W-E' y a la vez 'nivel 1 W si no hay oleada grande'); A: alcance de la Q de Thresh '1100', aproximado y no verificado en 26.22; B: alcance de Draven '~550', correcto en la base pero no verificado en 26.22
- **matchup-05-teemo** (draft contra baseline): B gana: es más coherente y da pasos concretos para la fase de líneas, mientras que A tiene errores de redacción y una build poco lógica. Ninguna explica el escudo pasivo ni propone bien un ítem completo de resistencia mágica.
  - Datos señalados: A: el Manto Anulamagia aparece como ítem de la build principal, pero es un componente; A: Reloj de Arena de Zhonya en una build tanque con Égida de Fuego Solar: dudoso y no responde al daño mágico de Teemo; A: «Construye Mandato Imperial no» es una frase incoherente y el ítem no pinta nada; A: «farmea solo con E y autoataques» contradice la idea de farmear a distancia con la Q; B: «Ojo de Bronce» no corresponde a ningún ítem conocido (no verificado), y Hexdrinker es un ítem de daño físico para bruisers, no para Malphite tanque; B: «Teemo no tiene escapes buenos» es discutible, porque su W le da velocidad de movimiento; B: Corazón de Hielo como ítem principal contra Teemo (AP) responde mal a la amenaza principal; B: que la tenacidad de las Botas de Mercurio reduzca la ceguera no está verificado para el parche 26.22

## Coste y herramientas

| Variante | Coste USD | Llamadas a herramientas | Errores |
|---|---|---|---|
| draft | 0.51 | 0 | 0 |
| baseline | 0.27 | 0 | 0 |
| juez | 2.45 | — | — |

## Nombres fuera del parche en la tarjeta (sin ronda de corrección)

- build-04-player-profile: ítem Medida: Rompeavances

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
