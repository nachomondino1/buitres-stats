"""Paridad JS/Python (SPEC_buitres_v3.md §6): misma grilla de filtros, exige
diferencia 0 entre site/js/stats.js (corrido vía Node) y scripts/stats_ref.py
(implementación independiente en pandas)."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
import stats_ref  # noqa: E402

RUNNER = Path(__file__).parent / "run_stats_js.mjs"

pytestmark = pytest.mark.skipif(shutil.which("node") is None, reason="node no está instalado")

# Mismo dataset sintético que site/js/stats.test.js (a propósito: así un cambio
# en una sola implementación sin tocar la otra se detecta como diferencia).
DATA = {
    "jugadores": [
        {"id_jugador": "J01", "nombre": "Ana", "apellido": None, "apodo": None, "origen": None, "nombre_mostrar": "Ana"},
        {"id_jugador": "J02", "nombre": "Bruno", "apellido": None, "apodo": None, "origen": None, "nombre_mostrar": "Bruno"},
        {"id_jugador": "J03", "nombre": "Carla", "apellido": None, "apodo": None, "origen": None, "nombre_mostrar": "Carla"},
    ],
    "partidos": [
        {"id_partido": 1, "fecha": "2026-01-10", "hora": None, "tipo": "Amistoso", "rival": "Rival A", "gf_1t": 1, "gc_1t": 1, "gf_2t": 1, "gc_2t": 0, "gf": 2, "gc": 1, "resultado": "G", "link_video": None, "goles_completos": True},
        {"id_partido": 2, "fecha": "2026-01-17", "hora": None, "tipo": "Torneo", "rival": "Rival B", "gf_1t": 0, "gc_1t": 0, "gf_2t": 0, "gc_2t": 0, "gf": 0, "gc": 0, "resultado": "E", "link_video": None, "goles_completos": True},
        {"id_partido": 3, "fecha": "2026-01-24", "hora": None, "tipo": "Torneo", "rival": "Rival A", "gf_1t": 1, "gc_1t": 1, "gf_2t": 0, "gc_2t": 1, "gf": 1, "gc": 2, "resultado": "P", "link_video": None, "goles_completos": True},
        {"id_partido": 4, "fecha": "2026-01-31", "hora": None, "tipo": "Amistoso", "rival": "Rival C", "gf_1t": 2, "gc_1t": 0, "gf_2t": 1, "gc_2t": 0, "gf": 3, "gc": 0, "resultado": "G", "link_video": None, "goles_completos": True},
    ],
    "alineaciones": [
        {"id_partido": 1, "id_jugador": "J01", "amarillas": 0, "rojas": 0},
        {"id_partido": 1, "id_jugador": "J02", "amarillas": 1, "rojas": 0},
        {"id_partido": 2, "id_jugador": "J01", "amarillas": 0, "rojas": 0},
        {"id_partido": 3, "id_jugador": "J01", "amarillas": 0, "rojas": 1},
        {"id_partido": 3, "id_jugador": "J03", "amarillas": 0, "rojas": 0},
        {"id_partido": 4, "id_jugador": "J02", "amarillas": 0, "rojas": 0},
        {"id_partido": 4, "id_jugador": "J03", "amarillas": 0, "rojas": 0},
    ],
    "goles": [
        {"id_partido": 1, "tipo_gol": "GF", "nro_gol": 1, "id_goleador": "J01", "id_asistidor": "J02", "fuente": "Contraataque", "marcador_tras_gol": "1-0", "link": None},
        {"id_partido": 1, "tipo_gol": "GF", "nro_gol": 2, "id_goleador": "J02", "id_asistidor": None, "fuente": "Sin dato", "marcador_tras_gol": "2-1", "link": None},
        {"id_partido": 1, "tipo_gol": "GC", "nro_gol": 1, "id_goleador": None, "id_asistidor": None, "fuente": "Corner", "marcador_tras_gol": "2-1", "link": None},
        {"id_partido": 3, "tipo_gol": "GF", "nro_gol": 1, "id_goleador": "J03", "id_asistidor": "J01", "fuente": "Jugada individual", "marcador_tras_gol": "1-1", "link": None},
        {"id_partido": 4, "tipo_gol": "GF", "nro_gol": 1, "id_goleador": "J02", "id_asistidor": "J03", "fuente": "Lateral", "marcador_tras_gol": "1-0", "link": None},
        {"id_partido": 4, "tipo_gol": "GF", "nro_gol": 2, "id_goleador": "J02", "id_asistidor": "J03", "fuente": "Contraataque", "marcador_tras_gol": "2-0", "link": None},
        {"id_partido": 4, "tipo_gol": "GF", "nro_gol": 3, "id_goleador": "J03", "id_asistidor": None, "fuente": "Sin dato", "marcador_tras_gol": "3-0", "link": None},
    ],
}

GRID = [
    {},
    {"tipo": "Torneo"},
    {"tipo": "Amistoso"},
    {"tipo": "Todos"},
    {"ultimos": 3},
    {"ultimos": 5},
    {"ultimos": 10},
    {"tipo": "Torneo", "ultimos": 3},
    {"tipo": "Amistoso", "ultimos": 1},
    {"desde": "2026-01-17", "hasta": "2026-01-24"},
    {"rivales": ["Rival A"]},
    {"rivales": ["Rival A"], "ultimos": 1},
    {"resultados": ["G"]},
    {"resultados": ["G", "E"]},
    {"resultados": ["P"], "rivales": ["Rival A"]},
]


def correr_js(filtros):
    payload = json.dumps({"data": DATA, "filtros": filtros})
    resultado = subprocess.run(
        ["node", str(RUNNER)], input=payload, capture_output=True, text=True, check=True
    )
    return json.loads(resultado.stdout)


@pytest.mark.parametrize("filtros", GRID, ids=[str(f) for f in GRID])
def test_paridad_js_python(filtros):
    js = correr_js(filtros)

    ids_py = stats_ref.filtrar_partidos(
        DATA,
        tipo=filtros.get("tipo"),
        desde=filtros.get("desde"),
        hasta=filtros.get("hasta"),
        rivales=filtros.get("rivales"),
        resultados=filtros.get("resultados"),
        ultimos=filtros.get("ultimos"),
    )
    assert sorted(ids_py) == js["ids"]

    resumen_py = stats_ref.resumen_equipo(DATA, ids_py)
    assert resumen_py == js["resumen"]

    tabla_py = sorted(stats_ref.tabla_jugadores(DATA, ids_py), key=lambda f: f["id_jugador"])
    assert tabla_py == js["tabla"]
