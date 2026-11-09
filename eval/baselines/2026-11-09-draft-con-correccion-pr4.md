# Evaluación del coach: `draft` contra `baseline`

## Ejecución

- fecha: `2026-11-09T07:17:55`
- git_sha: `0145aa7`
- prompt_sha256: `bbb5de50c37d`
- cli_version: `2.1.319 (Claude Code)`
- modelo: `claude-sonnet-5-5`
- modelo_juez: `claude-opus-5-5`
- parche: `26.22`
- seed: `7`
- juicios_por_par: `2`

## `draft` contra `baseline`

- Casos válidos: 12 (juicios fallidos o casos con error: 0)
- Fondo (precisión, contexto, accionabilidad): **2.66** contra **3.71**; diferencia media -1.05, IC 95 % bootstrap [-1.45, -0.56]
- Victorias / derrotas / empates: 1 / 11 / 0; test de signos p = 1.000
- Consistencia al invertir el orden A/B: 100 %; ruido del juez (desv. típica media de la diferencia): 0.15
- Restricciones (no peor que el rival por más de 0,25): formato -1.79, honestidad -0.29, cumplimiento +0.25
- Veredicto: **no se demuestra que sea superior** (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)

### Por dimensión

| Dimensión | draft | baseline |
|---|---|---|
| precision | 2.17 | 3.54 |
| contexto | 2.71 | 3.71 |
| accionabilidad | 3.33 | 3.96 |
| formato | 2.29 | 4.08 |
| honestidad | 3.42 | 3.71 |
| cumplimiento | 5.00 | 4.75 |

### Hechos de referencia

| | draft | baseline |
|---|---|---|
| acertados % | 60 | 72 |
| fallados % | 22 | 2 |

### Por categoría

| Categoría | casos | draft | baseline | aviso |
|---|---|---|---|---|
| build_situacional | 6 | 2.66 | 4.03 | pierde |
| matchup | 5 | 2.75 | 3.56 | pierde |
| momento_partida | 1 | 2.25 | 2.50 | pocos casos |

### Casos

| Caso | Categoría | draft | baseline | diferencia ± juez | Resultado |
|---|---|---|---|---|---|
| build-01-vs-ap-burst | build_situacional | 2.81 | 3.62 | -0.81 ± 0.27 | gana baseline |
| build-02-antiheal | build_situacional | 2.50 | 4.44 | -1.94 ± 0.27 | gana baseline |
| build-03-tanky-enemy | build_situacional | 2.25 | 4.00 | -1.75 ± 0.00 | gana baseline |
| build-04-player-profile | build_situacional | 2.25 | 4.00 | -1.75 ± 0.00 | gana baseline |
| matchup-01-top | matchup | 2.25 | 4.00 | -1.75 ± 0.00 | gana baseline |
| matchup-02-mid | matchup | 3.75 | 2.81 | 0.94 ± 0.44 | gana draft |
| matchup-03-jungle | matchup | 2.50 | 3.12 | -0.62 ± 0.00 | gana baseline |
| ingame-01-behind | momento_partida | 2.25 | 2.50 | -0.25 ± 0.00 | gana baseline |
| build-05-vs-assassins | build_situacional | 3.06 | 4.31 | -1.25 ± 0.18 | gana baseline |
| build-06-full-ad | build_situacional | 3.06 | 3.81 | -0.75 ± 0.53 | gana baseline |
| matchup-04-bot | matchup | 2.62 | 3.88 | -1.25 ± 0.18 | gana baseline |
| matchup-05-teemo | matchup | 2.62 | 4.00 | -1.38 ± 0.00 | gana baseline |

## Veredictos del juez (orden A = variante principal)

- **build-01-vs-ap-burst** (draft contra baseline): B gana: sus runas son coherentes con Jinx, la defensa encaja con un ADC y el plan de peleas es claro. A identifica las amenazas pero comete varios errores de runas e ítems para Jinx y es demasiado larga.
  - Datos señalados: A: Conquistador y la secundaria de Brujería (Celeridad y Caminata sobre Agua) no tienen sentido en Jinx; A: Velo de la Banshee es un ítem AP y no sirve como opción defensiva de un ADC; A: la W de Kai'Sa no se llama 'Rayo del Vacío', y su E no es una habilidad de entrada; A: Cañón de Fuego Rápido como primer ítem es raro en Jinx (no verificado para el 26.22); B: el fragmento de resistencia mágica se eliminó en el rediseño de fragmentos de 2024; hoy la fila defensiva es vida, vida escalada y tenacidad/resistencia a ralentizaciones; B: 'letalidad' no tiene sentido en Jinx; B: Ritmo Letal sigue en el juego según las estadísticas del parche 26.19 (https://metabot.gg/en/league/rune/8008/stats); no lo comprobé en el 26.22; Ambas: que Immortal Shieldbow, Maw of Malmortius y Runaan's estén en el 26.22: no verificado
- **build-02-antiheal** (draft contra baseline): B gana con claridad: elige el componente y la mejora correctos para un luchador AD, dice cuándo comprar cada uno según cómo vaya la línea y no rompe la curva de Darius. A cae en el error grave de llevar el Recordatorio Mortal y tiene un dato erróneo sobre la curación de Aatrox.
  - Datos señalados: A: 'Aatrox se cura con Q, W y su pasiva'. La W de Aatrox no cura; su curación viene de la pasiva, la E y la R.; A: recomienda el Recordatorio Mortal (ítem de crítico/tirador) como antisanación de Darius y no menciona la Espada de cadena Chempunk, que es la opción natural para un luchador AD (la existencia de Chempunk en 2026 se confirma en https://mobalytics.gg/blog/lol-patch-notes-breakdown/).; A y B: Rompeavances/Stridebreaker como ítem central de Darius en 26.22: no verificado.; B: el nombre 'Espada de cadena Chempunk' en es_MX: no verificado (el ítem existe, el nombre localizado puede ser otro).; B: mezcla nombres en inglés (Stridebreaker, Trinity) en una respuesta en español; es un detalle menor de formato, no un error de contenido.
- **build-03-tanky-enemy** (draft contra baseline): B gana con claridad: responde a la pregunta del minuto 18 con un orden concreto centrado en penetración de armadura y explica bien el uso de la W y a quién pegar. A es incoherente, resta importancia a Recordatorio Mortal y vuelve a dar la build entera desde el inicio.
  - Datos señalados: A: dice 'cinco rivales resistentes', pero Jhin no es tanque; A: Recordatorio Mortal 'no es prioritario si ya llevas Espada del Rey Arruinado' es un mal consejo contra cuatro tanques con armadura acumulada; A: maximizar W primero en Vayne no es lo estándar; normalmente se maximiza Q (no verificado para 26.22); A: Conquistador como runa clave de Vayne en 26.22 (no verificado); B: dice '5 tanques', pero Jhin no es tanque (luego lo corrige al llamarlo el único objetivo blando); Ambas: los valores y la existencia de Terminus, Flechas Salvajes de Yun Tal, Espada del Rey Arruinado y Recordatorio Mortal en el parche 26.22 no están verificados con búsqueda
- **build-04-player-profile** (draft contra baseline): B gana con claridad: sus runas y su primer ítem son correctos y están adaptados a un matchup de poke mixto, y explica bien cuándo enganchar. A falla en lo básico de un support (empieza con Doran, no menciona el ítem de soporte e incluye un ítem de ARAM) y se equivoca con el tipo de daño de Ezreal.
  - Datos señalados: A: Escudo de Doran como ítem inicial de un support (lo correcto es el ítem de soporte, que A no menciona en ningún momento); A: Cuerno del Guardián en la build principal; es exclusivo de ARAM (no verificado para el parche 26.22, pero así era en parches recientes); A: describe a Ezreal como 'casi todo daño mágico', cuando su daño es principalmente físico; A: 'cámbialo por las botas' con el Manto Anulamagia es un consejo confuso; B: no dice que el ítem de soporte se mejora acumulando oro ni que permite colocar guardianes; la versión 'tanque/peel' del ítem es plausible pero no verificada para el parche 26.22; B: nombres de runas e ítems en inglés (Font of Life, Locket, Flay) en lugar de la localización es_MX
- **matchup-01-top** (draft contra baseline): B gana con claridad: describe bien la interacción E/Parry, adapta el plan por niveles e incluye oleada y jungla. A comete un error grave al describir las habilidades y se va a una guía de build que no responde a la pregunta.
  - Datos señalados: A: 'usa E para bloquear su Q': la E de Jax esquiva ataques básicos, no habilidades (solo reduce el daño de área); A: 'usa E para esquivar el Duelo': la E no esquiva la R de Fiora; A: 'Su Parry bloquea tu Q/W CC': ni la Q ni la W de Jax tienen control; solo la E aturde; A: 'Cota de Espinas reduce su curación con Parry': la Parry no cura; A: 'Presagio de Randuin reduce el daño crítico': no verificado para el parche 26.22, y Fiora no suele hacer build de crítico; A: 'Armadura Pétrea' como ítem: no verificado; B: 'la W bloquea el primer efecto de control o daño': bloquea todo el daño y los efectos durante unos 0,75 s, y solo aturde si el control bloqueado es inmovilizante (si no, ralentiza)
- **matchup-02-mid** (draft contra baseline): A es mejor: es más completa y accionable (build, orden de habilidades y plan por fases) y explica bien el uso del Zhonya contra la marca. B acierta con la Barrera y con la idea de los dos momentos para responder a la R, pero recomienda una runa eliminada, su explicación del Zhonya es confusa y le faltan pasos concretos. Ninguna de las dos explica bien en qué momento de la línea Ahri es más fuerte que Zed.
  - Datos señalados: B: 'Recolector de globos oculares' se quitó del juego en 2024 y lo sustituyó Recuerdos Macabros (dato de memoria; no lo verifiqué con búsqueda web en el parche 26.22); A: la Capa de Agilidad no es un ítem defensivo contra autoataques, solo da probabilidad de crítico; A: dice que el encanto deja a Zed 'aturdido', pero es un encanto, no un aturdimiento (detalle menor); B: 'la marca no te mata si no hay daño acumulado' como explicación del Zhonya está mal razonada; lo que evita el daño es estar en estasis cuando detona la marca; B: que el Velo de la Banshee bloquee la R de Zed: no verificado; A y B: los nombres de la E de Ahri en es_MX ('Hechizo de Seducción' / 'Hechizo seductor') y de su R ('Carrera espiritual'): no verificado; A: el nombre es_MX 'Recuerdos Macabros' para Grisly Mementos: no verificado
- **matchup-03-jungle** (draft contra baseline): B es más accionable y está mejor organizada para una pregunta previa a la partida: ruta concreta y pasos claros ante el invade. Le falta decir cuándo Kha'Zix gana el duelo y comete un error de mecánica con el aislamiento. A cubre ese momento clave (nivel 6 y evoluciones), pero tiene una ruta vaga, una build con errores y un formato denso, así que B gana por poco.
  - Datos señalados: A: 'Cachorro de Rasgafuegos' y 'Cuchilla Oscura' como nombres es_MX: no verificado; A: 'Rompebastiones' como ítem actual: no verificado; A: 'Golpe de Gracia' como runa de Precisión disponible en 26.22: no verificado; A: Espada del Rey Arruinado en la build principal de un Kha'Zix letal con Electrocutar es una elección floja e incoherente; A: subir Q>E>W; lo habitual es Q>W>E (no verificado para 26.22); A: 'el rival es solo físico' es una suposición sin datos de la composición enemiga; A: llama 'Patada del Dragón' a la R de Lee Sin; el nombre oficial es 'Furia del Dragón' (no verificado en es_MX); B: 'retrocede hacia tus laners, ahí aprovecha el aislamiento' confunde la mecánica: el aislamiento depende de que el objetivo no tenga aliados cerca, no de tener los tuyos al lado; B: la ruta Rojo→Krugs→Raptors→Azul→Gromp es plausible pero no verificada para 26.22
- **ingame-01-behind** (draft contra baseline): Las dos aciertan con la idea de armadura e ir hacia Zhonya, y las dos cometen el error grave de recomendar una compra que no cabe en 1300 de oro. B gana por formato y accionabilidad: es breve, el plan de línea es útil y da un componente concreto, aunque está mal de precio. A es una guía completa con varias recomendaciones situacionales que no encajan.
  - Datos señalados: B: Brazal del Buscador (Seeker's Armguard) cuesta 1600 de oro desde el parche 14.1, según el historial de agatasmurf.com, que llega hasta el 26.21; el precio no está verificado en una fuente oficial de Riot para el 26.22. No se puede comprar con 1300 y no sobra margen (fuentes: https://agatasmurf.com/lol-items/seekers-armguard/, https://metabot.gg/en/league/item/2420/overview, https://vpesports.com/lol/items/seekers-armguard/); B: 'Si Zed te marca con su ult, el dash puede sacarte del alcance' es incorrecto: la Marca de la Muerte detona igual aunque te alejes con el dash; A: manda comprar Reloj de Arena de Zhonya (unos 3250 de oro, precio no verificado para el 26.22) con 1300 de oro; A: 'botas defensivas' en el resumen contradice 'Zapatos de Lanzahechizos'; contra Zed lo indicado son botas con armadura (Botas de Acero Reforzado / Plated Steelcaps); A: Antifaz Embrujado no da supervivencia ni una 'ventana extra' contra burst; Fajín de Mercurio es un ítem de AD/marksman y no encaja en Ahri; A: Arcanista Axiomático como runa de Brujería: no verificado para el parche 26.22
- **build-05-vs-assassins** (draft contra baseline): B es mejor. Es más precisa y directa: da armadura y estasis con momentos de compra concretos, sin errores de kit. A cubre los criterios pero mete varios datos erróneos (inicial, habilidades de Lux, botas) en un formato demasiado largo. Ninguna recomienda resistencia mágica como defensa principal.
  - Datos señalados: A: Escudo de Doran como inicial para Lux soporte. Un soporte empieza con el ítem de soporte (Atlas del Mundo) y la respuesta no lo menciona en ningún sitio.; A: 'W para marcarlo' (Kha'Zix) y 'colocar W lejos para esquivar' (Zed). La W de Lux es un escudo; no marca ni sirve para esquivar.; A: maximizar E > W > Q no es lo habitual en Lux; normalmente se sube E > Q > W.; A: Botas de Rapidez contra tres asesinos AD es flojo; Botas Blindadas (Steelcaps) encajan mejor.; A: 'Armadura Pétrea' y 'Rompeavances': no verificado que existan con esos nombres en es_MX 26.22, y 'Rompeavances' se cita sin ninguna utilidad.; A: Zhonya como primer ítem completo en un soporte es caro y lento para el oro de un support. Es discutible, no un error grave.; B: Seeker's Armguard como componente de Zhonya en 26.22: no verificado (la receta ha cambiado en temporadas recientes). La propia B lo advierte.; B: 'aléjate de tus aliados' con la marca de la R de Zed: la marca no hace daño en área, así que el consejo es dudoso y no tiene mucho sentido.
- **build-06-full-ad** (draft contra baseline): B es más precisa y su build es coherente con un Sett bruiser contra full AD, y además se lee rápido. A tiene un orden concreto pero recomienda ítems que no le sirven a Sett o que no existen, y atribuye a las Steelcaps un efecto que no tienen.
  - Datos señalados: A: 'Bailarín Espectral' (Phantom Dancer) es un ítem de crítico de tirador y no tiene sentido en un Sett tanque contra AD; si quería decir Danza de la Muerte, el nombre está mal; A: 'Armadura Pétrea' / 'Placa de resistencia' no corresponden a ningún ítem o runa reconocible (no verificado); A: dice que las Grebas de Armacero dan 'buen anti-CC'; dan armadura y reducen el daño de ataques básicos, no tenacidad; A: Cimitarra Mercurial en Sett top contra este equipo es una elección dudosa; A: los nombres de habilidades 'Atrévete', 'Show de Fuerza', 'Puños de Fuego' y el de Darius 'Captura' no los pude confirmar en es_MX (no verificado); A: maximizar Q > W > E en vez del habitual Q > E > W (no verificado para 26.22); A: la frase 'la lista de ítems válidos que me diste' deja ver contexto interno; B: que Stridebreaker, Death's Dance, Sterak's y Randuin's Omen sigan existiendo en el parche 26.22 (no verificado)
- **matchup-04-bot** (draft contra baseline): B responde justo lo que se pregunta (niveles 1 a 3) con pasos concretos y sin errores, y respeta el gancho y la fuerza de all-in de Draven. A acierta en la idea del alcance, pero la diluye en una build larga con varios errores y es peor en formato y precisión.
  - Datos señalados: A: 'Conquistador y Cadencia Letal' son dos keystones a la vez, cosa imposible; además Conquistador es una elección rara y floja en Caitlyn; A: Placa del Hombre Muerto es una mala recomendación situacional para Caitlyn como ADC; A: la Cimitarra Mercurial no quita el tirón del gancho de Thresh una vez conecta, así que el motivo que da no se sostiene bien; A: 'no te pongas en línea con minions entre vosotros y él' es confuso o al revés: lo correcto es tener súbditos de por medio para bloquear el gancho; A: 'Cazador de Tesoros', 'Golpe de Gracia' y 'Leyenda: Celeridad' para el parche 26.22: no verificado si siguen existiendo; A: alcance del gancho de Thresh ~1100: aproximado, no verificado para 26.22; A: Huracán de Runaan como segundo ítem en Caitlyn: no verificado como build estándar en 26.22
- **matchup-05-teemo** (draft contra baseline): B gana con claridad: resuelve la pregunta (cómo farmear con el poke y el ciego de Teemo) con pasos concretos y una defensa mágica adecuada. A es una guía genérica de build con una incoherencia en la resistencia mágica. Ninguna de las dos explica que el escudo pasivo de Malphite se regenera, que era un criterio esperado.
  - Datos señalados: A: 'Corazón de Hielo' es un nombre ambiguo; no verificado si se refiere a Corazón Congelado o a otro ítem en es_MX del parche 26.22; A: Rompeavances y Placa del Hombre Muerto como core de Malphite contra Teemo: no verificado para el parche 26.22 y poco coherente con el poke mágico; A: dice que la build prioriza resistencia mágica, pero la build principal no tiene ningún ítem de RM (incoherencia interna); B: 'Empuja y farmea bajo torre' se contradice con dejar que la oleada llegue a tu torre; la intención está clara pero la frase es confusa; B: 'Compra un Oracle Lens'; la Lente del Oráculo no se compra, es un trinket gratuito que se cambia en la tienda; B: los nombres de ítems y runas vienen en inglés en vez de la localización es_MX

## Coste y herramientas

| Variante | Coste USD | Llamadas a herramientas | Errores |
|---|---|---|---|
| draft | 0.34 | 0 | 0 |
| baseline | 0.24 | 0 | 0 |
| juez | 2.48 | — | — |

## Nombres fuera del parche en la tarjeta (tras la ronda de corrección)

- Ninguno

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
