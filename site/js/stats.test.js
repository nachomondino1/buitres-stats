import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MINUTOS_PARTIDO,
  UMBRALES_LOGROS,
  compararJugadores,
  datosCuriosos,
  duosAsistidorGoleador,
  evolucionGfGc,
  fichaJugador,
  filtrarPartidos,
  fuentePorTipoGol,
  golesPorTiempo,
  historialRivales,
  jugadorEnRacha,
  jugadorRivalFavorito,
  jugadoresDestacados,
  logrosJugador,
  partidosConDetalle,
  rachaGoleadoraJugador,
  rachasHistoricas,
  resumenEquipo,
  tablaJugadores,
  topJugadoresPorCategoria,
  ultimoPartido,
  ultimosResultados,
} from "./stats.js";

// Dataset sintético chico, a mano, para no depender de data.json real.
const DATA = {
  jugadores: [
    { id_jugador: "J01", nombre: "Ana", apellido: null, apodo: null, origen: null, nombre_mostrar: "Ana" },
    { id_jugador: "J02", nombre: "Bruno", apellido: null, apodo: null, origen: null, nombre_mostrar: "Bruno" },
    { id_jugador: "J03", nombre: "Carla", apellido: null, apodo: null, origen: null, nombre_mostrar: "Carla" },
  ],
  partidos: [
    { id_partido: 1, fecha: "2026-01-10", hora: null, tipo: "Amistoso", rival: "Rival A", gf_1t: 1, gc_1t: 1, gf_2t: 1, gc_2t: 0, gf: 2, gc: 1, resultado: "G", link_video: null, goles_completos: true },
    { id_partido: 2, fecha: "2026-01-17", hora: null, tipo: "Torneo", rival: "Rival B", gf_1t: 0, gc_1t: 0, gf_2t: 0, gc_2t: 0, gf: 0, gc: 0, resultado: "E", link_video: null, goles_completos: true },
    { id_partido: 3, fecha: "2026-01-24", hora: null, tipo: "Torneo", rival: "Rival A", gf_1t: 1, gc_1t: 1, gf_2t: 0, gc_2t: 1, gf: 1, gc: 2, resultado: "P", link_video: null, goles_completos: true },
    { id_partido: 4, fecha: "2026-01-31", hora: null, tipo: "Amistoso", rival: "Rival C", gf_1t: 2, gc_1t: 0, gf_2t: 1, gc_2t: 0, gf: 3, gc: 0, resultado: "G", link_video: null, goles_completos: true },
  ],
  alineaciones: [
    { id_partido: 1, id_jugador: "J01", amarillas: 0, rojas: 0 },
    { id_partido: 1, id_jugador: "J02", amarillas: 1, rojas: 0 },
    { id_partido: 2, id_jugador: "J01", amarillas: 0, rojas: 0 },
    { id_partido: 3, id_jugador: "J01", amarillas: 0, rojas: 1 },
    { id_partido: 3, id_jugador: "J03", amarillas: 0, rojas: 0 },
    { id_partido: 4, id_jugador: "J02", amarillas: 0, rojas: 0 },
    { id_partido: 4, id_jugador: "J03", amarillas: 0, rojas: 0 },
  ],
  goles: [
    { id_partido: 1, tipo_gol: "GF", nro_gol: 1, id_goleador: "J01", id_asistidor: "J02", fuente: "Contraataque", marcador_tras_gol: "1-0", link: null },
    { id_partido: 1, tipo_gol: "GF", nro_gol: 2, id_goleador: "J02", id_asistidor: null, fuente: "Sin dato", marcador_tras_gol: "2-1", link: null },
    { id_partido: 1, tipo_gol: "GC", nro_gol: 1, id_goleador: null, id_asistidor: null, fuente: "Corner", marcador_tras_gol: "2-1", link: null },
    { id_partido: 3, tipo_gol: "GF", nro_gol: 1, id_goleador: "J03", id_asistidor: "J01", fuente: "Jugada individual", marcador_tras_gol: "1-1", link: null },
    { id_partido: 4, tipo_gol: "GF", nro_gol: 1, id_goleador: "J02", id_asistidor: "J03", fuente: "Lateral", marcador_tras_gol: "1-0", link: null },
    { id_partido: 4, tipo_gol: "GF", nro_gol: 2, id_goleador: "J02", id_asistidor: "J03", fuente: "Contraataque", marcador_tras_gol: "2-0", link: null },
    { id_partido: 4, tipo_gol: "GF", nro_gol: 3, id_goleador: "J03", id_asistidor: null, fuente: "Sin dato", marcador_tras_gol: "3-0", link: null },
  ],
};

const TODOS = new Set(DATA.partidos.map((p) => p.id_partido));

// ---------------- filtrarPartidos ----------------

test("sin filtros devuelve todos los partidos", () => {
  const ids = filtrarPartidos(DATA, {});
  assert.deepEqual(ids, TODOS);
});

test("filtro por tipo", () => {
  const ids = filtrarPartidos(DATA, { tipo: "Torneo" });
  assert.deepEqual(ids, new Set([2, 3]));
});

test("tipo 'Todos' no filtra", () => {
  const ids = filtrarPartidos(DATA, { tipo: "Todos" });
  assert.deepEqual(ids, TODOS);
});

test("filtro por rango de fechas", () => {
  const ids = filtrarPartidos(DATA, { desde: "2026-01-17", hasta: "2026-01-24" });
  assert.deepEqual(ids, new Set([2, 3]));
});

test("filtro por rival (multi)", () => {
  const ids = filtrarPartidos(DATA, { rivales: new Set(["Rival A"]) });
  assert.deepEqual(ids, new Set([1, 3]));
});

test("filtro por resultado (multi)", () => {
  const ids = filtrarPartidos(DATA, { resultados: new Set(["G"]) });
  assert.deepEqual(ids, new Set([1, 4]));
});

test("últimos N se aplica después de los demás filtros, por fecha desc", () => {
  // Torneo = partidos 2 y 3; "últimos 1" de ese subconjunto es el más nuevo: el 3
  const ids = filtrarPartidos(DATA, { tipo: "Torneo", ultimos: 1 });
  assert.deepEqual(ids, new Set([3]));
});

test("últimos N mayor que la cantidad de partidos devuelve todos (borde)", () => {
  const ids = filtrarPartidos(DATA, { ultimos: 999 });
  assert.deepEqual(ids, TODOS);
});

test("combinación de filtros sin resultados da set vacío (borde)", () => {
  const ids = filtrarPartidos(DATA, { rivales: new Set(["Rival A"]), resultados: new Set(["E"]) });
  assert.deepEqual(ids, new Set());
});

// ---------------- resumenEquipo ----------------

test("resumenEquipo sobre todos los partidos", () => {
  const r = resumenEquipo(DATA, TODOS);
  assert.equal(r.pj, 4);
  assert.equal(r.g, 2);
  assert.equal(r.e, 1);
  assert.equal(r.p, 1);
  assert.equal(r.gf, 6);
  assert.equal(r.gc, 3);
  assert.equal(r.dif, 3);
  assert.equal(r.pctVictorias, 0.5);
  assert.equal(r.promedioGf, 1.5);
  assert.equal(r.promedioGc, 0.75);
  assert.deepEqual(r.racha, { resultado: "G", cantidad: 1 }); // el más nuevo (P4=G) corta al toparse con P3=P
});

test("resumenEquipo con set vacío: todo 0, pctVictorias/promedios y racha null (borde)", () => {
  const r = resumenEquipo(DATA, new Set());
  assert.equal(r.pj, 0);
  assert.equal(r.pctVictorias, null);
  assert.equal(r.promedioGf, null);
  assert.equal(r.promedioGc, null);
  assert.equal(r.racha, null);
});

// ---------------- historialRivales ----------------

test("historialRivales: una fila por rival, ordenado por PJ desc y después alfabético", () => {
  const filas = historialRivales(DATA, TODOS);
  assert.deepEqual(filas.map((f) => f.rival), ["Rival A", "Rival B", "Rival C"]);

  const rivalA = filas.find((f) => f.rival === "Rival A");
  assert.equal(rivalA.pj, 2);
  assert.equal(rivalA.g, 1);
  assert.equal(rivalA.p, 1);
  assert.equal(rivalA.gf, 3);
  assert.equal(rivalA.gc, 3);
  assert.equal(rivalA.dif, 0);
  assert.equal(rivalA.pctVictorias, 0.5);

  const rivalC = filas.find((f) => f.rival === "Rival C");
  assert.equal(rivalC.pj, 1);
  assert.equal(rivalC.pctVictorias, 1);
});

test("historialRivales con set vacío: lista vacía (borde)", () => {
  assert.deepEqual(historialRivales(DATA, new Set()), []);
});

// ---------------- datosCuriosos ----------------
// P1 10/01 Rival A G 2-1, P2 17/01 Rival B E 0-0, P3 24/01 Rival A P 1-2,
// P4 31/01 Rival C G 3-0 (Bruno mete 2 de los 3 goles de este partido)

test("datosCuriosos sobre todos los partidos", () => {
  const d = datosCuriosos(DATA, TODOS);

  assert.deepEqual(d.rivalRepetido, { rival: "Rival A", pj: 2, g: 1, e: 0, p: 1 });

  assert.equal(d.marcadorRepetido, null); // los 4 marcadores son distintos

  // jugador amuleto: mínimo 2 PJ (mitad de 4); Bruno (J02) jugó P1 y P4,
  // ganó los 2 -> 100%, mejor que Ana (J01, 1/3) y Carla (J03, 1/2)
  assert.equal(d.jugadorAmuleto.idJugador, "J02");
  assert.equal(d.jugadorAmuleto.pj, 2);
  assert.equal(d.jugadorAmuleto.pctVictorias, 1);

  // más goles en un partido: Bruno metió 2 de los 3 goles del 3-0 a Rival C
  assert.equal(d.masGolesUnPartido.idJugador, "J02");
  assert.equal(d.masGolesUnPartido.cantidad, 2);
  assert.equal(d.masGolesUnPartido.fecha, "2026-01-31");

  assert.deepEqual(d.vallaInvicta, { cantidad: 2, pj: 4, pct: 0.5 }); // P2 (0-0) y P4 (3-0)

  // partido más desparejo: el 3-0 a Rival C (diferencia de 3, la mayor)
  assert.deepEqual(d.partidoMasDesparejo, { fecha: "2026-01-31", rival: "Rival C", gf: 3, gc: 0, aFavor: true });
});

test("datosCuriosos con set vacío: todo null (borde)", () => {
  const d = datosCuriosos(DATA, new Set());
  assert.equal(d.rivalRepetido, null);
  assert.equal(d.marcadorRepetido, null);
  assert.equal(d.jugadorAmuleto, null);
  assert.equal(d.masGolesUnPartido, null);
  assert.equal(d.vallaInvicta, null);
  assert.equal(d.partidoMasDesparejo, null);
});

// ---------------- rachasHistoricas ----------------
// orden cronológico: P1=G (01-10), P2=E (01-17), P3=P (01-24), P4=G (01-31)

test("rachasHistoricas sobre todos los partidos", () => {
  const r = rachasHistoricas(DATA, TODOS);
  // G,E,P,G: ninguna racha ganadora/perdedora de más de 1 (en empate de
  // longitud, gana la más vieja)
  assert.deepEqual(r.ganando, { cantidad: 1, desde: "2026-01-10", hasta: "2026-01-10" });
  assert.deepEqual(r.perdiendo, { cantidad: 1, desde: "2026-01-24", hasta: "2026-01-24" });
  // sin ganar: E,P seguidos (P2-P3) es la racha más larga
  assert.deepEqual(r.sinGanar, { cantidad: 2, desde: "2026-01-17", hasta: "2026-01-24" });
  // sin perder (invicto): G,E seguidos (P1-P2)
  assert.deepEqual(r.sinPerder, { cantidad: 2, desde: "2026-01-10", hasta: "2026-01-17" });
});

test("rachasHistoricas con set vacío: todo null (borde)", () => {
  const r = rachasHistoricas(DATA, new Set());
  assert.equal(r.ganando, null);
  assert.equal(r.perdiendo, null);
  assert.equal(r.sinGanar, null);
  assert.equal(r.sinPerder, null);
});

// ---------------- tablaJugadores ----------------

test("tablaJugadores: PJ/G/A/TA/TR y derivados", () => {
  const filas = tablaJugadores(DATA, TODOS);
  const ana = filas.find((f) => f.id_jugador === "J01");
  assert.equal(ana.pj, 3); // partidos 1,2,3
  assert.equal(ana.g, 1);
  assert.equal(ana.a, 1); // asistió el gol de Carla en el partido 3
  assert.equal(ana.ga, 2);
  assert.equal(ana.tr, 1);
  assert.equal(ana.partidosConGa, 2); // metió en p1 (gol) y p3 (asistencia)
  assert.equal(ana.pctGaEquipo, 2 / 10); // 10 = 6 goles GF + 4 de esos goles con asistidor cargado
  assert.equal(ana.minPorGa, (3 * MINUTOS_PARTIDO) / 2);
});

test("tablaJugadores no incluye jugadores sin ninguna alineación en el set", () => {
  const ids = new Set([2]); // solo Ana jugó el partido 2
  const filas = tablaJugadores(DATA, ids);
  assert.deepEqual(filas.map((f) => f.id_jugador), ["J01"]);
});

test("tablaJugadores: división por cero da null, nunca NaN/Infinity", () => {
  // Ana jugó el partido 2, pero ahí no hubo ningún gol: ni ella ni el equipo
  // tienen G+A, así que ambos cocientes caen en denominador 0.
  const filas = tablaJugadores(DATA, new Set([2]));
  const ana = filas[0];
  assert.equal(ana.ga, 0);
  assert.equal(ana.partidosConGa, 0);
  assert.equal(ana.pctGaEquipo, null);
  assert.equal(ana.minPorGa, null);
});

test("tablaJugadores: búsqueda de texto por nombre (case-insensitive)", () => {
  const filas = tablaJugadores(DATA, TODOS, "ana");
  assert.deepEqual(filas.map((f) => f.nombre_mostrar), ["Ana"]);
});

test("minPorGa usa MINUTOS_PARTIDO", () => {
  const filas = tablaJugadores(DATA, TODOS);
  // partidos 1 y 4: pj=2, g=3 (p1 nro2, p4 nro1 y nro2), a=1 (asistió a Ana en p1 nro1) -> ga=4
  const bruno = filas.find((f) => f.id_jugador === "J02");
  assert.equal(bruno.pj, 2);
  assert.equal(bruno.ga, 4);
  assert.equal(bruno.partidosConGa, 2); // p1 (gol+asist. cuentan 1 solo partido) y p4
  assert.equal(bruno.minPorGa, (2 * MINUTOS_PARTIDO) / 4);
});

// ---------------- jugadoresDestacados ----------------

test("jugadoresDestacados: máximos del set filtrado (empate lo gana el primero en orden de datos)", () => {
  const d = jugadoresDestacados(DATA, TODOS);
  assert.deepEqual(d.goleador, { nombre: "Bruno", idJugador: "J02", valor: 3 });
  assert.deepEqual(d.asistidor, { nombre: "Carla", idJugador: "J03", valor: 2 });
  // Bruno y Carla empatan en ga=4; Bruno aparece primero en data.jugadores
  assert.deepEqual(d.influyente, { nombre: "Bruno", idJugador: "J02", valor: 4 });
  assert.deepEqual(d.masPartidos, { nombre: "Ana", idJugador: "J01", valor: 3 });
});

test("jugadoresDestacados: set vacío da todo null (nadie jugó, nadie es 'el máximo')", () => {
  const d = jugadoresDestacados(DATA, new Set());
  assert.deepEqual(d, { goleador: null, asistidor: null, influyente: null, masPartidos: null });
});

// ---------------- partidosConDetalle / fichaJugador ----------------

test("partidosConDetalle trae alineación y goles de cada partido", () => {
  const [p1] = partidosConDetalle(DATA, new Set([1]));
  assert.equal(p1.alineacion.length, 2);
  assert.equal(p1.goles.length, 3);
});

test("fichaJugador: todos los partidos jugados (según alineación), ordenados por fecha", () => {
  const ficha = fichaJugador(DATA, TODOS, "J01");
  assert.deepEqual(ficha.map((p) => p.id_partido), [1, 2, 3]);
  // no metió gol ni asistió en el partido 2, pero lo jugó -> aparece con goles vacío
  assert.deepEqual(ficha.find((p) => p.id_partido === 2).goles, []);
});

test("fichaJugador respeta el set de partidos filtrado", () => {
  const ficha = fichaJugador(DATA, new Set([3]), "J03");
  assert.deepEqual(ficha.map((p) => p.id_partido), [3]);
});

// ---------------- gráficos ----------------

test("evolucionGfGc ordena por fecha ascendente", () => {
  const ev = evolucionGfGc(DATA, TODOS);
  assert.deepEqual(ev.map((e) => e.fecha), ["2026-01-10", "2026-01-17", "2026-01-24", "2026-01-31"]);
});

test("fuentePorTipoGol separa GF/GC y cuenta 'Sin dato'", () => {
  const f = fuentePorTipoGol(DATA, TODOS);
  assert.equal(f.GF["Sin dato"], 2);
  assert.equal(f.GC["Corner"], 1);
});

test("golesPorTiempo suma 1T/2T de los partidos filtrados", () => {
  const t = golesPorTiempo(DATA, new Set([1]));
  assert.deepEqual(t, { gf1t: 1, gc1t: 1, gf2t: 1, gc2t: 0 });
});

test("duosAsistidorGoleador rankea por cantidad", () => {
  const duos = duosAsistidorGoleador(DATA, TODOS);
  assert.equal(duos[0].asistidor, "Carla");
  assert.equal(duos[0].goleador, "Bruno");
  assert.equal(duos[0].cantidad, 2);
});

test("duosAsistidorGoleador ignora goles sin asistidor o GC", () => {
  const duos = duosAsistidorGoleador(DATA, new Set([1]));
  // partido 1: gol 1 tiene asistidor (Ana->Bruno... pero invertido: goleador Ana, asistidor Bruno), gol 2 no tiene asistidor, GC no cuenta
  assert.equal(duos.length, 1);
  assert.equal(duos[0].asistidor, "Bruno");
  assert.equal(duos[0].goleador, "Ana");
});

// ---------------- ultimosResultados / ultimoPartido ----------------

test("ultimosResultados: del más viejo al más nuevo, recortado a N", () => {
  assert.deepEqual(ultimosResultados(DATA, TODOS, 5), ["G", "E", "P", "G"]); // p1,p2,p3,p4
  assert.deepEqual(ultimosResultados(DATA, TODOS, 2), ["P", "G"]); // p3,p4
});

test("ultimoPartido: el de fecha más nueva, con goleadores/asistidores agrupados", () => {
  const u = ultimoPartido(DATA);
  assert.equal(u.id_partido, 4); // 2026-01-31 es el más nuevo
  assert.deepEqual(u.goleadores, [{ nombre: "Bruno", cantidad: 2 }, { nombre: "Carla", cantidad: 1 }]);
  assert.deepEqual(u.asistidores, [{ nombre: "Carla", cantidad: 2 }]);
});

// ---------------- logros, rankings y comparador ----------------
// Fixture separado de DATA: necesito una secuencia de partidos por jugador
// pensada a propósito para ejercitar rachas (corte, empate, nunca jugó), así
// que reusar DATA (pensado para otra cosa) metería partidos de más y rompería
// sus asserts existentes.

const DATA2 = {
  jugadores: [
    { id_jugador: "J01", nombre: "Ana", apellido: null, apodo: null, origen: null, nombre_mostrar: "Ana" },
    { id_jugador: "J02", nombre: "Bruno", apellido: null, apodo: null, origen: null, nombre_mostrar: "Bruno" },
    { id_jugador: "J03", nombre: "Carla", apellido: null, apodo: null, origen: null, nombre_mostrar: "Carla" },
    { id_jugador: "J04", nombre: "Dario", apellido: null, apodo: null, origen: null, nombre_mostrar: "Dario" }, // nunca jugó
  ],
  partidos: [
    { id_partido: 101, fecha: "2026-02-01", hora: null, tipo: "Amistoso", rival: "Rival X", gf_1t: 1, gc_1t: 0, gf_2t: 1, gc_2t: 0, gf: 2, gc: 0, resultado: "G", link_video: null, goles_completos: true },
    { id_partido: 102, fecha: "2026-02-08", hora: null, tipo: "Amistoso", rival: "Rival Y", gf_1t: 1, gc_1t: 0, gf_2t: 0, gc_2t: 0, gf: 1, gc: 0, resultado: "G", link_video: null, goles_completos: true },
    { id_partido: 103, fecha: "2026-02-15", hora: null, tipo: "Amistoso", rival: "Rival X", gf_1t: 1, gc_1t: 0, gf_2t: 1, gc_2t: 0, gf: 2, gc: 0, resultado: "G", link_video: null, goles_completos: true },
    { id_partido: 104, fecha: "2026-02-22", hora: null, tipo: "Amistoso", rival: "Rival Z", gf_1t: 1, gc_1t: 0, gf_2t: 0, gc_2t: 0, gf: 1, gc: 0, resultado: "G", link_video: null, goles_completos: true },
  ],
  alineaciones: [
    { id_partido: 101, id_jugador: "J01", amarillas: 0, rojas: 0 },
    { id_partido: 101, id_jugador: "J02", amarillas: 1, rojas: 0 },
    { id_partido: 102, id_jugador: "J01", amarillas: 0, rojas: 0 },
    { id_partido: 102, id_jugador: "J02", amarillas: 0, rojas: 0 },
    { id_partido: 103, id_jugador: "J01", amarillas: 0, rojas: 0 },
    { id_partido: 103, id_jugador: "J02", amarillas: 1, rojas: 0 },
    { id_partido: 104, id_jugador: "J02", amarillas: 1, rojas: 0 },
    { id_partido: 104, id_jugador: "J03", amarillas: 0, rojas: 0 }, // jugó pero nunca metió ni asistió
  ],
  goles: [
    { id_partido: 101, tipo_gol: "GF", nro_gol: 1, id_goleador: "J01", id_asistidor: null, fuente: "Sin dato", marcador_tras_gol: "1-0", link: null },
    { id_partido: 101, tipo_gol: "GF", nro_gol: 2, id_goleador: "J02", id_asistidor: null, fuente: "Sin dato", marcador_tras_gol: "2-0", link: null },
    { id_partido: 102, tipo_gol: "GF", nro_gol: 1, id_goleador: "J01", id_asistidor: null, fuente: "Sin dato", marcador_tras_gol: "1-0", link: null },
    // partido 103: Ana mete de nuevo (2do gol vs Rival X -> rival favorito), Bruno corta su racha anterior y arranca una nueva
    { id_partido: 103, tipo_gol: "GF", nro_gol: 1, id_goleador: "J01", id_asistidor: null, fuente: "Sin dato", marcador_tras_gol: "1-0", link: null },
    { id_partido: 103, tipo_gol: "GF", nro_gol: 2, id_goleador: "J02", id_asistidor: null, fuente: "Sin dato", marcador_tras_gol: "2-0", link: null },
    { id_partido: 104, tipo_gol: "GF", nro_gol: 1, id_goleador: "J02", id_asistidor: null, fuente: "Sin dato", marcador_tras_gol: "1-0", link: null },
  ],
};
const TODOS2 = new Set(DATA2.partidos.map((p) => p.id_partido));

test("topJugadoresPorCategoria: top N desc, excluye ceros, empate por nombre", () => {
  // Ana y Bruno meten 3 goles cada uno; Carla y Dario quedan afuera (0 goles)
  const top = topJugadoresPorCategoria(DATA2, TODOS2, "g", 3);
  assert.deepEqual(top, [
    { idJugador: "J01", nombre: "Ana", valor: 3 },
    { idJugador: "J02", nombre: "Bruno", valor: 3 },
  ]);
});

test("compararJugadores: fila real para cada uno, en cero si no jugó nada", () => {
  const { a, b } = compararJugadores(DATA2, TODOS2, "J01", "J04");
  assert.equal(a.g, 3);
  assert.equal(b.nombre_mostrar, "Dario");
  assert.equal(b.pj, 0);
  assert.equal(b.g, 0);
});

test("jugadorRivalFavorito: rival con más goles, mínimo 2, ignora si no llega", () => {
  assert.deepEqual(jugadorRivalFavorito(DATA2, TODOS2, "J01"), { rival: "Rival X", goles: 2 });
  assert.equal(jugadorRivalFavorito(DATA2, TODOS2, "J03"), null); // Carla nunca metió
  assert.equal(jugadorRivalFavorito(DATA2, TODOS2, "J04"), null); // Dario nunca jugó
});

test("rachaGoleadoraJugador: actual se corta si el último partido jugado no convirtió", () => {
  // Ana metió en sus 3 partidos jugados (101,102,103): racha actual y mejor = 3
  const ana = rachaGoleadoraJugador(DATA2, TODOS2, "J01");
  assert.deepEqual(ana.actual, { cantidad: 3 });
  assert.deepEqual(ana.mejor, { cantidad: 3, desde: "2026-02-01", hasta: "2026-02-15" });

  // Bruno: metió(101), no metió(102), metió(103), metió(104) -> racha actual
  // 2 (103,104), mejor también 2 (el corte en 102 impide una racha de 3)
  const bruno = rachaGoleadoraJugador(DATA2, TODOS2, "J02");
  assert.deepEqual(bruno.actual, { cantidad: 2 });
  assert.deepEqual(bruno.mejor, { cantidad: 2, desde: "2026-02-15", hasta: "2026-02-22" });

  // Carla jugó un partido y no metió: ninguna racha
  const carla = rachaGoleadoraJugador(DATA2, TODOS2, "J03");
  assert.equal(carla.actual, null);
  assert.equal(carla.mejor, null);

  // Dario nunca jugó: ninguna racha
  const dario = rachaGoleadoraJugador(DATA2, TODOS2, "J04");
  assert.equal(dario.actual, null);
  assert.equal(dario.mejor, null);
});

test("jugadorEnRacha: el de racha ACTUAL más larga del set filtrado", () => {
  // Ana (racha actual 3) le gana a Bruno (racha actual 2)
  assert.deepEqual(jugadorEnRacha(DATA2, TODOS2), { idJugador: "J01", nombre: "Ana", cantidad: 3 });
});

test("jugadorEnRacha: null si nadie llega al mínimo de 2", () => {
  // en el único partido jugado, nadie metió 2 seguidos todavía
  assert.equal(jugadorEnRacha(DATA2, new Set([101])), null);
});

test("logrosJugador: solo los badges cuyo umbral se cumple, en orden fijo", () => {
  // Bruno: 3 goles (>=UMBRALES_LOGROS.goleador), 3 amarillas (>=picante),
  // racha actual 2 (>=enRacha); no llega a figura (G+A) ni a inoxidable (PJ).
  assert.equal(UMBRALES_LOGROS.goleador, 3);
  const logros = logrosJugador(DATA2, TODOS2, "J02");
  assert.deepEqual(logros, [
    { icono: "⚽", etiqueta: "Goleador", detalle: "3 goles" },
    { icono: "🟨", etiqueta: "Picante", detalle: "3 amarillas" },
    { icono: "🔥", etiqueta: "En racha", detalle: "2 partidos seguidos convirtiendo" },
  ]);
});

test("logrosJugador: [] para un jugador sin ningún logro todavía", () => {
  assert.deepEqual(logrosJugador(DATA2, TODOS2, "J03"), []);
  assert.deepEqual(logrosJugador(DATA2, TODOS2, "J04"), []);
});
