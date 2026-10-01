"""
Implementación INDEPENDIENTE (pandas) de las fórmulas de §5 de SPEC_buitres_v3.md,
usada solo para el test de paridad contra site/js/stats.js (tests/test_parity.py).

A propósito no comparte código con stats.js ni con export_data.py: si alguna de
las dos implementaciones tiene un bug, el test de paridad lo ve como una
diferencia real, no como "las dos coinciden en lo mismo".
"""
import pandas as pd

MINUTOS_PARTIDO = 70


def filtrar_partidos(data, tipo=None, desde=None, hasta=None, rivales=None, resultados=None, ultimos=None):
    partidos = pd.DataFrame(data["partidos"])
    if tipo and tipo != "Todos":
        partidos = partidos[partidos["tipo"] == tipo]
    if desde:
        partidos = partidos[partidos["fecha"] >= desde]
    if hasta:
        partidos = partidos[partidos["fecha"] <= hasta]
    if rivales:
        partidos = partidos[partidos["rival"].isin(rivales)]
    if resultados:
        partidos = partidos[partidos["resultado"].isin(resultados)]

    partidos = partidos.sort_values("fecha", ascending=False)
    if ultimos is not None:
        partidos = partidos.head(ultimos)
    return set(partidos["id_partido"].tolist())


def resumen_equipo(data, ids):
    partidos = pd.DataFrame(data["partidos"])
    partidos = partidos[partidos["id_partido"].isin(ids)]
    pj = len(partidos)

    g = int((partidos["resultado"] == "G").sum())
    e = int((partidos["resultado"] == "E").sum())
    p = int((partidos["resultado"] == "P").sum())
    gf = int(partidos["gf"].sum())
    gc = int(partidos["gc"].sum())

    racha = None
    if pj:
        ordenado = partidos.sort_values("fecha", ascending=False)
        resultado_racha = ordenado.iloc[0]["resultado"]
        cantidad = 0
        for _, fila in ordenado.iterrows():
            if fila["resultado"] != resultado_racha:
                break
            cantidad += 1
        racha = {"resultado": resultado_racha, "cantidad": cantidad}

    return {
        "pj": pj, "g": g, "e": e, "p": p, "gf": gf, "gc": gc,
        "dif": gf - gc,
        "pctVictorias": (g / pj) if pj else None,
        "racha": racha,
    }


def tabla_jugadores(data, ids):
    alineaciones = pd.DataFrame(data["alineaciones"])
    alineaciones = alineaciones[alineaciones["id_partido"].isin(ids)]
    goles = pd.DataFrame(data["goles"])
    goles_gf = goles[goles["id_partido"].isin(ids) & (goles["tipo_gol"] == "GF")]
    total_goles_equipo = len(goles_gf)

    filas = []
    for jugador in data["jugadores"]:
        id_j = jugador["id_jugador"]
        propias = alineaciones[alineaciones["id_jugador"] == id_j]
        pj = len(propias)
        if pj == 0:
            continue

        g = int((goles_gf["id_goleador"] == id_j).sum())
        a = int((goles_gf["id_asistidor"] == id_j).sum())
        ga = g + a
        primer_gol = int(((goles_gf["id_goleador"] == id_j) & (goles_gf["nro_gol"] == 1)).sum())

        filas.append({
            "id_jugador": id_j,
            "nombre_mostrar": jugador["nombre_mostrar"],
            "pj": pj, "g": g, "a": a, "ga": ga,
            "ta": int(propias["amarillas"].sum()),
            "tr": int(propias["rojas"].sum()),
            "gPorPj": (g / pj) if pj else None,
            "gaPorPj": (ga / pj) if pj else None,
            "pctGolesEquipo": (g / total_goles_equipo) if total_goles_equipo else None,
            "primerGolEquipo": primer_gol,
            "minPorGol": (pj * MINUTOS_PARTIDO / g) if g else None,
        })
    return filas
