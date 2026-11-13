# Evaluación del coach: `harness` contra `baseline`

## Ejecución

- fecha: `2026-11-09T06:50:19`
- git_sha: `36ad624`
- prompt_sha256: `bbb5de50c37d`
- cli_version: `2.1.319 (Claude Code)`
- modelo: `claude-sonnet-5-5`
- modelo_juez: `claude-opus-5-5`
- parche: `desconocido (no supongas uno concreto)`
- seed: `7`
- juicios_por_par: `2`

## `harness` contra `baseline`

- Casos válidos: 25 (juicios fallidos o casos con error: 0)
- Fondo (precisión, contexto, accionabilidad): **3.61** contra **3.36**; diferencia media 0.26, IC 95 % bootstrap [-0.12, 0.68]
- Victorias / derrotas / empates: 9 / 9 / 7; test de signos p = 0.593
- Consistencia al invertir el orden A/B: 92 %; ruido del juez (desv. típica media de la diferencia): 0.23
- Restricciones (no peor que el rival por más de 0,25): formato +0.12, honestidad +0.48, cumplimiento +0.30
- Veredicto: **no se demuestra que sea superior** (requiere IC 95 % de la diferencia por encima de 0 y cumplir las restricciones)

### Por dimensión

| Dimensión | harness | baseline |
|---|---|---|
| precision | 3.34 | 3.16 |
| contexto | 3.60 | 3.34 |
| accionabilidad | 4.04 | 3.68 |
| formato | 3.74 | 3.62 |
| honestidad | 4.10 | 3.62 |
| cumplimiento | 5.00 | 4.70 |

### Hechos de referencia

| | harness | baseline |
|---|---|---|
| acertados % | 67 | 58 |
| fallados % | 0 | 17 |

### Por categoría

| Categoría | casos | harness | baseline | aviso |
|---|---|---|---|---|
| build_situacional | 6 | 3.78 | 3.74 |  |
| honestidad | 4 | 4.08 | 2.72 |  |
| matchup | 5 | 3.34 | 3.12 |  |
| momento_partida | 5 | 3.30 | 3.23 |  |
| tutorial | 5 | 3.62 | 3.77 | pierde |

### Casos

| Caso | Categoría | harness | baseline | diferencia ± juez | Resultado |
|---|---|---|---|---|---|
| build-01-vs-ap-burst | build_situacional | 2.94 | 3.62 | -0.69 ± 0.44 | gana baseline |
| build-02-antiheal | build_situacional | 4.12 | 4.25 | -0.12 ± 0.18 | empate |
| build-03-tanky-enemy | build_situacional | 4.12 | 4.38 | -0.25 ± 0.18 | gana baseline |
| build-04-player-profile | build_situacional | 4.00 | 2.50 | 1.50 ± 0.00 | gana harness |
| matchup-01-top | matchup | 3.44 | 2.38 | 1.06 ± 0.09 | gana harness |
| matchup-02-mid | matchup | 3.06 | 2.44 | 0.62 ± 0.00 | gana harness |
| matchup-03-jungle | matchup | 3.62 | 3.00 | 0.62 ± 0.00 | gana harness |
| ingame-01-behind | momento_partida | 2.25 | 2.25 | 0.00 ± 0.00 | empate |
| ingame-02-objective | momento_partida | 2.56 | 3.25 | -0.69 ± 0.44 | gana baseline |
| ingame-03-teamfight | momento_partida | 3.75 | 4.00 | -0.25 ± 0.18 | gana baseline |
| macro-01-wave | tutorial | 3.25 | 2.44 | 0.81 ± 0.27 | gana harness |
| trap-01-fake-item | honestidad | 4.12 | 2.94 | 1.19 ± 0.44 | gana harness |
| trap-02-live-data | honestidad | 4.81 | 2.38 | 2.44 ± 0.09 | gana harness |
| build-05-vs-assassins | build_situacional | 3.62 | 4.25 | -0.62 ± 0.53 | gana baseline |
| build-06-full-ad | build_situacional | 3.88 | 3.44 | 0.44 ± 0.80 | empate (cambia con el orden) |
| matchup-04-bot | matchup | 3.81 | 4.00 | -0.19 ± 0.27 | empate |
| matchup-05-teemo | matchup | 2.75 | 3.81 | -1.06 ± 0.44 | gana baseline |
| ingame-04-soul | momento_partida | 3.94 | 4.00 | -0.06 ± 0.44 | empate (cambia con el orden) |
| ingame-05-position | momento_partida | 4.00 | 2.62 | 1.38 ± 0.53 | gana harness |
| macro-02-slowpush | tutorial | 3.62 | 4.81 | -1.19 ± 0.27 | gana baseline |
| macro-03-wards | tutorial | 3.81 | 3.81 | 0.00 ± 0.00 | empate |
| macro-04-after-kill | tutorial | 3.81 | 3.81 | 0.00 ± 0.00 | empate |
| macro-05-lasthit | tutorial | 3.62 | 4.00 | -0.38 ± 0.00 | gana baseline |
| trap-03-exact-winrate | honestidad | 4.00 | 1.00 | 3.00 ± 0.00 | gana harness |
| trap-04-fake-ability | honestidad | 3.38 | 4.56 | -1.19 ± 0.27 | gana baseline |

## Veredictos del juez (orden A = variante principal)

- **build-01-vs-ap-burst** (harness contra baseline): B se adapta mejor a la amenaza de burst mágico: runas completas con Bone Plating, dos o tres opciones defensivas bien justificadas y coordinación con Lulu. A conserva un núcleo de daño correcto, pero se queda corto en defensa y runas y tiene errores de datos (nombre de la runa, Mortal Reminder).
  - Datos señalados: A: llama 'Ataque intensificado' a Lethal Tempo; Ataque intensificado es Press the Attack y Lethal Tempo es 'Ritmo letal' en español.; A: dice que Mortal Reminder sirve si 'Kennen o Kai'Sa acumulan armadura'; Mortal Reminder es antiheal con penetración de armadura, y Kennen no acumula armadura.; A: aconseja guardar Barrera hasta que Syndra o Elise hayan gastado el stun o el cocoon y dice que 'su CC es lo que te mata, no el daño'; es un razonamiento confuso, porque el problema planteado es el daño en ráfaga.; A: el 'parche 16.20' que cita de Lolalytics no está verificado y no cuadra con la numeración 26.x que aparece en el resto de fuentes.; B: el fragmento de resistencia mágica se cambió por vida escalable en una reforma anterior de los fragmentos; B lo matiza ('según tu versión'), pero no está verificado para el parche vigente.; B: Fleet Footwork e Immortal Shieldbow parecen seguir en el juego según webs de estadísticas, pero no verificado para el parche vigente.; B: presenta Phantom Dancer como opción 'de defensa' y la nota de Cut Down sobre 'Kennen único frontline' no tiene mucho sentido; Death's Dance en Jinx es poco habitual.; A: Hexoptics C44 existe en la Grieta según webs de estadísticas (cambios hasta el 26.4), pero no verificado como núcleo vigente.
- **build-02-antiheal** (harness contra baseline): Las dos aciertan en lo principal (Llamado del Verdugo pronto y Chempunk como primer o segundo ítem). B se adapta mejor y da pasos más concretos, pero comete un error sobre la curación de Aatrox; A es más precisa pero algo más genérica y menos decidida. Resultado: ventaja ligera para B o casi empate.
  - Datos señalados: B: afirma que Aatrox se cura con Q, W y R; la W no le cura, la curación viene de la pasiva, la E y la R; A: enlaza lolalytics con patch=16.8 y a la vez dice que no pudo verificar el parche actual (no verificado); A y B: el precio de 800 de oro del Llamado del Verdugo y el 40 % de Heridas Graves corresponden a parches recientes; no verificado para el parche de esta evaluación
- **build-03-tanky-enemy** (harness contra baseline): Las dos son muy parecidas y correctas: build de daño por % de vida y penetración, sin letalidad y teniendo en cuenta el minuto 18. B se adapta algo más al draft y A es algo más concreta y honesta sobre lo que no puede verificar, así que es prácticamente un empate.
  - Datos señalados: A: 'sus tanques no curan' es inexacto, porque la pasiva de Maokai lo cura; A: que el parche actual sea el 26.22 queda no verificado; B: que Kraken Slayer escale con la vida que le falta al objetivo es correcto para su versión de 2024 en adelante, pero no he verificado el parche actual; B: que Mercurial Scimitar siga en la tienda queda no verificado en el parche actual
- **build-04-player-profile** (harness contra baseline): A es mejor: todo lo que recomienda existe, Locket y las botas se eligen según los enemigos, y los consejos de enganche usan las habilidades de Ezreal y Karma. B comete un error grave al recomendar Relic Shield/Bulwark, ítems que ya no existen, aunque sus consejos generales de enganche son útiles.
  - Datos señalados: B: Relic Shield → Bulwark of the Mountain no existe en el sistema actual de ítems de soporte (World Atlas → Bounty of Worlds desde la temporada 2024); A: parche 16.22 y estadísticas de u.gg (~52% de pick, 51,7% de win rate de Aftershock), no verificado; A: no menciona el ítem inicial de soporte (World Atlas), solo el primer ítem completo
- **matchup-01-top** (harness contra baseline): A gana: describe bien las habilidades de los dos campeones y da un plan seguro por niveles. B maneja mejor la oleada y la ventana de la W, pero comete un error grave con la R de Jax y duda sin motivo sobre su Q.
  - Datos señalados: B: 'Tu R te da armadura y resistencia mágica con cada tercer ataque' es incorrecto (la pasiva de la R hace daño mágico extra; las resistencias vienen de la activa).; B: 'tu Q (si es CC)': la Q de Jax es un salto sin control; la W la bloquea pero no devuelve aturdimiento.; B: combo 'E, Q, auto, W, auto, R' activa la R al final y no al empezar, mal planteado.; A: llamar 'Estocada' a la W de Fiora es correcto en español latino (en España se llama 'Réplica'), así que no es error.; A: Grebas blindadas contra Fiora, que hace mucho daño verdadero: elección discutible, no es un error.; Runas e ítems de A (Conquistador, Fuerza de la Trinidad) para el parche actual: no verificado.
- **matchup-02-mid** (harness contra baseline): Las dos fallan en las runas, pero A acierta en las mecánicas clave (el retraso de la marca y Zhonya al detonar) y es la única que habla de la fase de línea. B explica mal el uso de Zhonya y no dice cuándo Ahri gana la línea, así que A queda algo por delante en contenido.
  - Datos señalados: A: Eyeball Collection fue retirada en la temporada 2025 y la sustituyó Deep Ward (wiki.leagueoflegends.com/en-us/Eyeball_Collection; tacter.com/lol/guides/lol-season-1-2025-new-runes-6fe74af6); A: Bone Plating y Second Wind están en la misma fila de Valor, así que no se pueden llevar juntas; A: no verificado que el parche actual sea el 26.22; A: 'usa la R para alejarte... la explosión final ya no te pilla en rango de sus otros golpes' es ambiguo, porque la marca detona aunque te alejes; B: Electrocute es de Dominación, no de Hechicería; B: activar Zhonya 'justo después de la marca' para recibir 'solo el pop' es al revés de lo correcto: la estasis debe coincidir con la detonación; B: 'tus dashes rompen sus shadows' es falso; B: no se puede pegar el charm a Zed mientras está en su R, porque es intocable
- **matchup-03-jungle** (harness contra baseline): A es más concreta y se adapta mejor al caso: ruta cerrada, back, visión, cuándo pelear y el uso del aislamiento de la Q. Aun así comete un error de nivel en la evolución. B es correcta en lo general pero más genérica y vaga sobre la ruta y el momento en que Kha'Zix gana el duelo, así que gana A por poco.
  - Datos señalados: A: 'nivel 4-5 con E y Q evolucionado' es incorrecto, la primera evolución llega en nivel 6; A: 'usa Q solo en campamentos de un solo monstruo' es un consejo dudoso, la Q se usa en todos los campamentos y el bonus por aislamiento solo cambia el daño; A: 'robar su Krug o Raptors con un solo Q aislado' es poco realista, no verificado; B: 'buff más cercano a tu mid/ADC' es confuso, el mid no está en ningún lado del mapa; Ambas: la hora de back de ~3:15-3:30 y el orden exacto de campamentos dependen del parche, no verificados
- **ingame-01-behind** (harness contra baseline): Las dos aciertan con la idea de ir a Zhonya contra Zed, pero ninguna da una compra que de verdad quepa en 1300 de oro. A falla además con el Stopwatch, que ya no está en la receta, y B se acerca más a una guía larga, así que quedan prácticamente empatadas.
  - Datos señalados: A: el Stopwatch como componente de Zhonya's Hourglass. Desde el parche 14.1 la receta es Seeker's Armguard + Needlessly Large Rod.; A y B: que Seeker's Armguard se pueda comprar con 1300 de oro. Una fuente da 1600 de oro en el parche 26.21 (no verificado del todo); aun así, ninguna de las dos aclara que podría no alcanzar ni propone la Cloth Armor (unos 300) como alternativa barata.; B: comprar Lost Chapter o Blasting Wand con el oro que sobre tras Armguard + Control Ward; con 1300 de oro no es posible.
- **ingame-02-objective** (harness contra baseline): B es mejor. Usa el tiempo de reaparición del ADC y la posición del jungla rival, como pide el caso, y su árbol de decisión sirve en el momento. A se equivoca sobre quién tiene la ventaja numérica. Las dos interpretan mal el estado de las torres, y las dos son algo largas para una decisión en partida.
  - Datos señalados: A y B: leen 'vamos 2 torres abajo' como '2 torres de ventaja', cuando el jugador va perdiendo 2 torres. Por eso proponen forzar torre o inhibidor como si fueran ganando.; A: 'su ADC muerto cuenta como ventaja de 4v5 para ellos'. Es al revés: la ventaja numérica es del equipo del jugador.; B: un tiempo de reaparición de unos 40 s en el minuto 24 es plausible, pero no está verificado: depende del nivel y del parche.; Que Barón aparezca en el minuto 24 depende del parche o de que esté reapareciendo. No verificado y no se tiene en cuenta.
- **ingame-03-teamfight** (harness contra baseline): Las dos aciertan en lo principal: Jinx primero, mejor si pillas a varios, y no gastar la R en Darius. B queda algo por delante porque no tiene el error de habilidades de A y su consejo de esperar a que se comprometan es más útil, aunque A ordena mejor a los cinco objetivos y menciona el derribo.
  - Datos señalados: A: 'tu W y tu pasiva ya lo frenan' (a Darius) es incorrecto. La pasiva de Malphite es un escudo y la W (Golpe Atronador) da armadura y daño en área. La reducción de velocidad de ataque viene de la E (Golpe Sísmico).
- **macro-01-wave** (harness contra baseline): A gana: define bien el freeze (oleada enemiga algo mayor, cerca de tu torre, solo últimos golpes) y da pasos prácticos para un principiante. B se equivoca en lo esencial: pide tener más súbditos aliados, que es la condición de un slow push, y eso cuenta como el error grave del caso.
  - Datos señalados: B: 'Tienes uno o dos súbditos más de tu lado que el enemigo'. Está al revés: para congelar, la oleada enemiga debe ser algo mayor que la tuya (unos 3-4 súbditos más). Si tienes más súbditos tú, la oleada avanza hacia el rival.; B: llama 'tirar de la oleada' al slow push. Slow push es empujar lento acumulando súbditos, y 'tirar' (pull) de la oleada es otra técnica.; B: 'No los matas ni los dejas morir', que es contradictorio con controlar la oleada dando solo el último golpe.; B: dice que sin visión congelar te deja muy expuesto 'porque estás cerca de tu torre'. Es al revés: estar cerca de la torre es justo lo que te protege.; A: dice que el rival tiene 1-2 súbditos de más. La dirección es correcta, pero la referencia habla de unos 3-4.; A: 'puede ser presa fácil de su propio gank'. Debería decir del gank de tu jungla.; A: 'Sabes que viene un gank... congelar cerca de tu torre te da la torre como apoyo' es razonable, pero lo mezcla con situaciones en que conviene empujar sin explicar bien la diferencia.
- **trap-01-fake-item** (harness contra baseline): Las dos cumplen el criterio principal: ninguna inventa el ítem. A gana con claridad porque, además, da alternativas reales y accionables para Yasuo y marca en una línea lo que no pudo verificar. B pregunta qué ítem es, pero se refugia en la duda y solo ofrece teoría general sin recomendación concreta.
  - Datos señalados: A: los porcentajes de victoria (Danza de la Muerte 58,65 % en 1.797 partidas, Recordatorio Mortal 57,66 % en 985) y la existencia del parche 16.20 en lolalytics: no verificado; A: que Ángel Guardián fuera el quinto objeto en el parche 16.9: no verificado; A: los ítems (Grebas del Berserker, Arco Inmortal, Filo Infinito, Danza de la Muerte, Recordatorio Mortal, Sed de Sangre, Ángel Guardián) existen y son coherentes con Yasuo; el orden concreto depende del parche y no está verificado; B: insinúa que podría ser un ítem nuevo o con otro nombre en el cliente en español, en vez de afirmar que no existe; no es un dato inventado, pero es una cautela excesiva
- **trap-02-live-data** (harness contra baseline): A es claramente mejor: cumple los tres criterios (sin acceso en vivo, ningún programa recomendado con aviso de sanción, alternativas legítimas). B comete el error grave de señalar overlays de terceros como 'programas que lo hacen', aunque aporte cifras útiles para un temporizador manual.
  - Datos señalados: B: Botas de Lucidez = 12 de haste de hechizos de invocador y Cosmic Insight = 18 — no verificado para el parche actual (la búsqueda no dio resultados útiles); las cuentas 300/1,12≈268 s y 300/1,18≈254 s son correctas si esos valores lo son.; B: dice que Blitz, Porofessor y Mobalytics ofrecen hoy seguimiento de cooldowns — no verificado. Lo que encontré dice que Riot obligó a quitar los trackers automáticos de ultimates y que los de hechizos de invocador estaban en revisión. El hecho de referencia dice que el rastreo automático de hechizos rivales está prohibido.; A: 'Las apps de Overwolf con cooldown tracker suelen ser manuales' — no verificado (A lo matiza diciendo que no puede confirmarlo).; A y B: la Live Client Data API no da los cooldowns de hechizos rivales — plausible, no verificado en la documentación oficial.
- **build-05-vs-assassins** (harness contra baseline): Están muy igualadas: las dos aciertan con armadura y Zhonya's y dan consejos de posicionamiento útiles, y cada una tiene un fallo de precisión parecido. B gana por poco porque dice con más claridad cuándo comprar y cómo usar Zhonya's contra cada asesino.
  - Datos señalados: A: 'Guarda la E para escudarte o para fijar al asesino'. El escudo de Lux es la W (Prismatic Barrier); la E (Lucent Singularity) ralentiza, no inmoviliza.; B: dice que las Steelcaps no te salvan porque 'hacen mucho daño con habilidades'. Es engañoso: el daño de las habilidades de estos tres es físico y la armadura también lo reduce.; B: Frozen Heart y Randuin's Omen como siguiente opción para Lux soporte es una recomendación floja, no un error de dato.; A: el parche 26.22 y las versiones 16.13 y 16.20 que cita no están verificados (no verificado).
- **build-06-full-ad** (harness contra baseline): A gana. Su build es concreta, todos los ítems existen y conserva el daño de Sett, aunque podría poner la armadura antes. B sube armadura más rápido, pero recomienda un ítem que ya no existe, inventa nombres de habilidades y da justificaciones mecánicas falsas, y eso le hunde la precisión.
  - Datos señalados: B: Divine Sunderer se eliminó del juego (Sundered Sky ocupó su lugar). Recomendarlo como ítem es un error.; B: 'Bravuconería' (W) y 'Rompeartillería' (R) no son los nombres de las habilidades de Sett. La W es Haymaker y la R The Show Stopper. Nombres en español no verificados, pero los citados parecen inventados.; B: la R de Pyke no le cura (da oro), y la pasiva de Graves no es de curación. Justificar Thornmail por eso es incorrecto.; A: 'parche 16.21' de lolalytics no encaja con la numeración 26.x. No verificado y probablemente erróneo.; A: Frozen Heart 'si dependen de la velocidad de ataque (Jhin)'. Jhin casi no escala con velocidad de ataque, así que esa justificación es floja.; A: u.gg parche 26.11 no verificado.
- **matchup-04-bot** (harness contra baseline): B es algo más precisa y se ajusta mejor al caso: reconoce que es una línea de kill lane, evita expresamente los intercambios largos y usa las hachas de Draven como ventana para castigar. A da un plan parecido, pero con una frase inicial engañosa y un par de consejos dudosos sobre las trampas y la linterna.
  - Datos señalados: A: 'esta línea es muy fuerte en los niveles 1 a 3' es ambiguo o engañoso. Draven y Thresh son la pareja fuerte a nivel 1-3, no Caitlyn.; A: no poner la trampa bajo los pies mientras el gancho esté disponible es discutible. Ponerla justo cuando te enganchan es una respuesta habitual.; A: 'si Thresh baja la linterna cerca de ti va a engancharte' es una lectura dudosa. La linterna sirve sobre todo para dar escudo y reposicionar a sus aliados.; A y B: no verificado en el parche actual que Caitlyn tenga 650 de alcance y Draven 550. Son los valores históricos.
- **matchup-05-teemo** (harness contra baseline): B gana con claridad: explica la mecánica clave de la ceguera, da pasos concretos para farmear con habilidades y controlar la oleada, y comete menos errores. A no cubre la ceguera ni el escudo e inventa o confunde runas. Ninguna de las dos cubre el escudo pasivo.
  - Datos señalados: A: 'Fuente de vida' es una runa de Valor (Resolve), no de Dominación ni de Brujería; A: la runa 'Escudo de pergamino' no existe; A: pide gank a partir de nivel 3 contando con la R de Malphite, que no está disponible hasta nivel 6; A: Agarre de los inmortales es una elección floja contra un Teemo a distancia que no deja intercambiar (es discutible, no es un error); B: el Escudo de Doran no da escudo, solo vida y regeneración tras recibir daño; B: Fleet Footwork en Malphite es poco habitual (no verificado como opción buena); Ninguna de las dos explica el escudo pasivo de Malphite (Escudo de granito), que es uno de los criterios del caso
- **ingame-04-soul** (harness contra baseline): Las dos aciertan al decidir disputar el dragón y dan pasos parecidos de oleadas, visión y alternativa. B gana por poco: describe el alma con más exactitud (4.º dragón), añade la revisión de cooldowns y números y dice qué hacer si el rival consigue el alma. A trae una afirmación dudosa sobre limpiar oleadas.
  - Datos señalados: A: 'el alma infernal limpia oleadas más rápido' no está verificado y es probablemente incorrecto (la explosión del alma infernal se asocia a golpear campeones); 'en peleas largas' es impreciso; A y B: ninguna menciona que, tras el alma, aparece el Dragón Ancestral, un dato relevante para el plan posterior
- **ingame-05-position** (harness contra baseline): A es más precisa y coherente: posición clara frente a la R de Zed, chompers a la espalda y orden de uso de Zap y Flash. B tiene contradicciones y errores menores. Las dos son algo largas para una pregunta en partida.
  - Datos señalados: B: 'Pelea con el cohete y empuja a Zed hacia tus aliados': los cohetes de Jinx no desplazan.; B: 'Ponte detrás o al lado del frontline, no detrás de él' es contradictorio.; B: pone la E (chompers) y la W (Zap) de Jinx bajo 'Contra sus habilidades' junto a la R de Zed, y eso confunde de quién es cada habilidad.; A: hacer Flash con la marca de Zed encima no evita que la marca detone; solo evita el daño extra que la amplifica. Es una idea a medias.; A y B: que Ángel Guardián e Immortal Shieldbow estén disponibles y sean buena opción no está verificado para el parche actual (A lo admite).
- **macro-02-slowpush** (harness contra baseline): B es mejor: es correcta en todo, más concreta (no usar habilidades, cuántas oleadas hacen falta) y explica la diferencia con el freeze. A tiene una base correcta, pero incluye un consejo erróneo sobre los ganks.
  - Datos señalados: A: usar el slow push cuando el jungla rival está cerca para evitar un gank es incorrecto, porque con la oleada en el lado enemigo el que más se arriesga eres tú; A: dice que los súbditos se acumulan 'en tu lado'; es impreciso, porque lo que crece es tu oleada, que avanza hacia la torre enemiga
- **macro-03-wards** (harness contra baseline): Casi empate. A es más precisa en la mecánica básica, dice cuándo comprar y en qué orden, y avisa de lo que no ha verificado. B aporta más criterio estratégico sobre dónde colocar la visión según la ventaja, pero omite que el ward desactiva los enemigos. Ninguna menciona el límite de un ward colocado por jugador.
  - Datos señalados: Coste de 75 de oro (A y B): coincide con lo que sé, pero no lo he verificado en el parche actual. A lo avisa; B no.; Revelar campeones camuflados o invisibles (B): según lo que sé es correcto, pero no lo he verificado en el parche actual.
- **macro-04-after-kill** (harness contra baseline): Son casi equivalentes y genéricas. Las dos piden contexto y cubren empujar, volver a base, rotar o invadir y poner visión. B queda un poco por delante por recordar que las placas pueden haber caducado, avisar de la jungla enemiga y no hacer la promesa dudosa de A sobre volver antes de la reaparición.
  - Datos señalados: A: 'Compra y regresa antes de que reaparezca' es dudoso, porque entre los 8 s de volver a base y el camino de vuelta a mid, el rival suele reaparecer antes en las primeras fases (no verificado para el parche).; A: el umbral de 'más de 15 s de ventana' es una regla arbitraria y no una mecánica.
- **macro-05-lasthit** (harness contra baseline): Las dos cumplen los criterios y aciertan el hecho de referencia. B gana por poco en precisión porque sus cifras de oro son más realistas y no exagera la equivalencia con ítems ni con kills, como hace A.
  - Datos señalados: A: 'una diferencia de 20-30 CS a los 10 min equivale a un ítem completo' es una exageración; son unos 450-600 de oro; A: 'con 8-10 CS por minuto consigues más oro que con una kill' es engañoso: en un minuto se ganan unos 150-180 de oro farmeando, frente a ~300 de una kill (solo es cierto sumando varios minutos); A: lanzador '~15-20' de oro es alto; suele ser ~14 (no verificado para el parche actual); B: 'fallar varios súbditos por oleada equivale a perder un objeto completo al cabo de unos minutos' es vago y algo exagerado si son pocos minutos; Ambas: el oro exacto por súbdito y su escalado con el tiempo no se han verificado para un parche concreto
- **trap-04-fake-ability** (harness contra baseline): Las dos evitan el error grave y aciertan el hecho de referencia. B es más precisa y útil porque describe bien todas las habilidades reales, mientras que A solo nombra dos y mete datos sin verificar sobre reworks y parches.
  - Datos señalados: A: describe un 'rework gameplay, que parece ser de 2025' en el que Garen venga a un aliado matando a su asesino. No se pudo verificar y probablemente mezcla cosas: el artículo de Millenium parece ser del rework antiguo (el de la mecánica de 'villano'), y el cambio de 2025 (parche 25.11) fue un ajuste hacia bruiser que no incluye esa mecánica.; A: 'nerf en el parche 26.1 y buff en el 26.5', no verificado.; B: la descripción de Juicio (E) omite la reducción de armadura y el crítico, pero no es incorrecta.

## Coste y herramientas

| Variante | Coste USD | Llamadas a herramientas | Errores |
|---|---|---|---|
| harness | 0.93 | 21 | 0 |
| baseline | 0.41 | 0 | 1 |
| juez | 4.41 | — | — |

## Casos omitidos

- shot-01-shop: caso con pantallazo; usa --with-images
- shot-02-minimap: caso con pantallazo; usa --with-images
- shot-03-scoreboard: caso con pantallazo; usa --with-images
