# Backlog (fuera de alcance inicial)

De `SPEC_buitres_v3.md` §11:

- Tabla `torneo_partidos` (fecha, torneo, local, visitante, goles_local, goles_visitante)
  para reconstruir posiciones, en vez de la hoja corrupta `Torneo Apertura 2026`. Requiere
  recarga manual de resultados.
- Red/grafo interactivo de dúos asistidor→goleador.
- Revisar las fuentes de gol cargadas (tarea pendiente de la hoja `Intro` del Excel viejo).
- Carga de partidos desde el celular (AppSheet u otro) si cargar 11 filas de alineación
  resulta pesado. Métrica: minutos por partido cargado (meta < 5).

## Plan de tareas futuras del sitio (propuesto, sin priorizar)

Ideas juntadas construyendo el sitio + lo que pidió la usuaria (Google Analytics). No
implementar nada de acá sin confirmar primero — es un pizarrón, no un sprint.

**Medición**
- Google Analytics (o algo más liviano/privado tipo Plausible/Umami — GA mete cookies
  de terceros, para un sitio de un grupo de amigos puede ser mucho; a decidir). Sirve
  para saber qué vistas/filtros se usan de verdad y qué no (ya sacamos "Desde/Hasta" y
  "Buscar jugador" por esto mismo, a ojo — con datos reales no haría falta adivinar).

**UX / funcionalidad**
- ~~Botón "compartir"~~ ✅ hecho: botón en el header, `navigator.share` (panel nativo
  del celular) con fallback a copiar el link al portapapeles en desktop.
- ~~Recordar la columna de orden de la tabla de jugadores en la URL~~ ✅ hecho:
  `ordenCol`/`ordenDir`, mismo patrón que el resto de los filtros.
- ~~Comparador de 2 jugadores lado a lado~~ ✅ hecho: sección "Comparar" en la
  vista Jugadores (es una comparación de estadísticas, no de enfrentamientos
  directos — Buitres no arma equipos internos, ver DECISIONS.md).
- Gráfico de evolución de % de victorias / racha a lo largo del tiempo (no solo el
  snapshot actual de "racha actual").
- Exportar la tabla de jugadores o un partido como imagen/CSV para mandar al grupo.
- ~~PWA~~ ✅ hecho: manifest + ícono + service worker, instalable como app
  ("agregar a pantalla de inicio") ya que anda bien en el celular.

**Competencia / "sentirse pro" (pedido de la usuaria, ver DECISIONS.md)**
- "Resumen de temporada" exportable como imagen para compartir en el grupo
  (tipo "wrapped"): es una feature real, pero de alcance propio (generación de
  imagen/canvas) — no entró en la tanda de logros/rankings/comparador.
- Votación de MVP por partido y predicciones/polla pre-partido: necesitan
  backend real (cuentas, escritura) que el sitio no tiene hoy — descartadas
  por arquitectura, no por falta de interés. Ver DECISIONS.md.

**Calidad / infraestructura**
- ~~Lighthouse real~~ ✅ hecho: 100/100 en las 4 categorías (Performance,
  Accessibility, Best Practices, SEO). El único problema real era Cumulative Layout
  Shift por `.filtros`/`nav.tabs` apareciendo vacíos y empujando el resto al cargar
  `data.json` — arreglado con `min-height` (ver DECISIONS.md).
- ~~`og:image` / meta tags~~ ✅ hecho: preview con el logo del equipo al compartir
  el link (WhatsApp, etc.).
- Dominio propio en vez de `nachomondino1.github.io/buitres-stats`, si se quiere.
- Tests end-to-end de UI en CI (hoy: unit tests de `stats.js` + paridad Python, pero
  nada que abra un navegador de verdad y clickee).

**Contenido**
- Fotos del plantel / jugadores en la ficha.
- Backend `gsheets` con cron semanal si el ritmo de carga de partidos cambia (hoy es
  manual a propósito, ver DECISIONS.md).

## Encontrado durante Fase 1

- Partido 17 (26/09/2026 vs Perez el ratón) tiene el marcador final (1-4) pero le faltan
  los 4 goles en contra (GC) en el log de `goles`. Queda como WARNING (`goles_completos: false`)
  hasta que la usuaria los cargue — ver `DECISIONS.md`.
