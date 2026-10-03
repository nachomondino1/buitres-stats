// DOM + estado de filtros <-> URL. Toda la lógica de cálculo vive en stats.js
// (sin DOM); este archivo solo lee esos resultados y los pinta.
import {
  datosCuriosos,
  duosAsistidorGoleador,
  evolucionGfGc,
  fichaJugador,
  filtrarPartidos,
  fuentePorTipoGol,
  golesPorTiempo,
  historialRivales,
  jugadoresDestacados,
  partidosConDetalle,
  rachasHistoricas,
  resumenEquipo,
  tablaJugadores,
  ultimoPartido,
  ultimosResultados,
} from "./stats.js";
import { dibujarEvolucion, dibujarRanking, dibujarFuenteGoles, dibujarGolesPorTiempo } from "./charts.js";

// maximumFractionDigits: 0 a propósito en los dos (pedido de la usuaria: nada
// de decimales en la UI, ni en "Min/G+A" ni en los porcentajes).
const fmtNum = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 0 });
// excepción a la regla de "nada de decimales": un promedio de goles por
// partido redondeado a entero (p.ej. 2.6 -> "3") deja de decir nada.
const fmtProm = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
function fmtPromedio(valor) {
  return valor === null || valor === undefined ? "–" : fmtProm.format(valor);
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
  orden: {
    jugadores: { columna: "g", direccion: "desc" },
    rivales: { columna: "pj", direccion: "desc" },
  },
  jugadorFichaId: null,
};

// 4 vistas. "Partidos" se separó de "Equipo": es el log de partidos en sí
// (resultado + alineación + goles), ni una agregación de equipo ni de
// jugador, así que no encajaba del todo en ninguna de las otras dos (pedido
// de la usuaria).
const VISTAS = ["resumen", "partidos", "equipo", "jugadores"];

// vistas viejas (de antes de agrupar en pocas pestañas) que puede traer un
// link guardado: las mandamos a la vista nueva que más se le parece, en vez
// de resetear a Resumen en silencio. "partidos" ya no está acá: ahora es una
// vista real con ese mismo nombre, así que el link viejo cae directo ahí.
const VISTA_LEGADO = { graficos: "equipo", ficha: "jugadores", duos: "jugadores" };

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
  cerrarDropdownsFiltroAlClickAfuera();
  construirTabs();
  construirBotonCompartir();
  construirToggleTema();
  construirBotonTitulo();
  renderFooter();
  renderVistaActual();
  registrarServiceWorker();
}

// tocar el título vuelve a Resumen, como el logo/home de cualquier sitio.
function construirBotonTitulo() {
  document.getElementById("boton-titulo").addEventListener("click", () => {
    estado.vista = "resumen";
    actualizarURL();
    renderVistaActual();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
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
  if (params.has("resultados")) filtros.resultados = new Set(params.get("resultados").split(","));
  if (params.has("ultimos")) filtros.ultimos = Number(params.get("ultimos"));
  estado.filtros = filtros;
  if (params.has("vista")) {
    const v = params.get("vista");
    if (VISTAS.includes(v)) estado.vista = v;
    else if (VISTA_LEGADO[v]) estado.vista = VISTA_LEGADO[v];
  }
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

  // en mobile todo el bloque vive colapsado atrás de este botón (sticky,
  // ocupa una sola línea); en desktop queda oculto por CSS y .filtros-panel
  // se ve siempre entero (pedido de la usuaria: el filtro de Rival se sacó
  // por desuso, y lo que queda no debía seguir ocupando una pantalla entera
  // en mobile).
  cont.innerHTML = `
    <button type="button" class="boton-filtros-toggle" id="boton-filtros-toggle" aria-expanded="false" aria-controls="filtros-panel">
      <span>Filtros</span>
      <span class="filtros-badge" id="filtros-badge" hidden>0</span>
      <span class="filtros-toggle-icono" aria-hidden="true">▾</span>
    </button>
    <div class="filtros-panel" id="filtros-panel">
      <div class="filtro-campo">
        <label class="filtro-etiqueta" for="f-tipo">Tipo</label>
        <select id="f-tipo">
          <option value="">Todos</option>
          ${tipos.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
      </div>
      <div class="filtro-campo">
        <span class="filtro-etiqueta" id="f-resultado-label">Resultado</span>
        <details class="filtro-dropdown" name="filtro-dropdown">
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
    </div>
  `;

  // reflejar el estado actual de filtros en los controles recién creados
  cont.querySelector("#f-tipo").value = filtros.tipo ?? "";
  for (const cb of cont.querySelectorAll('input[name="resultado"]')) {
    cb.checked = filtros.resultados?.has(cb.value) ?? false;
  }
  actualizarResumenResultados(cont);
  actualizarBotonesUltimos(cont);
  actualizarBadgeFiltros(cont);
  if (filtros.ultimos != null && ![3, 5, 10].includes(filtros.ultimos)) {
    cont.querySelector("#f-ultimos-custom").value = filtros.ultimos;
  }

  cont.querySelector("#boton-filtros-toggle").addEventListener("click", () => {
    const abierto = cont.classList.toggle("filtros-abierto");
    cont.querySelector("#boton-filtros-toggle").setAttribute("aria-expanded", String(abierto));
  });
  cont.querySelector("#f-tipo").addEventListener("change", (e) => {
    estado.filtros.tipo = e.target.value || undefined;
    actualizarBadgeFiltros(cont);
    onFiltrosCambiaron();
  });
  for (const cb of cont.querySelectorAll('input[name="resultado"]')) {
    cb.addEventListener("change", () => {
      const marcados = [...cont.querySelectorAll('input[name="resultado"]:checked')].map((c) => c.value);
      estado.filtros.resultados = marcados.length ? new Set(marcados) : undefined;
      actualizarResumenResultados(cont);
      actualizarBadgeFiltros(cont);
      onFiltrosCambiaron();
    });
  }
  for (const boton of cont.querySelectorAll("[data-ultimos]")) {
    boton.addEventListener("click", () => {
      estado.filtros.ultimos = boton.dataset.ultimos ? Number(boton.dataset.ultimos) : undefined;
      cont.querySelector("#f-ultimos-custom").value = "";
      actualizarBotonesUltimos(cont);
      actualizarBadgeFiltros(cont);
      onFiltrosCambiaron();
    });
  }
  cont.querySelector("#f-ultimos-custom").addEventListener("input", (e) => {
    const valor = Number(e.target.value);
    estado.filtros.ultimos = e.target.value && valor > 0 ? valor : undefined;
    actualizarBotonesUltimos(cont);
    actualizarBadgeFiltros(cont);
    onFiltrosCambiaron();
  });
  cont.querySelector(".boton-limpiar").addEventListener("click", () => {
    estado.filtros = {};
    construirControlesFiltro();
    onFiltrosCambiaron();
  });
}

// <details> nativo solo se cierra haciendo click en el <summary>; esto suma
// el comportamiento habitual de un dropdown: click afuera también cierra.
// Delegado en document (una sola vez) porque los <details> se recrean cada
// vez que se reconstruyen los controles de filtro.
function cerrarDropdownsFiltroAlClickAfuera() {
  document.addEventListener("click", (e) => {
    for (const details of document.querySelectorAll(".filtro-dropdown[open]")) {
      if (!details.contains(e.target)) details.open = false;
    }
    // mismo criterio para el panel colapsable de filtros en mobile (ver CSS,
    // solo tiene efecto visual bajo los 600px): clickear afuera lo cierra.
    const filtrosAbiertos = document.querySelector(".filtros.filtros-abierto");
    if (filtrosAbiertos && !filtrosAbiertos.contains(e.target)) {
      filtrosAbiertos.classList.remove("filtros-abierto");
      filtrosAbiertos.querySelector("#boton-filtros-toggle")?.setAttribute("aria-expanded", "false");
    }
  });
}

function onFiltrosCambiaron() {
  actualizarURL();
  renderVistaActual();
}

// texto del <summary> de un desplegable de selección múltiple (Resultado):
// "Todos" si no hay nada tildado, los valores si son pocos (p.ej. "G, P"), o
// el total si son muchos — así no hace falta abrir el desplegable para ver
// qué hay elegido.
function textoResumenSeleccion(seleccionados) {
  const n = seleccionados?.size ?? 0;
  if (n === 0) return "Todos";
  if (n <= 2) return [...seleccionados].join(", ");
  return `${n} seleccionados`;
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

// cuántos filtros hay activos: se ve en el botón "Filtros" colapsado de
// mobile, para no tener que abrirlo solo para confirmar que no quedó ninguno
// tildado por accidente.
function actualizarBadgeFiltros(cont) {
  const badge = cont.querySelector("#filtros-badge");
  if (!badge) return;
  let n = 0;
  if (estado.filtros.tipo) n++;
  if (estado.filtros.resultados?.size) n++;
  if (estado.filtros.ultimos != null) n++;
  badge.hidden = n === 0;
  badge.textContent = String(n);
}

// ---------------- tabs ----------------

const ETIQUETA_VISTA = {
  resumen: "📊 Resumen",
  partidos: "⚽ Partidos",
  equipo: "🛡️ Equipo",
  jugadores: "👥 Jugadores",
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

  const renderers = { resumen: renderResumen, partidos: renderPartidosVista, equipo: renderEquipo, jugadores: renderJugadores };
  main.innerHTML = `<section role="tabpanel" id="panel-${estado.vista}" aria-labelledby="tab-${estado.vista}"></section>`;
  renderers[estado.vista](main.querySelector("section"), ids);
}

// fila de botones arriba de una vista con varias secciones, para saltar
// directo a una sin tener que scrollear a mano (las vistas se alargaron al
// agrupar temas que antes eran pestañas separadas).
function renderSubnav(items) {
  return `
    <nav class="subnav" aria-label="Secciones de esta vista">
      ${items.map(([id, etiqueta]) => `<button type="button" data-destino="${id}">${etiqueta}</button>`).join("")}
    </nav>
  `;
}

// cualquier [data-destino="id-de-sección"] (subnav, o el link de "volver" de
// la ficha) hace scroll suave a esa sección; se busca de nuevo en cada
// render porque las secciones se reconstruyen con cada cambio de filtro.
function activarScrollASecciones(cont) {
  for (const boton of cont.querySelectorAll("[data-destino]")) {
    boton.addEventListener("click", () => {
      document.getElementById(boton.dataset.destino)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

// desde cualquier lado (tarjeta de "destacados" en Resumen, nombre de
// jugador en la tabla): va a la vista Jugadores con esa ficha abierta y
// scrollea a la sección.
function irAFichaJugador(idJugador) {
  estado.jugadorFichaId = idJugador;
  estado.vista = "jugadores";
  actualizarURL();
  renderVistaActual();
  document.getElementById("seccion-ficha")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// desde la tarjeta mini de "Último partido" en Resumen: va a la vista
// Partidos (ahí arriba tiene la versión completa, con goleadores/asistidores).
function irAPartidos() {
  estado.vista = "partidos";
  actualizarURL();
  renderVistaActual();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderResumen(cont, ids) {
  const r = resumenEquipo(estado.data, ids);
  const tarjetaUltimo = renderTarjetaUltimoPartidoMini();
  if (r.pj === 0) {
    cont.innerHTML = `<p class="estado-vacio">No hay partidos para estos filtros.</p>${tarjetaUltimo}`;
    return;
  }
  const forma = ultimosResultados(estado.data, ids, 5);
  const seccionRachas = renderRachasHistoricas(ids, r.racha);
  const seccionDestacados = renderJugadoresDestacados(ids);
  const seccionCuriosos = renderDatosCuriosos(ids);
  cont.innerHTML = `
    <section class="resumen-bloque resumen-bloque-hero">
      <h2>Resultados</h2>
      ${filaTarjetas([["PJ", r.pj], ["% victorias", fmtPorcentaje(r.pctVictorias)]], "resumen-grid-hero")}
      ${filaTarjetas([["G", r.g, "tarjeta-g"], ["E", r.e, "tarjeta-e"], ["P", r.p, "tarjeta-p"]])}
      ${filaTarjetas([["GF", r.gf], ["GC", r.gc], ["Dif", r.dif]])}
      ${filaTarjetas([["Prom. GF/partido", fmtPromedio(r.promedioGf)], ["Prom. GC/partido", fmtPromedio(r.promedioGc)]])}
      <p class="resumen-forma">Últimos partidos: ${puntosForma(forma)}</p>
      ${tarjetaUltimo}
    </section>
    ${seccionRachas ? `<section class="resumen-bloque">${seccionRachas}</section>` : ""}
    ${seccionDestacados ? `<section class="resumen-bloque">${seccionDestacados}</section>` : ""}
    ${seccionCuriosos ? `<section class="resumen-bloque">${seccionCuriosos}</section>` : ""}
  `;
  activarScrollASecciones(cont);
  for (const boton of cont.querySelectorAll(".tarjeta-destacado[data-jugador-id]")) {
    boton.addEventListener("click", () => irAFichaJugador(boton.dataset.jugadorId));
  }
  cont.querySelector("[data-ir-partidos]")?.addEventListener("click", irAPartidos);
}

// rachas: la actual (pedido de la usuaria: vivía suelta arriba, ahora es una
// tarjeta más acá) + las históricas (la más larga ganando/perdiendo y la más
// larga sin ganar / sin perder), cada una con su rango de fechas.
function renderRachasHistoricas(ids, rachaActual) {
  const r = rachasHistoricas(estado.data, ids);
  const items = [
    ["Racha ganadora más larga", r.ganando, "bueno"],
    ["Racha perdedora más larga", r.perdiendo, "malo"],
    ["Más partidos seguidos sin ganar", r.sinGanar, "malo"],
    ["Más partidos seguidos sin perder", r.sinPerder, "bueno"],
  ];
  if (!rachaActual && items.every(([, racha]) => !racha)) return "";
  return `
    <h2>Rachas</h2>
    ${descripcionSeccion("La racha actual del equipo y los mejores (y peores) rachas de la historia, con el rango de fechas de cada una.")}
    <div class="destacados-grid">
      ${tarjetaRachaActual(rachaActual)}
      ${items.map(([etiqueta, racha, tono]) => tarjetaRacha(etiqueta, racha, tono)).join("")}
    </div>
  `;
}

// G/E/P: mismo color que el resto de la app usa para ese resultado (ver
// .tarjeta-g/-e/-p), no siempre verde — el verde es "bueno", no "el dato
// importante" (pedido de la usuaria).
function tarjetaRachaActual(racha) {
  if (!racha) {
    return `<div class="tarjeta-destacado tarjeta-destacado-vacia"><span class="tarjeta-destacado-etiqueta">Racha actual</span><span class="tarjeta-destacado-valor">–</span></div>`;
  }
  const tono = { G: "bueno", E: "empate", P: "malo" }[racha.resultado];
  return `
    <div class="tarjeta-destacado">
      <span class="tarjeta-destacado-etiqueta">Racha actual</span>
      <span class="tarjeta-destacado-valor valor-${tono}">${racha.cantidad}</span>
      <span class="tarjeta-destacado-etiqueta">${etiquetaRacha(racha.resultado)}</span>
    </div>
  `;
}

function tarjetaRacha(etiqueta, racha, tono) {
  if (!racha) {
    return `<div class="tarjeta-destacado tarjeta-destacado-vacia"><span class="tarjeta-destacado-etiqueta">${etiqueta}</span><span class="tarjeta-destacado-valor">–</span></div>`;
  }
  const rango = racha.desde === racha.hasta
    ? fmtFechaISO(racha.desde)
    : `${fmtFechaISO(racha.desde)} – ${fmtFechaISO(racha.hasta)}`;
  return `
    <div class="tarjeta-destacado">
      <span class="tarjeta-destacado-etiqueta">${etiqueta}</span>
      <span class="tarjeta-destacado-valor valor-${tono}">${racha.cantidad}</span>
      <span class="tarjeta-destacado-etiqueta">${rango}</span>
    </div>
  `;
}

// "Resumen" tiene que ser un resumen de verdad: no solo números del equipo,
// también quién se destaca individualmente (pedido de la usuaria). Un valor
// en 0 no cuenta como "destacado" (jugadoresDestacados() ya filtra eso).
function renderJugadoresDestacados(ids) {
  const d = jugadoresDestacados(estado.data, ids);
  const items = [
    ["Máximo goleador", d.goleador, "goles"],
    ["Máximo asistidor", d.asistidor, "asistencias"],
    ["Más influyente", d.influyente, "G+A"],
    ["Más partidos jugados", d.masPartidos, "PJ"],
  ];
  if (items.every(([, v]) => !v)) return "";
  return `
    <h2>Jugadores destacados</h2>
    ${descripcionSeccion("Quién lidera cada estadística individual en los partidos filtrados. Tocá una tarjeta para ver la ficha completa de ese jugador.")}
    <div class="destacados-grid">
      ${items.map(([etiqueta, v, unidad]) => tarjetaDestacado(etiqueta, v, unidad)).join("")}
    </div>
  `;
}

function tarjetaDestacado(etiqueta, v, unidad) {
  if (!v) {
    return `<div class="tarjeta-destacado tarjeta-destacado-vacia"><span class="tarjeta-destacado-etiqueta">${etiqueta}</span><span class="tarjeta-destacado-valor">–</span></div>`;
  }
  return `
    <button type="button" class="tarjeta-destacado" data-jugador-id="${v.idJugador}">
      <span class="tarjeta-destacado-etiqueta">${etiqueta}</span>
      <span class="tarjeta-destacado-jugador">${avatarHTML(v.nombre)}${v.nombre}</span>
      <span class="tarjeta-destacado-valor">${v.valor} ${unidad}</span>
    </button>
  `;
}

// "Datos curiosos": coincidencias que salen de cruzar los datos entre sí
// (rival más repetido, marcador que se dio más de una vez, etc.), no solo
// sumar columnas. Pedido de la usuaria. Cada hecho se arma solo si aplica
// (ver datosCuriosos() en stats.js) — con pocos partidos cargados es normal
// que algunas tarjetas no aparezcan todavía.
function renderDatosCuriosos(ids) {
  const d = datosCuriosos(estado.data, ids);
  const tarjetas = [];

  if (d.rivalRepetido) {
    const r = d.rivalRepetido;
    const record = [r.g && `${r.g}G`, r.e && `${r.e}E`, r.p && `${r.p}P`].filter(Boolean).join("-");
    tarjetas.push(tarjetaCuriosidad("Rival más enfrentado", r.rival, `${r.pj} partidos (${record})`));
  }
  if (d.marcadorRepetido) {
    const m = d.marcadorRepetido;
    tarjetas.push(tarjetaCuriosidad("Marcador que más se repitió", listaConY(m.marcadores), `${m.cantidad} veces`));
  }
  if (d.jugadorAmuleto) {
    const j = d.jugadorAmuleto;
    tarjetas.push(tarjetaCuriosidadJugador(
      "Jugador amuleto",
      j,
      `${fmtPorcentaje(j.pctVictorias)} de victorias del equipo en sus ${j.pj} PJ`,
    ));
  }
  if (d.masGolesUnPartido) {
    const m = d.masGolesUnPartido;
    tarjetas.push(tarjetaCuriosidadJugador(
      "Más goles en un solo partido",
      m,
      `${m.cantidad} · ${fmtFechaISO(m.fecha)} vs ${m.rival}`,
    ));
  }
  if (d.vallaInvicta) {
    const v = d.vallaInvicta;
    tarjetas.push(tarjetaCuriosidad("Vallas invictas", v.cantidad, `${fmtPorcentaje(v.pct)} de los partidos sin recibir goles`, "bueno"));
  }
  if (d.partidoMasDesparejo) {
    const p = d.partidoMasDesparejo;
    tarjetas.push(tarjetaCuriosidad(
      p.aFavor ? "Goleada más contundente" : "Peor derrota",
      `${p.gf}-${p.gc}`,
      `${fmtFechaISO(p.fecha)} vs ${p.rival}`,
      p.aFavor ? "bueno" : "malo",
    ));
  }

  if (tarjetas.length === 0) return "";
  return `
    <h2>Datos curiosos</h2>
    ${descripcionSeccion("Coincidencias y récords que salen de cruzar los datos entre sí: rival más enfrentado, marcador que más se repitió, y más.")}
    <div class="destacados-grid">
      ${tarjetas.join("")}
    </div>
  `;
}

function listaConY(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

// hecho sin jugador asociado (rival, marcador, partido): mismo layout de
// tarjetaRacha (etiqueta / valor grande / detalle). `tono` es opcional: solo
// los hechos claramente buenos/malos lo usan (el resto queda neutro, ver
// comentario arriba de .tarjeta-destacado-valor en el CSS).
function tarjetaCuriosidad(etiqueta, valor, detalle, tono) {
  const claseTono = tono ? ` valor-${tono}` : "";
  return `
    <div class="tarjeta-destacado">
      <span class="tarjeta-destacado-etiqueta">${etiqueta}</span>
      <span class="tarjeta-destacado-valor${claseTono}">${valor}</span>
      <span class="tarjeta-destacado-etiqueta">${detalle}</span>
    </div>
  `;
}

// hecho protagonizado por un jugador: mismo layout que tarjetaDestacado
// (clickeable -> va a su ficha), con el detalle de la coincidencia abajo.
function tarjetaCuriosidadJugador(etiqueta, jugador, detalle) {
  return `
    <button type="button" class="tarjeta-destacado" data-jugador-id="${jugador.idJugador}">
      <span class="tarjeta-destacado-etiqueta">${etiqueta}</span>
      <span class="tarjeta-destacado-jugador">${avatarHTML(jugador.nombre)}${jugador.nombre}</span>
      <span class="tarjeta-destacado-valor">${detalle}</span>
    </button>
  `;
}

// una fila = un grupo semántico (resultado, goles, etc.) en su propia grilla,
// para separarlos visualmente en vez de una sola grilla con las 8 tarjetas
// mezcladas.
function filaTarjetas(items, claseFila = "") {
  const tarjetas = items.map(([et, val, clase = ""]) => miniTarjeta(et, val, clase)).join("");
  return `<div class="resumen-grid ${claseFila}">${tarjetas}</div>`;
}

function miniTarjeta(etiqueta, valor, clase) {
  return `<div class="resumen-tarjeta ${clase}"><span class="valor">${valor}</span><span class="etiqueta">${etiqueta}</span></div>`;
}

// una línea chica debajo del <h2> de una sección, explicando qué se ve ahí
// abajo antes de que el lector tenga que inferirlo de la tabla/gráfico
// (pedido de la usuaria, ver ej. "Dúos" en la vista Jugadores).
function descripcionSeccion(texto) {
  return `<p class="seccion-descripcion">${texto}</p>`;
}

function etiquetaRacha(resultado) {
  return { G: "victoria(s) seguidas", E: "empate(s) seguidos", P: "derrota(s) seguidas" }[resultado];
}

function puntosForma(resultados) {
  if (resultados.length === 0) return "";
  const puntos = resultados.map((r) => `<span class="forma-punto forma-punto-${r}" title="${r}"></span>`).join("");
  return `<span class="forma-puntos" aria-hidden="true">${puntos}</span>`;
}

// tarjeta "último partido" completa (goleadores/asistidores incluidos):
// siempre el real más reciente, sin importar los filtros activos (ver
// comentario de ultimoPartido() en stats.js). Vive arriba de todo en la
// vista Partidos.
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

// versión mini para Resumen: solo el resultado, sin goleadores/alineación
// (eso ahora vive en la vista Partidos) — pedido de la usuaria, para no
// duplicar el detalle completo en dos lados.
function renderTarjetaUltimoPartidoMini() {
  const u = ultimoPartido(estado.data);
  if (!u) return "";
  return `
    <h2>Último partido</h2>
    <div class="tarjeta-ultimo">
      <div class="tarjeta-ultimo-header">
        <span>${fmtFechaISO(u.fecha)} · ${u.tipo} vs ${u.rival}</span>
        <span class="resultado resultado-${u.resultado}">${u.resultado}</span>
      </div>
      <div class="tarjeta-ultimo-marcador">Los Buitres ${u.gf} – ${u.gc} ${u.rival}</div>
      <button type="button" class="tarjeta-ultimo-link" data-ir-partidos>Ver todos los partidos →</button>
    </div>
  `;
}

// `glosario`: qué significa la sigla. Se usa como title del <abbr> (hover en
// desktop) y además se lista entera en el desplegable "¿Qué significa cada
// columna?" debajo de la tabla (en mobile no hay hover, pedido de la
// usuaria). Las columnas sin sigla (nombre, rival) no necesitan ninguno.
const COLUMNAS_JUGADORES = [
  { clave: "nombre_mostrar", etiqueta: "Jugador", numerica: false },
  { clave: "pj", etiqueta: "PJ", glosario: "Partidos jugados" },
  { clave: "g", etiqueta: "G", glosario: "Goles convertidos" },
  { clave: "a", etiqueta: "A", glosario: "Asistencias" },
  { clave: "ga", etiqueta: "G+A", glosario: "Goles más asistencias" },
  { clave: "partidosConGa", etiqueta: "PJ c/ G+A", glosario: "Partidos jugados en los que convirtió un gol o dio una asistencia" },
  { clave: "ta", etiqueta: "TA", glosario: "Tarjetas amarillas" },
  { clave: "tr", etiqueta: "TR", glosario: "Tarjetas rojas" },
  { clave: "primerGolEquipo", etiqueta: "1º gol equipo", glosario: "Veces que convirtió el primer gol del equipo en el partido" },
  { clave: "pctGaEquipo", etiqueta: "% G+A equipo", formato: fmtPorcentaje, glosario: "Porcentaje de los goles + asistencias del equipo que son suyos" },
  { clave: "minPorGa", etiqueta: "Min/G+A", formato: fmt, glosario: "Minutos jugados (estimados) por cada gol o asistencia" },
];

const COLUMNAS_RIVALES = [
  { clave: "rival", etiqueta: "Rival" },
  { clave: "pj", etiqueta: "PJ", glosario: "Partidos jugados" },
  { clave: "g", etiqueta: "G", glosario: "Partidos ganados" },
  { clave: "e", etiqueta: "E", glosario: "Partidos empatados" },
  { clave: "p", etiqueta: "P", glosario: "Partidos perdidos" },
  { clave: "gf", etiqueta: "GF", glosario: "Goles a favor" },
  { clave: "gc", etiqueta: "GC", glosario: "Goles en contra" },
  { clave: "dif", etiqueta: "Dif", glosario: "Diferencia de gol (GF menos GC)" },
  { clave: "pctVictorias", etiqueta: "% victorias", glosario: "Porcentaje de partidos ganados" },
];

// desplegable con el glosario completo de una tabla, para abajo del
// .tabla-wrap. Nada si ninguna columna tiene sigla que explicar.
function renderLeyendaColumnas(columnas) {
  const items = columnas.filter((c) => c.glosario);
  if (items.length === 0) return "";
  return `
    <details class="tabla-leyenda">
      <summary>¿Qué significa cada columna?</summary>
      <dl>
        ${items.map((c) => `<dt>${c.etiqueta}</dt><dd>${c.glosario}</dd>`).join("")}
      </dl>
    </details>
  `;
}

// ---------------- vista Equipo: Historial vs rivales + Gráficos ----------------

function renderEquipo(cont, ids) {
  cont.innerHTML = `
    ${renderSubnav([
      ["seccion-historial-rivales", "Historial"],
      ["seccion-graficos-equipo", "Goles"],
    ])}
    <section id="seccion-historial-rivales">
      <h2>Historial vs rivales</h2>
      ${descripcionSeccion("El acumulado de todos los enfrentamientos contra cada rival: partidos jugados, resultados y goles.")}
      <div id="historial-rivales-contenido"></div>
    </section>
    <section id="seccion-graficos-equipo">
      <h2>Goles</h2>
      ${descripcionSeccion("Cómo evolucionaron los goles a favor y en contra partido a partido, de dónde vinieron y en qué momento del partido se convirtieron.")}
      <div id="graficos-equipo-contenido"></div>
    </section>
  `;
  activarScrollASecciones(cont);
  renderHistorialRivalesContenido(cont.querySelector("#historial-rivales-contenido"), ids);
  renderGraficosEquipoContenido(cont.querySelector("#graficos-equipo-contenido"), ids);
}

// ---------------- vista Partidos: último partido (completo) + listado ----------------
// Se separó de Equipo: el log de partidos (resultado + alineación + goles)
// no es una agregación de equipo ni de jugador, es su propia cosa (pedido de
// la usuaria). Sin subnav: es una sola sección, no hace falta saltar entre
// varias.

function renderPartidosVista(cont, ids) {
  cont.innerHTML = `
    ${renderTarjetaUltimoPartido()}
    <h2>Partidos</h2>
    ${descripcionSeccion("El historial completo, partido por partido: resultado, alineación y goles. Tocá uno para ver el detalle.")}
    <div id="partidos-contenido"></div>
  `;
  renderPartidosContenido(cont.querySelector("#partidos-contenido"), ids);
}

// una fila por rival enfrentado, no solo el más repetido (eso ya lo cubre
// "Rival más enfrentado" en Datos curiosos). Pedido de la usuaria.
function renderHistorialRivalesContenido(cont, ids) {
  let filas = historialRivales(estado.data, ids);
  const orden = estado.orden.rivales;
  filas = ordenarFilas(filas, orden);

  if (filas.length === 0) {
    cont.innerHTML = '<p class="estado-vacio">No hay partidos para estos filtros.</p>';
    return;
  }

  cont.innerHTML = `
    <div class="tabla-wrap">
      <table>
        <thead><tr>${COLUMNAS_RIVALES.map((c) => thOrdenable(c, orden)).join("")}</tr></thead>
        <tbody>
          ${filas.map((f) => `
            <tr>
              <td>${f.rival}</td>
              <td>${f.pj}</td><td>${f.g}</td><td>${f.e}</td><td>${f.p}</td>
              <td>${f.gf}</td><td>${f.gc}</td><td>${f.dif}</td>
              <td>${fmtPorcentaje(f.pctVictorias)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${renderLeyendaColumnas(COLUMNAS_RIVALES)}
  `;

  for (const th of cont.querySelectorAll("th[data-clave]")) {
    th.addEventListener("click", () => {
      const clave = th.dataset.clave;
      if (orden.columna === clave) orden.direccion = orden.direccion === "desc" ? "asc" : "desc";
      else {
        orden.columna = clave;
        orden.direccion = "desc";
      }
      renderHistorialRivalesContenido(cont, ids);
    });
  }
}

function renderPartidosContenido(cont, ids) {
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

function renderGraficosEquipoContenido(cont, ids) {
  if (ids.size === 0) {
    cont.innerHTML = '<p class="estado-vacio">No hay datos para graficar con estos filtros.</p>';
    return;
  }
  cont.innerHTML = `
    <div class="grafico-card"><h3>Evolución GF/GC por partido</h3><div class="grafico-contenedor"><canvas id="chart-evolucion" role="img" aria-label="Gráfico de evolución de goles a favor y en contra por partido"></canvas></div></div>
    <div class="grafico-card"><h3>Fuente de los goles (GF vs GC)</h3><div class="grafico-contenedor"><canvas id="chart-fuente" role="img" aria-label="Gráfico de fuente de los goles a favor y en contra"></canvas></div></div>
    <div class="grafico-card"><h3>Goles por tiempo (1T vs 2T)</h3><div class="grafico-contenedor"><canvas id="chart-tiempo" role="img" aria-label="Gráfico de goles por primer y segundo tiempo"></canvas></div></div>
  `;
  dibujarEvolucion(cont.querySelector("#chart-evolucion"), evolucionGfGc(estado.data, ids), fmtFechaISO);
  dibujarFuenteGoles(cont.querySelector("#chart-fuente"), fuentePorTipoGol(estado.data, ids));
  dibujarGolesPorTiempo(cont.querySelector("#chart-tiempo"), golesPorTiempo(estado.data, ids));
}

// ---------------- vista Jugadores: tabla + gráficos + dúos + ficha ----------------

function renderJugadores(cont, ids) {
  cont.innerHTML = `
    ${renderSubnav([
      ["seccion-tabla-jugadores", "Tabla"],
      ["seccion-graficos-jugadores", "Gráficos"],
      ["seccion-duos", "Dúos"],
      ["seccion-ficha", "Ficha"],
    ])}
    <section id="seccion-tabla-jugadores">
      <h2>Jugadores</h2>
      ${descripcionSeccion("Estadísticas acumuladas de cada jugador en los partidos filtrados. Tocá un encabezado de columna para ordenar por ese dato, o el nombre de un jugador para ver su ficha.")}
      <div id="tabla-jugadores-contenido"></div>
    </section>
    <section id="seccion-graficos-jugadores">
      <h2>Gráficos</h2>
      ${descripcionSeccion("Ranking de los jugadores más determinantes, por goles y asistencias.")}
      <div id="graficos-jugadores-contenido"></div>
    </section>
    <section id="seccion-duos">
      <h2>Dúos asistidor → goleador</h2>
      ${descripcionSeccion("Qué combinaciones de pase y definición se repitieron más: quién asistió a quién, y cuántas veces.")}
      <div id="duos-contenido"></div>
    </section>
    <section id="seccion-ficha">
      <h2>Ficha de jugador</h2>
      ${descripcionSeccion("Elegí un jugador para ver, partido por partido, en qué goles y asistencias participó.")}
      <div id="ficha-selector"></div>
      <div id="ficha-contenido"></div>
    </section>
  `;
  activarScrollASecciones(cont);
  renderTablaJugadoresContenido(cont.querySelector("#tabla-jugadores-contenido"), ids);
  renderGraficoJugadoresContenido(cont.querySelector("#graficos-jugadores-contenido"), ids);
  renderDuosContenido(cont.querySelector("#duos-contenido"), ids);
  renderFichaSelector(cont.querySelector("#ficha-selector"));
  renderFichaContenido(cont.querySelector("#ficha-contenido"), ids);
}

function renderTablaJugadoresContenido(cont, ids) {
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
    ${renderLeyendaColumnas(COLUMNAS_JUGADORES)}
  `;

  // re-renderiza solo esta sección (no toda la vista): así ordenar no reinicia
  // el resto de las secciones (gráficos, dúos, ficha ya abierta, scroll).
  for (const th of cont.querySelectorAll("th[data-clave]")) {
    th.addEventListener("click", () => {
      const clave = th.dataset.clave;
      if (orden.columna === clave) orden.direccion = orden.direccion === "desc" ? "asc" : "desc";
      else {
        orden.columna = clave;
        orden.direccion = "desc";
      }
      actualizarURL();
      renderTablaJugadoresContenido(cont, ids);
    });
  }
  for (const boton of cont.querySelectorAll("[data-jugador-id]")) {
    boton.addEventListener("click", () => irAFichaJugador(boton.dataset.jugadorId));
  }
}

function thOrdenable(col, orden) {
  const contenido = col.glosario ? `<abbr title="${col.glosario}">${col.etiqueta}</abbr>` : col.etiqueta;
  return `<th data-clave="${col.clave}"${ariaSort(col, orden)}>${contenido}</th>`;
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

function renderFichaSelector(cont) {
  const jugadores = estado.data.jugadores.slice().sort((a, b) => a.nombre_mostrar.localeCompare(b.nombre_mostrar));
  cont.innerHTML = `
    <div class="filtro-campo" style="margin-bottom:1rem">
      <label for="ficha-select">Jugador</label>
      <select id="ficha-select">
        <option value="">Elegí un jugador…</option>
        ${jugadores.map((j) => `<option value="${j.id_jugador}">${j.nombre_mostrar}</option>`).join("")}
      </select>
    </div>
  `;
  const select = cont.querySelector("#ficha-select");
  select.value = estado.jugadorFichaId ?? "";
  select.addEventListener("change", () => {
    estado.jugadorFichaId = select.value || null;
    actualizarURL();
    renderFichaContenido(document.getElementById("ficha-contenido"), idsFiltrados());
  });
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

function renderGraficoJugadoresContenido(cont, ids) {
  const filas = tablaJugadores(estado.data, ids);
  if (filas.length === 0) {
    cont.innerHTML = '<p class="estado-vacio">No hay datos para graficar con estos filtros.</p>';
    return;
  }
  cont.innerHTML = `
    <div class="grafico-card"><h3>Ranking goleadores y G+A</h3><div class="grafico-contenedor grafico-contenedor-ranking"><canvas id="chart-ranking" role="img" aria-label="Gráfico de ranking de goleadores y goles más asistencias"></canvas></div></div>
  `;
  dibujarRanking(cont.querySelector("#chart-ranking"), filas);
}

function renderDuosContenido(cont, ids) {
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
