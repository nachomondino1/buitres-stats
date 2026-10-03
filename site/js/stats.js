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
    promedioGf: dividirONull(gf, pj),
    promedioGc: dividirONull(gc, pj),
    racha,
  };
}

/** Historial G/E/P y goles contra cada rival del set filtrado (vista
 * Equipo): una fila por rival enfrentado, no solo el más repetido como
 * rivalMasEnfrentado() en datosCuriosos(). Orden por defecto: más enfrentado
 * primero (la UI puede reordenar por columna). */
export function historialRivales(data, idsPartidos) {
  const partidos = data.partidos.filter((p) => idsPartidos.has(p.id_partido));
  const porRival = new Map();
  for (const p of partidos) {
    let c = porRival.get(p.rival);
    if (!c) {
      c = { rival: p.rival, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0 };
      porRival.set(p.rival, c);
    }
    c.pj++;
    c.gf += p.gf;
    c.gc += p.gc;
    if (p.resultado === "G") c.g++;
    else if (p.resultado === "E") c.e++;
    else c.p++;
  }
  return [...porRival.values()]
    .map((c) => ({ ...c, dif: c.gf - c.gc, pctVictorias: dividirONull(c.g, c.pj) }))
    .sort((a, b) => b.pj - a.pj || a.rival.localeCompare(b.rival));
}

// recorre los partidos en orden cronológico y devuelve la racha consecutiva
// más larga que cumple `predicado`, con sus fechas límite (null si ninguno
// cumple).
function rachaMasLarga(partidosOrdenados, predicado) {
  let mejor = null;
  let actual = null;
  for (const partido of partidosOrdenados) {
    if (predicado(partido.resultado)) {
      actual = actual
        ? { cantidad: actual.cantidad + 1, desde: actual.desde, hasta: partido.fecha }
        : { cantidad: 1, desde: partido.fecha, hasta: partido.fecha };
      if (!mejor || actual.cantidad > mejor.cantidad) mejor = actual;
    } else {
      actual = null;
    }
  }
  return mejor;
}

/** Rachas históricas (no solo la actual) del set filtrado: la racha
 * ganadora/perdedora más larga, y la más larga sin ganar / sin perder
 * (invicta). Cada una con su rango de fechas, o null si nunca se dio. */
export function rachasHistoricas(data, idsPartidos) {
  const partidos = data.partidos.filter((p) => idsPartidos.has(p.id_partido));
  const ordenados = partidos.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    ganando: rachaMasLarga(ordenados, (r) => r === "G"),
    perdiendo: rachaMasLarga(ordenados, (r) => r === "P"),
    sinGanar: rachaMasLarga(ordenados, (r) => r !== "G"),
    sinPerder: rachaMasLarga(ordenados, (r) => r !== "P"),
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

/** Jugadores destacados del set filtrado (vista Resumen): máximo goleador,
 * máximo asistidor, más influyente (G+A) y el que más partidos jugó. Un
 * jugador en 0 en la métrica correspondiente no cuenta como "destacado" (no
 * tiene sentido resaltar a alguien con 0 goles como "máximo goleador" solo
 * porque nadie más metió ninguno) -> null en ese caso. */
export function jugadoresDestacados(data, idsPartidos) {
  const filas = tablaJugadores(data, idsPartidos);

  function maximo(clave) {
    const mejor = filas.reduce((m, f) => (f[clave] > (m?.[clave] ?? -1) ? f : m), null);
    return mejor && mejor[clave] > 0 ? { nombre: mejor.nombre_mostrar, idJugador: mejor.id_jugador, valor: mejor[clave] } : null;
  }

  return {
    goleador: maximo("g"),
    asistidor: maximo("a"),
    influyente: maximo("ga"),
    masPartidos: maximo("pj"),
  };
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

/** Ficha de jugador (vista 4): todos los partidos jugados del set filtrado
 * (según alineación), con los goles/asistencias de ese partido ya resueltos. */
export function fichaJugador(data, idsPartidos, idJugador) {
  const idsJugados = new Set(
    data.alineaciones
      .filter((a) => idsPartidos.has(a.id_partido) && a.id_jugador === idJugador)
      .map((a) => a.id_partido)
  );
  const golesDelJugador = data.goles.filter(
    (g) => idsPartidos.has(g.id_partido) && (g.id_goleador === idJugador || g.id_asistidor === idJugador)
  );
  return data.partidos
    .filter((p) => idsJugados.has(p.id_partido))
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

// ---------------- datos curiosos (vista Resumen) ----------------
// Cada helper devuelve null si el hecho no aplica (sin repeticiones, muestra
// chica, etc.), igual que jugadoresDestacados(): "nadie se destaca" es un
// resultado válido, no un error. Así la sección crece sola a medida que se
// cargan más partidos, en vez de depender de lo que haya hoy.

function rivalMasEnfrentado(partidos) {
  const porRival = new Map();
  for (const p of partidos) {
    let c = porRival.get(p.rival);
    if (!c) {
      c = { rival: p.rival, pj: 0, g: 0, e: 0, p: 0 };
      porRival.set(p.rival, c);
    }
    c.pj++;
    if (p.resultado === "G") c.g++;
    else if (p.resultado === "E") c.e++;
    else c.p++;
  }
  const mejor = [...porRival.values()].reduce((m, c) => (c.pj > (m?.pj ?? 0) ? c : m), null);
  return mejor && mejor.pj >= 2 ? mejor : null;
}

// "repetido" = pasó 2+ veces; si hay empate entre varios marcadores con la
// misma cantidad máxima, se muestran todos (no se elige uno arbitrario).
function marcadorMasRepetido(partidos) {
  const conteo = new Map();
  for (const p of partidos) {
    const marcador = `${p.gf}-${p.gc}`;
    conteo.set(marcador, (conteo.get(marcador) ?? 0) + 1);
  }
  const cantidad = Math.max(0, ...conteo.values());
  if (cantidad < 2) return null;
  const marcadores = [...conteo.entries()].filter(([, c]) => c === cantidad).map(([marcador]) => marcador);
  return { marcadores, cantidad };
}

// jugador "amuleto": mejor % de victorias del equipo en los partidos que
// jugó, entre quienes jugaron al menos la mitad del set filtrado (si no,
// cualquiera con 2 PJ y 2 victorias "sería" 100% amuleto, ruido puro).
function jugadorConMejorPctVictorias(data, idsPartidos, partidos) {
  const pjTotal = partidos.length;
  if (pjTotal === 0) return null;
  const minimo = Math.ceil(pjTotal / 2);
  const resultadoPorPartido = new Map(partidos.map((p) => [p.id_partido, p.resultado]));

  const partidosPorJugador = new Map();
  for (const al of data.alineaciones) {
    if (!idsPartidos.has(al.id_partido)) continue;
    let set = partidosPorJugador.get(al.id_jugador);
    if (!set) {
      set = new Set();
      partidosPorJugador.set(al.id_jugador, set);
    }
    set.add(al.id_partido);
  }

  let mejor = null;
  for (const jugador of data.jugadores) {
    const pids = partidosPorJugador.get(jugador.id_jugador);
    if (!pids || pids.size < minimo) continue;
    let g = 0;
    for (const pid of pids) if (resultadoPorPartido.get(pid) === "G") g++;
    const pctVictorias = g / pids.size;
    if (!mejor || pctVictorias > mejor.pctVictorias) {
      mejor = { idJugador: jugador.id_jugador, nombre: jugador.nombre_mostrar, pj: pids.size, g, pctVictorias };
    }
  }
  return mejor;
}

// póker/hat-trick: más goles de un mismo jugador en un solo partido. Un
// máximo de 1 (nadie metió nunca 2 en el mismo partido) no es "curioso".
function masGolesEnUnPartido(data, idsPartidos, nombrePorId) {
  const conteo = new Map(); // `${id_partido}|${id_goleador}` -> cantidad
  for (const gol of data.goles) {
    if (!idsPartidos.has(gol.id_partido) || gol.tipo_gol !== "GF" || !gol.id_goleador) continue;
    const clave = `${gol.id_partido}|${gol.id_goleador}`;
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  let mejor = null;
  for (const [clave, cantidad] of conteo) {
    if (!mejor || cantidad > mejor.cantidad) {
      const [idPartido, idJugador] = clave.split("|");
      mejor = { idPartido: Number(idPartido), idJugador, cantidad };
    }
  }
  if (!mejor || mejor.cantidad < 2) return null;
  const partido = data.partidos.find((p) => p.id_partido === mejor.idPartido);
  return {
    idJugador: mejor.idJugador,
    nombre: nombrePorId.get(mejor.idJugador) ?? mejor.idJugador,
    cantidad: mejor.cantidad,
    fecha: partido.fecha,
    rival: partido.rival,
  };
}

function vallaInvicta(partidos) {
  const cantidad = partidos.filter((p) => p.gc === 0).length;
  if (cantidad === 0) return null;
  return { cantidad, pj: partidos.length, pct: dividirONull(cantidad, partidos.length) };
}

// el partido con mayor diferencia de gol, a favor o en contra (el que más
// "se salió de lo normal" en el set filtrado).
function partidoMasDesparejo(partidos) {
  if (partidos.length === 0) return null;
  const mejor = partidos.reduce((m, p) => (Math.abs(p.gf - p.gc) > Math.abs(m.gf - m.gc) ? p : m));
  if (mejor.gf === mejor.gc) return null; // borde: set filtrado donde todo fue empate
  return { fecha: mejor.fecha, rival: mejor.rival, gf: mejor.gf, gc: mejor.gc, aFavor: mejor.gf > mejor.gc };
}

/** Datos curiosos / coincidencias del set filtrado, para la vista Resumen:
 * rival más enfrentado (con su historial), marcador que más se repitió,
 * jugador "amuleto", póker/hat-trick en un partido, vallas invictas y el
 * partido más desparejo. Cada uno null si no aplica (ver helpers arriba). */
export function datosCuriosos(data, idsPartidos) {
  const partidos = data.partidos.filter((p) => idsPartidos.has(p.id_partido));
  const nombrePorId = new Map(data.jugadores.map((j) => [j.id_jugador, j.nombre_mostrar]));

  return {
    rivalRepetido: rivalMasEnfrentado(partidos),
    marcadorRepetido: marcadorMasRepetido(partidos),
    jugadorAmuleto: jugadorConMejorPctVictorias(data, idsPartidos, partidos),
    masGolesUnPartido: masGolesEnUnPartido(data, idsPartidos, nombrePorId),
    vallaInvicta: vallaInvicta(partidos),
    partidoMasDesparejo: partidoMasDesparejo(partidos),
  };
}

// ---------------- logros, rankings y comparador (vista Jugadores) ----------------
// Pensado para los dos ejes que pidió la usuaria: que un jugador se sienta
// "pro" (ficha con logros/badges) y que haya competencia sana entre amigos
// (rankings con 2do/3er puesto, comparador lado a lado). No hay noción de
// "equipos" dentro de un partido en los datos (todos los partidos son
// Buitres vs. un rival externo), así que "comparar 2 jugadores" es una
// comparación de estadísticas, no un historial de enfrentamientos entre ellos.

/** Top N de tablaJugadores por una columna numérica (de mayor a menor),
 * excluyendo a quienes están en 0 (no tiene sentido un "3er puesto" con 0
 * goles solo porque nadie más metió). Pensado para mostrar 2do/3er puesto
 * además del líder que ya muestra jugadoresDestacados(). */
export function topJugadoresPorCategoria(data, idsPartidos, clave, n = 3) {
  return tablaJugadores(data, idsPartidos)
    .filter((f) => f[clave] > 0)
    .sort((a, b) => b[clave] - a[clave] || a.nombre_mostrar.localeCompare(b.nombre_mostrar))
    .slice(0, n)
    .map((f) => ({ idJugador: f.id_jugador, nombre: f.nombre_mostrar, valor: f[clave] }));
}

// fila de tablaJugadores para idJugador, o una fila en cero si no jugó
// ningún partido del set filtrado (tablaJugadores lo omite directamente,
// pero el comparador necesita poder mostrar "0" en vez de hacer desaparecer
// al jugador elegido).
function filaJugadorOCero(data, idsPartidos, idJugador) {
  const fila = tablaJugadores(data, idsPartidos).find((f) => f.id_jugador === idJugador);
  if (fila) return fila;
  const jugador = data.jugadores.find((j) => j.id_jugador === idJugador);
  return {
    id_jugador: idJugador,
    nombre_mostrar: jugador?.nombre_mostrar ?? idJugador,
    pj: 0, g: 0, a: 0, ga: 0, ta: 0, tr: 0,
    primerGolEquipo: 0, partidosConGa: 0, pctGaEquipo: null, minPorGa: null,
  };
}

/** Comparador de 2 jugadores lado a lado (vista Jugadores → Comparar): la
 * misma fila que tablaJugadores para cada uno, en cero si no jugó nada en el
 * set filtrado. La UI decide, fila por fila, quién "va ganando". */
export function compararJugadores(data, idsPartidos, idJugadorA, idJugadorB) {
  return {
    a: filaJugadorOCero(data, idsPartidos, idJugadorA),
    b: filaJugadorOCero(data, idsPartidos, idJugadorB),
  };
}

/** Rival contra el que un jugador metió más goles ("rival favorito"). Mínimo
 * 2 goles a un mismo rival para que el dato diga algo — con 1 goleó a medio
 * fixture y no significa nada. Empate en cantidad: se queda con el primero
 * en orden alfabético del rival, para que el resultado sea determinístico. */
export function jugadorRivalFavorito(data, idsPartidos, idJugador) {
  const partidoPorId = new Map(data.partidos.map((p) => [p.id_partido, p]));
  const conteo = new Map();
  for (const gol of data.goles) {
    if (!idsPartidos.has(gol.id_partido) || gol.tipo_gol !== "GF" || gol.id_goleador !== idJugador) continue;
    const rival = partidoPorId.get(gol.id_partido)?.rival;
    if (!rival) continue;
    conteo.set(rival, (conteo.get(rival) ?? 0) + 1);
  }
  let mejor = null;
  for (const [rival, goles] of conteo) {
    if (!mejor || goles > mejor.goles || (goles === mejor.goles && rival.localeCompare(mejor.rival) < 0)) {
      mejor = { rival, goles };
    }
  }
  return mejor && mejor.goles >= 2 ? mejor : null;
}

// partidos del set filtrado en los que jugó idJugador (según alineaciones),
// ordenados por fecha asc, cada uno con si convirtió (>=1 gol GF) o no. Base
// común de rachaGoleadoraJugador() y jugadorEnRacha().
function partidosJugadosOrdenados(data, idsPartidos, idJugador) {
  const idsJugados = new Set(
    data.alineaciones.filter((al) => idsPartidos.has(al.id_partido) && al.id_jugador === idJugador).map((al) => al.id_partido)
  );
  const idsConGol = new Set(
    data.goles.filter((g) => g.tipo_gol === "GF" && g.id_goleador === idJugador && idsJugados.has(g.id_partido)).map((g) => g.id_partido)
  );
  return data.partidos
    .filter((p) => idsJugados.has(p.id_partido))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((p) => ({ fecha: p.fecha, marco: idsConGol.has(p.id_partido) }));
}

/** Racha goleadora de un jugador (partidos jugados seguidos convirtiendo al
 * menos un gol): la actual (puede ser null si el último partido que jugó no
 * convirtió) y la más larga histórica, con su rango de fechas. Mismo criterio
 * que rachasHistoricas() pero sobre "convirtió sí/no" en vez de G/E/P, y
 * reutiliza rachaMasLarga() pasándole un resultado sintético "SI"/"NO". */
export function rachaGoleadoraJugador(data, idsPartidos, idJugador) {
  const jugados = partidosJugadosOrdenados(data, idsPartidos, idJugador);

  let actual = null;
  for (let i = jugados.length - 1; i >= 0; i--) {
    if (!jugados[i].marco) break;
    actual = (actual ?? 0) + 1;
  }

  const sintetico = jugados.map((j) => ({ fecha: j.fecha, resultado: j.marco ? "SI" : "NO" }));
  const mejor = rachaMasLarga(sintetico, (r) => r === "SI");

  return { actual: actual ? { cantidad: actual } : null, mejor };
}

/** El jugador con la racha goleadora ACTUAL más larga del set filtrado (para
 * la tarjeta "Jugador en racha" de Resumen). Mínimo 2 partidos seguidos
 * convirtiendo — "1" es simplemente "metió en el último partido que jugó",
 * no una racha. Empate: gana el de nombre_mostrar alfabéticamente primero. */
export function jugadorEnRacha(data, idsPartidos) {
  let mejor = null;
  for (const jugador of data.jugadores) {
    const { actual } = rachaGoleadoraJugador(data, idsPartidos, jugador.id_jugador);
    if (!actual) continue;
    if (!mejor || actual.cantidad > mejor.cantidad || (actual.cantidad === mejor.cantidad && jugador.nombre_mostrar.localeCompare(mejor.nombre) < 0)) {
      mejor = { idJugador: jugador.id_jugador, nombre: jugador.nombre_mostrar, cantidad: actual.cantidad };
    }
  }
  return mejor && mejor.cantidad >= 2 ? mejor : null;
}

// Umbrales de los logros/badges: elegidos mirando los datos reales de hoy
// (17 partidos, 108 goles entre 29 jugadores) para que varios jugadores los
// puedan alcanzar, no solo el líder histórico — si el dataset crece mucho,
// recalibrar acá (son los únicos números "mágicos" de todo este bloque).
export const UMBRALES_LOGROS = {
  goleador: 3,
  asistidor: 2,
  figura: 5, // G+A
  inoxidable: 12, // PJ
  picante: 3, // amarillas
  enRacha: 2, // partidos seguidos convirtiendo
};

/** Logros/badges ganados por un jugador en el set filtrado, para la ficha.
 * Cada uno con ícono + etiqueta + detalle (el número que lo justifica).
 * Devuelve [] si no ganó ninguno (jugador sin logros todavía: resultado
 * válido, no un error, igual que el resto de este archivo). */
export function logrosJugador(data, idsPartidos, idJugador) {
  const fila = filaJugadorOCero(data, idsPartidos, idJugador);
  const racha = rachaGoleadoraJugador(data, idsPartidos, idJugador).actual;
  const u = UMBRALES_LOGROS;
  const logros = [];

  if (fila.g >= u.goleador) logros.push({ icono: "⚽", etiqueta: "Goleador", detalle: `${fila.g} goles` });
  if (fila.a >= u.asistidor) logros.push({ icono: "🎯", etiqueta: "Asistidor", detalle: `${fila.a} asistencias` });
  if (fila.ga >= u.figura) logros.push({ icono: "🌟", etiqueta: "Figura", detalle: `${fila.ga} G+A` });
  if (fila.pj >= u.inoxidable) logros.push({ icono: "🦾", etiqueta: "Inoxidable", detalle: `${fila.pj} partidos jugados` });
  if (fila.ta >= u.picante) logros.push({ icono: "🟨", etiqueta: "Picante", detalle: `${fila.ta} amarillas` });
  if (racha && racha.cantidad >= u.enRacha) logros.push({ icono: "🔥", etiqueta: "En racha", detalle: `${racha.cantidad} partidos seguidos convirtiendo` });

  return logros;
}
