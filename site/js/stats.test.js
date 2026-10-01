import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MINUTOS_PARTIDO,
  duosAsistidorGoleador,
  evolucionGfGc,
  fichaJugador,
  filtrarPartidos,
  fuentePorTipoGol,
  golesPorTiempo,
  partidosConDetalle,
  resumenEquipo,
  resumenPorTipo,
  tablaJugadores,
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
  assert.deepEqual(r.racha, { resultado: "G", cantidad: 1 }); // el más nuevo (P4=G) corta al toparse con P3=P
});

test("resumenEquipo con set vacío: todo 0, pctVictorias y racha null (borde)", () => {
  const r = resumenEquipo(DATA, new Set());
  assert.equal(r.pj, 0);
  assert.equal(r.pctVictorias, null);
  assert.equal(r.racha, null);
});

test("resumenPorTipo ignora el filtro de tipo activo", () => {
  const porTipo = resumenPorTipo(DATA, { tipo: "Torneo" });
  // el resultado trae AMBOS tipos, no solo Torneo, porque tipo se descarta antes de armar el set base
  assert.equal(porTipo.Torneo.pj, 2);
  assert.equal(porTipo.Amistoso.pj, 2);
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
  assert.equal(ana.gPorPj, 1 / 3);
  assert.equal(ana.pctGolesEquipo, 1 / 6); // 6 goles GF en total en el dataset
});

test("tablaJugadores no incluye jugadores sin ninguna alineación en el set", () => {
  const ids = new Set([2]); // solo Ana jugó el partido 2
  const filas = tablaJugadores(DATA, ids);
  assert.deepEqual(filas.map((f) => f.id_jugador), ["J01"]);
});

test("tablaJugadores: división por cero da null, nunca NaN/Infinity", () => {
  const filas = tablaJugadores(DATA, new Set([2])); // Ana jugó, no metió goles ni asistió
  const ana = filas[0];
  assert.equal(ana.gPorPj, 0); // 0 goles / 1 pj = 0, no es división por cero
  assert.equal(ana.minPorGol, null); // 0 goles en el denominador de minutos/gol: null
});

test("tablaJugadores: búsqueda de texto por nombre (case-insensitive)", () => {
  const filas = tablaJugadores(DATA, TODOS, "ana");
  assert.deepEqual(filas.map((f) => f.nombre_mostrar), ["Ana"]);
});

test("minPorGol usa MINUTOS_PARTIDO", () => {
  const filas = tablaJugadores(DATA, TODOS);
  const bruno = filas.find((f) => f.id_jugador === "J02"); // partidos 1 y 4: pj=2, g=3 (p1 nro2, p4 nro1 y nro2)
  assert.equal(bruno.pj, 2);
  assert.equal(bruno.g, 3);
  assert.equal(bruno.minPorGol, (2 * MINUTOS_PARTIDO) / 3);
});

// ---------------- partidosConDetalle / fichaJugador ----------------

test("partidosConDetalle trae alineación y goles de cada partido", () => {
  const [p1] = partidosConDetalle(DATA, new Set([1]));
  assert.equal(p1.alineacion.length, 2);
  assert.equal(p1.goles.length, 3);
});

test("fichaJugador: solo partidos donde metió gol o asistió, ordenados por fecha", () => {
  const ficha = fichaJugador(DATA, TODOS, "J03");
  assert.deepEqual(ficha.map((p) => p.id_partido), [3, 4]);
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
