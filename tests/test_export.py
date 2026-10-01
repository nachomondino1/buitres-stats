"""Tests de export_data.py (ver SPEC_buitres_v3.md §3 y §6)."""
import datetime as dt

import pytest

import export_data
from conftest import (
    ALINEACIONES_BASE, GOLES_BASE, JUGADORES_BASE, PARTIDOS_BASE, build_workbook,
)


def exportar(path):
    return export_data.exportar(path)


def esperar_error(path, fragmento):
    with pytest.raises(export_data.ExportError) as exc:
        exportar(path)
    mensajes = exc.value.args[0]
    assert any(fragmento in m for m in mensajes), f"no se encontró {fragmento!r} en {mensajes}"


def test_caso_limpio_no_tiene_errores_ni_warnings(workbook_path):
    data = exportar(workbook_path())
    assert data["meta"]["warnings"] == []
    assert data["meta"]["counts"] == {"partidos": 1, "alineaciones": 7, "goles": 1, "jugadores": 7}


# ---------------- ERROR ----------------

def test_error_hoja_faltante(workbook_path):
    esperar_error(workbook_path(quitar_hoja="listas"), "falta la hoja")


def test_error_columna_faltante(workbook_path):
    esperar_error(workbook_path(quitar_columna=("partidos", "rival")), "falta la columna")


def test_error_id_jugador_duplicado(workbook_path):
    jugadores = JUGADORES_BASE + [dict(JUGADORES_BASE[0])]
    esperar_error(workbook_path(jugadores=jugadores), "id_jugador duplicado")


def test_error_id_partido_duplicado(workbook_path):
    partidos = PARTIDOS_BASE + [dict(PARTIDOS_BASE[0], fecha=dt.date(2026, 2, 1))]
    esperar_error(workbook_path(partidos=partidos), "id_partido duplicado")


def test_error_fecha_duplicada(workbook_path):
    partidos = PARTIDOS_BASE + [dict(PARTIDOS_BASE[0], id_partido=2)]
    esperar_error(workbook_path(partidos=partidos), "misma fecha")


def test_error_fecha_invalida(workbook_path):
    partidos = [dict(PARTIDOS_BASE[0], fecha=None)]
    esperar_error(workbook_path(partidos=partidos), "fecha inválida")


def test_error_gf_1t_negativo(workbook_path):
    partidos = [dict(PARTIDOS_BASE[0], gf_1t=-1)]
    esperar_error(workbook_path(partidos=partidos), "gf_1t inválido")


def test_error_fk_alineacion_partido_inexistente(workbook_path):
    alineaciones = ALINEACIONES_BASE[:-1] + [dict(ALINEACIONES_BASE[-1], id_partido=99)]
    esperar_error(workbook_path(alineaciones=alineaciones), "alineaciones.id_partido sin partido")


def test_error_fk_gol_partido_inexistente(workbook_path):
    goles = [dict(GOLES_BASE[0], id_partido=99)]
    esperar_error(workbook_path(goles=goles), "goles.id_partido sin partido")


def test_error_fk_alineacion_jugador_inexistente(workbook_path):
    alineaciones = ALINEACIONES_BASE[:-1] + [dict(ALINEACIONES_BASE[-1], jugador="Nadie")]
    esperar_error(workbook_path(alineaciones=alineaciones), "alineaciones.jugador no existe")


def test_error_fk_goleador_inexistente(workbook_path):
    goles = [dict(GOLES_BASE[0], goleador="Nadie")]
    esperar_error(workbook_path(goles=goles), "goles.goleador no existe")


def test_error_fk_asistidor_inexistente(workbook_path):
    goles = [dict(GOLES_BASE[0], asistidor="Nadie")]
    esperar_error(workbook_path(goles=goles), "goles.asistidor no existe")


def test_error_alineacion_duplicada(workbook_path):
    alineaciones = ALINEACIONES_BASE + [dict(ALINEACIONES_BASE[0])]
    esperar_error(workbook_path(alineaciones=alineaciones), "duplicado en alineaciones")


def test_error_nro_gol_repetido(workbook_path):
    goles = GOLES_BASE + [dict(GOLES_BASE[0], goleador="Bruno", asistidor=None)]
    esperar_error(workbook_path(goles=goles), "no consecutivo/repetido")


def test_error_nro_gol_no_consecutivo(workbook_path):
    goles = [dict(GOLES_BASE[0], nro_gol=2)]
    esperar_error(workbook_path(goles=goles), "no consecutivo/repetido")


def test_error_tipo_partido_fuera_de_listas(workbook_path):
    partidos = [dict(PARTIDOS_BASE[0], tipo="Inventado")]
    esperar_error(workbook_path(partidos=partidos), "partidos.tipo fuera de listas")


def test_error_fuente_fuera_de_listas(workbook_path):
    goles = [dict(GOLES_BASE[0], fuente="Inventada")]
    esperar_error(workbook_path(goles=goles), "goles.fuente fuera de listas")


def test_error_tipo_gol_invalido(workbook_path):
    goles = [dict(GOLES_BASE[0], tipo_gol="XX")]
    esperar_error(workbook_path(goles=goles), "goles.tipo_gol fuera de")


def test_error_goleador_en_gc(workbook_path):
    goles = [dict(GOLES_BASE[0], tipo_gol="GC", goleador="Ana", asistidor=None, nro_gol=1)]
    esperar_error(workbook_path(goles=goles), "goleador/asistidor cargado en gol GC")


def test_error_goleador_vacio_sin_gol_en_contra(workbook_path):
    goles = [dict(GOLES_BASE[0], goleador=None, asistidor=None)]
    esperar_error(workbook_path(goles=goles), "goleador vacío en gol GF")


def test_goleador_vacio_con_gol_en_contra_no_es_error(workbook_path):
    goles = [dict(GOLES_BASE[0], goleador=None, asistidor=None, fuente="Gol en contra")]
    data = exportar(workbook_path(goles=goles))
    assert data["goles"][0]["id_goleador"] is None


def test_error_goleador_no_jugo_el_partido(workbook_path):
    # partido 2 no tiene alineación propia: Ana (alineada en el partido 1) no jugó ahí
    partidos = PARTIDOS_BASE + [dict(PARTIDOS_BASE[0], id_partido=2, fecha=dt.date(2026, 2, 1))]
    goles = [dict(GOLES_BASE[0], id_partido=2, goleador="Ana")]
    esperar_error(workbook_path(partidos=partidos, goles=goles), "no figura en la alineación")


def test_error_marcador_tras_gol_formato_invalido(workbook_path):
    goles = [dict(GOLES_BASE[0], marcador_tras_gol="cualquier cosa")]
    esperar_error(workbook_path(goles=goles), "formato inválido")


def test_error_marcador_tras_gol_como_fecha(workbook_path):
    goles = [dict(GOLES_BASE[0], marcador_tras_gol=dt.date(2026, 1, 5))]
    esperar_error(workbook_path(goles=goles), "llegó como fecha")


def test_error_nombre_mostrar_duplicado(workbook_path):
    jugadores = JUGADORES_BASE + [dict(JUGADORES_BASE[0], id_jugador="J99")]
    esperar_error(workbook_path(jugadores=jugadores), "nombre_mostrar duplicado")


# ---------------- WARNING ----------------

def test_warning_goles_completos_false(workbook_path):
    partidos = [dict(PARTIDOS_BASE[0], gf_1t=5)]  # gf pasa a 5 pero sigue habiendo 1 solo gol logueado
    data = exportar(workbook_path(partidos=partidos))
    assert any("goles cargados" in w for w in data["meta"]["warnings"])
    assert data["partidos"][0]["goles_completos"] is False


def test_warning_menos_de_7_jugadores(workbook_path):
    alineaciones = ALINEACIONES_BASE[:6]  # 6 jugadores
    goles = [dict(GOLES_BASE[0], asistidor=None)]
    data = exportar(workbook_path(alineaciones=alineaciones, goles=goles))
    assert any("fuera de 7-11" in w for w in data["meta"]["warnings"])


def test_warning_mas_de_11_jugadores(workbook_path):
    extra = [{"id_jugador": f"J{i:02d}", "nombre": f"Extra{i}"} for i in range(8, 13)]
    jugadores = JUGADORES_BASE + extra
    alineaciones = ALINEACIONES_BASE + [
        {"id_partido": 1, "jugador": f"Extra{i}", "amarillas": 0, "rojas": 0} for i in range(8, 13)
    ]
    data = exportar(workbook_path(jugadores=jugadores, alineaciones=alineaciones))
    assert any("fuera de 7-11" in w for w in data["meta"]["warnings"])


def test_warning_link_descartado(workbook_path):
    partidos = [dict(PARTIDOS_BASE[0], link_video="No grabado")]
    data = exportar(workbook_path(partidos=partidos))
    assert any("link(s) descartado" in w for w in data["meta"]["warnings"])
    assert data["partidos"][0]["link_video"] is None


def test_warning_fuente_sin_dato(workbook_path):
    goles = [dict(GOLES_BASE[0], fuente="Sin dato")]
    data = exportar(workbook_path(goles=goles))
    assert any("Sin dato" in w for w in data["meta"]["warnings"])


def test_warning_jugador_sin_alineacion(workbook_path):
    jugadores = JUGADORES_BASE + [{"id_jugador": "J08", "nombre": "Hugo", "apellido": None, "apodo": None, "origen": None}]
    data = exportar(workbook_path(jugadores=jugadores))
    assert any("Hugo" in w for w in data["meta"]["warnings"])


# ---------------- cálculo gf/gc/resultado y allowlist ----------------

@pytest.mark.parametrize(
    "gf_1t,gc_1t,gf_2t,gc_2t,resultado",
    [(2, 0, 1, 0, "G"), (0, 1, 0, 2, "P"), (1, 1, 0, 0, "E")],
)
def test_calculo_gf_gc_resultado(workbook_path, gf_1t, gc_1t, gf_2t, gc_2t, resultado):
    partidos = [dict(PARTIDOS_BASE[0], gf_1t=gf_1t, gc_1t=gc_1t, gf_2t=gf_2t, gc_2t=gc_2t)]
    goles = [dict(GOLES_BASE[0], asistidor=None)] if gf_1t + gf_2t >= 1 else []
    data = exportar(workbook_path(partidos=partidos, goles=goles))
    p = data["partidos"][0]
    assert p["gf"] == gf_1t + gf_2t
    assert p["gc"] == gc_1t + gc_2t
    assert p["resultado"] == resultado


def test_allowlist_no_publica_observaciones_ni_lavo_camisetas(workbook_path):
    partidos = [dict(PARTIDOS_BASE[0], observaciones="comentario interno", lavo_camisetas="Ana")]
    data = exportar(workbook_path(partidos=partidos))
    assert "observaciones" not in data["partidos"][0]
    assert "lavo_camisetas" not in data["partidos"][0]
    import json
    assert "comentario interno" not in json.dumps(data)


def test_json_es_serializable_y_sin_nan(workbook_path):
    import json
    data = exportar(workbook_path())
    texto = json.dumps(data, allow_nan=False)  # debe no explotar
    assert "NaN" not in texto


def test_meta_schema(workbook_path):
    data = exportar(workbook_path())
    assert data["meta"]["schema_version"] == 1
    assert set(data.keys()) == {"meta", "jugadores", "partidos", "alineaciones", "goles"}
    assert set(data["jugadores"][0].keys()) == {
        "id_jugador", "nombre", "apellido", "apodo", "origen", "nombre_mostrar",
    }
    assert set(data["partidos"][0].keys()) == {
        "id_partido", "fecha", "hora", "tipo", "rival", "gf_1t", "gc_1t", "gf_2t", "gc_2t",
        "gf", "gc", "resultado", "link_video", "goles_completos",
    }
    assert set(data["alineaciones"][0].keys()) == {"id_partido", "id_jugador", "amarillas", "rojas"}
    assert set(data["goles"][0].keys()) == {
        "id_partido", "tipo_gol", "nro_gol", "id_goleador", "id_asistidor", "fuente",
        "marcador_tras_gol", "link",
    }
