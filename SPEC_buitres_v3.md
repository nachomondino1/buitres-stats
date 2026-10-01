# SPEC – Buitres v3: datos normalizados → JSON → sitio estático con filtros

> Para Claude Code. Leer todo antes de tocar nada. Idioma del código: identificadores de datos en español snake_case (igual que el Excel), el resto en inglés. Textos de la UI en español rioplatense.

## 0. Reglas de trabajo (obligatorias)

1. **El repo ya existe.** Primero explorá su estructura y reportá qué hay (árbol, lenguajes, CI, README). **No borres ni sobrescribas nada existente** sin avisar. Proponé el plan de archivos y esperá OK antes de la Fase 1.
2. Trabajá por fases (abajo), un commit/PR por fase, cada una con su *Definition of Done* cumplido y tests en verde.
3. **No inventes datos.** Si un dato es ambiguo o está mal (ver §9), no lo "arregles": reportalo.
4. **Nunca** commitear credenciales, tokens ni JSON de service accounts.
   El repo será **público**: tampoco commitear el Excel/Sheet real ni ningún archivo con `observaciones` o `lavo_camisetas` (hay comentarios sobre pagos y críticas internas). Los fixtures de test son sintéticos o sanitizados. Antes de empezar, revisá si el repo existente ya tiene un `.xlsx` con esas columnas (también en el historial de git) y avisá.
5. Decisiones técnicas estándar de la industria por sobre soluciones ingeniosas. Nada de frameworks pesados.
6. La usuaria programa en Python y **no domina JS**: en el código JS, comentá lo específico del lenguaje con analogía a Python (`filter` ≈ list comprehension, `Set` ≈ `set`, `??=` ≈ `setdefault`, etc.) donde no sea obvio. Sin comentarios triviales.
7. Si algo no está en esta spec, elegí la opción más simple y anotala en `DECISIONS.md`.

## 1. Arquitectura (decidida)

```
[Excel/Sheet: SOLO datos]  →  export_data.py (valida + normaliza)  →  data.json  →  sitio estático (filtros en el navegador)  →  GitHub Pages (u otro hosting estático)
```

- El Excel queda **únicamente con datos + validación de carga**. Cero hojas de visualización.
- **Fuente maestra: un Google Sheet nuevo**, creado importando `Buitres_v3.xlsx` (Archivo > Importar). El Sheet actual de la usuaria tiene el esquema viejo (ancho) y queda como archivo histórico, sin tocar.
- El sitio **recibe datos crudos normalizados** (no stats precalculadas) y calcula todo en el navegador, para que cualquier combinación de filtros funcione sin servidor.
- La lógica de stats vive en **un solo módulo JS puro** (`stats.js`), sin DOM, testeable con Node.
- **Riesgo principal:** que el JS y el Excel/Python diverjan. Se mitiga con tests de paridad (§6).

## 2. Fase 1 – `Buitres_v3.xlsx` (datos)

Partir de `Buitres_v2.xlsx` (provisto por la usuaria, hay que agregarlo a `data/`). Cambios:

| Acción | Detalle |
|---|---|
| **Borrar hojas** | `stats_jugadores`, `stats_equipo` |
| **Borrar columnas helper** | `partidos!P` (`en_filtro`), `alineaciones!E` (`en_filtro`), `goles!I` (`en_filtro`): dependían de los filtros de `stats_jugadores`. Re-indexar referencias de `checks` y de las columnas `check_dup`/`check_jugó` que queden |
| **Mantener** | `partidos`, `alineaciones`, `goles`, `jugadores`, `listas`, `checks` (control de calidad de carga, no visualización), `Leeme` (actualizarlo) |
| **Mantener fórmulas** | `partidos`: `gf = gf_1t+gf_2t`, `gc = gc_1t+gc_2t`, `resultado`; `goles`: `check_dup`, `check_jugó`; `checks` |
| **Mantener validaciones** | desplegables de tipo, jugador, fuente y tipo_gol |

**Procedimiento:** generar v3 con `openpyxl` a partir de v2 (script reproducible `scripts/build_v3.py`, no edición manual). Luego recalcular (LibreOffice headless) y verificar **0 errores de fórmula**.

**Esquema (contrato de datos)** – fuente de verdad en `schema.py`, usada por export y tests:

| Tabla | Columna | Tipo / regla |
|---|---|---|
| `jugadores` | `id_jugador` | texto único (J01…); **clave estable** que usa el JSON |
| | `nombre`, `apellido`, `apodo` | texto; `nombre` obligatorio, los otros opcionales |
| | `origen` | texto libre opcional: de dónde viene el jugador ("amigo de X", "peluquero", "fábrica") |
| | `nombre_mostrar` | **fórmula**, único: `nombre apellido` + `"apodo"` si hay + `(origen)` solo si no hay apellido. Es lo que muestran los desplegables |
| `partidos` | `id_partido` | int único |
| | `fecha` | date (no puede haber dos partidos el mismo día: fallaba el esquema viejo) |
| | `hora` | time \| null |
| | `tipo` | enum de `listas` (Torneo, Amistoso) |
| | `rival` | texto |
| | `gf_1t`, `gc_1t`, `gf_2t`, `gc_2t` | int ≥ 0 |
| | `link_video` | URL \| null (ver regla de links) |
| | `lavo_camisetas`, `observaciones` | **internos: NO se publican** |
| `alineaciones` | `id_partido` | FK → partidos |
| | `jugador` | FK → `jugadores.nombre_mostrar` (desplegable); el export lo resuelve a `id_jugador` |
| | `amarillas`, `rojas` | int ≥ 0 (vacío = 0) |
| | (unicidad) | `(id_partido, jugador)` único |
| `goles` | `id_partido` | FK → partidos |
| | `tipo_gol` | `GF` \| `GC` |
| | `nro_gol` | int ≥ 1; consecutivo 1..n por `(id_partido, tipo_gol)`, sin repetidos |
| | `goleador` | FK → jugadores; solo en GF; vacío permitido únicamente si `fuente == "Gol en contra"` |
| | `asistidor` | FK → jugadores \| null; solo en GF |
| | `fuente` | enum de `listas` |
| | `marcador_tras_gol` | `N-N` \| null. **Columna en formato texto plano** + validación regex `^\d+-\d+$`: Sheets/Excel convierten "5-2" en fecha si la celda no es texto (ya rompió la hoja vieja del torneo) |
| | `link` | URL \| null |

**Regla de links:** `link_video` y `link` contienen hoy texto mezclado con URLs ("No grabado", "Fecha 2 - Los buitres (1) - Celta FC (3)"). Se exporta solo si empieza con `http://` o `https://`; si no, `null` + warning. **No migrar el texto suelto** a otra columna salvo que la usuaria lo pida.

**Migración de nombres (propuesta, no automática):** `scripts/build_v3.py` genera primero `propuesta_jugadores.csv` separando los 29 nombres actuales en `nombre / apellido / apodo / origen` con heurísticas simples (paréntesis → `origen`; comillas → `apodo`; primera palabra → `nombre`, resto → `apellido`) y **marca como ambiguos** los que no encajan, por ejemplo "Valentin arquero", "Roger Fabrica" (¿apellido o "de la fábrica"?), "Bona", "Simon \"Chama\" Ortelli". La usuaria revisa y confirma el CSV; recién ahí se arma `jugadores`. Los nombres actuales se mapean a `id_jugador` para migrar `alineaciones` y `goles`. **No unificar** a Valentin (peluquero) con Valentin arquero: son personas distintas.

**Corrección de datos confirmada (una sola vez, documentar en `DECISIONS.md`):** la fila de gol de Roger Fabrica con marcador 1-4 figura con fecha 19/09 pero es del 26/09/2026 (se copió la fila de arriba sin cambiar la fecha). `Buitres_v2.xlsx` ya viene con esta corrección aplicada.

**Verificación manual en Google Sheets (paso de la usuaria):** importar `Buitres_v3.xlsx` y comprobar que sobreviven desplegables, formatos condicionales, fórmulas y el formato texto de `marcador_tras_gol`. No se probó en Google Sheets; si algo no sobrevive, reportarlo y ajustar el build.

**DoD Fase 1:** `Buitres_v3.xlsx` sin hojas de visualización, 0 errores de fórmula, `checks` funcionando, `jugadores` con la estructura nueva y `nombre_mostrar` único, test que valida columnas y hojas esperadas contra `schema.py`.

## 3. Fase 2 – `export_data.py` → `site/data/data.json`

**Entrada:** backend intercambiable, misma interfaz `load_tables() -> dict[str, DataFrame]`:
- `xlsx` (archivo local): **implementar primero**. Lo usan los tests con fixtures sanitizados y sirve de plan B.
- `gsheets`: **Fase 2b, último paso de la Fase 2**. `gspread` + service account de solo lectura, secretos `GOOGLE_SA_JSON` y `SHEET_ID`. Pedir valores sin formato (`UNFORMATTED_VALUE`) y convertir explícitamente fechas/horas desde serial (época 1899-12-30). Validar que los encabezados coincidan con `schema.py`. Si el setup de Google se complica, **no bloquea**: la Fase 3 sigue con el backend `xlsx` y 2b queda para la versión siguiente.

**Pasos:** leer → normalizar (strip, espacios múltiples, `"-"` → null) → **recalcular `gf`, `gc`, `resultado` en Python** a partir de los inputs (no confiar en los cacheados del Excel) → validar → escribir JSON.

**Validación.** `ERROR` corta el export (exit ≠ 0); `WARNING` se escribe en `meta.warnings` y se imprime.

| Nivel | Regla |
|---|---|
| ERROR | hojas/columnas faltantes; tipos inválidos; ids duplicados; FK rotas (jugador inexistente, partido inexistente); `(id_partido, jugador)` duplicado; `nro_gol` repetido o no consecutivo; tipo/fuente fuera de `listas`; goleador/asistidor en GC; goleador/asistidor que no figura en la alineación de ese partido; fecha inválida; `marcador_tras_gol` que llega como fecha (autoformato); `nombre_mostrar` duplicado |
| WARNING | goles GF/GC cargados ≠ `gf`/`gc` del partido (`goles_completos: false` en ese partido); partido con < 7 o > 11 jugadores; link descartado; fuente `"Sin dato"` (contar); jugador en `jugadores` sin ninguna alineación |

**Contrato del JSON** (`meta.schema_version = 1`, cambiarlo ante cualquier cambio incompatible):

```json
{
  "meta": {"schema_version": 1, "generated_at": "ISO-8601", "source": "xlsx",
           "counts": {"partidos": 17, "alineaciones": 158, "goles": 108, "jugadores": 29},
           "warnings": ["..."]},
  "jugadores":    [{"id_jugador": "J01", "nombre": "...", "apellido": null, "apodo": null, "origen": null, "nombre_mostrar": "..."}],
  "partidos":     [{"id_partido": 1, "fecha": "2025-12-13", "hora": null, "tipo": "Amistoso", "rival": "404 FC",
                    "gf_1t": 3, "gc_1t": 0, "gf_2t": 4, "gc_2t": 0, "gf": 7, "gc": 0, "resultado": "G",
                    "link_video": null, "goles_completos": true}],
  "alineaciones": [{"id_partido": 1, "id_jugador": "J01", "amarillas": 0, "rojas": 0}],
  "goles":        [{"id_partido": 1, "tipo_gol": "GF", "nro_gol": 1, "id_goleador": "J07", "id_asistidor": null,
                    "fuente": "Sin dato", "marcador_tras_gol": null, "link": null}]
}
```

- Fechas ISO `YYYY-MM-DD` (ordenan como strings). Ordenar `partidos` por fecha asc.
- **Allowlist de campos:** solo se exporta lo de la tabla de arriba (incluye nombres y `origen`, que la usuaria aprobó publicar). `observaciones` y `lavo_camisetas` contienen comentarios internos (costos, deudas, críticas) y **nunca** van al JSON público.
- JSON determinístico (mismo input → mismo archivo, excepto `generated_at`), sin espacios extra de más, objetivo < 200 KB.

**DoD Fase 2:** export corre limpio sobre los datos de v3; tests `pytest` para: cada regla ERROR (fixture mínima que la dispare), cada WARNING, el cálculo de `gf/gc/resultado`, la allowlist (assert que `observaciones` no aparece), y esquema del JSON.

## 4. Fase 3 – Sitio estático (`site/`)

**Stack:** HTML + CSS + JS vanilla con ES modules, **sin build step**. Gráficos con Chart.js en versión fija, **vendoreado en el repo** (no CDN). Mobile-first, responsive, sin dependencias de runtime externas. Accesible (contraste, foco, `aria-label` en controles). `es-AR` para fechas y números.

```
site/
  index.html
  css/styles.css
  js/stats.js        # lógica pura: filtros + agregaciones. SIN DOM. Importable desde Node
  js/ui.js           # DOM, render, estado de filtros <-> URL
  js/charts.js
  vendor/chart.min.js
  data/data.json     # generado, versionado o generado en CI (ver §7)
```

### Filtros (todos componibles, estado serializado en la URL: `?tipo=Torneo&ultimos=5`)

| Filtro | Comportamiento |
|---|---|
| Tipo | Todos / Torneo / Amistoso |
| Rango de fechas | desde / hasta |
| Rival | multi-selección |
| Resultado | G / E / P (multi) |
| **Últimos N** | Todos o N (presets 3, 5, 10 + input numérico) |
| Jugador | búsqueda de texto en las tablas |

**Semántica (fijada para coincidir con el Excel v2):** primero se aplican tipo, fechas, rival y resultado; **después** "últimos N" sobre ese subconjunto ordenado por fecha desc. `stats.js` expone `filtrarPartidos(data, filtros) -> Set<id_partido>` y todo lo demás recibe ese set.

### Vistas

1. **Resumen del equipo:** PJ, G, E, P, GF, GC, Dif, % victorias, racha actual; bloque por tipo de partido (ignora el filtro de tipo).
2. **Tabla de jugadores** (ordenable por columna, sticky header + primera columna en mobile): PJ, G, A, G+A, TA, TR, G/PJ, (G+A)/PJ, % de goles del equipo, veces que hizo el 1º gol del equipo. Opcional: "G cada x min" con `MINUTOS_PARTIDO = 70` como constante configurable (así calculaba el Excel viejo).
3. **Partidos:** lista con fecha, rival, tipo, marcador, resultado, link a video; al expandir, alineación y goles. Partidos con `goles_completos: false` llevan un aviso visible.
4. **Ficha de jugador:** al clickear un jugador, los partidos en los que hizo gol y/o asistencia.
5. **Gráficos:** evolución GF/GC por partido; ranking de goleadores y de G+A; fuente de los goles GF vs GC (con "Sin dato" visible); goles por tiempo (1T vs 2T).
6. **Dúos asistidor→goleador** (del backlog de la usuaria): ranking de pares con cantidad de goles y heatmap. Red de círculos (grafo) solo como extra al final.

Estados vacíos claros (filtros sin resultados), carga de `data.json` con manejo de error, y pie con `meta.generated_at` y cantidad de warnings.

**DoD Fase 3:** todas las vistas funcionan con todos los filtros; Lighthouse mobile ≥ 90 en Performance y Accessibility (objetivo propuesto); sin errores en consola; funciona abriendo vía un servidor estático local.

## 5. Stats: definiciones exactas

- **PJ:** cantidad de partidos del set filtrado en que el jugador figura en `alineaciones`.
- **G / A:** goles `GF` del set donde es `id_goleador` / `id_asistidor`. Los GC nunca suman a jugadores.
- **TA / TR:** suma de `amarillas` / `rojas` en el set.
- **% goles del equipo:** `G / total goles GF del set`, donde el total sale del log de `goles`.
- **Equipo:** PJ, G/E/P, GF, GC salen de `partidos` (`gf`, `gc`, `resultado`), **no** del log de goles. Puede diferir del log si hay partidos incompletos: es esperable y se avisa.
- **1º gol del equipo:** goles GF con `nro_gol == 1` por goleador.
- Divisiones por cero → `null` (en UI "–"), nunca `NaN`.

## 6. Tests (obligatorios)

| Test | Qué verifica |
|---|---|
| `pytest` del export | §3 |
| `node --test` de `stats.js` | casos unitarios de cada filtro y agregación; combinaciones (tipo+últimos N); bordes (N mayor que los partidos, set vacío) |
| **Paridad JS vs Python** | `scripts/stats_ref.py` es una implementación **independiente** (pandas) de §5. Un test recorre una grilla de filtros (tipo × últimos N ∈ {Todos,3,5,10} × algunos rangos de fechas) y exige **diferencia 0** entre `stats.js` (vía Node) y `stats_ref.py` |
| **Golden del Excel viejo** | con los datos de v2 (30/9/2026) y filtro Todos los tipos: 17 PJ, 9G/1E/7P, GF 55, GC 57; Torneo: 12 PJ, 6G/1E/5P, GF 31, GC 39; Amistoso: 5 PJ, 3G/0E/2P, GF 24, GC 18. PJ por jugador con Torneo (snapshot de la hoja vieja): Gonzalo Ruiz Diaz 11, Genaro Recabarren 9, Fede Begher 11, Tomas Coldeira 11. Goles/asistencias/tarjetas en Torneo (hoja vieja, verificadas con diferencia 0): Gonzalo Ruiz Diaz 6G/5A/3TA/2TR, Genaro Recabarren 8G/2A, Fede Begher 2G/4A, Tomas Coldeira 5G/0A, Roger Fabrica 2G/1A. Con la corrección del gol del 26/09, el Torneo total no cambia |
| Último-N | Todos los tipos + últimos 5 con los datos de v2 debe dar los partidos del 08/08, 15/08, 12/09, 19/09 y 26/09/2026 |

## 7. CI/CD (GitHub Actions)

1. Disparadores: `push` a `main`, `workflow_dispatch`, y opcional `schedule` (cron) cuando exista el backend `gsheets`.
2. Jobs: setup Python → `pytest` → export → setup Node → `node --test` → paridad → deploy a Pages.
3. **Si cualquier test o el export falla, no se publica.** El sitio anterior queda intacto.
4. Un Action corrido bajo demanda es la forma de "actualizar la web después de cargar un partido".
5. `data.json` se genera en CI y **no se versiona**. Secretos de GitHub: `GOOGLE_SA_JSON`, `SHEET_ID`. El repo es público: los logs del Action no deben imprimir filas de datos (solo conteos y warnings).
6. Con el backend `gsheets`, agregar `schedule` (cron diario) además del disparo manual.

## 8. Estructura de repo propuesta (adaptar al repo existente)

```
tests/fixtures/…      (xlsx sintético/sanitizado; el dato real NO va al repo público)
schema.py
export_data.py
scripts/{build_v3.py, stats_ref.py}   (build_v3 genera también propuesta_jugadores.csv)
tests/{test_export.py, test_parity.py}
site/…            (ver §4)
.github/workflows/deploy.yml
README.md         (cómo cargar un partido, cómo publicar, cómo correr tests)
DECISIONS.md
BACKLOG.md
```

## 9. Datos: problemas conocidos (NO corregir automáticamente)

| Dónde | Problema | Acción |
|---|---|---|
| Gol de Roger Fabrica (asistió Gonzalo Ruiz Diaz, fuente Lateral, marcador 1-4) | **Resuelto por la usuaria:** era del 26/09/2026 (copió la fila de arriba y no cambió la fecha) | Ya corregido en `Buitres_v2.xlsx` (`id_partido` 17). Tras el cambio, el 19/09 queda con 1 GF y 3 GC cargados |
| Partido 26/09/2026 vs Perez el ratón (1-4) | Con la corrección tiene su GF, pero faltan los 4 GC | La usuaria los carga. Mientras tanto WARNING y el sitio lo marca como incompleto |
| `goles.fuente` | 23 goles en `"Sin dato"` (13 GF, 10 GC) | Solo contar y mostrar; no inferir |
| Jugadores | Nombres descriptivos mezclados con el origen | **Confirmado:** Valentin (peluquero) y Valentin arquero son personas distintas. Se separan en nombre/apellido/apodo/origen (Fase 1) |
| Hoja vieja `Torneo Apertura 2026` | Resultados guardados como fechas (corrupta) | Fuera de alcance; ver `BACKLOG.md` |

Con la corrección del gol del 26/09, los datos actuales no deberían disparar ningún ERROR; el único WARNING esperado es el 26/09 incompleto. Si aparece otro ERROR, es un hallazgo: reportalo, no lo parchees.

## 10. Decisiones tomadas y pendientes

**Tomadas por la usuaria**
1. **Fuente maestra:** Google Sheets (nuevo, importado desde v3). Backend `gsheets` en Fase 2b; si resulta complejo, se difiere sin bloquear el resto.
2. **Público:** sitio y repo públicos. Se mantiene fuera del JSON todo lo interno (`observaciones`, `lavo_camisetas`).
3. **Nombres:** columnas `nombre`, `apellido`, `apodo` y `origen` (Fase 1).
4. **Gol del 19/09:** era del 26/09 (ya corregido).

**Pendientes (valor por defecto entre paréntesis)**
- ¿Alguna observación debería ser pública? (No; futura columna `obs_publica` si se pide.)
- ¿Se publica `origen` ("amigo de X")? (Sí, ya aprobado implícitamente; la usuaria puede vetarlo.)

**Setup de Google, una sola vez (lo hace la usuaria; Claude Code lo documenta en el README verificando la documentación oficial vigente, porque la consola cambia)**
1. Crear un proyecto en Google Cloud y habilitar la API de Google Sheets.
2. Crear una service account y descargar su clave JSON (no commitearla).
3. Compartir el Google Sheet con el email de la service account, como lector.
4. Cargar `GOOGLE_SA_JSON` (contenido del JSON) y `SHEET_ID` en GitHub > Settings > Secrets.

## 11. Backlog (fuera de alcance inicial)

- Tabla `torneo_partidos` (fecha, torneo, local, visitante, goles_local, goles_visitante) para reconstruir posiciones, en vez de la hoja corrupta. Requiere recarga manual de resultados.
- Red/grafo interactivo de dúos.
- Revisar las fuentes de gol cargadas (tarea pendiente de la hoja `Intro` del Excel viejo).
- Carga de partidos desde el celular (AppSheet u otro), si cargar 11 filas de alineación resulta pesado. Métrica: minutos por partido cargado (meta < 5).
- Backend `gsheets` + cron.

## 12. Definition of Done global

- [ ] Fases 1-3 con tests verdes en CI.
- [ ] Paridad JS/Python con diferencia 0 en toda la grilla de filtros.
- [ ] `observaciones` y `lavo_camisetas` ausentes del JSON publicado **y del repo público** (incluido el historial).
- [ ] `jugadores` con nombre/apellido/apodo/origen y `nombre_mostrar` único; referencias por `id_jugador` en el JSON.
- [ ] README con: cómo cargar un partido, cómo correr el export, cómo publicar, cómo interpretar `checks`.
- [ ] Sitio publicado, con link compartible y filtros en la URL.
