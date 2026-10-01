# Backlog (fuera de alcance inicial)

De `SPEC_buitres_v3.md` §11:

- Tabla `torneo_partidos` (fecha, torneo, local, visitante, goles_local, goles_visitante)
  para reconstruir posiciones, en vez de la hoja corrupta `Torneo Apertura 2026`. Requiere
  recarga manual de resultados.
- Red/grafo interactivo de dúos asistidor→goleador.
- Revisar las fuentes de gol cargadas (tarea pendiente de la hoja `Intro` del Excel viejo).
- Carga de partidos desde el celular (AppSheet u otro) si cargar 11 filas de alineación
  resulta pesado. Métrica: minutos por partido cargado (meta < 5).

## Encontrado durante Fase 1

- Partido 17 (26/09/2026 vs Perez el ratón) tiene el marcador final (1-4) pero le faltan
  los 4 goles en contra (GC) en el log de `goles`. Queda como WARNING (`goles_completos: false`)
  hasta que la usuaria los cargue — ver `DECISIONS.md`.
