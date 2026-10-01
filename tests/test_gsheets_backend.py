"""Tests del backend gsheets de export_data.py (SPEC §3, Fase 2b).

No pega a la API real de Google: gspread.authorize() se reemplaza (monkeypatch)
por un cliente falso que devuelve filas fijas, igual que haría un Google Sheet
real leído con UNFORMATTED_VALUE (fechas/horas como serial numérico, celdas
vacías como "" en vez de None).
"""
import datetime as dt

import pytest

import export_data


# ---------------- serial_a_fecha / serial_a_hora ----------------

@pytest.mark.parametrize("fecha,serial", [
    (dt.date(2025, 12, 13), 46004),
    (dt.date(2026, 1, 1), 46023),
    (dt.date(1900, 1, 1), 2),  # el "bug del año bisiesto 1900" que tiene Excel/Sheets por compatibilidad
])
def test_serial_a_fecha(fecha, serial):
    assert export_data.serial_a_fecha(serial) == fecha


@pytest.mark.parametrize("hora,serial", [
    (dt.time(0, 0), 0.0),
    (dt.time(12, 0), 0.5),
    (dt.time(16, 30), 0.6875),
    (dt.time(23, 59), 0.999305555),
])
def test_serial_a_hora(hora, serial):
    resultado = export_data.serial_a_hora(serial)
    assert resultado.hour == hora.hour
    assert resultado.minute == hora.minute


# ---------------- load_tables_gsheets (gspread mockeado) ----------------

class _WorksheetFalso:
    def __init__(self, filas):
        self._filas = filas

    def get_values(self, value_render_option=None):
        return self._filas


class _LibroFalso:
    def __init__(self, hojas):
        self._hojas = hojas

    def worksheet(self, nombre):
        if nombre not in self._hojas:
            import gspread
            raise gspread.exceptions.WorksheetNotFound(nombre)
        return _WorksheetFalso(self._hojas[nombre])


HOJAS_FALSAS = {
    "jugadores": [
        ["id_jugador", "nombre", "apellido", "apodo", "origen"],
        ["J01", "Ana", "", "", ""],
        ["J02", "Bruno", "Perez", "", ""],
    ],
    "partidos": [
        ["id_partido", "fecha", "hora", "tipo", "rival", "gf_1t", "gc_1t", "gf_2t", "gc_2t",
         "link_video", "lavo_camisetas", "observaciones"],
        [1, 46004, 0.6875, "Amistoso", "Rival A", 1, 0, 1, 0, "", "", ""],
        # fila con menos columnas de las que hay encabezados (la API de Sheets no
        # devuelve las celdas vacías finales de una fila): hay que poder leerla igual
        [2, 46023, "", "Torneo", "Rival B"],
    ],
    "alineaciones": [
        ["id_partido", "jugador", "amarillas", "rojas"],
        [1, "Ana", 0, 0],
    ],
    "goles": [
        ["id_partido", "tipo_gol", "nro_gol", "goleador", "asistidor", "fuente", "marcador_tras_gol", "link"],
        [1, "GF", 1, "Ana", "", "Sin dato", "1-0", ""],
    ],
    "listas": [
        ["tipo_partido", "fuente_gol", "tipo_gol"],
        ["Torneo", "Sin dato", "GF"],
        ["Amistoso", "Contraataque", "GC"],
    ],
}


def test_load_tables_gsheets(monkeypatch):
    monkeypatch.setenv("GOOGLE_SA_JSON", '{"type": "service_account"}')
    monkeypatch.setenv("SHEET_ID", "fake-id")

    import gspread
    from google.oauth2.service_account import Credentials

    monkeypatch.setattr(Credentials, "from_service_account_info", classmethod(lambda cls, *a, **k: object()))
    monkeypatch.setattr(gspread, "authorize", lambda creds: type("C", (), {"open_by_key": lambda self, sid: _LibroFalso(HOJAS_FALSAS)})())

    tablas = export_data.load_tables_gsheets()

    assert list(tablas["jugadores"].columns) == ["id_jugador", "nombre", "apellido", "apodo", "origen"]
    assert tablas["jugadores"].iloc[0]["apellido"] is None  # "" -> None

    p = tablas["partidos"]
    assert p.iloc[0]["fecha"] == dt.date(2025, 12, 13)
    assert p.iloc[0]["hora"].hour == 16
    assert p.iloc[1]["fecha"] == dt.date(2026, 1, 1)
    assert p.iloc[1]["hora"] is None  # "" en la celda de hora -> None
    assert p.iloc[1]["rival"] == "Rival B"  # fila corta, se completó con None/"" sin romper


def test_pipeline_completo_sobre_datos_de_gsheets(monkeypatch):
    # Regresión: validar() asumía fecha como pd.Timestamp (lo que da el backend
    # xlsx) y rompía con AttributeError ante el datetime.date que da gsheets.
    # El partido 1 de este fixture tiene 1 sola persona en la alineación (<7):
    # tiene que generar la warning de "fuera de 7-11" sin explotar, con la
    # fecha bien formateada en el mensaje. Fixture propio (no HOJAS_FALSAS):
    # necesita un partido completo y sin errores para llegar a las warnings.
    hojas = {
        "jugadores": HOJAS_FALSAS["jugadores"],
        "partidos": [
            ["id_partido", "fecha", "hora", "tipo", "rival", "gf_1t", "gc_1t", "gf_2t", "gc_2t",
             "link_video", "lavo_camisetas", "observaciones"],
            [1, 46004, 0.6875, "Amistoso", "Rival A", 1, 0, 1, 0, "", "", ""],
        ],
        "alineaciones": [["id_partido", "jugador", "amarillas", "rojas"], [1, "Ana", 0, 0]],
        "goles": [
            ["id_partido", "tipo_gol", "nro_gol", "goleador", "asistidor", "fuente", "marcador_tras_gol", "link"],
            [1, "GF", 1, "Ana", "", "Sin dato", "1-0", ""],
        ],
        "listas": HOJAS_FALSAS["listas"],
    }

    monkeypatch.setenv("GOOGLE_SA_JSON", '{"type": "service_account"}')
    monkeypatch.setenv("SHEET_ID", "fake-id")

    import gspread
    from google.oauth2.service_account import Credentials

    monkeypatch.setattr(Credentials, "from_service_account_info", classmethod(lambda cls, *a, **k: object()))
    monkeypatch.setattr(gspread, "authorize", lambda creds: type("C", (), {"open_by_key": lambda self, sid: _LibroFalso(hojas)})())

    tablas = export_data.normalizar(export_data.load_tables_gsheets())
    tablas = export_data.recalcular(tablas)
    warnings = export_data.validar(tablas)

    assert any("2025-12-13" in w and "fuera de 7-11" in w for w in warnings)


def test_load_tables_gsheets_hoja_faltante(monkeypatch):
    monkeypatch.setenv("GOOGLE_SA_JSON", '{"type": "service_account"}')
    monkeypatch.setenv("SHEET_ID", "fake-id")

    import gspread
    from google.oauth2.service_account import Credentials

    incompletas = {k: v for k, v in HOJAS_FALSAS.items() if k != "listas"}
    monkeypatch.setattr(Credentials, "from_service_account_info", classmethod(lambda cls, *a, **k: object()))
    monkeypatch.setattr(gspread, "authorize", lambda creds: type("C", (), {"open_by_key": lambda self, sid: _LibroFalso(incompletas)})())

    with pytest.raises(export_data.ExportError) as exc:
        export_data.load_tables_gsheets()
    assert any("listas" in m for m in exc.value.args[0])
