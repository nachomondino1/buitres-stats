"""
Contrato de datos de Buitres v3: hojas y columnas esperadas en Buitres_v3.xlsx,
y qué columnas son internas (nunca se publican en el JSON).

Fuente de verdad para scripts/build_v3.py, export_data.py y los tests.
"""

# Hojas que sobreviven en Buitres_v3.xlsx (se borran stats_jugadores y stats_equipo).
HOJAS_V3 = ["Leeme", "partidos", "alineaciones", "goles", "jugadores", "listas", "checks"]

# Columnas internas: contienen comentarios/críticas internas y nunca van al JSON publicado.
COLUMNAS_INTERNAS = {"partidos": ["lavo_camisetas", "observaciones"]}

# Columnas de control de calidad (fórmulas "(auto)" para uso en Excel/Sheets, ver §2):
# no son parte del contrato de datos ni se exportan, solo ayudan a cargar bien.
COLUMNAS_QC = {"goles": ["check_dup", "check_jugó"]}

COLUMNAS = {
    "jugadores": [
        "id_jugador", "nombre", "apellido", "apodo", "origen", "nombre_mostrar",
    ],
    "partidos": [
        "id_partido", "fecha", "hora", "tipo", "rival",
        "gf_1t", "gc_1t", "gf_2t", "gc_2t", "gf", "gc", "resultado",
        "link_video", "lavo_camisetas", "observaciones",
    ],
    "alineaciones": ["id_partido", "jugador", "amarillas", "rojas"],
    "goles": [
        "id_partido", "tipo_gol", "nro_gol", "goleador", "asistidor",
        "fuente", "marcador_tras_gol", "link",
    ],
    "listas": ["tipo_partido", "fuente_gol", "tipo_gol"],
}

# Enum de tipo_gol usado en goles.tipo_gol (no viene de 'listas', es fijo).
TIPOS_GOL = ["GF", "GC"]

# Claves primarias / foráneas, para referencia de export_data.py y los tests.
PK = {
    "jugadores": "id_jugador",
    "partidos": "id_partido",
}
FK = {
    "alineaciones": {"id_partido": "partidos", "jugador": "jugadores.nombre_mostrar"},
    "goles": {
        "id_partido": "partidos",
        "goleador": "jugadores.nombre_mostrar",
        "asistidor": "jugadores.nombre_mostrar",
    },
}

# Unicidad además de la PK.
UNICIDAD = {
    "alineaciones": [("id_partido", "jugador")],
    "goles": [("id_partido", "tipo_gol", "nro_gol")],
    "jugadores": [("nombre_mostrar",)],
}


def nombre_mostrar(nombre, apellido=None, apodo=None, origen=None):
    """Misma regla que la fórmula de jugadores!F en Buitres_v3.xlsx (ver build_v3.py):
    'nombre apellido' + '"apodo"' si hay + '(origen)' solo si no hay apellido.
    Único lugar donde vive esta regla: export_data.py la usa para resolver FKs sin
    confiar en el valor cacheado del Excel, build_v3.py para armar la fórmula y el
    preview de propuesta_jugadores.csv."""
    base = f"{nombre} {apellido}".strip() if apellido else nombre
    if apodo:
        base += f' "{apodo}"'
    if origen and not apellido:
        base += f" ({origen})"
    return base
