// DOM + estado de filtros <-> URL. Toda la lógica de cálculo vive en stats.js
// (sin DOM); este archivo solo lee esos resultados y los pinta.
import {
  duosAsistidorGoleador,
  evolucionGfGc,
  fichaJugador,
  filtrarPartidos,
  fuentePorTipoGol,
  golesPorTiempo,
  partidosConDetalle,
  resumenEquipo,
  tablaJugadores,
  ultimoPartido,
  ultimosResultados,
} from "./stats.js";
import { dibujarEvolucion, dibujarRanking, dibujarFuenteGoles, dibujarGolesPorTiempo } from "./charts.js";

const fmtNum = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });
// timeZone: "UTC" es obligatorio acá: si no, Intl formatea en el huso horario
// local del navegador y una fecha parseada como medianoche UTC puede mostrar
// el día anterior (p.ej. Argentina, UTC-3).
const fmtFecha = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
});

// "–" ≈ el "-" que usa el Excel para "sin dato"; nunca mostramos NaN/undefined.
function fmt(valor) {
  return valor === null || valor === undefined ? "–" : fmtNum.format(valor);
}
function fmtPorcentaje(valor) {
  return valor === null || valor === undefined ? "–" : fmtPct.format(valor);
}
function fmtFechaISO(iso) {
  // Date(iso) en UTC para que no corra un día según el huso horario del navegador
  return fmtFecha.format(new Date(`${iso}T00:00:00Z`));
}

// avatar ≈ iniciales + color determinístico por nombre (hash simple -> hue),
// para darle identidad visual a cada jugador en las tablas sin depender de
// fotos reales (la foto grupal que se probó en el header no le gustó a la
// usuaria, ver DECISIONS.md).
function colorDesdeNombre(nombre) {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 55%, 42%)`;
}

function avatarHTML(nombre) {
  const inicial = nombre.trim().charAt(0).toUpperCase();
  return `<span class="avatar" style="background:${colorDesdeNombre(nombre)}" aria-hidden="true">${inicial}</span>`;
}

// estado ≈ un solo dict mutable; dict.setdefault-like defaults abajo en initFiltros()
const estado = {
  data: null,
  filtros: {},
  vista: "resumen",
  orden: { resumen: null, jugadores: { columna: "g", direccion: "desc" } },
  jugadorFichaId: null,
};

// agrupadas: equipo primero (resumen, partidos, gráficos trae varios charts
// de equipo), después todo lo centrado en jugadores.
const VISTAS = ["resumen", "partidos", "graficos", "jugadores", "ficha", "duos"];

async function init() {
  const main = document.querySelector("main");
  try {
    const resp = await fetch("data/data.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    estado.data = await resp.json();
  } catch (err) {
    main.innerHTML = `<p class="estado-error" role="alert">No se pudo cargar data/data.json: ${err.message}</p>`;
    return;
  }

  leerFiltrosDeURL();
  construirControlesFiltro();
  construirTabs();
  construirBotonCompartir();
  construirToggleTema();
  renderFooter();
  renderVistaActual();
  registrarServiceWorker();
}

// el <html data-theme> ya se aplica antes de este módulo (script inline en
// index.html, para que no haya flash del tema equivocado al cargar); acá solo
// hace falta reflejar el ícono inicial y ciclar auto -> oscuro -> claro -> auto.
function construirToggleTema() {
  const boton = document.getElementById("boton-tema");
  actualizarIconoTema(boton);
  boton.addEventListener("click", () => {
    const actual = document.documentElement.getAttribute("data-theme");
    const siguiente = actual === "dark" ? "light" : actual === "light" ? null : "dark";
    if (siguiente) document.documentElement.setAttribute("data-theme", siguiente);
    else document.documentElement.removeAttribute("data-theme");
    try {
      if (siguiente) localStorage.setItem("tema", siguiente);
      else localStorage.removeItem("tema");
    } catch {
      // localStorage puede no estar disponible (modo privado); no es crítico acá
    }
    actualizarIconoTema(boton);
  });
}

function actualizarIconoTema(boton) {
  const tema = document.documentElement.getAttribute("data-theme");
  const porTema = { dark: ["☀️", "Pasar a modo claro"], light: ["🌙", "Pasar a modo oscuro (automático)"] };
  const [icono, etiqueta] = porTema[tema] ?? ["🌓", "Forzar modo oscuro"];
  boton.textContent = icono;
  boton.setAttribute("aria-label", etiqueta);
  boton.title = etiqueta;
}

function registrarServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// Web Share API (navigator.share): en el celular abre el panel nativo para
// mandar el link directo a WhatsApp/etc. ≈ no tiene equivalente en Python,
// es la forma que da el navegador para "compartir esto" sin armar un menú a
// mano. Si no está disponible (la mayoría de los navegadores de escritorio),
// se cae a copiar el link al portapapeles.
function construirBotonCompartir() {
  const boton = document.getElementById("boton-compartir");
  boton.addEventListener("click", async () => {
    const url = window.location.href;
    const datosCompartir = { title: "Los Buitres — Estadísticas", url };
    try {
      if (navigator.share) {
        await navigator.share(datosCompartir);
        return;
      }
      await navigator.clipboard.writeText(url);
      avisarCompartido("¡Link copiado!");
    } catch (err) {
      if (err.name === "AbortError") return; // el usuario cerró el panel de compartir
      avisarCompartido("No se pudo compartir el link", true);
    }
  });
}

function avisarCompartido(mensaje, esError = false) {
  const boton = document.getElementById("boton-compartir");
  const textoOriginal = boton.textContent;
  boton.textContent = mensaje;
  boton.classList.toggle("boton-compartir-error", esError);
  setTimeout(() => {
    boton.textContent = textoOriginal;
    boton.classList.remove("boton-compartir-error");
  }, 2000);
}

// ---------------- filtros <-> URL ----------------

function leerFiltrosDeURL() {
  const params = new URLSearchParams(window.location.search);
  const filtros = {};
  if (params.has("tipo")) filtros.tipo = params.get("tipo");
  if (params.has("rivales")) filtros.rivales = new Set(params.get("rivales").split(","));
  if (params.has("resultados")) filtros.resultados = new Set(params.get("resultados").split(","));
  if (params.has("ultimos")) filtros.ultimos = Number(params.get("ultimos"));
  estado.filtros = filtros;
  if (params.has("vista") && VISTAS.includes(params.get("vista"))) estado.vista = params.get("vista");
  if (params.has("jugadorId")) estado.jugadorFichaId = params.get("jugadorId");
  if (params.has("ordenCol") && COLUMNAS_JUGADORES.some((c) => c.clave === params.get("ordenCol"))) {
    estado.orden.jugadores = {
      columna: params.get("ordenCol"),
      direccion: params.get("ordenDir") === "asc" ? "asc" : "desc",
    };
  }
}

function actualizarURL() {
  const params = new URLSearchParams();
  const f = estado.filtros;
  if (f.tipo && f.tipo !== "Todos") params.set("tipo", f.tipo);
  if (f.rivales && f.rivales.size) params.set("rivales", [...f.rivales].join(","));
  if (f.resultados && f.resultados.size) params.set("resultados", [...f.resultados].join(","));
  if (f.ultimos != null) params.set("ultimos", String(f.ultimos));
  if (estado.vista !== "resumen") params.set("vista", estado.vista);
  if (estado.jugadorFichaId) params.set("jugadorId", estado.jugadorFichaId);
  const orden = estado.orden.jugadores;
  if (orden && (orden.columna !== "g" || orden.direccion !== "desc")) {
    params.set("ordenCol", orden.columna);
    params.set("ordenDir", orden.direccion);
  }
  const query = params.toString();
  const url = query ? `?${query}` : window.location.pathname;
  history.replaceState(null, "", url);
}

function idsFiltrados() {
  return filtrarPartidos(estado.data, estado.filtros);
}

// ---------------- controles de filtro ----------------

function construirControlesFiltro() {
  const cont = document.querySelector(".filtros");
  const { data, filtros } = estado;
  const tipos = [...new Set(data.partidos.map((p) => p.tipo))].sort();
  const rivales = [...new Set(data.partidos.map((p) => p.rival))].sort();

  cont.innerHTML = `
    <div class="filtro-campo">
      <label class="filtro-etiqueta" for="f-tipo">Tipo</label>
      <select id="f-tipo">
        <option value="">Todos</option>
        ${tipos.map((t) => `<option value="${t}">${t}</option>`).join("")}
      </select>
    </div>
    <div class="filtro-campo">
      <span class="filtro-etiqueta" id="f-rivales-label">Rival</span>
      <details class="filtro-dropdown">
        <summary aria-labelledby="f-rivales-label"><span id="f-rivales-resumen">Todos</span></summary>
        <div class="filtro-dropdown-panel">
          <input type="text" id="f-rivales-buscar" placeholder="Buscar rival…" aria-label="Buscar rival" class="input-busqueda" />
          <div class="filtro-chips-lista" role="group" aria-label="Rival" id="f-rivales"></div>
        </div>
      </details>
    </div>
    <div class="filtro-campo">
      <span class="filtro-etiqueta" id="f-resultado-label">Resultado</span>
      <details class="filtro-dropdown">
        <summary aria-labelledby="f-resultado-label"><span id="f-resultado-resumen">Todos</span></summary>
        <div class="filtro-dropdown-panel">
          <div class="filtro-chips-lista" role="group" aria-label="Resultado" id="f-resultado">
            ${["G", "E", "P"].map((r) => `
              <label><input type="checkbox" name="resultado" value="${r}" /> ${r}</label>
            `).join("")}
          </div>
        </div>
      </details>
    </div>
    <div class="filtro-campo">
      <span class="filtro-etiqueta" id="f-ultimos-label">Últimos partidos</span>
      <div class="filtro-ultimos" role="group" aria-labelledby="f-ultimos-label">
        <button type="button" data-ultimos="">Todos</button>
        <button type="button" data-ultimos="3">3</button>
        <button type="button" data-ultimos="5">5</button>
        <button type="button" data-ultimos="10">10</button>
        <input type="number" min="1" id="f-ultimos-custom" aria-label="Otra cantidad de últimos partidos" />
      </div>
    </div>
    <button type="button" class="boton-limpiar">Limpiar filtros</button>
  `;

  const rivalesCont = cont.querySelector("#f-rivales");
  rivalesCont.innerHTML = rivales
    .map((r) => `<label><input type="checkbox" name="rival" value="${r}" /> ${r}</label>`)
    .join("");

  // reflejar el estado actual de filtros en los controles recién creados
  cont.querySelector("#f-tipo").value = filtros.tipo ?? "";
  for (const cb of cont.querySelectorAll('input[name="rival"]')) {
    cb.checked = filtros.rivales?.has(cb.value) ?? false;
  }
  actualizarResumenRivales(cont);
  for (const cb of cont.querySelectorAll('input[name="resultado"]')) {
    cb.checked = filtros.resultados?.has(cb.value) ?? false;
  }
  actualizarResumenResultados(cont);
  actualizarBotonesUltimos(cont);
  if (filtros.ultimos != null && ![3, 5, 10].includes(filtros.ultimos)) {
    cont.querySelector("#f-ultimos-custom").value = filtros.ultimos;
  }

  cont.querySelector("#f-tipo").addEventListener("change", (e) => {
    estado.filtros.tipo = e.target.value || undefined;
    onFiltrosCambiaron();
  });
  for (const cb of cont.querySelectorAll('input[name="rival"]')) {
    cb.addEventListener("change", () => {
      const marcados = [...cont.querySelectorAll('input[name="rival"]:checked')].map((c) => c.value);
      estado.filtros.rivales = marcados.length ? new Set(marcados) : undefined;
      actualizarResumenRivales(cont);
      onFiltrosCambiaron();
    });
  }
  cont.querySelector("#f-rivales-buscar").addEventListener("input", (e) => {
    const busqueda = e.target.value.trim().toLowerCase();
    for (const label of cont.querySelectorAll("#f-rivales label")) {
      // style.display directo, no .hidden: ".filtro-chips-lista label { display:
      // flex }" le gana en especificidad CSS al "display:none" que pone el
      // atributo [hidden] del navegador (ambos pesan 1 clase/attr, pero la regla
      // de acá suma un selector de tipo de más) y lo dejaba invisible solo en el DOM.
      label.style.display = label.textContent.toLowerCase().includes(busqueda) ? "" : "none";
    }
  });
  for (const cb of cont.querySelectorAll('input[name="resultado"]')) {
    cb.addEventListener("change", () => {
      const marcados = [...cont.querySelectorAll('input[name="resultado"]:checked')].map((c) => c.value);
      estado.filtros.resultados = marcados.length ? new Set(marcados) : undefined;
      actualizarResumenResultados(cont);
      onFiltrosCambiaron();
    });
  }
  for (const boton of cont.querySelectorAll("[data-ultimos]")) {
    boton.addEventListener("click", () => {
      estado.filtros.ultimos = boton.dataset.ultimos ? Number(boton.dataset.ultimos) : undefined;
      cont.querySelector("#f-ultimos-custom").value = "";
      actualizarBotonesUltimos(cont);
      onFiltrosCambiaron();
    });
  }
  cont.querySelector("#f-ultimos-custom").addEventListener("input", (e) => {
    const valor = Number(e.target.value);
    estado.filtros.ultimos = e.target.value && valor > 0 ? valor : undefined;
    actualizarBotonesUltimos(cont);
    onFiltrosCambiaron();
  });
  cont.querySelector(".boton-limpiar").addEventListener("click", () => {
    estado.filtros = {};
    construirControlesFiltro();
    onFiltrosCambiaron();
  });
}

function onFiltrosCambiaron() {
  actualizarURL();
  renderVistaActual();
}

// texto del <summary> de un desplegable de selección múltiple (Rival,
// Resultado): "Todos" si no hay nada tildado, los valores si son pocos
// (p.ej. "G, P"), o el total si son muchos (nombres de rival pueden ser
// largos) — así no hace falta abrir el desplegable para ver qué hay elegido.
function textoResumenSeleccion(seleccionados) {
  const n = seleccionados?.size ?? 0;
  if (n === 0) return "Todos";
  if (n <= 2) return [...seleccionados].join(", ");
  return `${n} seleccionados`;
}

function actualizarResumenRivales(cont) {
  cont.querySelector("#f-rivales-resumen").textContent = textoResumenSeleccion(estado.filtros.rivales);
}

function actualizarResumenResultados(cont) {
  cont.querySelector("#f-resultado-resumen").textContent = textoResumenSeleccion(estado.filtros.resultados);
}

// qué botón de "últimos partidos" queda verde (aria-pressed): hay que
// llamarla también al clickear un botón o tipear en el input custom, no solo
// al construir los controles, si no el resaltado queda pegado en "Todos".
function actualizarBotonesUltimos(cont) {
  for (const boton of cont.querySelectorAll("[data-ultimos]")) {
    const valor = boton.dataset.ultimos ? Number(boton.dataset.ultimos) : null;
    boton.setAttribute("aria-pressed", String(valor === (estado.filtros.ultimos ?? null)));
  }
}

// ---------------- tabs ----------------

const ETIQUETA_VISTA = {
  resumen: "Resumen",
  jugadores: "Jugadores",
  partidos: "Partidos",
  ficha: "Ficha de jugador",
  graficos: "Gráficos",
  duos: "Dúos",
};

function construirTabs() {
  const nav = document.querySelector("nav.tabs");
  nav.innerHTML = VISTAS.map(
    (v) => `<button type="button" role="tab" id="tab-${v}" aria-controls="panel-${v}" data-vista="${v}">${ETIQUETA_VISTA[v]}</button>`
  ).join("");
  for (const boton of nav.querySelectorAll("button")) {
    boton.addEventListener("click", () => {
      estado.vista = boton.dataset.vista;
      actualizarURL();
      renderVistaActual();
    });
  }
}

function marcarTabActiva() {
  for (const boton of document.querySelectorAll("nav.tabs button")) {
    boton.setAttribute("aria-selected", String(boton.dataset.vista === estado.vista));
  }
}

// ---------------- render por vista ----------------

function renderVistaActual() {
  marcarTabActiva();
  const main = document.querySelector("main");
  const ids = idsFiltrados();

  const renderers = {
    resumen: renderResumen,
    jugadores: renderJugadores,
    partidos: renderPartidos,
    ficha: renderFicha,
    graficos: renderGraficos,
    duos: renderDuos,
  };
  main.innerHTML = `<section role="tabpanel" id="panel-${estado.vista}" aria-labelledby="tab-${estado.vista}"></section>`;
  renderers[estado.vista](main.querySelector("section"), ids);
}

function renderResumen(cont, ids) {
  const r = resumenEquipo(estado.data, ids);
  const tarjetaUltimo = renderTarjetaUltimoPartido();
  if (r.pj === 0) {
    cont.innerHTML = `<p class="estado-vacio">No hay partidos para estos filtros.</p>${tarjetaUltimo}`;
    return;
  }
  const forma = ultimosResultados(estado.data, ids, 5);
  cont.innerHTML = `
    ${filaTarjetas([["PJ", r.pj], ["% victorias", fmtPorcentaje(r.pctVictorias)]])}
    ${filaTarjetas([["G", r.g, "tarjeta-g"], ["E", r.e, "tarjeta-e"], ["P", r.p, "tarjeta-p"]])}
    ${filaTarjetas([["GF", r.gf], ["GC", r.gc], ["Dif", r.dif]])}
    <p>${puntosForma(forma)} Racha actual: ${r.racha ? `${r.racha.cantidad} ${etiquetaRacha(r.racha.resultado)}` : "–"}</p>
    ${tarjetaUltimo}
  `;
}

// una fila = un grupo semántico (resultado, goles, etc.) en su propia grilla,
// para separarlos visualmente en vez de una sola grilla con las 8 tarjetas
// mezcladas.
function filaTarjetas(items) {
  const tarjetas = items.map(([et, val, clase = ""]) => miniTarjeta(et, val, clase)).join("");
  return `<div class="resumen-grid">${tarjetas}</div>`;
}

function miniTarjeta(etiqueta, valor, clase) {
  return `<div class="resumen-tarjeta ${clase}"><span class="valor">${valor}</span><span class="etiqueta">${etiqueta}</span></div>`;
}

function etiquetaRacha(resultado) {
  return { G: "victoria(s) seguidas", E: "empate(s) seguidos", P: "derrota(s) seguidas" }[resultado];
}

function puntosForma(resultados) {
  if (resultados.length === 0) return "";
  const puntos = resultados.map((r) => `<span class="forma-punto forma-punto-${r}" title="${r}"></span>`).join("");
  return `<span class="forma-puntos" aria-hidden="true">${puntos}</span>`;
}

// tarjeta "último partido": siempre el real más reciente, sin importar los
// filtros activos (ver comentario de ultimoPartido() en stats.js) — es la
// primera pregunta al abrir la página después de jugar un sábado.
function renderTarjetaUltimoPartido() {
  const u = ultimoPartido(estado.data);
  if (!u) return "";
  const golesTexto = (lista, icono) =>
    lista.length ? `<p class="tarjeta-ultimo-detalle">${icono} ${lista.map((x) => `${x.nombre}${x.cantidad > 1 ? ` x${x.cantidad}` : ""}`).join(", ")}</p>` : "";
  return `
    <h2>Último partido</h2>
    <div class="tarjeta-ultimo">
      <div class="tarjeta-ultimo-header">
        <span>${fmtFechaISO(u.fecha)} · ${u.tipo} vs ${u.rival}</span>
        <span class="resultado resultado-${u.resultado}">${u.resultado}</span>
      </div>
      <div class="tarjeta-ultimo-marcador">Los Buitres ${u.gf} – ${u.gc} ${u.rival}</div>
      ${golesTexto(u.goleadores, "⚽")}
      ${golesTexto(u.asistidores, "🅰️")}
    </div>
  `;
}

const COLUMNAS_JUGADORES = [
  { clave: "nombre_mostrar", etiqueta: "Jugador", numerica: false },
  { clave: "pj", etiqueta: "PJ" },
  { clave: "g", etiqueta: "G" },
  { clave: "a", etiqueta: "A" },
  { clave: "ga", etiqueta: "G+A" },
  { clave: "partidosConGa", etiqueta: "PJ c/ G+A" },
  { clave: "ta", etiqueta: "TA" },
  { clave: "tr", etiqueta: "TR" },
  { clave: "primerGolEquipo", etiqueta: "1º gol equipo" },
  { clave: "pctGaEquipo", etiqueta: "% G+A equipo", formato: fmtPorcentaje },
  { clave: "minPorGa", etiqueta: "Min/G+A", formato: fmt },
];

function renderJugadores(cont, ids) {
  let filas = tablaJugadores(estado.data, ids);
  const orden = estado.orden.jugadores;
  filas = ordenarFilas(filas, orden);

  if (filas.length === 0) {
    cont.innerHTML = '<p class="estado-vacio">No hay jugadores para estos filtros.</p>';
    return;
  }

  cont.innerHTML = `
    <div class="tabla-wrap">
      <table>
        <thead><tr>${COLUMNAS_JUGADORES.map((c) => thOrdenable(c, orden)).join("")}</tr></thead>
        <tbody>
          ${filas.map((f) => `
            <tr>
              <td><button type="button" class="boton-jugador" data-jugador-id="${f.id_jugador}">${avatarHTML(f.nombre_mostrar)}${f.nombre_mostrar}</button></td>
              <td>${f.pj}</td><td>${f.g}</td><td>${f.a}</td><td>${f.ga}</td>
              <td>${f.partidosConGa}</td>
              <td>${f.ta}</td><td>${f.tr}</td>
              <td>${f.primerGolEquipo}</td>
              <td>${fmtPorcentaje(f.pctGaEquipo)}</td><td>${fmt(f.minPorGa)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  for (const th of cont.querySelectorAll("th[data-clave]")) {
    th.addEventListener("click", () => {
      const clave = th.dataset.clave;
      if (orden.columna === clave) orden.direccion = orden.direccion === "desc" ? "asc" : "desc";
      else {
        orden.columna = clave;
        orden.direccion = "desc";
      }
      actualizarURL();
      renderVistaActual();
    });
  }
  for (const boton of cont.querySelectorAll("[data-jugador-id]")) {
    boton.addEventListener("click", () => {
      estado.jugadorFichaId = boton.dataset.jugadorId;
      estado.vista = "ficha";
      actualizarURL();
      renderVistaActual();
    });
  }
}

function thOrdenable(col, orden) {
  return `<th data-clave="${col.clave}"${ariaSort(col, orden)}>${col.etiqueta}</th>`;
}

function ariaSort(col, orden) {
  if (orden.columna !== col.clave) return "";
  return ` aria-sort="${orden.direccion === "asc" ? "ascending" : "descending"}"`;
}

function ordenarFilas(filas, orden) {
  if (!orden?.columna) return filas;
  const signo = orden.direccion === "asc" ? 1 : -1;
  return filas.slice().sort((a, b) => {
    const va = a[orden.columna];
    const vb = b[orden.columna];
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string") return signo * va.localeCompare(vb);
    return signo * (va - vb);
  });
}

function renderPartidos(cont, ids) {
  const partidos = partidosConDetalle(estado.data, ids).sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (partidos.length === 0) {
    cont.innerHTML = '<p class="estado-vacio">No hay partidos para estos filtros.</p>';
    return;
  }
  const nombrePorId = new Map(estado.data.jugadores.map((j) => [j.id_jugador, j.nombre_mostrar]));

  cont.innerHTML = partidos
    .map((p, i) => `
      <div class="partido">
        <button type="button" class="partido-resumen" aria-expanded="false" data-idx="${i}">
          <span>${fmtFechaISO(p.fecha)} · ${p.tipo} vs ${p.rival}</span>
          <span>
            ${p.gf}-${p.gc} <span class="resultado resultado-${p.resultado}">${p.resultado}</span>
            ${p.goles_completos ? "" : '<span class="partido-aviso">goles incompletos</span>'}
          </span>
        </button>
        <div class="partido-detalle" hidden>
          ${p.link_video ? `<p><a href="${p.link_video}" target="_blank" rel="noopener">Ver video</a></p>` : ""}
          <h4>Alineación</h4>
          <ul>${p.alineacion.map((a) => `<li>${nombrePorId.get(a.id_jugador) ?? a.id_jugador}${a.amarillas ? " 🟨" : ""}${a.rojas ? " 🟥" : ""}</li>`).join("") || "<li>Sin datos</li>"}</ul>
          <h4>Goles</h4>
          <ul>${p.goles.map((g) => `<li>${g.tipo_gol} #${g.nro_gol}${g.id_goleador ? " " + nombrePorId.get(g.id_goleador) : ""}${g.id_asistidor ? " (asistió " + nombrePorId.get(g.id_asistidor) + ")" : ""} — ${g.fuente}</li>`).join("") || "<li>Sin goles cargados</li>"}</ul>
        </div>
      </div>
    `)
    .join("");

  for (const boton of cont.querySelectorAll(".partido-resumen")) {
    boton.addEventListener("click", () => {
      const detalle = boton.nextElementSibling;
      const abierto = boton.getAttribute("aria-expanded") === "true";
      boton.setAttribute("aria-expanded", String(!abierto));
      detalle.hidden = abierto;
    });
  }
}

function renderFicha(cont, ids) {
  const jugadores = estado.data.jugadores.slice().sort((a, b) => a.nombre_mostrar.localeCompare(b.nombre_mostrar));
  cont.innerHTML = `
    <button type="button" class="boton-volver" id="ficha-volver">← Volver a Jugadores</button>
    <div class="filtro-campo" style="margin-bottom:1rem">
      <label for="ficha-select">Jugador</label>
      <select id="ficha-select">
        <option value="">Elegí un jugador…</option>
        ${jugadores.map((j) => `<option value="${j.id_jugador}">${j.nombre_mostrar}</option>`).join("")}
      </select>
    </div>
    <div id="ficha-contenido"></div>
  `;
  cont.querySelector("#ficha-volver").addEventListener("click", () => {
    estado.vista = "jugadores";
    actualizarURL();
    renderVistaActual();
  });
  const select = cont.querySelector("#ficha-select");
  select.value = estado.jugadorFichaId ?? "";
  select.addEventListener("change", () => {
    estado.jugadorFichaId = select.value || null;
    actualizarURL();
    renderFichaContenido(cont.querySelector("#ficha-contenido"), ids);
  });
  renderFichaContenido(cont.querySelector("#ficha-contenido"), ids);
}

function renderFichaContenido(cont, ids) {
  if (!estado.jugadorFichaId) {
    cont.innerHTML = "";
    return;
  }
  const jugador = estado.data.jugadores.find((j) => j.id_jugador === estado.jugadorFichaId);
  const encabezado = jugador
    ? `<h3 class="ficha-encabezado">${avatarHTML(jugador.nombre_mostrar)}${jugador.nombre_mostrar}</h3>`
    : "";
  const partidos = fichaJugador(estado.data, ids, estado.jugadorFichaId);
  if (partidos.length === 0) {
    cont.innerHTML = `${encabezado}<p class="estado-vacio">${jugador?.nombre_mostrar ?? "Este jugador"} no tiene goles ni asistencias en estos filtros.</p>`;
    return;
  }
  cont.innerHTML = `
    ${encabezado}
    <div class="tabla-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Rival</th><th>Resultado</th><th style="text-align:left">Participación</th></tr></thead>
        <tbody>
          ${partidos.map((p) => `
            <tr>
              <td>${fmtFechaISO(p.fecha)}</td>
              <td>${p.rival}</td>
              <td><span class="resultado resultado-${p.resultado}">${p.gf}-${p.gc} ${p.resultado}</span></td>
              <td style="text-align:left">${p.goles.map((g) => g.id_goleador === estado.jugadorFichaId ? `Gol (#${g.nro_gol})` : `Asistencia`).join(", ")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderGraficos(cont, ids) {
  cont.innerHTML = `
    <div class="grafico-card"><h3>Evolución GF/GC por partido</h3><canvas id="chart-evolucion" role="img" aria-label="Gráfico de evolución de goles a favor y en contra por partido"></canvas></div>
    <div class="grafico-card"><h3>Ranking goleadores y G+A</h3><canvas id="chart-ranking" role="img" aria-label="Gráfico de ranking de goleadores y goles más asistencias"></canvas></div>
    <div class="grafico-card"><h3>Fuente de los goles (GF vs GC)</h3><canvas id="chart-fuente" role="img" aria-label="Gráfico de fuente de los goles a favor y en contra"></canvas></div>
    <div class="grafico-card"><h3>Goles por tiempo (1T vs 2T)</h3><canvas id="chart-tiempo" role="img" aria-label="Gráfico de goles por primer y segundo tiempo"></canvas></div>
  `;
  const evolucion = evolucionGfGc(estado.data, ids);
  if (evolucion.length === 0) {
    cont.innerHTML = '<p class="estado-vacio">No hay datos para graficar con estos filtros.</p>';
    return;
  }
  dibujarEvolucion(cont.querySelector("#chart-evolucion"), evolucion, fmtFechaISO);
  dibujarRanking(cont.querySelector("#chart-ranking"), tablaJugadores(estado.data, ids));
  dibujarFuenteGoles(cont.querySelector("#chart-fuente"), fuentePorTipoGol(estado.data, ids));
  dibujarGolesPorTiempo(cont.querySelector("#chart-tiempo"), golesPorTiempo(estado.data, ids));
}

function renderDuos(cont, ids) {
  const duos = duosAsistidorGoleador(estado.data, ids);
  if (duos.length === 0) {
    cont.innerHTML = '<p class="estado-vacio">No hay dúos asistidor→goleador para estos filtros.</p>';
    return;
  }
  const maxCantidad = duos[0].cantidad;
  cont.innerHTML = `
    <div class="tabla-wrap">
      <table>
        <thead><tr><th>Asistidor</th><th style="text-align:left">Goleador</th><th>Goles</th><th style="text-align:left">Heatmap</th></tr></thead>
        <tbody>
          ${duos.map((d) => `
            <tr>
              <td style="text-align:left">${avatarHTML(d.asistidor)}${d.asistidor}</td>
              <td style="text-align:left">${avatarHTML(d.goleador)}${d.goleador}</td>
              <td>${d.cantidad}</td>
              <td style="text-align:left"><span style="display:inline-block;height:0.8rem;width:${(d.cantidad / maxCantidad) * 100}px;background:var(--color-acento);border-radius:3px"></span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFooter() {
  const footer = document.querySelector("footer.app-footer");
  const { meta } = estado.data;
  const fecha = new Date(meta.generated_at).toLocaleString("es-AR");
  footer.innerHTML = `Datos generados el ${fecha} · ${meta.warnings.length} aviso(s) de calidad de datos`;
}

init();
