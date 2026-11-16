# Playbook de flujo de datos (Ignacio / "la usuaria" en los commits)

Extraído de las decisiones de arquitectura reales tomadas en **buitres-stats**
(ver `SPEC_buitres_v3.md`, `schema.py`, `export_data.py` y `DECISIONS.md`), no
de una guía abstracta. Pensado para pegarse como contexto al arrancar un
proyecto nuevo con forma de "hay datos en algún lado, hay que validarlos y
mostrarlos", para no tener que re-derivar la misma arquitectura de cero.
Complementa a `DESIGN_PLAYBOOK.md` (eso es visual, esto es datos).

## 0. Cuándo aplica este patrón

Pensado para proyectos chicos/medianos, de un grupo o un solo mantenedor, con
estas características:

- Hay una **fuente de datos editable a mano** (planilla, Sheet, CSV) cargada
por alguien no técnico, no una base de datos con un backend de verdad.
- El consumo es de **solo lectura** (un sitio, un reporte, un dashboard).
- La cadencia de actualización es baja/irregular (no justifica infraestructura
de streaming ni un cron agresivo).

Si el proyecto necesita escritura real desde el front (altas, ediciones,
auth), este patrón no alcanza — es la señal de que hace falta backend de
verdad, no de forzar la planilla a hacer algo que no es (ver `DECISIONS.md`,
"descartado por arquitectura": votación/predicciones en Buitres).

## 1. Arquitectura general

```
[Planilla: SOLO datos]  →  script de export (valida + normaliza)  →  JSON  →  consumidor (sitio/reporte estático)
```

- **Un único punto de verdad para los datos**: la planilla. Nada de hojas de
visualización/stats precalculadas adentro — esas se recalculan siempre en
el paso de export o en el consumidor, nunca se cargan a mano ni se cachean
en la fuente.
- **Un único punto de verdad para el *contrato* de datos**: un módulo de
schema (`schema.py` en Buitres) con qué hojas/columnas existen, tipos,
claves primarias/foráneas, unicidad y enums. Lo usan el script de export
*y* los tests — nunca se duplica la lista de columnas en dos lugares.
- **El script de export es la única puerta de entrada** al JSON. Nadie edita
el JSON a mano ni lo genera por otro camino.
- **El consumidor recibe datos crudos normalizados, no stats precalculadas**,
y calcula todo en tiempo de uso. Así cualquier combinación de filtros/vistas
funciona sin volver a pedirle nada a la fuente.
- **Riesgo principal de este patrón:** que la lógica de cálculo viva en dos
lenguajes (ej. Python del export y JS del sitio) y diverja con el tiempo.
Se mitiga con tests de paridad (§7), no con "tener cuidado".



## 2. La planilla como fuente: reglas

- La planilla **es la UI de carga**, no un documento de análisis. Si hace
falta ver un total o un chequeo, es una hoja de **control de calidad**
(`checks` en Buitres: fórmulas que marcan "OK"/"REVISAR"), no una hoja de
negocio — esa vive en el consumidor.
- Desplegables (listas de valores válidas) y validación de celdas en la
planilla misma reducen errores de carga *antes* de que lleguen al export,
pero **nunca son el único lugar que valida**: el export tiene que validar
todo de nuevo, porque alguien puede pegar datos sin pasar por el
desplegable, o la hoja fuente puede cambiar de manos.
- **Nunca confiar en una fórmula cacheada de la planilla como si fuera el
dato.** Todo campo calculable (totales, resultado derivado de goles, un
nombre compuesto) se recalcula en el export a partir de los campos
primitivos, incluso si la planilla ya lo calcula con una fórmula — la
fórmula es una ayuda visual para quien carga, no la fuente de verdad.
- Columnas con información interna/sensible (en Buitres: `observaciones`,
comentarios sobre plata) **conviven en la misma planilla** que los datos
públicos — más simple que separar en dos archivos — pero quedan en una
lista explícita de "columnas internas" en el schema, y el export las
excluye por **allowlist**, no por blacklist (ver §5).
- **Claves estables, no nombres**, para referencias cruzadas. Un identificador
tipo `J01` que no cambia aunque se corrija el nombre de una persona/cosa.
Los desplegables de carga pueden mostrar un nombre legible armado con
fórmula (`nombre_mostrar`), pero el export lo resuelve a la clave estable
antes de exportar — el JSON nunca referencia por el texto editable.



## 3. El script de export: forma general

Pipeline con pasos separados y nombrados (no todo en una función gigante):

```
load_tables(backend, fuente) -> dict[str, DataFrame]   # leer, sin opinar
normalizar(tablas)                                      # limpiar texto, descartar filas vacías
recalcular(tablas)                                       # derivar campos SIEMPRE en código, no confiar en la fuente
validar(tablas) -> warnings                              # ERROR corta, WARNING se acumula y sigue
construir_json(tablas, warnings) -> dict                 # armar el contrato de salida, allowlist de campos
```

- `load_tables` tiene **una interfaz única e intercambiable entre backends**
(ej. archivo local vs. API en la nube), para poder desarrollar y testear
contra un archivo local primero y recién después conectar la fuente real
(API, credenciales) sin tocar el resto del pipeline. El backend local sirve
además de **plan B** si la fuente en la nube se cae o tarda en configurarse
— no bloquea avanzar con el resto.
- Cada función es pura (`tablas -> tablas`), fácil de testear por separado con
fixtures sintéticas, sin pegarle a la fuente real.
- El export corre **completo en cada invocación** (no incremental): dado el
volumen esperado (cientos/miles de filas, no millones), recalcular todo de
cero es más simple y más confiable que mantener estado parcial.



## 4. Validación: ERROR vs. WARNING

Dos niveles, nunca un solo "falló"/"no falló":


| Nivel       | Significa                                                                                                                           | Acción                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **ERROR**   | El dato está roto (clave foránea inválida, duplicado que no debería existir, tipo que no parsea, valor fuera de un enum cerrado)    | Cortar el export (exit ≠ 0), **no escribir nada**. El consumidor anterior queda intacto.      |
| **WARNING** | El dato es válido pero incompleto o llamativo (faltan filas relacionadas, un campo quedó en "sin dato", un link no es una URL real) | Se imprime y queda listado en el JSON (`meta.warnings`); el export **sigue** y publica igual. |


- **No inventar ni "arreglar" datos ambiguos en el script.** Si algo no
encaja, es un WARNING o un ERROR que señala dónde corregir en la fuente —
nunca una heurística silenciosa que adivina el valor correcto.
- Cada regla de ERROR y de WARNING tiene que tener un test que la dispare con
una fixture mínima (§7) — si no tiene test, en la práctica no existe la
próxima vez que alguien toque el validador.
- El corte por ERROR es la pieza que hace seguro automatizar la publicación
(§8): un dato roto nunca llega a producción, sin que alguien tenga que
mirar el export a mano cada vez.



## 5. Contrato del JSON de salida

- **Versionado explícito** (`meta.schema_version`): se incrementa ante
cualquier cambio incompatible, para que el consumidor pueda detectar un
contrato viejo si hiciera falta.
- **Metadatos siempre presentes**: cuándo se generó, de qué backend salió,
conteos por tabla (detectan de un vistazo si algo se vació sin querer) y la
lista de warnings — así el consumidor puede mostrar "N avisos" sin
necesidad de correr el export de nuevo para enterarse.
- **Allowlist de campos, no blacklist.** Se enumera explícitamente qué sale en
el JSON; un campo nuevo que se agregue a la fuente el día de mañana **no
sale** hasta que alguien lo agregue a mano a la lista. Mucho más seguro para
datos semi-sensibles que acordarse de excluir cada campo nuevo.
- **Determinístico**: misma entrada → mismo archivo de salida, salvo el
timestamp de generación. Facilita ver en un diff de CI si realmente cambió
algo. Orden estable (ordenar por fecha/clave antes de serializar).
- Tamaño acotado y conocido de antemano (un objetivo tipo "< 200 KB") — si
crece mucho, es señal de reconsiderar "mandar todo crudo al cliente".
- Fechas en formato ISO (`YYYY-MM-DD`), nunca el formato de display — el
consumidor decide cómo mostrarlas (y con qué huso horario, ver §9).



## 6. Backends intercambiables (local ↔ API en la nube)

Cuando la fuente real es una API externa (Google Sheets, Airtable, Notion,
etc.), conviene separar en dos backends detrás de la misma interfaz:

1. **Backend de archivo local primero.** Más rápido de iterar, no necesita
  credenciales, es lo que usan los tests con fixtures. Se implementa y se
   deja funcionando de punta a punta (incluyendo CI) antes de tocar la API.
2. **Backend de API después**, agregado sin romper el primero. Mismas
  validaciones, mismo `construir_json` — solo cambia de dónde salen las
   `DataFrame`/estructuras crudas.
3. Diferencias típicas entre backends a manejar explícitamente (no asumir que
  "da lo mismo"):
  - Tipos nativos (fecha real) vs. texto/número crudo que hay que parsear a
  mano (ej. fechas como número serie de días desde una época fija).
  - Celdas vacías: un archivo puede traer `NaN`, una API puede traer `""` —
  normalizar ambas al mismo valor nulo del lenguaje, explícitamente (no
  confiar en que una conversión automática haga lo mismo en los dos casos).
  - Filas más cortas que el encabezado (una API puede no devolver las celdas
  vacías finales de una fila) — hay que rellenar antes de tabular.
4. **Verificar paridad entre backends con los mismos datos** (mismo
  JSON byte a byte) antes de confiar en el segundo backend para producción.
5. Si el backend de API requiere credenciales/setup externo que toma tiempo
  conseguir, **no bloquea** el resto del proyecto: queda detrás de una
   bandera/variable de entorno (§8) y el backend local sigue sirviendo todo
   lo demás mientras tanto.
6. Credenciales de la API: acceso de **solo lectura**, nunca de escritura —
  el export nunca necesita modificar la fuente. Nunca commitear la clave;
   vive en secrets del CI y, en local, en una variable de entorno efímera.



## 7. Paridad de lógica entre dos implementaciones

Si la lógica de cálculo (agregaciones, stats, reglas de negocio) tiene que
vivir en dos lenguajes porque el consumidor y el pipeline de datos no
comparten runtime (ej. JS en el sitio, Python en el export):

- Aislarla en **un módulo puro, sin efectos de lado** (sin DOM, sin I/O), en
cada lenguaje — eso es lo que la hace testeable aisladamente y comparable.
- Escribir una **segunda implementación independiente** (ej. en Python con
pandas) de la misma lógica, usada *solo* para testear la primera por
comparación — nunca para producción. Es trabajo doble a propósito: el
objetivo es que un bug de un lado no se replique idéntico del otro lado por
compartir el mismo error de razonamiento.
- Un test de paridad recorre una **grilla de combinaciones** (no un solo caso)
y exige diferencia cero entre ambas implementaciones en cada combinación.
- Complementar con **golden tests**: un snapshot de valores reales conocidos
(verificados a mano una vez, contra la fuente vieja o un cálculo manual),
para detectar si *ambas* implementaciones se desvían del resultado correcto
al mismo tiempo (la paridad sola no lo detectaría).



## 8. CI/CD: publicar solo si los datos están sanos

- **Dos jobs separados: test y deploy.** `test` corre siempre (valida que el
código esté sano) y no depende de la fuente real de datos — usa fixtures.
`deploy` corre el export contra la fuente real y publica, y depende de
`test` en verde.
- **Si el export corta por ERROR (o cualquier test falla), no se publica
nada** — el consumidor anterior queda intacto. El log dice qué dato está
roto; se corrige en la fuente, nunca en el script.
- Si el backend de API todavía no tiene credenciales configuradas, gatear el
job `deploy` detrás de una **variable explícita** (ej. `API_LISTO=true` en
vez de dejarlo correr y fallar en rojo todo el tiempo) — así `test` sigue
siendo una señal limpia de "el código anda" mientras el setup externo (que
puede tardar) no está listo, sin ensuciarla con fallas esperadas.
- **Disparo manual (**`workflow_dispatch`**) además de** `push`**.** Si la cadencia
de carga de datos es baja/irregular (ej. "solo se carga los fines de
semana"), **no agregar un cron** que corra en vacío la mayoría de los días
— actualizar manualmente después de cargar datos es más simple y más obvio
que mantener un cron desalineado con la cadencia real. Agregar cron recién
cuando la cadencia de carga lo justifique.
- El archivo de datos generado (JSON) **no se versiona** en git — se genera
en CI en cada deploy. El dato real vive en la fuente (planilla/API), el
repo solo tiene el código que lo transforma.
- Si el repo es público pero la fuente tiene datos sensibles, los logs del
CI **nunca imprimen filas de datos** — solo conteos, nombres de reglas y
warnings (nunca el valor concreto que disparó un error, si ese valor mismo
es sensible).



## 9. Gotchas recurrentes (para no redescubrirlos)

- `None` **que se convierte en** `NaN` **sin querer** al construir columnas de
texto con pandas (u operaciones equivalentes en otros frameworks de
dataframes): construir la columna explícitamente con el tipo "objeto
genérico", no dejar que se infiera un tipo texto puro que no sabe
representar nulo. Poner además una limpieza defensiva justo antes de
serializar a JSON (`NaN` no es JSON válido) que *rompa fuerte* el export si
se escapa uno, en vez de escribir JSON inválido en silencio.
- **Zona horaria al mostrar fechas puras** (sin hora): si el consumidor
parsea `"YYYY-MM-DD"` como medianoche UTC y lo formatea con el huso horario
local del navegador, en husos negativos la fecha se corre un día para
atrás. Fijar explícitamente `timeZone: "UTC"` al formatear una fecha pura;
un timestamp completo (con hora real) sí se muestra en el huso local a
propósito.
- **Autoformato de la planilla disfrazando un dato de otro tipo** (ej. "5-2"
tipeado en una celda que Excel/Sheets interpreta como fecha). Validar el
*tipo* del valor recibido, no solo su forma de texto — si ya llegó como
fecha, convertirlo a texto antes de validar tapa el bug en vez de
detectarlo.
- **El runner de tests de CI no es el mismo comando que en local.** Si en
local siempre se corre con una invocación que agrega la raíz del repo al
path (ej. `python -m pytest`) y el workflow usa el comando pelado
(`pytest`), módulos sueltos en la raíz del repo no se encuentran recién en
CI. Usar en el workflow exactamente el mismo comando que se usa en local.
- **Verificar contra la fuente real antes de confiar en un backend nuevo**,
no solo contra mocks: un mock que siempre devuelve el tipo de dato "lindo"
(ej. un tipo de fecha con métodos que el tipo real no tiene) puede ocultar
un bug que solo aparece con la fuente de verdad.



## 10. Checklist para arrancar un proyecto nuevo con este patrón

1. Definir el **schema como código** primero (hojas/tablas, columnas, tipos,
  PK/FK, unicidad, enums) antes de escribir una sola línea del export.
2. Armar el **backend de archivo local** del export y sus tests con fixtures
  sintéticas — ningún dato real todavía.
3. Definir el **contrato del JSON** (incluida la allowlist de campos y
  `meta.schema_version`) y escribir el test que falla si aparece un campo no
   permitido.
4. Separar ERROR vs. WARNING desde la primera regla de validación, no
  agregarlo "después".
5. Si el consumidor necesita lógica de cálculo espejada en otro lenguaje,
  escribir la segunda implementación y el test de paridad **antes** de que
   haya muchas reglas de negocio — retrofittear paridad sobre lógica ya
   grande es más caro.
6. Recién ahí conectar la fuente real (API/credenciales) como segundo
  backend, detrás de una bandera si el setup externo puede demorar.
7. CI con `test` siempre corriendo y `deploy` gateado por esa misma bandera.
8. Documentar en el README: cómo cargar un dato nuevo, cómo correr el export,
  cómo se publica, qué significa cada chequeo de calidad de carga.

