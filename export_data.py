"""
Excel/Sheet -> site/data/data.json (ver SPEC_buitres_v3.md §3).

Uso:
    python export_data.py [data/Buitres_v3.xlsx] [--out site/data/data.json]

Pasos: leer -> normalizar -> recalcular gf/gc/resultado/nombre_mostrar en Python
(nunca se confía en el valor cacheado del Excel) -> validar -> escribir JSON.
Si hay algún ERROR de validación, el export corta (exit 1) y no escribe nada.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

import pandas as pd

import schema

# Google Sheets usa la misma época que Excel para fechas/horas como "serial":
# un entero de días (parte entera) + fracción de día (parte decimal) desde acá.
EPOCA_SHEETS = dt.date(1899, 12, 30)

SCHEMA_VERSION = 1
HOJAS_DATOS = ("jugadores", "partidos", "alineaciones", "goles", "listas")


class ExportError(Exception):
    """Uno o más ERROR de validación: el export no debe escribir el JSON."""


# ---------- normalización ----------

def limpiar_texto(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    s = re.sub(r"\s+", " ", str(x)).strip()
    return None if s in ("", "-") else s


def limpiar_marcador(x):
    """Como limpiar_texto, pero sin str(x): si Excel autoconvirtió '5-2' en fecha
    hay que dejar pasar el objeto date/datetime tal cual para que validar() lo
    detecte como ERROR, en vez de taparlo convirtiéndolo a texto."""
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    if isinstance(x, str):
        s = re.sub(r"\s+", " ", x).strip()
        return None if s in ("", "-") else s
    return x


COLUMNAS_TEXTO = {
    "jugadores": ["nombre", "apellido", "apodo", "origen"],
    "partidos": ["tipo", "rival", "link_video", "lavo_camisetas", "observaciones"],
    "alineaciones": ["jugador"],
    "goles": ["tipo_gol", "goleador", "asistidor", "fuente", "link"],
}

PK_POR_HOJA = {
    "jugadores": "id_jugador",
    "partidos": "id_partido",
    "alineaciones": "id_partido",
    "goles": "id_partido",
}


def normalizar(tablas):
    tablas = {k: v.copy() for k, v in tablas.items()}
    for hoja, cols in COLUMNAS_TEXTO.items():
        df = tablas[hoja]
        for c in cols:
            if c in df.columns:
                # pandas 3 infiere dtype "str" y recodifica el None de vuelta a su
                # propio NA (aparece como float nan) si se asigna vía .map(); por eso
                # se construye la Series explícitamente en dtype=object.
                df[c] = pd.Series([limpiar_texto(x) for x in df[c]], dtype=object, index=df.index)
    g = tablas["goles"]
    g["marcador_tras_gol"] = pd.Series(
        [limpiar_marcador(x) for x in g["marcador_tras_gol"]], dtype=object, index=g.index
    )
    # las hojas vienen con fórmulas precargadas de más (filas sin datos): descartarlas
    for hoja, pk in PK_POR_HOJA.items():
        tablas[hoja] = tablas[hoja][tablas[hoja][pk].notna()].reset_index(drop=True)
    return tablas


# ---------- backends ----------

def load_tables_xlsx(path):
    """Backend xlsx de load_tables(): cada hoja de datos -> DataFrame, con los
    encabezados limpios (sin el sufijo visible ' (auto)' de las columnas fórmula)."""
    faltantes = []
    tablas = {}
    for hoja in HOJAS_DATOS:
        try:
            df = pd.read_excel(path, sheet_name=hoja)
        except ValueError:
            faltantes.append(hoja)
            continue
        df.columns = [
            c[: -len(" (auto)")] if isinstance(c, str) and c.endswith(" (auto)") else c
            for c in df.columns
        ]
        tablas[hoja] = df
    if faltantes:
        raise ExportError([f"falta la hoja {h!r} en {path}" for h in faltantes])
    return tablas


def serial_a_fecha(serial):
    return EPOCA_SHEETS + dt.timedelta(days=int(serial))


def serial_a_hora(serial):
    # parte fraccionaria del día -> segundos -> time(). round() por errores de
    # punto flotante (0.5 debería ser exactamente mediodía, no 11:59:59.99...).
    segundos = round((float(serial) % 1) * 86400)
    return (dt.datetime.min + dt.timedelta(seconds=segundos)).time()


def load_tables_gsheets():
    """Backend gsheets de load_tables(): gspread + service account de solo
    lectura. Credenciales desde las variables de entorno GOOGLE_SA_JSON (el
    JSON completo de la service account) y SHEET_ID (ver README, "Publicar
    (CI/CD)" para el setup de Google, que lo hace la usuaria una sola vez)."""
    import gspread
    from google.oauth2.service_account import Credentials

    sa_info = json.loads(os.environ["GOOGLE_SA_JSON"])
    sheet_id = os.environ["SHEET_ID"]
    credenciales = Credentials.from_service_account_info(
        sa_info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    libro = gspread.authorize(credenciales).open_by_key(sheet_id)

    faltantes = []
    tablas = {}
    for hoja in HOJAS_DATOS:
        try:
            ws = libro.worksheet(hoja)
        except gspread.exceptions.WorksheetNotFound:
            faltantes.append(hoja)
            continue
        # UNFORMATTED_VALUE: igual que data_only=True en openpyxl, pero fechas/
        # horas vienen como serial numérico (hay que convertirlas a mano, abajo).
        valores = ws.get_values(value_render_option="UNFORMATTED_VALUE")
        if not valores:
            faltantes.append(hoja)
            continue
        encabezados = [
            c[: -len(" (auto)")] if isinstance(c, str) and c.endswith(" (auto)") else c
            for c in valores[0]
        ]
        ancho = len(encabezados)
        # la API de Sheets no devuelve las celdas vacías al final de una fila:
        # hay que rellenar antes de armar el DataFrame o pandas tira ValueError
        filas = [fila + [""] * (ancho - len(fila)) for fila in valores[1:]]
        # dtype=object desde el inicio: si se infiere "str" (default de pandas 3),
        # el .replace("", None) de abajo recodifica el None a su propio NA, que
        # termina apareciendo como float('nan') en vez de None (mismo problema
        # que en normalizar(), ver DECISIONS.md).
        df = pd.DataFrame(filas, columns=encabezados, dtype=object)
        tablas[hoja] = df.replace("", None)  # gspread: celda vacía = "", no NaN

    if faltantes:
        raise ExportError([f"falta la hoja {h!r} en el Google Sheet" for h in faltantes])

    p = tablas["partidos"]
    def _fecha_segura(v):
        # si la celda no es un serial numérico (p.ej. alguien tipeó texto en vez
        # de usar el tipo fecha de Sheets), None para que validar() lo marque
        # como "fecha inválida" en vez de reventar el export con un traceback.
        if v is None:
            return None
        try:
            return serial_a_fecha(v)
        except (TypeError, ValueError):
            return None

    def _hora_segura(v):
        if v is None:
            return None
        try:
            return serial_a_hora(v)
        except (TypeError, ValueError):
            return v  # texto suelto: se deja, formatear_hora() en construir_json lo intenta leer igual

    p["fecha"] = p["fecha"].apply(_fecha_segura)
    p["hora"] = p["hora"].apply(_hora_segura)
    tablas["partidos"] = p

    return tablas


def load_tables(backend, source):
    if backend == "xlsx":
        return load_tables_xlsx(source)
    if backend == "gsheets":
        return load_tables_gsheets()
    raise ValueError(f"backend desconocido: {backend!r}")


# ---------- recálculo (nunca confiar en el valor cacheado del Excel) ----------

def recalcular(tablas):
    tablas = {k: v.copy() for k, v in tablas.items()}

    p = tablas["partidos"]
    for c in ("gf_1t", "gc_1t", "gf_2t", "gc_2t"):
        p[c] = pd.to_numeric(p[c], errors="coerce")
    p["gf"] = p["gf_1t"] + p["gf_2t"]
    p["gc"] = p["gc_1t"] + p["gc_2t"]
    p["resultado"] = p.apply(
        lambda r: "G" if r["gf"] > r["gc"] else ("P" if r["gf"] < r["gc"] else "E"), axis=1
    )
    tablas["partidos"] = p

    a = tablas["alineaciones"]
    for c in ("amarillas", "rojas"):
        a[c] = pd.to_numeric(a[c], errors="coerce").fillna(0)
    tablas["alineaciones"] = a

    g = tablas["goles"]
    g["nro_gol"] = pd.to_numeric(g["nro_gol"], errors="coerce")
    tablas["goles"] = g

    j = tablas["jugadores"]
    j["nombre_mostrar"] = j.apply(
        lambda r: schema.nombre_mostrar(r["nombre"], r["apellido"], r["apodo"], r["origen"]), axis=1
    )
    tablas["jugadores"] = j

    return tablas


# ---------- validación ----------

def es_link_valido(x):
    return isinstance(x, str) and (x.startswith("http://") or x.startswith("https://"))


def validar(tablas):
    errores = []
    warnings = []

    for hoja, columnas in schema.COLUMNAS.items():
        df = tablas[hoja]
        for c in columnas:
            if c not in df.columns and c not in ("gf", "gc", "resultado", "nombre_mostrar"):
                errores.append(f"falta la columna {c!r} en la hoja {hoja!r}")
    if errores:
        raise ExportError(errores)

    j, p, a, g, listas = (tablas[h] for h in ("jugadores", "partidos", "alineaciones", "goles", "listas"))

    # --- ids / fechas únicas ---
    dup_jug = j["id_jugador"][j["id_jugador"].duplicated()].tolist()
    if dup_jug:
        errores.append(f"id_jugador duplicado: {dup_jug}")
    dup_part = p["id_partido"][p["id_partido"].duplicated()].tolist()
    if dup_part:
        errores.append(f"id_partido duplicado: {dup_part}")
    dup_fecha = p["fecha"][p["fecha"].duplicated()].dropna().tolist()
    if dup_fecha:
        errores.append(f"dos partidos con la misma fecha: {dup_fecha}")

    dup_nombre_mostrar = j["nombre_mostrar"][j["nombre_mostrar"].duplicated()].tolist()
    if dup_nombre_mostrar:
        errores.append(f"nombre_mostrar duplicado: {dup_nombre_mostrar}")

    # --- tipos ---
    if p["fecha"].isna().any():
        ids = p.loc[p["fecha"].isna(), "id_partido"].tolist()
        errores.append(f"fecha inválida en partidos: {ids}")
    for c in ("gf_1t", "gc_1t", "gf_2t", "gc_2t"):
        malos = p.loc[p[c].isna() | (p[c] < 0), "id_partido"].tolist()
        if malos:
            errores.append(f"{c} inválido (vacío o negativo) en partidos: {malos}")
    if (a["amarillas"] < 0).any() or (a["rojas"] < 0).any():
        errores.append("amarillas/rojas negativas en alineaciones")
    if g["nro_gol"].isna().any() or (g["nro_gol"] < 1).any():
        errores.append("nro_gol inválido (vacío o < 1) en goles")

    # marcador_tras_gol: si Excel lo autoconvirtió a fecha, no es texto "N-N"
    for idx, v in g["marcador_tras_gol"].items():
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        if isinstance(v, (dt.date, dt.datetime, pd.Timestamp)):
            errores.append(
                f"marcador_tras_gol llegó como fecha (id_partido={g.at[idx, 'id_partido']}): {v!r}"
            )
        elif not re.match(r"^\d+-\d+$", str(v)):
            errores.append(
                f"marcador_tras_gol con formato inválido (id_partido={g.at[idx, 'id_partido']}): {v!r}"
            )

    # --- FK ---
    ids_partido = set(p["id_partido"])
    nombres_validos = set(j["nombre_mostrar"])

    rotas = a.loc[~a["id_partido"].isin(ids_partido), "id_partido"].tolist()
    if rotas:
        errores.append(f"alineaciones.id_partido sin partido: {rotas}")
    rotas = g.loc[~g["id_partido"].isin(ids_partido), "id_partido"].tolist()
    if rotas:
        errores.append(f"goles.id_partido sin partido: {rotas}")
    rotas = a.loc[~a["jugador"].isin(nombres_validos), "jugador"].tolist()
    if rotas:
        errores.append(f"alineaciones.jugador no existe en jugadores: {rotas}")
    for campo in ("goleador", "asistidor"):
        serie = g[campo].dropna()
        rotas = serie[~serie.isin(nombres_validos)].tolist()
        if rotas:
            errores.append(f"goles.{campo} no existe en jugadores: {rotas}")

    # --- (id_partido, jugador) único en alineaciones ---
    dup = a[a.duplicated(["id_partido", "jugador"])][["id_partido", "jugador"]].values.tolist()
    if dup:
        errores.append(f"(id_partido, jugador) duplicado en alineaciones: {dup}")

    # --- nro_gol consecutivo sin repetidos, por (id_partido, tipo_gol) ---
    for (pid, tg), grupo in g.groupby(["id_partido", "tipo_gol"]):
        nros = sorted(grupo["nro_gol"].tolist())
        esperado = list(range(1, len(nros) + 1))
        if nros != esperado:
            errores.append(f"nro_gol no consecutivo/repetido en partido {pid} ({tg}): {nros}")

    # --- tipo/fuente/tipo_gol fuera de enum ---
    tipos_validos = set(listas["tipo_partido"].dropna())
    fuentes_validas = set(listas["fuente_gol"].dropna())
    fuera = p.loc[~p["tipo"].isin(tipos_validos), ["id_partido", "tipo"]].values.tolist()
    if fuera:
        errores.append(f"partidos.tipo fuera de listas: {fuera}")
    fuera = g.loc[~g["tipo_gol"].isin(schema.TIPOS_GOL), ["id_partido", "tipo_gol"]].values.tolist()
    if fuera:
        errores.append(f"goles.tipo_gol fuera de {schema.TIPOS_GOL}: {fuera}")
    fuera = g.loc[~g["fuente"].isin(fuentes_validas), ["id_partido", "fuente"]].values.tolist()
    if fuera:
        errores.append(f"goles.fuente fuera de listas: {fuera}")

    # --- goleador/asistidor en GC; vacío en GF solo si fuente == 'Gol en contra' ---
    gc_con_jugador = g.loc[
        (g["tipo_gol"] == "GC") & (g["goleador"].notna() | g["asistidor"].notna()), "id_partido"
    ].tolist()
    if gc_con_jugador:
        errores.append(f"goleador/asistidor cargado en gol GC: partidos {gc_con_jugador}")
    gf_sin_goleador = g.loc[
        (g["tipo_gol"] == "GF") & g["goleador"].isna() & (g["fuente"] != "Gol en contra"), "id_partido"
    ].tolist()
    if gf_sin_goleador:
        errores.append(
            f"goleador vacío en gol GF sin fuente 'Gol en contra': partidos {gf_sin_goleador}"
        )

    # --- goleador/asistidor que no jugó ese partido ---
    alin_set = set(zip(a["id_partido"], a["jugador"]))
    for _, row in g.iterrows():
        for campo in ("goleador", "asistidor"):
            jugador = row[campo]
            if jugador is not None and (row["id_partido"], jugador) not in alin_set:
                errores.append(
                    f"{campo} {jugador!r} no figura en la alineación del partido {row['id_partido']}"
                )

    if errores:
        raise ExportError(errores)

    # ---------------- WARNINGS ----------------
    cnt_gf = g[g["tipo_gol"] == "GF"].groupby("id_partido").size()
    cnt_gc = g[g["tipo_gol"] == "GC"].groupby("id_partido").size()
    cnt_alin = a.groupby("id_partido").size()

    for _, partido in p.iterrows():
        pid = partido["id_partido"]
        fecha_legible = formatear_fecha(partido["fecha"])
        gf_log, gc_log = cnt_gf.get(pid, 0), cnt_gc.get(pid, 0)
        if partido["gf"] != gf_log or partido["gc"] != gc_log:
            warnings.append(
                f"partido {pid} ({fecha_legible} vs {partido['rival']}): "
                f"goles cargados ({gf_log} GF, {gc_log} GC) != marcador (gf={partido['gf']}, gc={partido['gc']})"
            )
        n = cnt_alin.get(pid, 0)
        if n < 7 or n > 11:
            warnings.append(f"partido {pid} ({fecha_legible}): {n} jugadores en alineación (fuera de 7-11)")

    descartados = 0
    if "link_video" in p.columns:
        descartados += p["link_video"].apply(lambda x: x is not None and not es_link_valido(x)).sum()
    descartados += g["link"].apply(lambda x: x is not None and not es_link_valido(x)).sum()
    if descartados:
        warnings.append(f"{descartados} link(s) descartado(s) (no empiezan con http(s)://)")

    sin_dato_gf = int((g[(g["tipo_gol"] == "GF")]["fuente"] == "Sin dato").sum())
    sin_dato_gc = int((g[(g["tipo_gol"] == "GC")]["fuente"] == "Sin dato").sum())
    if sin_dato_gf or sin_dato_gc:
        warnings.append(f"goles con fuente 'Sin dato': {sin_dato_gf} GF, {sin_dato_gc} GC")

    jugados = set(a["jugador"])
    sin_alineacion = j.loc[~j["nombre_mostrar"].isin(jugados), "nombre_mostrar"].tolist()
    if sin_alineacion:
        warnings.append(f"jugadores sin ninguna alineación: {sin_alineacion}")

    return warnings


# ---------- construcción del JSON ----------

def formatear_fecha(v):
    if isinstance(v, pd.Timestamp):
        return v.date().isoformat()
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()[:10]
    return None


def formatear_hora(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (dt.time, dt.datetime)):
        return v.strftime("%H:%M")
    s = str(v).strip()
    m = re.match(r"^(\d{1,2}):(\d{2})", s)
    return f"{m.group(1)}:{m.group(2)}" if m else s


def jnum(v):
    """None-safe int: pandas puede traer int64/NaN."""
    return None if v is None or (isinstance(v, float) and pd.isna(v)) else int(v)


def construir_json(tablas, warnings, source):
    j, p, a, g = (tablas[h] for h in ("jugadores", "partidos", "alineaciones", "goles"))

    cnt_gf = g[g["tipo_gol"] == "GF"].groupby("id_partido").size()
    cnt_gc = g[g["tipo_gol"] == "GC"].groupby("id_partido").size()

    jugadores_json = [
        {
            "id_jugador": r["id_jugador"],
            "nombre": r["nombre"],
            "apellido": r["apellido"],
            "apodo": r["apodo"],
            "origen": r["origen"],
            "nombre_mostrar": r["nombre_mostrar"],
        }
        for _, r in j.sort_values("id_jugador").iterrows()
    ]

    partidos_json = [
        {
            "id_partido": jnum(r["id_partido"]),
            "fecha": formatear_fecha(r["fecha"]),
            "hora": formatear_hora(r["hora"]),
            "tipo": r["tipo"],
            "rival": r["rival"],
            "gf_1t": jnum(r["gf_1t"]), "gc_1t": jnum(r["gc_1t"]),
            "gf_2t": jnum(r["gf_2t"]), "gc_2t": jnum(r["gc_2t"]),
            "gf": jnum(r["gf"]), "gc": jnum(r["gc"]),
            "resultado": r["resultado"],
            "link_video": r["link_video"] if es_link_valido(r.get("link_video")) else None,
            "goles_completos": bool(
                r["gf"] == cnt_gf.get(r["id_partido"], 0) and r["gc"] == cnt_gc.get(r["id_partido"], 0)
            ),
        }
        for _, r in p.sort_values("fecha").iterrows()
    ]

    nombre_a_id = dict(zip(j["nombre_mostrar"], j["id_jugador"]))

    alineaciones_json = [
        {
            "id_partido": jnum(r["id_partido"]),
            "id_jugador": nombre_a_id[r["jugador"]],
            "amarillas": jnum(r["amarillas"]),
            "rojas": jnum(r["rojas"]),
        }
        for _, r in a.sort_values(["id_partido", "jugador"]).iterrows()
    ]

    goles_json = [
        {
            "id_partido": jnum(r["id_partido"]),
            "tipo_gol": r["tipo_gol"],
            "nro_gol": jnum(r["nro_gol"]),
            "id_goleador": nombre_a_id.get(r["goleador"]) if r["goleador"] is not None else None,
            "id_asistidor": nombre_a_id.get(r["asistidor"]) if r["asistidor"] is not None else None,
            "fuente": r["fuente"],
            "marcador_tras_gol": r["marcador_tras_gol"],
            "link": r["link"] if es_link_valido(r.get("link")) else None,
        }
        for _, r in g.sort_values(["id_partido", "tipo_gol", "nro_gol"]).iterrows()
    ]

    data = {
        "meta": {
            "schema_version": SCHEMA_VERSION,
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "source": source,
            "counts": {
                "partidos": len(partidos_json),
                "alineaciones": len(alineaciones_json),
                "goles": len(goles_json),
                "jugadores": len(jugadores_json),
            },
            "warnings": warnings,
        },
        "jugadores": jugadores_json,
        "partidos": partidos_json,
        "alineaciones": alineaciones_json,
        "goles": goles_json,
    }
    return limpiar_nan(data)


def limpiar_nan(obj):
    """Defensivo: pandas (al construir filas con .iterrows()/.apply()) a veces
    devuelve float('nan') donde el dato real es None. json.dumps con allow_nan=False
    hace fallar fuerte el export si se escapa alguno sin pasar por acá."""
    if isinstance(obj, float) and obj != obj:  # nan != nan
        return None
    if isinstance(obj, dict):
        return {k: limpiar_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [limpiar_nan(v) for v in obj]
    return obj


# ---------- CLI ----------

def exportar(path_entrada, backend="xlsx"):
    """Corre el pipeline completo y devuelve el dict final (meta.warnings incluidas)."""
    tablas = load_tables(backend, path_entrada)
    tablas = normalizar(tablas)
    tablas = recalcular(tablas)
    warnings = validar(tablas)
    data = construir_json(tablas, warnings, source=backend)
    return data


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("entrada", nargs="?", default="data/Buitres_v3.xlsx",
                     help="Ruta al xlsx (backend xlsx) o ignorado (backend gsheets, usa $SHEET_ID)")
    ap.add_argument("--backend", choices=["xlsx", "gsheets"], default="xlsx")
    ap.add_argument("--out", default="site/data/data.json")
    args = ap.parse_args(argv)

    entrada = args.entrada if args.backend == "xlsx" else None
    try:
        data = exportar(entrada, backend=args.backend)
    except ExportError as e:
        print("ERROR de validación, no se generó el JSON:", file=sys.stderr)
        for msg in e.args[0]:
            print(f"  - {msg}", file=sys.stderr)
        return 1

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8"
    )

    print(f"-> {out_path} ({out_path.stat().st_size} bytes)")
    print(f"counts: {data['meta']['counts']}")
    if data["meta"]["warnings"]:
        print(f"{len(data['meta']['warnings'])} warning(s):")
        for w in data["meta"]["warnings"]:
            print(f"  - {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
