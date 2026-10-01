"""
ARCHIVADO: uso único, ya no es parte del pipeline activo (ver DECISIONS.md).
Migró Estadisticas_Buitres.xlsx (formato ancho) a las tablas largas que se
convirtieron en Buitres_v2.xlsx. Desde ahí en adelante los partidos se cargan
directo en formato largo (ver scripts/build_v3.py), así que este script no
se vuelve a correr salvo que aparezca más data vieja en formato ancho para
migrar. Queda como referencia de cómo se hizo esa migración una vez.

Migra Estadisticas_Buitres.xlsx (formato ancho) a tablas largas y valida contra
las stats actuales de la hoja 'Estadisticas Jugadores'.

Uso:  python scripts/archivo/migrar_buitres.py [entrada.xlsx] [salida.xlsx]
Salida: jugadores, partidos, alineaciones, goles + hojas de control
        (revisar_nombres, checks, validacion).
"""
import difflib
import re
import sys

import pandas as pd

SRC = sys.argv[1] if len(sys.argv) > 1 else "Estadisticas_Buitres.xlsx"
OUT = sys.argv[2] if len(sys.argv) > 2 else "buitres_normalizado.xlsx"

# variante -> nombre canónico. Completar mirando la hoja `revisar_nombres` y re-correr.
ALIAS = {
    "Javi (amigo de Emanuel Parra)": "Javi (amigo de ema)",
}


def clean(x):
    if pd.isna(x):
        return None
    s = re.sub(r"\s+", " ", str(x)).strip()
    return None if s in ("", "-") else ALIAS.get(s, s)


# ---------- Partidos ----------
lp = pd.read_excel(SRC, sheet_name="Logs Partidos", header=1)
lp = lp[lp["Fecha"].notna()].copy()
lp["Fecha"] = pd.to_datetime(lp["Fecha"]).dt.date
assert lp["Fecha"].is_unique, "Hay dos partidos el mismo día: el log de goles usa fecha como id"
lp = lp.sort_values("Fecha").reset_index(drop=True)
lp["id_partido"] = range(1, len(lp) + 1)
fecha2id = dict(zip(lp["Fecha"], lp["id_partido"]))

partidos = pd.DataFrame({
    "id_partido": lp["id_partido"],
    "fecha": lp["Fecha"],
    "hora": lp["Hora"],
    "tipo": lp["Tipo"].map(clean),
    "rival": lp["Rival"].map(clean),
    "gf_1t": lp["GF 1T"], "gc_1t": lp["GC 1T"],
    "gf_2t": lp["GF 2T"], "gc_2t": lp["GC 2T"],
    "gf": lp["GF"], "gc": lp["GC"],
    "resultado": lp["Resultado"],
    "link_video": lp["Link Video"],
    "lavo_camisetas": lp["¿Quien se llevo las camisetas para lavar?"].map(clean),
    "observaciones": lp["Observaciones"],
})

# ---------- Alineaciones (ancho -> largo) ----------
def melt_cols(prefix, n, value_name):
    cols = [f"{prefix} {i}" for i in range(1, n + 1)]
    m = lp[["id_partido"] + cols].melt("id_partido", value_name=value_name)[["id_partido", value_name]]
    m[value_name] = m[value_name].map(clean)
    return m.dropna()

alin = melt_cols("Jugador", 11, "jugador")
ta = melt_cols("TA", 6, "jugador").groupby(["id_partido", "jugador"]).size().rename("amarillas")
tr = melt_cols("TR", 2, "jugador").groupby(["id_partido", "jugador"]).size().rename("rojas")
alin = (alin.merge(ta, on=["id_partido", "jugador"], how="left")
            .merge(tr, on=["id_partido", "jugador"], how="left")
            .fillna({"amarillas": 0, "rojas": 0}))

# tarjetas a jugadores que no figuran en la alineación (error de carga)
tarj = pd.concat([ta.reset_index(), tr.reset_index()])[["id_partido", "jugador"]].drop_duplicates()
tarj_sin_alin = tarj.merge(alin[["id_partido", "jugador"]], how="left", indicator=True)
tarj_sin_alin = tarj_sin_alin[tarj_sin_alin["_merge"] == "left_only"]

# ---------- Goles (GF + GC en una sola tabla) ----------
gf = pd.read_excel(SRC, sheet_name="Logs GF").dropna(how="all")
gc = pd.read_excel(SRC, sheet_name="Logs GC").dropna(how="all")
gf = gf.rename(columns={"id_partido": "fecha", "Nº gol": "nro_gol", "Goleador": "goleador",
                        "Asistidor": "asistidor", "Fuente gol": "fuente",
                        "resultado partido tras gol": "marcador_tras_gol", "Link": "link"})
gc = gc.rename(columns={"id_partido": "fecha", "Nº gol": "nro_gol", "Fuente gol": "fuente",
                        "resultado partido": "marcador_tras_gol", "Link": "link"})
gf["tipo_gol"], gc["tipo_gol"] = "GF", "GC"
goles = pd.concat([gf, gc], ignore_index=True)
goles["fecha"] = pd.to_datetime(goles["fecha"]).dt.date
goles["id_partido"] = goles["fecha"].map(fecha2id)
for c in ("goleador", "asistidor"):
    goles[c] = goles[c].map(clean)
# "GC" cargado como goleador = gol en contra del rival: no es un jugador
goles.loc[goles["goleador"] == "GC", "goleador"] = None
goles = goles[["id_partido", "tipo_gol", "nro_gol", "goleador", "asistidor", "fuente",
               "marcador_tras_gol", "link"]].sort_values(["id_partido", "tipo_gol", "nro_gol"])

# ---------- Jugadores + nombres a revisar ----------
nombres = pd.concat([alin["jugador"], goles["goleador"], goles["asistidor"],
                     partidos["lavo_camisetas"]]).dropna()
pj = alin.groupby("jugador").size()
jugadores = pd.DataFrame({"nombre": sorted(nombres.unique())})
jugadores["pj"] = jugadores["nombre"].map(pj).fillna(0).astype(int)
jugadores = jugadores.sort_values(["pj", "nombre"], ascending=[False, True]).reset_index(drop=True)
jugadores.insert(0, "id_jugador", [f"J{i:02d}" for i in range(1, len(jugadores) + 1)])
n2id = dict(zip(jugadores["nombre"], jugadores["id_jugador"]))

# pares sospechosos: similitud de string o uno contenido en el otro
rev = []
nn = list(jugadores["nombre"])
for i, a in enumerate(nn):
    for b in nn[i + 1:]:
        r = difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()
        if r >= 0.75 or a.lower() in b.lower() or b.lower() in a.lower():
            rev.append({"nombre_a": a, "nombre_b": b, "similitud": round(r, 2)})
revisar = pd.DataFrame(rev, columns=["nombre_a", "nombre_b", "similitud"])

# ---------- Checks de integridad ----------
chk = []
def add(nombre, df):
    for _, r in df.iterrows():
        chk.append({"check": nombre, "detalle": ", ".join(f"{k}={v}" for k, v in r.items())})

cnt = goles.groupby(["id_partido", "tipo_gol"]).size().unstack(fill_value=0).reindex(partidos["id_partido"], fill_value=0)
cmp_ = partidos.set_index("id_partido")[["fecha", "rival", "gf", "gc"]].join(cnt)
cmp_ = cmp_.reindex(columns=["fecha", "rival", "gf", "gc", "GF", "GC"]).fillna(0)
add("goles GF cargados != marcador (gf vs log)", cmp_[cmp_["gf"] != cmp_["GF"]][["fecha", "rival", "gf", "GF"]].reset_index())
add("goles GC cargados != marcador (gc vs log)", cmp_[cmp_["gc"] != cmp_["GC"]][["fecha", "rival", "gc", "GC"]].reset_index())
add("GF 1T + 2T != GF", partidos[partidos["gf_1t"] + partidos["gf_2t"] != partidos["gf"]][["id_partido", "fecha", "gf_1t", "gf_2t", "gf"]])
add("GC 1T + 2T != GC", partidos[partidos["gc_1t"] + partidos["gc_2t"] != partidos["gc"]][["id_partido", "fecha", "gc_1t", "gc_2t", "gc"]])
res = partidos["gf"].sub(partidos["gc"]).apply(lambda d: "G" if d > 0 else "P" if d < 0 else "E")
add("resultado inconsistente con marcador", partidos[res != partidos["resultado"]][["id_partido", "fecha", "gf", "gc", "resultado"]])
add("nro_gol duplicado dentro del partido", goles[goles.duplicated(["id_partido", "tipo_gol", "nro_gol"], keep=False)][["id_partido", "tipo_gol", "nro_gol", "goleador"]])
add("tarjeta a jugador fuera de la alineación", tarj_sin_alin[["id_partido", "jugador"]])
add("goleador/asistidor que no jugó ese partido",
    pd.concat([goles.rename(columns={"goleador": "jugador"})[["id_partido", "jugador"]],
               goles.rename(columns={"asistidor": "jugador"})[["id_partido", "jugador"]]])
    .dropna().drop_duplicates().merge(alin[["id_partido", "jugador"]], how="left", indicator=True)
    .query("_merge == 'left_only'")[["id_partido", "jugador"]])
add("jugadores por partido fuera de 7-11", alin.groupby("id_partido").size().rename("n").reset_index().query("n < 7 or n > 11"))
sd = goles[goles["fuente"].isin(["Sin dato"])].groupby("tipo_gol").size()
chk.append({"check": "goles con fuente 'Sin dato'", "detalle": ", ".join(f"{k}={v}" for k, v in sd.items())})
checks = pd.DataFrame(chk)

# ---------- Validación contra 'Estadisticas Jugadores' ----------
raw = pd.read_excel(SRC, sheet_name="Estadisticas Jugadores", header=None)
hdr = raw.index[raw.iloc[:, 1] == "Jugador"][0]
filtro_tipo, filtro_n = raw.iat[1, 2], raw.iat[0, 2]
orig = raw.iloc[hdr + 1:, 1:].copy()
orig.columns = raw.iloc[hdr, 1:].astype(str).str.replace("\n", " ", regex=False).values
orig = orig.loc[orig["Jugador"].notna(), ["Jugador", "PJ", "G", "A", "TA", "TR"]]
orig["Jugador"] = orig["Jugador"].map(clean)
orig = orig.set_index("Jugador").apply(pd.to_numeric, errors="coerce")

sel = partidos if filtro_tipo in ("Todos", None) or pd.isna(filtro_tipo) else partidos[partidos["tipo"] == filtro_tipo]
ids = set(sel["id_partido"])
a_ = alin[alin["id_partido"].isin(ids)]
g_ = goles[goles["id_partido"].isin(ids) & (goles["tipo_gol"] == "GF")]
nuevo = pd.DataFrame({
    "PJ": a_.groupby("jugador").size(),
    "G": g_.groupby("goleador").size(),
    "A": g_.groupby("asistidor").size(),
    "TA": a_.groupby("jugador")["amarillas"].sum(),
    "TR": a_.groupby("jugador")["rojas"].sum(),
}).fillna(0)
val = orig.join(nuevo, how="outer", lsuffix="_hoja", rsuffix="_nuevo").fillna(0)
for m in ["PJ", "G", "A", "TA", "TR"]:
    val[f"dif_{m}"] = val[f"{m}_nuevo"] - val[f"{m}_hoja"]
val = val.reset_index().rename(columns={"index": "Jugador"})
val["ok"] = val[[c for c in val if c.startswith("dif_")]].abs().sum(axis=1) == 0
validacion = val.sort_values("ok")

# ---------- Export ----------
with pd.ExcelWriter(OUT, engine="openpyxl") as xw:
    for name, df in [("jugadores", jugadores), ("partidos", partidos), ("alineaciones", alin.assign(
            id_jugador=alin["jugador"].map(n2id))), ("goles", goles.assign(
            id_goleador=goles["goleador"].map(n2id), id_asistidor=goles["asistidor"].map(n2id))),
            ("revisar_nombres", revisar), ("checks", checks), ("validacion", validacion)]:
        df.to_excel(xw, sheet_name=name, index=False)
        ws = xw.sheets[name]
        ws.freeze_panes = "A2"
        for col in ws.columns:
            w = max(len(str(c.value)) if c.value is not None else 0 for c in col)
            ws.column_dimensions[col[0].column_letter].width = min(max(w + 2, 8), 45)

print(f"Filtro de la hoja original: tipo={filtro_tipo}, ult. partidos={filtro_n}")
print(f"partidos={len(partidos)} alineaciones={len(alin)} goles={len(goles)} jugadores={len(jugadores)}")
print(f"Validación: {int(validacion['ok'].sum())}/{len(validacion)} jugadores coinciden con la hoja actual")
print(f"Checks con hallazgos: {len(checks)} | pares de nombres a revisar: {len(revisar)}")
print(f"-> {OUT}")
