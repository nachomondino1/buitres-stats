// Puente para el test de paridad: lee {data, filtros} en JSON por stdin,
// corre stats.js (la implementación real del sitio) y devuelve el resultado
// por stdout. tests/test_parity.py lo invoca como subprocess desde pytest.
import { filtrarPartidos, resumenEquipo, tablaJugadores } from "../site/js/stats.js";

function leerStdin() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => resolve(buf));
  });
}

const { data, filtros = {} } = JSON.parse(await leerStdin());

// listas planas (desde Python/JSON) -> Set, como espera filtrarPartidos
const filtrosConSets = {
  ...filtros,
  rivales: filtros.rivales ? new Set(filtros.rivales) : undefined,
  resultados: filtros.resultados ? new Set(filtros.resultados) : undefined,
};

const ids = filtrarPartidos(data, filtrosConSets);
const resumen = resumenEquipo(data, ids);
const tabla = tablaJugadores(data, ids).sort((a, b) => a.id_jugador.localeCompare(b.id_jugador));

process.stdout.write(JSON.stringify({ ids: [...ids].sort((a, b) => a - b), resumen, tabla }));
