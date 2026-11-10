"""Fotos de torneos: scripts/actualizar_torneos.py (sin red) + su lectura en export_data.py."""
import json
import sys
from pathlib import Path

import pytest

import export_data

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
import actualizar_torneos  # noqa: E402

DATOS = {"id_torneo": 3944, "torneo_nombre": "Apertura", "grupo_categoria": "D", "inicio": "2026-03-28T00:00:00"}
POSICIONES = [  # a propósito desordenadas: la foto las ordena por posición
    {"posicion": 2, "equipo": "LOS BUITRES", "puntos": 16, "pj": 9, "pg": 5, "pe": 1, "pp": 3, "gf": 26, "gc": 30, "gd": -4},
    {"posicion": 1, "equipo": "MARCIANOS FC", "puntos": 24, "pj": 9, "pg": 8, "pe": 0, "pp": 1, "gf": 48, "gc": 10, "gd": 38},
]


def test_construir_foto_normaliza_y_ordena():
    foto = actualizar_torneos.construir_foto(DATOS, POSICIONES, "2026-11-10")
    assert foto["competencia"] == "Apertura 2026"  # nombre + año de inicio: igual que partidos.competencia
    assert foto["categoria"] == "D" and foto["inicio"] == "2026-03-28" and foto["actualizado"] == "2026-11-10"
    assert [f["equipo"] for f in foto["tabla"]] == ["MARCIANOS FC", "LOS BUITRES"]
    assert foto["tabla"][1] == {
        "pos": 2, "equipo": "LOS BUITRES", "pts": 16, "pj": 9, "pg": 5, "pe": 1, "pp": 3,
        "gf": 26, "gc": 30, "dif": -4,
    }


def test_construir_foto_sin_tabla_falla():
    with pytest.raises(RuntimeError, match="no tiene tabla"):
        actualizar_torneos.construir_foto(DATOS, [], "2026-11-10")


def escribir_foto(carpeta, nombre, **cambios):
    foto = actualizar_torneos.construir_foto(DATOS, POSICIONES, "2026-11-10")
    foto.update(cambios)
    (carpeta / f"{nombre}.json").write_text(json.dumps(foto), encoding="utf-8")


def test_cargar_torneos_marca_nuestro_equipo_y_ordena_nuevo_a_viejo(tmp_path):
    escribir_foto(tmp_path, "1", id_torneo=1, competencia="Apertura 2026", inicio="2026-03-28")
    escribir_foto(tmp_path, "2", id_torneo=2, competencia="Clausura 2026", inicio="2026-09-05")
    torneos, warnings = export_data.cargar_torneos(tmp_path, "LOS BUITRES")
    assert [t["competencia"] for t in torneos] == ["Clausura 2026", "Apertura 2026"]
    assert [f["propio"] for f in torneos[0]["tabla"]] == [False, True]
    assert warnings == []


def test_cargar_torneos_avisa_si_nuestro_equipo_no_figura(tmp_path):
    escribir_foto(tmp_path, "1")
    _, warnings = export_data.cargar_torneos(tmp_path, "OTRO EQUIPO")
    assert any("no figura en la tabla" in w for w in warnings)


def test_cargar_torneos_sin_carpeta_devuelve_vacio(tmp_path):
    assert export_data.cargar_torneos(tmp_path / "no_existe", "LOS BUITRES") == ([], [])
    assert export_data.cargar_torneos(None, "LOS BUITRES") == ([], [])


def test_exportar_incluye_torneos(workbook_path, tmp_path):
    carpeta = tmp_path / "torneos"
    carpeta.mkdir()
    escribir_foto(carpeta, "1")
    data = export_data.exportar(workbook_path(), torneos_dir=carpeta, equipo_propio="LOS BUITRES")
    assert data["torneos"][0]["competencia"] == "Apertura 2026"
    assert json.dumps(data, allow_nan=False)  # serializable


def test_fotos_reales_del_repo_son_validas():
    """Las fotos versionadas en torneos/ tienen la forma esperada y nuestro equipo."""
    carpeta = Path(__file__).parent.parent / "torneos"
    equipo = json.loads((Path(__file__).parent.parent / "torneos.json").read_text(encoding="utf-8"))["equipo"]
    torneos, warnings = export_data.cargar_torneos(carpeta, equipo)
    assert torneos and warnings == []
    for t in torneos:
        assert [f["pos"] for f in t["tabla"]] == list(range(1, len(t["tabla"]) + 1))
        assert sum(f["propio"] for f in t["tabla"]) == 1


# ---------------- próximo partido ----------------

def partido(fecha, rival, id_rival, jugado, res=None, res_rival=None, **extra):
    base = {
        "fecha": f"{fecha}T00:00:00", "hora": "14:00", "cancha": "06a", "partido_sede": "Paraisos",
        "fecha_detalle": "fecha 11", "equipo_rival": rival, "id_equipo_rival": id_rival,
        "jugado": jugado, "suspendido": False, "resultado": res, "resultado_rival": res_rival,
    }
    return {**base, **extra}


def test_construir_proximo_toma_el_no_jugado_mas_cercano_y_los_resultados_del_rival():
    propios = [
        partido("2026-11-21", "NANI NANI", 2, False),
        partido("2026-11-14", "BIRRINGHAM", 1, False),  # fuera de orden a propósito
        partido("2026-11-07", "CELTA FC", 3, True, 2, 1),
    ]
    del_rival = [
        partido("2026-10-31", "PUCHITO F.C.", 9, True, 3, 3),
        partido("2026-09-05", "X", 8, True),  # jugado pero sin marcador (walkover): se descarta
        partido("2026-09-12", "CA PICAPICA", 7, True, 3, 2),
        partido("2026-11-14", "LOS BUITRES", 0, False),  # el que viene: no cuenta
    ]
    pedidos = []

    def pedir(id_rival):
        pedidos.append(id_rival)
        return del_rival

    prox = actualizar_torneos.construir_proximo(propios, pedir)
    assert pedidos == [1]
    assert (prox["fecha"], prox["hora"], prox["cancha"], prox["rival"], prox["etapa"]) == (
        "2026-11-14", "14:00", "06a", "BIRRINGHAM", "fecha 11",
    )
    assert prox["partidos_rival"] == [  # ordenados por fecha, solo con marcador
        {"fecha": "2026-09-12", "contra": "CA PICAPICA", "gf": 3, "gc": 2},
        {"fecha": "2026-10-31", "contra": "PUCHITO F.C.", "gf": 3, "gc": 3},
    ]


def test_construir_proximo_none_si_no_queda_nada_por_jugar():
    propios = [partido("2026-11-07", "CELTA FC", 3, True, 2, 1), partido("2026-11-14", "X", 4, False, suspendido=True)]
    assert actualizar_torneos.construir_proximo(propios, lambda _: []) is None


def test_foto_incluye_el_proximo():
    foto = actualizar_torneos.construir_foto(DATOS, POSICIONES, "2026-11-10", {"rival": "X"})
    assert foto["proximo"] == {"rival": "X"}
    assert actualizar_torneos.construir_foto(DATOS, POSICIONES, "2026-11-10")["proximo"] is None
