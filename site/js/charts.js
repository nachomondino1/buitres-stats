// Envoltorios de Chart.js para las 4 vistas de gráficos (SPEC §4, vista 5).
// Chart.js se carga como <script> clásico (vendor/chart.min.js, UMD) antes de
// este módulo en index.html, por eso queda disponible como global `Chart`
// (no se importa: ≈ usar una librería ya instalada en el intérprete global).

const COLOR_GF = "#1f6f4a";
const COLOR_GC = "#b33a3a";
const COLOR_ASISTENCIA = "#4a7fb3";

// canvas -> instancia de Chart. Hay que destruir la anterior antes de volver a
// dibujar en el mismo <canvas>, si no Chart.js tira "Canvas is already in use".
const instancias = new Map();

function redibujar(canvas, config) {
  instancias.get(canvas)?.destroy();
  const instancia = new Chart(canvas, config);
  instancias.set(canvas, instancia);
  return instancia;
}

// < 601px ≈ el mismo corte que usa el CSS para "mobile" (ver styles.css).
// Chart.js no tiene media queries propias: hay que leer el viewport a mano
// cada vez que se dibuja, para achicar fuentes/leyenda en pantallas chicas.
function esMobile() {
  return window.matchMedia("(max-width: 600px)").matches;
}

// maintainAspectRatio:false a propósito: por default Chart.js calcula el
// alto del canvas como ancho/aspectRatio (≈2), y en mobile el ancho
// disponible es tan chico que el gráfico quedaba aplastado (poca altura,
// ilegible). Con esto en false, el canvas ocupa el alto fijo del
// contenedor (.grafico-contenedor en el CSS), que es parejo sin importar
// el ancho de la pantalla — pedido de la usuaria, gráficos en mobile.
function opcionesComunes() {
  const mobile = esMobile();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: mobile ? 12 : 16, font: { size: mobile ? 11 : 12 } },
      },
    },
  };
}

function ejeTicks(extra = {}) {
  const mobile = esMobile();
  return { font: { size: mobile ? 10 : 11 }, ...extra };
}

export function dibujarEvolucion(canvas, evolucion, fmtFecha) {
  redibujar(canvas, {
    type: "line",
    data: {
      labels: evolucion.map((e) => fmtFecha(e.fecha)),
      datasets: [
        { label: "GF", data: evolucion.map((e) => e.gf), borderColor: COLOR_GF, backgroundColor: COLOR_GF, tension: 0.2 },
        { label: "GC", data: evolucion.map((e) => e.gc), borderColor: COLOR_GC, backgroundColor: COLOR_GC, tension: 0.2 },
      ],
    },
    options: {
      ...opcionesComunes(),
      scales: {
        x: { ticks: ejeTicks() },
        y: { beginAtZero: true, ticks: ejeTicks({ precision: 0 }) },
      },
    },
  });
}

export function dibujarRanking(canvas, filasJugadores) {
  const top = filasJugadores
    .filter((f) => f.ga > 0)
    .sort((a, b) => b.ga - a.ga)
    .slice(0, 10);

  if (top.length === 0) {
    redibujar(canvas, { type: "bar", data: { labels: [], datasets: [] }, options: opcionesComunes() });
    return;
  }

  redibujar(canvas, {
    type: "bar",
    data: {
      labels: top.map((f) => f.nombre_mostrar),
      datasets: [
        { label: "Goles", data: top.map((f) => f.g), backgroundColor: COLOR_GF },
        { label: "Asistencias", data: top.map((f) => f.a), backgroundColor: COLOR_ASISTENCIA },
      ],
    },
    options: {
      ...opcionesComunes(),
      indexAxis: "y",
      scales: {
        x: { beginAtZero: true, ticks: ejeTicks({ precision: 0 }), stacked: true },
        y: { stacked: true, ticks: ejeTicks() },
      },
    },
  });
}

export function dibujarFuenteGoles(canvas, fuentePorTipo) {
  const fuentes = [...new Set([...Object.keys(fuentePorTipo.GF), ...Object.keys(fuentePorTipo.GC)])];
  redibujar(canvas, {
    type: "bar",
    data: {
      labels: fuentes,
      datasets: [
        { label: "GF", data: fuentes.map((f) => fuentePorTipo.GF[f] ?? 0), backgroundColor: COLOR_GF },
        { label: "GC", data: fuentes.map((f) => fuentePorTipo.GC[f] ?? 0), backgroundColor: COLOR_GC },
      ],
    },
    options: {
      ...opcionesComunes(),
      scales: { x: { ticks: ejeTicks() }, y: { beginAtZero: true, ticks: ejeTicks({ precision: 0 }) } },
    },
  });
}

export function dibujarGolesPorTiempo(canvas, { gf1t, gc1t, gf2t, gc2t }) {
  redibujar(canvas, {
    type: "bar",
    data: {
      labels: ["1er tiempo", "2do tiempo"],
      datasets: [
        { label: "GF", data: [gf1t, gf2t], backgroundColor: COLOR_GF },
        { label: "GC", data: [gc1t, gc2t], backgroundColor: COLOR_GC },
      ],
    },
    options: {
      ...opcionesComunes(),
      scales: { x: { ticks: ejeTicks() }, y: { beginAtZero: true, ticks: ejeTicks({ precision: 0 }) } },
    },
  });
}
