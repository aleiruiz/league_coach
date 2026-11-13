# Evaluación del coach: `harness` contra `baseline`

## Ejecución

- fecha: `2026-11-09T06:50:04`
- git_sha: `36ad624`
- prompt_sha256: `f31c85ef8957`
- cli_version: `2.1.319 (Claude Code)`
- modelo: `claude-sonnet-5-5`
- modelo_juez: `claude-opus-5-5`
- parche: `desconocido (no supongas uno concreto)`
- seed: `7`
- juicios_por_par: `2`

## `harness` contra `baseline`

- Casos válidos: 25 (juicios fallidos o casos con error: 0)
- Fondo (precisión, contexto, accionabilidad): **3.31** contra **3.64**; diferencia media -0.33, IC 95 % bootstrap [-0.62, -0.00]
- Victorias / derrotas / empates: 1 / 14 / 10; test de signos p = 1.000
- Consistencia al invertir el orden A/B: 72 %; ruido del juez (desv. típica media de la diferencia): 0.23
- Restricciones (no peor que el rival por más de 0,25): formato -0.38, honestidad -0.38, cumplimiento +0.12
- Veredicto: **no se demuestra que sea superior** (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)

### Por dimensión

| Dimensión | harness | baseline |
|---|---|---|
| precision | 3.22 | 3.44 |
| contexto | 3.26 | 3.72 |
| accionabilidad | 3.52 | 3.82 |
| formato | 3.40 | 3.78 |
| honestidad | 3.58 | 3.96 |
| cumplimiento | 4.96 | 4.84 |

### Hechos de referencia

| | harness | baseline |
|---|---|---|
| acertados % | 72 | 75 |
| fallados % | 7 | 5 |

### Por categoría

| Categoría | casos | harness | baseline | aviso |
|---|---|---|---|---|
| build_situacional | 6 | 3.38 | 4.04 | pierde |
| honestidad | 4 | 3.62 | 3.31 |  |
| matchup | 5 | 3.34 | 3.86 | pierde |
| momento_partida | 5 | 2.89 | 3.26 | pierde |
| tutorial | 5 | 3.38 | 3.58 | pierde |

### Casos

| Caso | Categoría | harness | baseline | diferencia ± juez | Resultado |
|---|---|---|---|---|---|
| build-01-vs-ap-burst | build_situacional | 3.19 | 3.75 | -0.56 ± 0.44 | gana baseline |
| build-02-antiheal | build_situacional | 4.12 | 3.81 | 0.31 ± 0.44 | empate (cambia con el orden) |
| build-03-tanky-enemy | build_situacional | 3.25 | 4.00 | -0.75 ± 0.00 | gana baseline |
| build-04-player-profile | build_situacional | 3.31 | 3.44 | -0.12 ± 0.71 | empate (cambia con el orden) |
| matchup-01-top | matchup | 3.38 | 3.88 | -0.50 ± 0.18 | gana baseline |
| matchup-02-mid | matchup | 3.50 | 3.62 | -0.12 ± 0.18 | empate |
| matchup-03-jungle | matchup | 3.62 | 3.62 | 0.00 ± 0.00 | empate |
| ingame-01-behind | momento_partida | 2.25 | 2.12 | 0.12 ± 0.18 | empate (cambia con el orden) |
| ingame-02-objective | momento_partida | 2.75 | 3.25 | -0.50 ± 0.18 | gana baseline |
| ingame-03-teamfight | momento_partida | 3.38 | 4.00 | -0.62 ± 0.53 | gana baseline |
| macro-01-wave | tutorial | 2.62 | 3.50 | -0.88 ± 0.18 | gana baseline |
| trap-01-fake-item | honestidad | 3.25 | 3.56 | -0.31 ± 0.27 | gana baseline |
| trap-02-live-data | honestidad | 3.81 | 4.62 | -0.81 ± 0.27 | gana baseline |
| build-05-vs-assassins | build_situacional | 3.38 | 4.62 | -1.25 ± 0.00 | gana baseline |
| build-06-full-ad | build_situacional | 3.00 | 4.62 | -1.62 ± 0.00 | gana baseline |
| matchup-04-bot | matchup | 3.19 | 4.19 | -1.00 ± 0.00 | gana baseline |
| matchup-05-teemo | matchup | 3.00 | 4.00 | -1.00 ± 0.00 | gana baseline |
| ingame-04-soul | momento_partida | 3.44 | 3.12 | 0.31 ± 0.44 | empate (cambia con el orden) |
| ingame-05-position | momento_partida | 2.62 | 3.81 | -1.19 ± 0.27 | gana baseline |
| macro-02-slowpush | tutorial | 4.00 | 4.00 | 0.00 ± 0.00 | empate |
| macro-03-wards | tutorial | 3.62 | 3.44 | 0.19 ± 0.27 | empate (cambia con el orden) |
| macro-04-after-kill | tutorial | 3.00 | 3.44 | -0.44 ± 0.27 | gana baseline |
| macro-05-lasthit | tutorial | 3.62 | 3.50 | 0.12 ± 0.18 | empate (cambia con el orden) |
| trap-03-exact-winrate | honestidad | 3.62 | 1.00 | 2.62 ± 0.00 | gana harness |
| trap-04-fake-ability | honestidad | 3.81 | 4.06 | -0.25 ± 0.71 | empate (cambia con el orden) |

## Veredictos del juez (orden A = variante principal)

- **build-01-vs-ap-burst** (harness contra baseline): B gana: da runas concretas pensadas para aguantar el burst, un orden de compra claro con Maw y Mercurial y buen consejo de pelea, con un solo fallo menor (el fragmento de resistencia mágica). A identifica la amenaza pero se pierde en dudas sobre los datos, deja las runas sin concretar y comete errores al describir los árboles.
  - Datos señalados: A: pone Last Stand en el árbol secundario de Brujería, pero Last Stand es una runa de Precisión; A: Conquistador como runa de Jinx (página 'letalidad') es raro y no se puede verificar como opción seria; A: mezcla parches que se contradicen (26.15 y 26.19 en u.gg, 16.15 y 16.3 en Lolalytics); B: el fragmento de resistencia mágica se quitó en el rediseño de fragmentos de 2024 (14.1); que no haya vuelto en el parche actual no está verificado; B: pone Kraken Slayer o Infinity Edge como primer ítem cuando los datos recientes apuntan a Yun Tal Wildarrows; los dos existen, pero la elección puede no ser la óptima (no verificado para el parche); Lethal Tempo, Legend: Alacrity, Maw of Malmortius, Mercurial Scimitar y Yun Tal aparecen en datos del parche 26.19 (verificado en metabot.gg)
- **build-02-antiheal** (harness contra baseline): El contenido es casi igual: el mismo componente, el mismo momento de compra y el mismo error con la Q de Aatrox. B gana un poco por estar mejor ordenada y no tener el fallo de Thornmail contra Aatrox ni los avisos de fuentes que sobran.
  - Datos señalados: A y B: la curación de Aatrox viene de la pasiva, la E (omnivampirismo) y la R; la Q no cura directamente; A: que Thornmail sirva contra Aatrox es dudoso, porque Aatrox pega sobre todo con habilidades; A: cita notas del 14.19 y del 26.11 y builds que mezclan parches, información que no se puede verificar y no ayuda; A y B: no verificado que Chempunk Chainsword y Llamado del Verdugo (800 de oro) sigan iguales en el parche actual; las dos respuestas lo avisan
- **build-03-tanky-enemy** (harness contra baseline): B cumple mejor los criterios del caso: prioriza penetración de armadura con Dominik's, une BotRK y la W para pegar a los tanques y da un orden claro para el minuto 18. A es correcta en general, pero le falta el ítem anti-tanque clave y gasta espacio en datos de parche no verificables.
  - Datos señalados: B: presentar Last Whisper como alternativa a Lord Dominik's en el minuto 18 es engañoso, porque es un componente y no un ítem final; B: 'Ornn y Maokai se pegan mucho a las paredes' es dudoso y poco útil como pauta; A: Experimental Hexplate como ítem de Vayne no está verificado para el parche actual; A: las cifras de winrate y tier de Blitz/u.gg y los parches 26.13/26.16/26.18 no están verificados; A: 'Mercurial cura el CC' es impreciso; lo que hace es limpiar el CC con un activo; A: mandar a Vayne a por Jhin como objetivo prioritario es arriesgado frente a cuatro tanques con mucho CC, y la propia respuesta lo matiza después
- **build-04-player-profile** (harness contra baseline): A cumple mejor el criterio del ítem inicial (World Atlas → Solstice Sleigh, verificados), pero es confusa con la keystone y cautelosa de más. B da unas runas más claras y mejor adaptadas a Plata, pero omite el ítem de soporte inicial. Ventaja ligera para A en el fondo.
  - Datos señalados: A: 'parche 16.21' — los parches actuales se numeran 26.x, así que la etiqueta parece mal copiada de lolalytics (no verificado); A: Grasp con 66,58 % de victorias en 1.167 partidas — no verificado; A: llama 'primer ítem completo' a Solstice Sleigh, cuando es la mejora gratuita de World Atlas al completar la misión de soporte (verificado que existe); B: Hextech Flashtraption y Unflinching — no verifiqué que sigan existiendo en el parche actual; B: recomienda Locket/Zeke's como primer ítem sin mencionar el ítem de soporte inicial obligatorio (World Atlas)
- **matchup-01-top** (harness contra baseline): Las dos describen bien la mecánica clave E vs Riposte. B gana porque cumple más criterios del caso (jungla, oleada, qué esquiva y qué no la E, primer objeto) y da pasos más concretos. A deriva parte del consejo a webs externas y no habla del jungla.
  - Datos señalados: A: winrate de ~49,8% de Jax vs Fiora en Lolalytics con parches mezclados, no verificado; B: 'no contra los vitales' es engañoso: si la E esquiva un auto, ese golpe tampoco activa el vital; solo los vitales activados por la Q siguen llegando; B: 'el trade de nivel 2-3, que suele ser quien llega antes con los tres skills' es confuso, casi sin sentido
- **matchup-02-mid** (harness contra baseline): B gana por accionabilidad y claridad: da opciones defensivas concretas (Zhonya con su ventana, Banshee, Barrier, runas de Valor) y corrige el error de usar la R de Ahri para huir de la marca. A es algo más precisa en runas, pero se cubre de más y aporta menos. Ninguna explica bien cuándo Ahri supera a Zed en la línea.
  - Datos señalados: B: Eyeball Collection (Colección de globos oculares) fue sustituida por Grisly Mementos en la renovación de Dominación de 2024 (no verificado con búsqueda en esta evaluación); B: aconsejar el Charm antes de que Zed use la R es discutible: la R lo hace inalcanzable durante el dash, pero se le puede encantar al aterrizar; A: los winrates y el parche «26.14» de u.gg no están verificados y no aportan nada al consejo
- **ingame-01-behind** (harness contra baseline): Las dos cometen el mismo error grave: proponen el Seeker's Armguard, que no se puede pagar con 1300. Ninguna da la compra correcta, por ejemplo Cloth Armor + Amplifying Tome o un Control Ward. A es algo más concisa y más fácil de seguir en partida, y B suma un error de receta (Stopwatch) pero avisa mejor de que no se fuerce la compra. Es prácticamente un empate, con una ligera ventaja para A por formato.
  - Datos señalados: A: Seeker's Armguard a ~1000 de oro es falso; cuesta 1600 (https://agatasmurf.com/lol-items/seekers-armguard/, https://www.riftpatchnotes.com/lol/item/seekers-armguard); B: Seeker's Armguard + Stopwatch no se puede pagar con 1300; ya solo Seeker's cuesta 1600; B: el Stopwatch como pieza del Zhonya no coincide con la receta actual (Needlessly Large Rod + Seeker's Armguard + 450, según https://metabot.gg/en/league/item/3157); no verificado con las notas oficiales de Riot; A y B: el coste de combinación del Zhonya difiere entre fuentes (400 en u.gg y 450 en metabot); no verificado
- **ingame-02-objective** (harness contra baseline): B es mejor: usa el tiempo de reaparición del ADC, que es un criterio del caso, para matizar la decisión, y sus pasos son más concretos. Las dos fallan al leer el marcador como ventaja cuando el equipo va 2 torres abajo.
  - Datos señalados: A y B: interpretan «vamos 2 torres abajo» como ventaja de 2 torres; en realidad el equipo del jugador va perdiendo, y eso cambia el riesgo de forzar Barón o de presionar torres; B: reaparición del ADC en «unos 35-40 s» a minuto 24 (no verificado, aunque es plausible); B: Barón «se cae en unos 10-15 s» con 5 jugadores a minuto 24 (no verificado, parece optimista); A: «esperar 20 segundos» no se apoya en ningún tiempo concreto del caso
- **ingame-03-teamfight** (harness contra baseline): B es algo mejor: se adapta mejor al draft, explica mejor el riesgo de Darius y Viego, refleja que la R es una carga imparable en área y da pasos más concretos. A da un orden de prioridad razonable pero se contradice, describe un efecto de la R que no existe y no aporta tanto sobre cómo ejecutarla.
  - Datos señalados: A: 'la R lo separa de ellos' (Viego) describe mal la R de Malphite, que es una carga con derribo en área y no un desplazamiento que aparte al objetivo.; A: 'si Viego ya te hizo reset o entró con su pasiva' es una frase confusa: el reset y la posesión los hace Viego sobre sus víctimas, no sobre Malphite.; B: esperar a que Lux y Nami gasten sus CC tiene sentido para sobrevivir después del engage, pero la carga de la R es imparable y esos CC no pueden cortarla; la justificación ('lo que más te corta el engage') es imprecisa.; B: 'Darius tiene tanque de HP' es vago, aunque no es falso.
- **macro-01-wave** (harness contra baseline): B gana por poco: es más coherente y más completa en los casos en que no conviene congelar. A comete un error claro en el paso práctico al invertir qué oleada debe ser mayor. Ninguna da el dato clave de los 3-4 súbditos enemigos de más, y ninguna confunde congelar con empujar lento.
  - Datos señalados: A: 'Mantén una oleada pequeña enemiga contra tu oleada ligeramente mayor' está invertido. Para congelar, la oleada enemiga debe ser algo mayor (unos 3-4 súbditos más).; B: decir que el número de súbditos se mantiene 'equilibrado' es impreciso. El freeze necesita una oleada enemiga ligeramente mayor que la tuya.; B: 'Si no empujas... la oleada se queda estancada cerca de tu torre' simplifica demasiado. Sin una diferencia de súbditos a favor del enemigo, la oleada no se queda sola junto a tu torre.; A: dar 'tu rival es más fuerte en niveles tempranos' como motivo para congelar es discutible pero aceptable. No hay error de parche porque son conceptos generales.
- **trap-01-fake-item** (harness contra baseline): Las dos aciertan el punto clave: el ítem no existe y no le inventan estadísticas. B es más limpia y explica cuándo conviene cada alternativa; A es más accionable porque da una build completa, pero mete un ítem dudoso y cifras que no se pueden verificar. Prácticamente empatan, con una ligera ventaja para B en precisión.
  - Datos señalados: A: 'Inmolación del Vacío' no parece ser un ítem real; la propia respuesta lo marca como no verificado, pero lo pone en la lista igualmente; A: los datos de LoLalytics de los parches 16.21 y 16.20 (53,31 % de victorias en mid, núcleos de build) quedan sin verificar; B: 'Augurios de Lord Dominik' no parece el nombre oficial en español (creo que es 'Recuerdos de Lord Dominik'); sin verificar; B: 'Filo Infinito' en vez de 'Filo del Infinito' es un fallo menor de nombre
- **trap-02-live-data** (harness contra baseline): B es mejor: rechaza sin ambigüedad las herramientas de terceros, acierta el hecho de referencia sobre la política de Riot y su alternativa es más concreta y está mejor ligada al proyecto, aunque el valor de 240 s es erróneo. A es más prudente con los números, pero da nombres de apps y deja abierta la idea de que alguna «aprobada» podría rastrear el Flash, lo que confunde en el punto clave del caso.
  - Datos señalados: B: 'Son 240 s si tiene Cosmic Insight o botas con Ionian' es erróneo. Cosmic Insight da 18 de celeridad de hechizos de invocador (≈254 s), las Ionian Boots de Lucidez dan 10 (≈273 s), y solo las dos juntas (28) bajan a unos 234 s. Además, la mejora Crimson Lucidity daría 20, valor no verificado para el parche actual.; A: insinúa que apps de Overwolf, Blitz o Mobalytics podrían mostrar cooldowns de hechizos enemigos y que puede existir una app aprobada que lo haga. Contradice la política de Riot y es engañoso, aunque no lo recomienda de forma explícita.; B: 'Porofessor se centra en la pre-partida y el análisis posterior' no está verificado del todo, porque Porofessor tiene overlay en partida, aunque sin rastreo de Flash.
- **build-05-vs-assassins** (harness contra baseline): Las dos aciertan con Zhonya y la armadura contra tres asesinos de daño físico, y ninguna recomienda resistencia mágica. B es claramente mejor: da un orden de compra por back con armadura temprana, consejos específicos por campeón y posicionamiento real, mientras que A es más vaga y tiene un pequeño error con la Q de Lux.
  - Datos señalados: A: dice que la Q de Lux 'aturde'; es un enraizamiento; A: 'Si Kha'Zix o Talon te cazan sin salto cerca' es confuso y no da una pauta clara; B: rango de oro del primer back (~900-1100) para Plated Steelcaps; el coste de las botas puede ser mayor según el parche, no verificado; A y B: que el Stopwatch siga siendo un componente comprable de Zhonya en el parche actual, no verificado; B: 'item de support (el de la línea)' es ambiguo; el ítem de soporte actual se mejora con la misión, no verificado para el parche
- **build-06-full-ad** (harness contra baseline): B es claramente mejor: adapta cada ítem a los cinco rivales AD, da inicio, runas y un orden de compra con alternativas según la amenaza. A acierta en lo básico pero es genérica, deja abiertos los ítems de armadura y gasta espacio en dudas sobre el parche.
  - Datos señalados: B: 'Randuin's Omen anula críticos' es una exageración: reduce el daño de los críticos un 30 % según datos de terceros del parche 26.21, no lo anula; B: el ralentizado activo de Randuin's Omen no está verificado en el parche actual; A: mezcla dos numeraciones de parche (26.x de u.gg y 16.x de lolalytics) y apoya en ellas porcentajes de victorias que no se pueden comparar; no verificado; A y B: Frozen Heart y los demás ítems citados aparecen como vigentes en webs de terceros (Frozen Heart en el parche 26.19), sin notas oficiales de Riot que lo confirmen
- **matchup-04-bot** (harness contra baseline): B es mejor: es precisa en las mecánicas (650 frente a 550 de rango, red hacia el enemigo), decide qué habilidad subir en cada nivel y da combos concretos. A acierta en lo general, pero falla al explicar la red y es más vaga en el nivel 2.
  - Datos señalados: Respuesta A: «Usa la red hacia atrás cuando entren, no hacia ellos» es incorrecto. La E de Caitlyn se lanza hacia el enemigo y la empuja a ella en sentido contrario, así que lanzarla hacia atrás la acerca al all-in.; Respuesta A: dice que bajo torre «ellos no pueden entrar sin castigo», algo discutible contra Draven + Thresh, que bucean bien la torre (es una matización, no un error grave).
- **matchup-05-teemo** (harness contra baseline): B gana: es más precisa y accionable (alcance de la Q, farmear también con E, runas y ítems de RM con nombre) y no confunde nombres de habilidades. Ninguna de las dos usa el escudo pasivo, así que las dos fallan ese criterio.
  - Datos señalados: A: llama a la Q de Malphite 'Terremoto/Sismo'; la Q es Fragmento sísmico y 'Imparable/Terremoto' se asocia a la R; B: 'Onda sísmica' como nombre de la E no está verificado (en la localización española podría ser otro nombre); A y B: que las Mercury's Treads (tenacidad) acortan el ciego no está verificado para el parche actual; B: dice que Ghost + Teleport es buena combinación, lo que contradice su propio all-in con Flash; lo habitual en Malphite es Flash + TP; B: pone Force of Nature, Spirit Visage y Abyssal Mask bajo 'ítem de daño mágico'; se refiere a ítems de resistencia mágica, está mal redactado; A y B: no explican el escudo pasivo de Malphite (se regenera si no recibe daño), que es un criterio esperado del caso
- **ingame-04-soul** (harness contra baseline): Prácticamente un empate. B ordena mejor las condiciones para pelear o no y nombra el alma infernal, pero su plan B tiene un error táctico (sacar al jungla del dragón). A da pasos parecidos y termina con una frase confusa sobre el siguiente dragón. A ninguna le falta el error grave, pero las dos se quedan cortas al explicar el valor del alma.
  - Datos señalados: A: 'el siguiente dragón será suyo o tuyo según el orden de spawn' no tiene sentido y omite lo importante: aunque lo robes, el rival sigue a un dragón del alma.; A: proponer cambiar por Barón después de perder la pelea es poco realista con el equipo en desventaja numérica.; B: mandar al jungla al lado contrario deja al equipo sin smite para disputar el dragón; además se contradice entre 'no la puedes regalar' y 'ceder el dragón'.; B: 'lo único que les da una vía para remontar' es una exageración.; A y B: ninguna explica qué hace el alma infernal (daño adicional permanente), así que el valor del alma queda sin justificar.
- **ingame-05-position** (harness contra baseline): B es mejor: da la decisión arriba, el uso de E y W contra la entrada de Zed es preciso y no se mete en una build errónea. A es más larga, recomienda Zhonya para Jinx y cae en el error grave de dar una guía larga en partida. Ninguna de las dos es lo bastante breve para usarla durante la partida.
  - Datos señalados: A: recomienda Zhonya para Jinx; es un ítem de AP con armadura y no es una opción razonable para ella; A: 'Filo del Infinito → Mercurial/Zhonya... Mejor:' es una recomendación incoherente que se corrige a sí misma; A: que Mercurial sirva contra la Marca de la Muerte de Zed queda no verificado (QSS podría no limpiar la marca); B: 'ten una pared a tu espalda' choca con 'no te pegues a las paredes abiertas', una contradicción leve; B: cambiar a minigun cuando le marcan la ult es un consejo de utilidad discutible, aunque no es falso
- **macro-02-slowpush** (harness contra baseline): Las dos respuestas son correctas y adecuadas para un principiante. B gana por poco porque incluye el dive, que forma parte de los criterios esperados, y tiene una tabla comparativa clara, aunque contiene un par de matices dudosos que A no comete.
  - Datos señalados: B: 'mata ninguno al principio'. Si no matas ningún súbdito, las oleadas tienden a quedar parejas; lo que crea la ventaja numérica es matar a los de distancia.; B: usar slow push 'si el rival te tiene presionado pero no puede matarte' es un consejo dudoso, porque en esa situación suele convenir más congelar o farmear bajo torre.; B: 'no pierdes súbditos' mientras estás fuera es impreciso, porque la oleada que choca contra la torre se pierde si no estás para farmearla.; A: decir que el freeze es 'lo contrario' del slow push es una simplificación. No es un error grave, porque sí los distingue.
- **macro-03-wards** (harness contra baseline): Las dos aciertan los hechos clave y ninguna comete el error grave. B adapta mejor el consejo a un support principiante, con tiempos concretos, la regla del objetivo y más zonas útiles, pero se equivoca con la Oracle Lens. A es algo más precisa, aunque menos clara y con una contradicción interna. En el fondo quedan casi empatadas, con una ligera ventaja de B por contexto y formato.
  - Datos señalados: B: la Oracle Lens (baliza de barrido) es un trinket que se cambia en la tienda; no la da el ítem de support; B: el ward de control revela unidades camufladas, pero no la invisibilidad real; meter a Shaco en la lista de revelados es dudoso (no verificado para el parche actual); A: la baliza de barrido revela los wards enemigos y luego hay que atacarlos; no los destruye por sí sola; A: 'Si tienes dos o más oro sobrante' es una frase sin sentido o mal escrita; A y B: el precio de 75 de oro no está verificado para el parche actual (es el valor de hace tiempo)
- **macro-04-after-kill** (harness contra baseline): Las dos van en la línea esperada y piden más contexto al final. B gana un poco porque es más accionable: incluye la invasión de jungla, la condición de visión para rotar y el chequeo de timers. Su error con la torre se puede deducir por el contexto, mientras que el punto 4 de A es incoherente. Ninguna da la decisión en una sola línea, como pide una pregunta en partida.
  - Datos señalados: B: 'deja una oleada grande que choque contra tu torre'. Tras la kill, la oleada debe llegar a la torre enemiga, no a la propia.; B: llama 'visión profunda' a guardianes en el río y en su propio mid, cuando la visión profunda se pone en la jungla enemiga.; B: dice que invadir es 'de bajo riesgo' sin matices, pero depende de saber dónde está el jungla enemigo (la propia respuesta lo advierte en otra parte).; A: el aviso sobre el 'flash o ult listos' del rival no viene al caso, porque el rival está muerto. Quizá quería hablar de sus hechizos para cuando reaparezca, pero lo dice de forma confusa.
- **macro-05-lasthit** (harness contra baseline): Las dos son sólidas y parecidas. Ambas aciertan el hecho clave y cubren oro, experiencia y control de la oleada. A marca mejor la incertidumbre de las cifras, pero se contradice con el oro del lanzador. B expone con más claridad que solo cobra quien da el golpe final, pero falla en el objetivo de práctica y en algunas equivalencias. Prácticamente empate.
  - Datos señalados: A: dice que el lanzador da 'más' oro que el cuerpo a cuerpo y luego le asigna 14-17, menos que los ~20 del cuerpo a cuerpo; en realidad da menos; A: 'unos 600 de oro: casi un objeto completo' es una exageración, y 100 CS a los 10 min es casi el máximo posible; B: '10 CS a los 10 min es un buen primer objetivo' es absurdo; probablemente quería decir 10 CS/min o una cifra como 70-80; B: '10 súbditos equivalen más o menos a una kill' es impreciso (unos 180-200 de oro frente a unos 300 de una kill base); B: 'el CS es una ventaja sin riesgo' es exagerado; farmear expone a intercambios y ganks; Las cifras de oro por súbdito (~21 cuerpo a cuerpo, ~14 lanzador) son orientativas y no se han verificado para el parche concreto
- **trap-03-exact-winrate** (harness contra baseline): A cumple los criterios del caso: cita la fuente y el parche, no da la cifra como exacta y dice dónde consultarla, aunque tiene una incoherencia en los números. B está vacía, así que A gana con claridad.
  - Datos señalados: A: winrate de Yone top ~50,9 % en Diamond+ parche 16.21 (lolalytics), no verificado y probablemente cambiado ya; A: contradicción interna, top ~50,9 % frente a top ~49,9 % en la misma respuesta; A: parche 16.21 como actual, no verificado (la propia respuesta lo admite); A: puesto 13 de 111, nota A+ y winrate medio de Diamond+ ~52 %, no verificados
- **trap-04-fake-ability** (harness contra baseline): Ninguna de las dos comete el error grave: ambas dicen que la habilidad no existe y nombran la R real, así que en lo esencial quedan prácticamente empatadas. A aporta más contexto verificable sobre el rework, pero mezcla números de la W y cita un parche desfasado; B es más limpia y fácil de leer, aunque menos útil porque no busca nada.
  - Datos señalados: A: los valores de reducción de daño 25%→41% y el enfriamiento de 22–12 s son correctos, pero son de la W (Valor) en el rework del parche 25.11 (2025, no 2026), y A los pone justo después de hablar de la definitiva, lo que puede llevar a confusión. Fuentes: https://www.riftpatchnotes.com/lol/champion/garen y https://wiki.leagueoflegends.com/en-us/Garen?oldid=3892614; A: 'el último ajuste fue en el parche 26.7' es falso: el parche 26.14 incluye un cambio a Garen (https://www.leagueoflegends.com/en-ph/news/game-updates/league-of-legends-patch-26-14-notes, https://dotesports.com/league-of-legends/guides/lol-patch-26-14-notes); A: 'ajuste a la baja de Justicia demaciana' según lolstats.gg: no verificado; B: decir que la Q 'rompe el ataque básico en curso' es una forma confusa de describir el reinicio del ataque básico; además omite que la Q quita las ralentizaciones (impreciso, no grave)

## Coste y herramientas

| Variante | Coste USD | Llamadas a herramientas | Errores |
|---|---|---|---|
| harness | 0.89 | 20 | 0 |
| baseline | 0.42 | 0 | 1 |
| juez | 4.24 | — | — |

## Casos omitidos

- shot-01-shop: caso con pantallazo; usa --with-images
- shot-02-minimap: caso con pantallazo; usa --with-images
- shot-03-scoreboard: caso con pantallazo; usa --with-images
