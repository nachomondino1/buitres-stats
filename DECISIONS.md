# Decisiones

Decisiones tomadas durante el desarrollo que no estaban (o no quedaron resueltas) en `SPEC_buitres_v3.md`, con su motivo.

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
