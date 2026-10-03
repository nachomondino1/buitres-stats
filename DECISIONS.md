# Decisiones

Decisiones tomadas durante el desarrollo que no estaban (o no quedaron resueltas) en `SPEC_buitres_v3.md`, con su motivo.

## Logros, rankings, comparador y rival favorito (pedido de la usuaria)

La usuaria pidió ideas de otras apps de fútbol amateur con foco en que los
jugadores se sientan "pro" (ego) y en competencia sana entre amigos, e
implementar las que se pudieran. Se agregó, 100% calculado client-side sobre
`data.json` (sin tocar el pipeline de Python ni el schema):

- **Ficha de jugador "tipo pro"**: tarjeta de cabecera (avatar, PJ/G/A/G+A) +
  logros/badges ganados + "rival favorito" (contra quién metió más goles),
  arriba de la tabla partido a partido que ya existía.
- **Logros/badges automáticos** (`logrosJugador` en `stats.js`): Goleador,
  Asistidor, Figura, Inoxidable, Picante y En racha, con umbrales elegidos
  mirando los datos reales de hoy (17 partidos, 108 goles entre 29 jugadores)
  para que varios jugadores los puedan alcanzar, no solo el líder histórico
  (`UMBRALES_LOGROS`, recalibrar ahí si el dataset crece mucho).
- **Racha goleadora individual** (`rachaGoleadoraJugador`): mismo espíritu que
  `rachasHistoricas()` (la de equipo) pero por jugador, sobre "convirtió sí/no"
  en vez de G/E/P.
- **Rankings con 2do/3er puesto** en "Jugadores destacados" de Resumen, no
  solo el líder (`topJugadoresPorCategoria`) — más competencia visual sin
  crear una sección nueva.
- **Comparador de 2 jugadores** (`compararJugadores`, sección "Comparar" en
  la vista Jugadores): cierra el ítem que ya estaba en `BACKLOG.md`. Es una
  comparación de **estadísticas** lado a lado, no un historial de
  enfrentamientos directos entre ellos — Buitres no arma equipos internos
  (todo partido es Buitres vs. un rival externo), así que esa noción no existe
  en los datos. Estado del comparador a propósito NO vive en la URL (a
  diferencia de filtros/orden/ficha): impacto/esfuerzo no lo amerita para una
  comparación que se arma y se tira.

**Descartado, no por falta de interés sino por arquitectura**: votación de MVP
por partido y predicciones/polla pre-partido. El sitio es estático y de solo
lectura (`fetch("data/data.json")`, sin backend, sin cuentas, sin forms) —
cualquiera de las dos necesita infraestructura real de escritura (base de
datos, auth) que hoy no existe. Quedan anotadas en `BACKLOG.md` por si en
algún momento se decide agregar ese backend.

## Medición de visitas: GoatCounter

Se agregó un contador de visitas (`site/index.html`) para saber cuánto se usa el
sitio. Se eligió **GoatCounter** en vez de Google Analytics:

- No usa cookies ni recolecta datos personales, así que no hace falta agregar un
  aviso/banner de consentimiento (GA4 sí lo requeriría al usar cookies).
- Instalación mínima: un solo `<script>` con el código del sitio, nada de tags de
  medición, streams ni consola de configuración.
- El propio script de GoatCounter ignora automáticamente las visitas desde
  `localhost`, así que probar el sitio en desarrollo no ensucia las estadísticas
  reales.
- Las estadísticas son más básicas que GA4 (visitas, páginas, referrers, sin
  embudos ni segmentación), pero alcanzan para el objetivo de "saber si se usa".

## Ajustes finos sobre las 3 vistas (pedidos de la usuaria, revisados en el navegador)

Ronda de retoques puntuales después de armar las 3 vistas, cada uno probado en
desktop y mobile antes de seguir con el siguiente:

- **Tabs y filtros centrados en desktop**: `justify-content: center` en `.filtros` y
  `nav.tabs`. Inofensivo en mobile (ahí el eje principal de `.filtros` es vertical por
  el `flex-direction: column`, así que centrar no cambia nada visible).
- **Título "Resultados"** agregado a la primera sección de Resumen (las tarjetas de
  equipo no tenían encabezado propio, a diferencia de "Jugadores destacados" y "Último
  partido").
- **"Gráficos" → "Goles"** en la segunda sección de Equipo (subnav + `<h2>`): esa
  sección es específicamente sobre goles (evolución, fuente, por tiempo), no gráficos
  en general.
- **Más espacio entre filtros**: `gap` de `.filtros` de `0.75rem` a `1.5rem`.
- **Sin decimales en ningún lado**: `fmtNum`/`fmtPct` (en `ui.js`) pasan de
  `maximumFractionDigits: 2`/`1` a `0` — afecta "Min/G+A" y todos los porcentajes
  (antes p.ej. "52,9%" o "116,67"). Los gráficos (Chart.js) ya redondeaban los ejes
  (`ticks: { precision: 0 }`), no hubo que tocarlos.
- **Valores de tabla centrados**: el default de `th`/`td` pasa de `text-align: right`
  a `center`; se mantienen a la izquierda la primera columna (ya tenía su propia regla)
  y las columnas de texto/nombre con `style="text-align:left"` explícito (Goleador,
  Participación, Heatmap) — "los valores" se entendió como las columnas numéricas, no
  los nombres de jugadores.
- **Tocar el título vuelve a Resumen**: el `<h1>` ahora envuelve un `<button>`
  (`.boton-titulo`, estilado para no parecer un botón) que resetea `estado.vista` y
  hace `scrollTo` arriba — mismo patrón que un logo/home de cualquier sitio.
- **Nav fijo arriba en desktop al scrollear** (`position: sticky; top: 0`, solo
  `nav.tabs`, no los filtros — se consideró pero los filtros ocupan mucho más alto y
  en Resumen, que es corto, hubiera sido puro costo sin beneficio). Hizo falta
  `scroll-margin-top` en las secciones (`main section[id]`) para que el scroll-to-section
  del subnav y de "ir a la ficha de un jugador" no quedara tapado por la barra fija.

## De 6 pestañas a 3 vistas con secciones (pedido de la usuaria)

Se simplificó la navegación: en vez de una pestaña por tabla/gráfico (Resumen,
Partidos, Gráficos, Jugadores, Ficha de jugador, Dúos), quedan 3 vistas con varias
secciones apiladas adentro:

- **Resumen**: tarjetas de equipo (PJ/%vict/G/E/P/GF/GC/Dif/racha) + **"Jugadores
  destacados"** (nuevo: máximo goleador, máximo asistidor, más influyente en G+A, más
  partidos jugados — pedido explícito de la usuaria, "que sea un resumen de verdad" de
  equipo y jugadores) + "Último partido".
- **Equipo**: sección "Partidos" (la lista con detalle al expandir) + sección
  "Gráficos del equipo" (Evolución GF/GC, Fuente de goles, Goles por tiempo).
- **Jugadores**: sección "Tabla" (la de siempre) + "Gráficos" (ranking
  goleadores/G+A) + "Dúos asistidor→goleador" + "Ficha de jugador" (selector +
  historial), todo en la misma página.

**Jugadores destacados** se calcula con `jugadoresDestacados()` (nuevo en `stats.js`):
toma el máximo de cada métrica sobre `tablaJugadores()` ya existente — no es una
agregación nueva, es un `reduce` sobre datos que ya se calculaban. Un jugador en 0 no
cuenta como "destacado" (no tiene sentido resaltar a alguien con 0 goles como "máximo
goleador" solo porque nadie metió ninguno con esos filtros) → esa tarjeta queda vacía
("–"). En caso de empate gana el primero en el orden de `data.jugadores` (determinístico,
no es "más justo" que otro criterio, pero es predecible).

**Navegación entre secciones de una misma vista:** como Equipo y Jugadores quedaron
páginas largas (antes eran 2-4 pestañas separadas), se agregó una fila de botones
("subnav") arriba de cada una que hace scroll suave a la sección — sin esto, Jugadores
en particular (tabla + gráfico + dúos + ficha) era mucho scroll a ciegas. Tocar un
jugador (en la tabla, en los dúos no por ahora, o en una tarjeta de "destacados" en
Resumen) lleva directo a la sección Ficha con ese jugador ya elegido y hace scroll ahí
— antes esto era cambiar de pestaña, ahora es la misma página.

**Compatibilidad con links viejos:** un link guardado con `?vista=graficos` o
`?vista=partidos` (de antes de agrupar) redirige a `equipo`; `?vista=ficha` o
`?vista=duos` redirige a `jugadores` — mejor que resetear en silencio a Resumen.

Se sacó el botón "Volver a Jugadores" de la Ficha (tenía sentido cuando era una pestaña
aparte; ahora es la misma página, así que "volver" es scrollear o tocar "Tabla" en el
subnav).

## "Versión 2" de diseño y flujo (pedido de la usuaria, revisado antes de commitear)

La usuaria pidió repensar diseño/flujo del sitio "desde cero" dentro de lo razonable;
se armó una lista de ideas (flujo: tarjeta de último partido, swipe entre pestañas
descartado por conflicto con el scroll horizontal de las tablas, pestañas fijas abajo
en mobile, volver desde Ficha de jugador; diseño: avatar con color por jugador,
racha en puntitos, skeleton loader, toggle de tema) y se implementó un subconjunto
con buen impacto/esfuerzo y bajo riesgo visual. Se mostró el resultado en el navegador
antes de commitear (pedido explícito) y se ajustó con feedback real:

- Se sacó "Por tipo de partido" de Resumen (quedaba redundante con el filtro Tipo ya
  existente) — de paso se borró `resumenPorTipo()` de `stats.js` y su test, ya sin uso.
- La tarjeta "Último partido" pasó de arriba de todo a debajo de las tarjetas de
  resultado, con su propio `<h2>` (si no, no quedaba claro qué era).
- Filtro "Rival": se le agregó una etiqueta "Rival" arriba del desplegable (antes el
  nombre solo vivía dentro del `<summary>`, inconsistente con "Tipo"). "Resultado"
  pasó de 3 checkboxes sueltas a usar el mismo desplegable multi-selección que Rival
  (menos espacio, mismo patrón) — con un `textoResumenSeleccion()` compartido: "Todos"
  si no hay nada tildado, los valores si son ≤2, o el total si son más.
- Bug visual que surgió recién en mobile real: el `<select>` de Tipo se estira al 100%
  del ancho (es un `<select>` dentro de un flex column con `align-items: stretch`
  implícito), pero el `<summary>` de los desplegables es `inline-flex` y no hereda eso
  — quedaba angosto al lado de Tipo. Se le fuerza `width:100%` + `justify-content:
  space-between` solo en el media query mobile (en desktop, con los filtros en fila,
  el tamaño por contenido es lo que corresponde).
- Toggle de tema manual: ciclo auto → oscuro → claro → auto, guardado en
  `localStorage`. Usa el patrón `:root:not([data-theme="light"])` dentro del
  `@media (prefers-color-scheme: dark)` + `:root[data-theme="dark"]` repetido afuera,
  para que "forzar claro" le siga ganando al sistema en modo oscuro. Un script inline
  en el `<head>` (antes de cargar `ui.js`) aplica el tema guardado antes del primer
  pintado, si no hay flash del tema equivocado al cargar.
- Avatar con color por jugador: hash simple del nombre -> hue de HSL, determinístico
  (mismo jugador, mismo color siempre). Es la alternativa de "identidad visual" que se
  había descartado con la foto grupal (ver más abajo) — no depende de fotos reales.
- De paso, se encontró que el `defer` en `vendor/chart.min.js` (agregado en el fix de
  Lighthouse) se había perdido sin querer al revertir el commit de la foto del
  plantel, porque venían bundleados en el mismo commit. Restaurado.

## Orden de la tabla de jugadores en la URL (quinto ítem del backlog, impacto/esfuerzo)

Era el que quedaba más barato del backlog: mismo patrón que ya existía para
tipo/rivales/resultados/últimos (`leerFiltrosDeURL`/`actualizarURL`), solo que
`orden.jugadores` vive aparte de `estado.filtros` (no es un filtro, es una preferencia
de visualización) así que no se toca con "Limpiar filtros" ni se pierde al cambiar de
pestaña. Se omite de la URL cuando está en el default (`g` desc) para no ensuciarla
con el caso más común.

## Nueva columna "PJ c/ G+A" (pedido de la usuaria) + bug de caché de la PWA

La usuaria pidió, en la tabla de jugadores, en cuántos partidos distintos metió cada
uno al menos un gol o asistencia (no es lo mismo que G+A: un jugador puede meter 2
goles en el mismo partido y eso cuenta como 1 solo partido acá). Se agregó
`partidosConGa` en `tablaJugadores()` (`stats.js` y su espejo `stats_ref.py`): un
`Set` de `id_partido` por jugador, donde cada gol GF agrega su partido tanto al
goleador como al asistidor (si lo tiene) — el tamaño del set es la respuesta. Columna
"PJ c/ G+A" en la tabla, entre "G+A" y "TA".

**Bug al implementarlo, encontrado durante la verificación visual:** el `<tr>` de cada
fila en `renderJugadores()` está armado a mano con `<td>` fijos (no generado a partir
de `COLUMNAS_JUGADORES`, que sí define el header). Agregar la columna ahí no alcanzaba
— quedaba el header sin el dato, corriendo todas las columnas siguientes. Si solo se
hubiera mirado el resultado con los tests de `stats.js` (que pasaban igual, porque
prueban la función pura, no el render), esto no se hubiera detectado.

De paso se encontró un segundo bug, más serio, en el service worker de la PWA agregada
unos commits atrás: cachea el "app shell" (HTML/CSS/JS) en `install()`, pero como
`sw.js` no cambió de contenido en este commit, el navegador no dispara un nuevo
`install()` — el cache sigue sirviendo el JS de la versión anterior indefinidamente, a
pesar de que `index.html`/`stats.js`/`ui.js` sí cambiaron. Se cambió la estrategia de
"cache-first" a "stale-while-revalidate" para el shell (sirve lo cacheado al toque,
pero siempre dispara un fetch en paralelo que actualiza el cache para la próxima vez,
así nunca queda pegado más de una carga) y se subió `CACHE` a `"buitres-v2"` para
limpiar lo que haya quedado cacheado del service worker ya publicado. Si en el futuro
se cambia algo de `sw.js` mismo (no solo los assets que cachea), igual conviene subir
el número de versión a mano.

## PWA instalable (cuarto ítem del backlog, impacto/esfuerzo)

Entre lo que quedaba del backlog, se eligió esta por sobre Google Analytics (pide que
la usuaria cree una cuenta/propiedad externa, igual que gsheets) y por sobre
comparador de jugadores / export a imagen (más esfuerzo de UI). El sitio ya "anda bien
en el celular" (confirmado por la usuaria) así que hacerlo instalable es la forma más
directa de aprovechar eso: ícono en la pantalla de inicio, abre a pantalla completa sin
la barra de Chrome/Safari.

`site/manifest.json` (nombre, ícono, `display: standalone`, `theme_color` tomado de
`--color-acento`) + `site/sw.js` (service worker) + tags en `index.html`
(`apple-touch-icon`/`apple-mobile-web-app-*` para iOS, que no lee `manifest.json`).
Los íconos (`media/icon-192.png`, `-512.png`, `-180.png`) se generaron con `sips` desde
el logo ya existente (`cuadrada-transparente.png`, 500×500 con alpha).

El service worker cachea el "app shell" (HTML/CSS/JS/vendor/íconos) para que abra rápido
y funcione sin red después de la primera visita, pero **`data/data.json` siempre va a la
red primero** y solo cae al cache si no hay conexión — si cacheara los datos como el
resto, alguien podría ver estadísticas viejas después de cargar un partido nuevo sin
darse cuenta. No se persiguió el audit de "Installable" de Lighthouse (la CLI usada no
trae esa categoría en esta versión); se verificó a mano que `manifest.json` y `sw.js`
cargan bien y que el service worker queda `activated`.

## Foto del plantel: probada y revertida (feedback visual de la usuaria)

Se agregó una foto grupal arriba del header (ver commit revertido), optimizada y sin
pegarle al Lighthouse (quedó en 92/100/100/100). La usuaria la vio publicada y pidió
sacarla ("queda muy mal") — revertido sin discutir el motivo técnico, es una decisión
de diseño/gusto, no de performance. Queda en el backlog como "fotos del plantel /
jugadores" por si se retoma con otro tratamiento (por ejemplo más chica, en la ficha
de jugador en vez de como banner de ancho completo).

## Lighthouse real (segundo ítem del backlog): Performance 85→100

La spec original pedía "Lighthouse mobile ≥ 90 en Performance y Accessibility" como
DoD de Fase 3, pero nunca se corrió la herramienta de verdad (solo revisión manual).
Se corrió con `npx lighthouse` contra el sitio servido en local (Chrome headless, hay
`Google Chrome.app` instalado en la máquina). Resultado antes de tocar nada:
Accessibility/Best Practices/SEO ya estaban en 100; Performance en 85, arrastrado casi
entero por Cumulative Layout Shift (CLS 0.264-0.46, con el peso más alto de toda la
categoría: 25).

**Causa real del CLS, y un intento fallido antes de encontrarla:** el audit señala
`body > main` como el nodo que shiftea, pero la causa no es la altura de `main` en sí
— es que `.filtros` y `nav.tabs` (los elementos ANTES de `main`) arrancan casi vacíos
(se construyen recién cuando `data.json` termina de cargar) y lo empujan de golpe hacia
abajo al poblarse. El primer intento, ponerle `min-height` a `main`, **empeoró** el
puntaje (85→82): sobre-reservar espacio en el elemento equivocado cambia cuánto del
viewport queda "barrido" por el shift, y puede salir peor aunque el razonamiento
("reservar espacio reduce el salto") sea válido en general — importa *cuál* elemento.
Una vez identificado el culpable correcto, `min-height` en `.filtros` (incluido un
valor más alto específico para mobile, donde los filtros se apilan en columna) y en
`nav.tabs` llevó CLS a 0.01 y Performance a 100/100. Los valores de `min-height` son
estimaciones a mano del alto ya poblado, no un cálculo exacto — verificados a ojo en
mobile y desktop para que no quede espacio vacío de sobra.

## Botón "Compartir": primer ítem del backlog, elegido por impacto/esfuerzo

Entre las ideas de `BACKLOG.md`, se arrancó por "compartir" + `og:image` porque no
necesitan que la usuaria configure nada externo (a diferencia de Google Analytics, que
pide crear una cuenta/propiedad igual que gsheets) y van directo al uso real: mandar el
link al grupo por WhatsApp después de un partido.

Usa `navigator.share()` (panel nativo para elegir WhatsApp/etc, ideal en el celular) y
si el navegador no lo soporta (la mayoría de desktop) cae a copiar el link al
portapapeles con `navigator.clipboard.writeText()`. El link siempre es
`window.location.href`: como los filtros, la vista activa y el jugador de la ficha ya
viven en la URL (Fase 3), compartir "lo que se está mirando" no necesitó estado nuevo.

## Tabla de jugadores (pedido de la usuaria): columnas y "% G+A equipo"

Se sacaron G/PJ, (G+A)/PJ, "% goles equipo" y "Min/gol" (ya renombrado una vez, ver
más abajo), y se agregaron "% G+A equipo" y "Min/G+A". Quedan: PJ, G, A, G+A, TA, TR,
1º gol equipo, % G+A equipo, Min/G+A.

**"G+A del equipo"** (el denominador de "% G+A equipo") no es solo la cantidad de
goles GF del set — es goles GF **+** la cantidad de esos goles que además tienen
asistidor cargado (cada gol de penal/individual sin asistidor suma 1, un gol asistido
suma 2: uno para el goleador, uno para el asistidor). Es la misma idea que ya usaba
"% goles del equipo" pero extendida a incluir asistencias, para que la suma de
"% G+A equipo" de todos los jugadores dé ~100% en vez de superar el 100% (que pasaría
si el denominador fuera solo goles, porque cada asistencia sumaría sin un "lugar"
correspondiente en el total).

Se sacaron también los filtros "Desde"/"Hasta" y "Buscar jugador" de la UI (no se
usaban) y se reordenaron las pestañas agrupando equipo (Resumen, Partidos, Gráficos)
antes que jugadores (Jugadores, Ficha de jugador, Dúos). `stats.js` sigue soportando
`desde`/`hasta` y la búsqueda por texto en `tablaJugadores()` como parámetros — es
lógica genérica y testeada, no hace daño dejarla aunque hoy ningún control la use.

## Limpieza de repo (pedido de la usuaria)

- `.DS_Store` estaba trackeado en git desde el primer commit (antes de este trabajo).
  Se sacó y se agregó al `.gitignore` — nunca debería versionarse.
- `scripts/migrar_buitres.py` → `scripts/archivo/migrar_buitres.py`: hizo la migración
  de formato ancho a largo una sola vez (se convirtió en `Buitres_v2.xlsx`, que ya
  existía al arrancar este proyecto). Desde Fase 1 en adelante los partidos se cargan
  directo en formato largo, así que no se vuelve a correr salvo que aparezca más data
  vieja en formato ancho para migrar. Se archivó (no se borró del repo) porque documenta
  cómo se hizo esa migración una vez, por si hace falta de referencia.
- `data/buitres_normalizado.xlsx` (salida vieja de ese mismo script, no versionada
  porque `data/` está en `.gitignore`) se borró del disco: ya no se usa, `Buitres_v3.xlsx`
  es la fuente de verdad actual.
- `scripts/generar_copia_jugadores.py` y `scripts/propuesta_jugadores.csv` quedaron
  donde estaban: el primero es una utilidad reusable (generar copias para el plantel),
  el segundo lo necesita `build_v3.py --build` como input para reconstruir `jugadores`.

## CI/CD

### Sin cron: actualización manual después de cargar un partido (confirmado por la usuaria)

El workflow había quedado con cron diario (09:00 ART, SPEC §7.6). La usuaria aclaró
que el equipo juega solo los sábados, así que correr todos los días no tiene sentido
— la mayoría de los días no cambia nada. Se sacó el `schedule:` del workflow; por
ahora actualizar el sitio después de cargar un partido es manual ("Run workflow" en
GitHub, ver README). Si el ritmo de carga cambia (más partidos por semana, torneos
seguidos), se puede volver a agregar un cron — semanal en vez de diario sería lo
razonable para "solo sábados".

### `pytest` a secas no encontraba `export_data`/`schema` en GitHub Actions

Local siempre corrí `python -m pytest` (agrega la raíz del repo a `sys.path` porque
`-m` prepende el cwd). El workflow tenía `run: pytest`, que **no** hace eso, y
`export_data.py`/`schema.py` viven sueltos en la raíz (no son un paquete instalado) —
el primer deploy real falló en el job `test` con `ModuleNotFoundError`. Se agregó
`pyproject.toml` con `[tool.pytest.ini_options] pythonpath = ["."]` (la forma estándar
de pytest para esto) para que ande sin importar cómo se invoque, y de paso el workflow
quedó con `python -m pytest` explícito. Se encontró recién corriendo el deploy de
verdad por primera vez — los tests locales nunca lo iban a agarrar porque siempre se
corrieron con `-m`.

## Fase 2b — backend gsheets

### `validar()` asumía que `fecha` siempre era un `pd.Timestamp`

Bug real, no cubierto por los tests con mock: con el backend `xlsx`, `pandas.read_excel`
devuelve las fechas como `pd.Timestamp` (que tiene `.date()`); el backend `gsheets`
devuelve `datetime.date` puro (de `serial_a_fecha()`), que **no** tiene `.date()`. Las
warnings de `validar()` hacían `partido['fecha'].date()` a mano y rompían con
`AttributeError` solo con datos reales de Sheets. Se encontró recién al probar el
backend contra el Google Sheet real de la usuaria (los tests con mock no lo agarraron
porque las fechas falsas del mock eran `datetime.date`, pero el bug está en cómo se
_usa_ el valor, no en cómo se lo genera — hay que agregar un caso con `pd.Timestamp`
real al mock si se toca esto de nuevo). Se arregló reusando `formatear_fecha()` (que sí
maneja ambos tipos) en vez de llamar `.date()` directo. Verificado además comparando
bit a bit el JSON de salida del backend `xlsx` contra el de `gsheets` sobre los mismos
datos: idénticos.

### Tests con gspread mockeado, no contra la API real

`tests/test_gsheets_backend.py` reemplaza `gspread.authorize` por un cliente falso
(`monkeypatch`) que devuelve filas fijas. No hay forma de testear contra la API real de
Sheets sin credenciales de verdad (y no corresponde que esas credenciales vivan en el
repo ni en CI de test). Cubre: conversión de fecha/hora desde serial, celdas vacías
("" de gspread) convertidas a `None`, filas más cortas que el encabezado (la API de
Sheets no devuelve las celdas vacías finales de una fila), y hoja faltante.

### Mismo bug de pandas 3 que en normalizar(), otra vez

`pd.DataFrame(filas, columns=...).replace("", None)` volvió a convertir `None` en
`float('nan')` (ver la entrada de Fase 2 sobre esto). Se arregló construyendo el
DataFrame con `dtype=object` desde el inicio, antes del `.replace()`.

### Fecha/hora defensivas ante texto suelto en la celda

Si una celda de `fecha`/`hora` no es el tipo Fecha/Hora de Sheets (p.ej. alguien tipeó
texto a mano), `serial_a_fecha`/`serial_a_hora` fallarían con un `TypeError` al hacer
aritmética sobre un string. En vez de reventar el export entero, `fecha` inválida cae en
`None` (que `validar()` ya marca como ERROR "fecha inválida", el mecanismo correcto para
reportarlo) y `hora` inválida se deja como texto crudo (no es un campo validado, se
intenta mostrar igual vía `formatear_hora()`).

## Fase 3 — sitio estático

### Bug de huso horario en las fechas mostradas

`fecha` en el JSON es `"YYYY-MM-DD"` (sin hora). `new Date("2026-08-08T00:00:00Z")` es
correcto (medianoche UTC), pero `Intl.DateTimeFormat("es-AR")` sin `timeZone: "UTC"`
formatea en el huso horario del navegador: en Argentina (UTC-3) esa medianoche UTC cae
el día anterior en hora local, y la fecha mostrada quedaba un día corrida (se vio
probando el caso "últimos 5" del golden test: mostraba 07/08 en vez de 08/08). Se
arregló agregando `timeZone: "UTC"` al formatter de fecha en `ui.js`. El formatter de
`meta.generated_at` (un timestamp completo, no solo fecha) sí usa el huso local a
propósito, ahí es correcto mostrar la hora local del que mira el sitio.

### El job de deploy en CI arranca apagado

`.github/workflows/deploy.yml` tiene dos jobs: `test` (siempre corre: pytest + node
--test) y `deploy` (a GitHub Pages). El dato real vive en Google Sheets, no en el repo
(`data/` está en `.gitignore`), así que `deploy` no tiene de dónde sacar un `.xlsx` en
CI — necesita el backend `gsheets`, que es Fase 2b y está explícitamente diferida en la
spec. Se gatea con una variable de repo (`GSHEETS_LISTO == 'true'`) en vez de dejarlo
correr y fallar, para que el job `test` (la señal real de "¿el código está sano?") no
se vea ensuciado por fallas esperadas de un backend que todavía no existe.

## Fase 2 — export_data.py

### Fixtures de test generadas en Python, no archivos .xlsx committeados

`tests/conftest.py` arma el Excel sintético con `openpyxl` en un `tmp_path` para cada
test, en vez de versionar ~20 archivos `.xlsx` binarios (uno por regla de error/warning).
Más fácil de revisar en un PR (es texto Python) y de mantener si cambia el esquema.

### pandas 3.x convierte `None` en `NaN` al tocar columnas de texto

Encontrado al verificar el JSON de salida: pandas 3 infiere dtype `str` nativo para
columnas de texto, y tanto `Series.map()` como `.iterrows()`/`.apply()` recodifican un
`None` devuelto por una función (o leído de una fila) a su propio valor "faltante" del
dtype `str`, que al acceder aparece como `float('nan')` en vez de `None`. Esto generaba
`"apodo": NaN` en el JSON — **inválido** para `JSON.parse` de JS (rompería el sitio).

Mitigación en dos capas:
1. `normalizar()` construye las columnas de texto como `pd.Series(lista, dtype=object)`
   en vez de `.map()`, que sí preserva `None`.
2. Defensivo: `export_data.limpiar_nan()` recorre el dict final antes de escribirlo, y
   `json.dumps(..., allow_nan=False)` hace que cualquier `NaN` que se escape rompa el
   export en vez de escribir JSON inválido en silencio.

### `marcador_tras_gol` no pasa por la limpieza de texto genérica

Si Excel autoconvirtió "5-2" en fecha (el bug que ya rompió la hoja vieja del Torneo,
ver §9), hay que detectarlo en `validar()` comparando el tipo (`datetime.date`). Pasarlo
primero por `limpiar_texto` (que hace `str(x)`) taparía el bug convirtiéndolo a texto
antes de poder chequearlo. Tiene su propia función, `limpiar_marcador()`, que deja pasar
fechas/objetos raros sin tocarlos y solo limpia espacios si ya es `str`.

## Fase 1 — Buitres_v3.xlsx

### Corrección de datos: gol de Roger Fabrica mal asignado (confirmado por la usuaria, 2026-10-01)

La spec (§2 y §9) decía que `Buitres_v2.xlsx` ya traía aplicada la corrección "el gol de
Roger Fabrica con marcador 1-4 es del 26/09/2026, no del 19/09". Al verificar los checks
de los datos reales, **no estaba aplicada**:

- `id_partido=16` (19/09, Celta FC, marcador real 1-3) tenía **2 goles GF con `nro_gol=1`**
  (duplicado, marcado `DUP` por el propio `check_dup` de v2): el de Gonzalo Ruiz Diaz
  (marcador_tras_gol `1-3`, correcto para este partido) y el de Roger Fabrica
  (marcador_tras_gol `1-4`, que no corresponde a este partido).
- `id_partido=17` (26/09, Perez el ratón, marcador real 1-4) no tenía **ningún** gol
  cargado (ni GF ni GC).

La usuaria confirmó mover la fila de Roger Fabrica de `id_partido=16` a `id_partido=17`
(con `nro_gol=1`, porque ese partido no tenía goles cargados). La corrección se implementó
como paso reproducible en `scripts/build_v3.py` (`_mover_gol_roger_fabrica`), **no** editando
a mano `data/Buitres_v2.xlsx` (que queda intacto como fuente histórica). Tras la corrección,
el único partido en `checks` que queda en estado "REVISAR" es el 26/09 (le faltan los 4 GC,
que la usuaria todavía tiene que cargar) — esto es un WARNING esperado, no un error.

### Separación nombre/apellido/apodo/origen (confirmado por la usuaria, 2026-10-01)

Heurística aplicada en `scripts/build_v3.py` (paréntesis → `origen`, comillas → `apodo`,
primera palabra → `nombre`, resto → `apellido`), con 4 casos marcados ambiguos y resueltos
a mano por la usuaria vía `scripts/propuesta_jugadores.csv`:

| id | nombre original | resuelto como | nota |
|---|---|---|---|
| J10 | Roger Fabrica | nombre=Roger, apellido=Valero, origen="fábrica de un amigo" | el apellido real es Valero; "Fabrica" describía que el jugador trabaja en la fábrica de un amigo de la usuaria. Importante conservar esa fuente en `origen` aunque no se muestre en `nombre_mostrar` (porque hay apellido) |
| J14 | Bona | nombre=Tomas, apellido=Bonamino | nombre completo real |
| J26 | Simon "Chama" Ortelli | nombre=Simon, apellido=Ortelli, apodo=Chama | confirmado tal cual lo separó la heurística |
| J29 | Valentin arquero | nombre=Valentin, apodo=Valu, sin apellido | "arquero" era la posición, no el apellido; apellido real desconocido. Es una persona distinta de J17 "Valentin (peluquero)" — no se unifican |

### Estructura de datos: un solo Excel/Google Sheet, una hoja por tabla

Ya decidido en la spec (§1, §10): el Google Sheet nuevo importado desde `Buitres_v3.xlsx`
es la fuente maestra, con una pestaña por tabla (`partidos`, `alineaciones`, `goles`,
`jugadores`, `listas`, `checks`). Se descartó la alternativa de un archivo/CSV por tabla
porque los desplegables de carga (`jugador`, `fuente`, `tipo`) y las fórmulas de `checks`
dependen de referencias cruzadas entre hojas del mismo archivo.

### `nombre_mostrar` como fórmula de Excel, no valor precalculado

Para que siga funcionando si alguien edita `nombre`/`apellido`/`apodo`/`origen` directamente
en el Google Sheet, sin tener que re-correr `build_v3.py`. Fórmula en `jugadores!F`:
`=TRIM(B&" "&C)&IF(D<>""," "&""""&D&"""","")&IF(AND(E<>"",C=""),"  ("&E&")","")`.

### Convención de encabezados mantenida de v2

Columnas fórmula llevan el sufijo `(auto)` en el encabezado visible de Excel (`gf (auto)`,
`nombre_mostrar (auto)`), igual que ya hacía v2, con encabezado gris; columnas de carga manual
quedan en azul oscuro. `schema.py` usa los nombres limpios (sin el sufijo) como contrato.
