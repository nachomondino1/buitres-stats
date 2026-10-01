# Buitres stats

Pipeline de datos del equipo: Excel/Google Sheet → `export_data.py` → `data.json` → sitio
estático con filtros (ver `SPEC_buitres_v3.md`).

## Setup

```
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Fase 1 — generar Buitres_v3.xlsx

1. `python scripts/build_v3.py` — (re)genera `scripts/propuesta_jugadores.csv` separando
   `jugadores.nombre` en nombre/apellido/apodo/origen. Revisá los casos marcados `ambiguo`
   y corregí el CSV a mano si hace falta.
2. `python scripts/build_v3.py --build` — con el CSV ya confirmado, construye
   `data/Buitres_v3.xlsx` a partir de `data/Buitres_v2.xlsx` (borra hojas de visualización
   y columnas helper, reconstruye `jugadores`, reindexa `checks`).
3. Abrir `data/Buitres_v3.xlsx` en Excel real (no LibreOffice) para que recalcule las
   fórmulas y confirmar 0 errores antes de importarlo a Google Sheets.

## Fase 2 — generar data.json

```
python export_data.py data/Buitres_v3.xlsx --out site/data/data.json
```

Lee `Buitres_v3.xlsx`, valida y escribe `site/data/data.json` (no se versiona, se genera).
Si hay algún **ERROR** de validación (datos rotos: FK, duplicados, fuera de enum, etc.) no
escribe nada y corta con exit 1 — hay que corregir el dato en el Excel/Sheet, no el script.
Los **WARNING** (partido incompleto, fuente "Sin dato", etc.) se imprimen y quedan en
`meta.warnings` del JSON; el export sigue.

## Fase 3 — ver el sitio local

```
python3 -m http.server 8008 --directory site
```

Y abrir `http://localhost:8008`. No sirve abrir `site/index.html` directo con doble clic
(`file://`): `fetch("data/data.json")` lo bloquea el navegador por CORS, hace falta un
servidor. Los filtros quedan en la URL (`?tipo=Torneo&ultimos=5`), así que un link
específico se puede compartir tal cual.

## Tests

```
./venv/bin/python3 -m pytest        # export + schema + paridad JS/Python
cd site && node --test              # stats.js (también corre desde test_parity.py)
```

## Checks (control de calidad de carga)

La hoja `checks` de `Buitres_v3.xlsx` debería estar toda en 0 / "OK". Si un partido queda
en "REVISAR" es porque los goles cargados no coinciden con el marcador, o la alineación
tiene menos de 7 o más de 11 jugadores — hay que revisar esas filas en `goles`/`alineaciones`,
no editar el marcador de `partidos` para que coincida.

## Publicar (CI/CD)

`.github/workflows/deploy.yml` corre tests en cada push a `main` (y manual, con
"Run workflow"). El job de publicar a GitHub Pages está **apagado hasta que exista
el backend `gsheets`** (Fase 2b, pendiente — hoy el export solo lee `.xlsx` local).
Setup, una sola vez, cuando se haga esa fase:

1. Crear un proyecto en [Google Cloud Console](https://console.cloud.google.com/) y
   habilitar la API de Google Sheets (buscar "Google Sheets API" > Enable). La consola
   cambia de vez en cuando — si estos pasos no coinciden con lo que ves, buscá
   "enable Google Sheets API service account" en la documentación oficial vigente.
2. Crear una service account (IAM & Admin > Service Accounts > Create) y generar una
   clave JSON (Keys > Add key > JSON). **No commitear ese archivo.**
3. Compartir el Google Sheet con el email de la service account (termina en
   `...iam.gserviceaccount.com`), como lector.
4. En GitHub: Settings > Secrets and variables > Actions:
   - Secret `GOOGLE_SA_JSON`: contenido completo del JSON de la service account.
   - Secret `SHEET_ID`: el ID del Sheet (está en su URL, entre `/d/` y `/edit`).
   - Variable `GSHEETS_LISTO` = `true`: recién ahí el job `deploy` del workflow se activa.
5. En GitHub: Settings > Pages > Source: "GitHub Actions".

En el repo: implementar `load_tables_gsheets()` en `export_data.py` (hoy tira
`NotImplementedError` a propósito) con `gspread`, pidiendo `UNFORMATTED_VALUE` y
convirtiendo fechas/horas desde el serial de Sheets (época 1899-12-30). Si esto se
complica, no bloquea nada: el sitio sigue funcionando local con el backend `xlsx`.

Mientras tanto, para actualizar el sitio después de cargar un partido: correr
Fase 1 → Fase 2 local y copiar `site/` a donde se hostee (o activar Pages sin el
backend `gsheets`, publicando el `data.json` generado a mano — no recomendado a
largo plazo, pero funciona).

## Otros scripts

```
python scripts/generar_copia_jugadores.py data/estadisticas_buitres.xlsx estadisticas_buitres_form.xlsx
```

Genera una copia del Excel maestro para compartir con el plantel, sin la columna de análisis.
