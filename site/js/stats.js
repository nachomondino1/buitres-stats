// Lógica pura de filtros + agregaciones. SIN DOM: todo lo que toca el documento
// vive en ui.js. Pensado para ser importado tanto por el navegador como por
// `node --test` (ver stats.test.js) y por scripts/stats_ref.py para el test de
// paridad — por eso toda fórmula matemática tiene que coincidir exacto con §5
// de SPEC_buitres_v3.md.

// Constante configurable: así calculaba "minutos por gol" el Excel viejo
// (pj * MINUTOS_PARTIDO ≈ minutos jugados, sin datos reales de minutaje).
export const MINUTOS_PARTIDO = 70;

// division ≈ Python, pero acá "a / 0" da Infinity en vez de ZeroDivisionError;
// por eso cada división del módulo pasa por este helper (0 o null en el
// denominador -> null, nunca NaN/Infinity) en vez de hacer a/b directo.
function dividirONull(numerador, denominador) {
  return denominador ? numerador / denominador : null;
}

/**
 * filtros = {
 *   tipo: string | undefined,            // "Todos" o undefined = sin filtrar
 *   desde: "YYYY-MM-DD" | undefined,
 *   hasta: "YYYY-MM-DD" | undefined,
 *   rivales: Set<string> | undefined,    // vacío/undefined = todos
 *   resultados: Set<"G"|"E"|"P"> | undefined,
 *   ultimos: number | undefined,         // undefined/null = "Todos"
 * }
 *
 * Semántica fijada en la spec: tipo + fechas + rival + resultado se aplican
 * juntos; "últimos N" se aplica DESPUÉS, sobre ese subconjunto ordenado por
 * fecha desc. Por eso ultimos no es "un filtro más" en el mismo paso.
 */
export function filtrarPartidos(data, filtros = {}) {
  const { tipo, desde, hasta, rivales, resultados, ultimos } = filtros;

  // partidos.filter(fn) ≈ [p for p in partidos if fn(p)]
  let partidos = data.partidos.filter((p) => {
    if (tipo && tipo !== "Todos" && p.tipo !== tipo) return false;
    if (desde && p.fecha < desde) return false;
    if (hasta && p.fecha > hasta) return false;
    if (rivales && rivales.size > 0 && !rivales.has(p.rival)) return false;
    if (resultados && resultados.size > 0 && !resultados.has(p.resultado)) return false;
    return true;
  });

  // localeCompare acá compara texto; como las fechas son "YYYY-MM-DD" (ISO),
  // ordenan igual que si fueran números. b antes que a = descendente.
  partidos = partidos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (ultimos != null) {
    partidos = partidos.slice(0, ultimos);
  }

  // new Set(iterable) ≈ set(iterable)
  return new Set(partidos.map((p) => p.id_partido));
}

/** Últimos N resultados (G/E/P) del set filtrado, del más viejo al más nuevo
 * (para dibujar una racha de puntitos de izquierda a derecha). */
export function ultimosResultados(data, idsPartidos, n = 5) {
  const partidos = data.partidos.filter((p) => idsPartidos.has(p.id_partido));
  return partidos
    .slice()
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, n)
    .reverse()
    .map((p) => p.resultado);
}

/** Último partido jugado por el equipo, con sus goleadores/asistidores ya
 * agrupados. A propósito ignora los filtros activos (como resumenPorTipo
 * ignora "tipo"): la pregunta que responde es "¿cómo salió el partido?", no
 * "¿cómo salió el partido dentro de lo que tengo filtrado ahora?". */
export function ultimoPartido(data) {
  const ordenados = data.partidos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (ordenados.length === 0) return null;
  const partido = ordenados[0];
  const goles = data.goles.filter((g) => g.id_partido === partido.id_partido && g.tipo_gol === "GF");
  const nombrePorId = new Map(data.jugadores.map((j) => [j.id_jugador, j.nombre_mostrar]));

  function agrupar(idsConCantidad) {
    const conteo = new Map();
    for (const id of idsConCantidad) conteo.set(id, (conteo.get(id) ?? 0) + 1);
    return [...conteo.entries()].map(([id, cantidad]) => ({ nombre: nombrePorId.get(id) ?? id, cantidad }));
  }

  return {
    ...partido,
    goleadores: agrupar(goles.filter((g) => g.id_goleador).map((g) => g.id_goleador)),
    asistidores: agrupar(goles.filter((g) => g.id_asistidor).map((g) => g.id_asistidor)),
  };
}

/** PJ, G/E/P, GF, GC, Dif, % victorias y racha actual del set filtrado. */
export function resumenEquipo(data, idsPartidos) {
  const partidos = data.partidos.filter((p) => idsPartidos.has(p.id_partido));

  let g = 0, e = 0, p = 0, gf = 0, gc = 0;
  for (const partido of partidos) {
    gf += partido.gf;
    gc += partido.gc;
    if (partido.resultado === "G") g++;
    else if (partido.resultado === "E") e++;
    else p++;
  }
  const pj = partidos.length;

  // racha actual: partidos más nuevo -> más viejo, contando mientras el
  // resultado se repite (se corta en el primer partido distinto).
  const ordenados = partidos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  let racha = null;
  if (ordenados.length > 0) {
    const resultado = ordenados[0].resultado;
    let cantidad = 0;
    for (const partido of ordenados) {
      if (partido.resultado !== resultado) break;
      cantidad++;
    }
    racha = { resultado, cantidad };
  }

  return {
    pj, g, e, p, gf, gc,
    dif: gf - gc,
    pctVictorias: dividirONull(g, pj),
    racha,
  };
}

/** Tabla de jugadores (vista 2): una fila por jugador que figura en alguna
 * alineación del set filtrado. `textoBusqueda` filtra por substring de
 * nombre_mostrar (case-insensitive), es el filtro "Jugador" de la spec. */
export function tablaJugadores(data, idsPartidos, textoBusqueda = "") {
  const alineaciones = data.alineaciones.filter((a) => idsPartidos.has(a.id_partido));
  const golesGF = data.goles.filter((g) => idsPartidos.has(g.id_partido) && g.tipo_gol === "GF");
  // "G+A del equipo": cada gol GF suma 1 (es un gol de alguien) + 1 más si
  // además tiene asistidor cargado (es la asistencia de otro alguien).
  const totalGaEquipo = golesGF.length + golesGF.filter((g) => g.id_asistidor).length;

  // Map ≈ dict; acumuladorPorJugador.get(id) ?? inicial ≈ dict.setdefault(id, inicial)
  const acumuladorPorJugador = new Map();
  function acc(idJugador) {
    let a = acumuladorPorJugador.get(idJugador);
    if (!a) {
      a = { pj: 0, g: 0, asis: 0, ta: 0, tr: 0, primerGol: 0, partidosConGa: new Set() };
      acumuladorPorJugador.set(idJugador, a);
    }
    return a;
  }

  for (const alineacion of alineaciones) {
    const a = acc(alineacion.id_jugador);
    a.pj++;
    a.ta += alineacion.amarillas;
    a.tr += alineacion.rojas;
  }
  for (const gol of golesGF) {
    if (gol.id_goleador) {
      const a = acc(gol.id_goleador);
      a.g++;
      if (gol.nro_gol === 1) a.primerGol++;
      a.partidosConGa.add(gol.id_partido);
    }
    if (gol.id_asistidor) {
      const a = acc(gol.id_asistidor);
      a.asis++;
      a.partidosConGa.add(gol.id_partido);
    }
  }

  const busqueda = textoBusqueda.trim().toLowerCase();
  const filas = [];
  for (const jugador of data.jugadores) {
    const a = acumuladorPorJugador.get(jugador.id_jugador);
    if (!a) continue; // no jugó ningún partido del set filtrado
    if (busqueda && !jugador.nombre_mostrar.toLowerCase().includes(busqueda)) continue;

    const ga = a.g + a.asis;
    filas.push({
      id_jugador: jugador.id_jugador,
      nombre_mostrar: jugador.nombre_mostrar,
      pj: a.pj,
      g: a.g,
      a: a.asis,
      ga,
      ta: a.ta,
      tr: a.tr,
      primerGolEquipo: a.primerGol,
      partidosConGa: a.partidosConGa.size,
      pctGaEquipo: dividirONull(ga, totalGaEquipo),
      minPorGa: dividirONull(a.pj * MINUTOS_PARTIDO, ga),
    });
  }
  return filas;
}

/** Partidos del set filtrado con su alineación y goles ya resueltos, para la
 * vista "Partidos" (lista + detalle al expandir). */
export function partidosConDetalle(data, idsPartidos) {
  return data.partidos
    .filter((p) => idsPartidos.has(p.id_partido))
    .map((p) => ({
      ...p, // ≈ **p en Python: copia todas las claves del partido
      alineacion: data.alineaciones.filter((a) => a.id_partido === p.id_partido),
      goles: data.goles.filter((g) => g.id_partido === p.id_partido),
    }));
}

/** Ficha de jugador (vista 4): partidos del set filtrado en los que metió gol
 * y/o dio asistencia, con esos goles ya resueltos. */
export function fichaJugador(data, idsPartidos, idJugador) {
  const golesDelJugador = data.goles.filter(
    (g) => idsPartidos.has(g.id_partido) && (g.id_goleador === idJugador || g.id_asistidor === idJugador)
  );
  const idsConParticipacion = new Set(golesDelJugador.map((g) => g.id_partido));
  return data.partidos
    .filter((p) => idsConParticipacion.has(p.id_partido))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((p) => ({
      ...p,
      goles: golesDelJugador.filter((g) => g.id_partido === p.id_partido),
    }));
}

/** Evolución GF/GC por partido, ordenado por fecha asc (para el gráfico de línea). */
export function evolucionGfGc(data, idsPartidos) {
  return data.partidos
    .filter((p) => idsPartidos.has(p.id_partido))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((p) => ({ fecha: p.fecha, rival: p.rival, gf: p.gf, gc: p.gc }));
}

/** Fuente de los goles GF vs GC del set filtrado (incluye "Sin dato"). */
export function fuentePorTipoGol(data, idsPartidos) {
  const conteo = { GF: {}, GC: {} };
  for (const gol of data.goles) {
    if (!idsPartidos.has(gol.id_partido)) continue;
    const porTipo = conteo[gol.tipo_gol];
    porTipo[gol.fuente] = (porTipo[gol.fuente] ?? 0) + 1;
  }
  return conteo;
}

/** Goles por tiempo (1T vs 2T), sumado del marcador de partidos (el log de
 * goles no registra en qué tiempo se hizo cada gol). */
export function golesPorTiempo(data, idsPartidos) {
  let gf1t = 0, gc1t = 0, gf2t = 0, gc2t = 0;
  for (const p of data.partidos) {
    if (!idsPartidos.has(p.id_partido)) continue;
    gf1t += p.gf_1t;
    gc1t += p.gc_1t;
    gf2t += p.gf_2t;
    gc2t += p.gc_2t;
  }
  return { gf1t, gc1t, gf2t, gc2t };
}

/** Dúos asistidor->goleador (vista 6): ranking de pares por cantidad de goles GF. */
export function duosAsistidorGoleador(data, idsPartidos) {
  const nombrePorId = new Map(data.jugadores.map((j) => [j.id_jugador, j.nombre_mostrar]));
  const conteo = new Map();

  for (const gol of data.goles) {
    if (!idsPartidos.has(gol.id_partido)) continue;
    if (gol.tipo_gol !== "GF") continue;
    if (!gol.id_asistidor || !gol.id_goleador) continue;
    const clave = `${gol.id_asistidor}|${gol.id_goleador}`;
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }

  return [...conteo.entries()]
    .map(([clave, cantidad]) => {
      const [idAsistidor, idGoleador] = clave.split("|");
      return {
        idAsistidor,
        idGoleador,
        asistidor: nombrePorId.get(idAsistidor),
        goleador: nombrePorId.get(idGoleador),
        cantidad,
      };
    })
    .sort((a, b) => b.cantidad - a.cantidad);
}
