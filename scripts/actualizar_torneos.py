"""
Guarda una "foto" de la tabla de posiciones de cada torneo de torneos.json en
torneos/<id_torneo>.json (se versiona en el repo: así el historial de cada
torneo queda guardado aunque la liga lo saque de su sitio).

Fuente: la API JSON que usa el propio sitio de la liga
(https://www.northchamp.com.ar/torneos_zona_posiciones.html?id_torneo=<id>),
no un scraping de HTML. Es una API sin documentar: si cambia, este script falla
con un error claro y las fotos ya guardadas siguen sirviendo.

Si a nuestro equipo le quedan partidos por jugar en el torneo, la foto también
guarda el próximo (`proximo`: fecha, hora, cancha) y los resultados del rival en
ese torneo, para el panel "Próximo partido" de la vista Partidos. El análisis en sí se
calcula en el sitio (site/js/stats.js, analisisRival), no acá.

Uso:
    python scripts/actualizar_torneos.py          # todos los de torneos.json
    python scripts/actualizar_torneos.py 3991     # solo uno

Para un torneo en curso, volver a correrlo después de cada fecha y commitear.
Agregar un torneo nuevo = sumar su id_torneo (el número al final del link de la
página de posiciones) a torneos.json.
"""
import datetime as dt
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.northchamp.com.ar"
RAIZ = Path(__file__).resolve().parent.parent
CONFIG = RAIZ / "torneos.json"
DESTINO = RAIZ / "torneos"


def pedir_json(endpoint, params):
    url = f"{API}{endpoint}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url, headers={"User-Agent": "buitres-stats (+https://github.com/nachomondino1/buitres-stats)"}
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        cuerpo = json.load(resp)
    if not cuerpo.get("success"):
        raise RuntimeError(f"la API respondió success=false en {endpoint}: {cuerpo}")
    return cuerpo["data"]


def construir_proximo(partidos_propios, partidos_rival_fn):
    """Próximo partido de nuestro equipo (el no jugado más cercano) + los partidos
    ya jugados de ese rival en el torneo. `partidos_propios` es la respuesta de
    /equipos/partidos de nuestro equipo; `partidos_rival_fn(id_equipo_rival)` pide
    la del rival (se inyecta para testear sin red). None si no queda nada por jugar.
    Se descartan los partidos sin marcador (walkovers sin resultado cargado)."""
    pendientes = sorted(
        (p for p in partidos_propios if not p["jugado"] and not p.get("suspendido")),
        key=lambda p: p["fecha"],
    )
    if not pendientes:
        return None
    sig = pendientes[0]
    jugados = [
        {
            "fecha": p["fecha"][:10], "contra": p["equipo_rival"],
            "gf": p["resultado"], "gc": p["resultado_rival"],
        }
        for p in partidos_rival_fn(sig["id_equipo_rival"])
        if p["jugado"] and p["resultado"] is not None and p["resultado_rival"] is not None
    ]
    return {
        "fecha": sig["fecha"][:10], "hora": sig["hora"], "cancha": sig.get("cancha"),
        "sede": sig.get("partido_sede"), "etapa": sig.get("fecha_detalle"),
        "rival": sig["equipo_rival"],
        "partidos_rival": sorted(jugados, key=lambda p: p["fecha"]),
    }


def construir_foto(datos, posiciones, hoy, proximo=None):
    """Normaliza las respuestas de /torneos/datos y /torneos/posiciones a la foto
    que se guarda. Separado de pedir_json() para poder testearlo sin red."""
    if not posiciones:
        raise RuntimeError("el torneo no tiene tabla de posiciones")
    inicio = datos["inicio"][:10]
    nombre = datos["torneo_nombre"]
    return {
        "id_torneo": datos["id_torneo"],
        "competencia": f"{nombre} {inicio[:4]}",
        "nombre": nombre,
        "categoria": datos["grupo_categoria"],
        "inicio": inicio,
        "actualizado": hoy,
        "proximo": proximo,
        "tabla": [
            {
                "pos": f["posicion"], "equipo": f["equipo"], "pts": f["puntos"],
                "pj": f["pj"], "pg": f["pg"], "pe": f["pe"], "pp": f["pp"],
                "gf": f["gf"], "gc": f["gc"], "dif": f["gd"],
            }
            for f in sorted(posiciones, key=lambda f: f["posicion"])
        ],
    }


def actualizar(id_torneo, equipo_propio):
    datos = pedir_json("/torneos/datos", {"id_torneo": id_torneo})
    posiciones = pedir_json("/torneos/posiciones", {"id_torneo": id_torneo})
    propia = next((f for f in posiciones if f["equipo"] == equipo_propio), None)
    proximo = None
    if propia:
        partidos_de = lambda id_equipo: pedir_json(  # noqa: E731
            "/equipos/partidos", {"id_equipo": id_equipo, "id_torneo": id_torneo}
        )
        proximo = construir_proximo(partidos_de(propia["id_equipo"]), partidos_de)
    foto = construir_foto(datos, posiciones, dt.date.today().isoformat(), proximo)
    DESTINO.mkdir(exist_ok=True)
    destino = DESTINO / f"{id_torneo}.json"
    destino.write_text(json.dumps(foto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return foto, destino


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    ids = [int(a) for a in argv] or config["torneos"]
    fallos = 0
    for id_torneo in ids:
        try:
            foto, destino = actualizar(id_torneo, config["equipo"])
        except Exception as e:  # noqa: BLE001 - se reporta y se sigue con el resto
            print(f"ERROR {id_torneo}: {e}", file=sys.stderr)
            fallos += 1
            continue
        prox = foto["proximo"]
        extra = f" | próximo: {prox['rival']} ({prox['fecha']})" if prox else ""
        print(f"{foto['competencia']} (Zona {foto['categoria']}): {len(foto['tabla'])} equipos -> {destino.relative_to(RAIZ)}{extra}")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
