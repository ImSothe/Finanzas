# -*- coding: utf-8 -*-
"""Lee TU Excel (solo lectura) y genera seed/seed.json: configuracion + diccionario de costumbres.

Uso: python tools/build_seed.py "C:/ruta/tu_excel_de_finanzas.xlsx"
El resultado contiene datos personales: queda en seed/ (ignorado por git) y se inyecta en dist/Code.gs.
"""
import json
import sys
import unicodedata
import warnings
import openpyxl

warnings.filterwarnings('ignore')
SRC = sys.argv[1]
OUT = 'seed/seed.json'

S_P, S_G, S_X, S_A = '⚙️ Piloto Automático', '📝 Gastos', '🚀 Extras', '🏦 Ahorros'
MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

wb = openpyxl.load_workbook(SRC)
p, g = wb[S_P], wb[S_G]


def norm(s):
    s = unicodedata.normalize('NFD', str(s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    out = ''.join(c if (c.isalnum() or c == ' ') else ' ' for c in s)
    return ' '.join(out.split())


# ---- primer año del archivo y filas clave
year0 = int(p.cell(next(r for r in range(40, 90) if str(p.cell(r, 2).value).startswith('Primer año')), 3).value)
tot = next(r for r in range(1, 40) if str(p.cell(r, 2).value).startswith('TOTAL GASTOS FIJOS'))
cat_rows = list(range(10, tot))
hdr_sub = next(r for r in range(tot, 90) if str(p.cell(r, 2).value) == 'Nombre')
hdr_ext = next(r for r in range(tot, 90) if str(p.cell(r, 2).value).startswith('Nombre ('))


def entradas(row):
    """Valores escritos a mano (no formulas) en una fila del calendario continuo -> [{desde:'YYYY-MM', importe}]"""
    out = []
    for c in range(4, 4 + 96):
        v = p.cell(row, c).value
        if v is not None and not (isinstance(v, str) and v.startswith('=')):
            out.append({'desde': '%04d-%02d' % (year0 + (c - 4) // 12, (c - 4) % 12 + 1), 'importe': float(v)})
    return out


categorias = [str(p.cell(r, 2).value) for r in cat_rows]
IDX_SUSC = next(i for i, c in enumerate(categorias) if 'Suscripciones' in c)
fijos = {}
for r in cat_rows:
    e = entradas(r)
    if e and categorias[r - 10] != categorias[IDX_SUSC]:
        fijos[categorias[r - 10]] = e
suscripciones = []
for r in range(hdr_sub + 1, hdr_sub + 21):
    if p.cell(r, 2).value:
        suscripciones.append({'nombre': str(p.cell(r, 2).value), 'importe': float(p.cell(r, 3).value or 0),
                              'activa': str(p.cell(r, 5).value or 'Sí') != 'No'})
tipos_extra = [str(p.cell(hdr_ext + 1 + i, 2).value) for i in range(6) if p.cell(hdr_ext + 1 + i, 2).value]
a = wb[S_A]
mes_ini = a['D9'].value
ahorro_desde = '%04d-%02d' % (int(a['E9'].value), MESES.index(mes_ini) + 1) if mes_ini in MESES and a['E9'].value else None

config = {
    'categorias': [{'nombre': c, 'presupuesto': None} for c in categorias],
    'sueldo': entradas(9),
    'fijos': fijos,
    'suscripciones': suscripciones,
    'tiposExtra': tipos_extra,
    'ahorro': {'inicial': float(a['D8'].value) if a['D8'].value not in (None, '') else None, 'desde': ahorro_desde},
    'moneda': '€',
}

# ---- diccionario de costumbres: (1) tu historial real, (2) semilla generica editable
dic = {}


def put(key, cat, src, n=1):
    k = norm(key)
    if not k:
        return
    if k in dic:
        dic[k]['n'] += n
    else:
        dic[k] = {'k': k, 'c': cat, 'n': n, 's': src}


historial = []
for r in range(10, 6010):
    f, cat, imp, tipo, det = [g.cell(r, c).value for c in (2, 3, 4, 5, 6)]
    if cat and det and imp:
        historial.append((str(det), str(cat)))
IGNORAR = {'no se', 'nose', 'x', 'varios', 'otros'}      # conceptos vacios de significado
for det, cat in historial:
    if norm(det) in IGNORAR or cat not in categorias:
        continue
    put(det, cat, 'historial')
    toks = norm(det).split()
    if len(toks) >= 2 and len(toks[0]) >= 4:
        put(toks[0], cat, 'historial')                    # "concepto largo con varias palabras" -> primera palabra

SEMILLA = {
    'Supermercado': 'mercadona lidl carrefour dia alcampo eroski gadis aldi supermercado super compra fruteria panaderia carniceria pescaderia pan leche queso huevos',
    'Ocio': 'cafe cafeteria cerveza cana bar restaurante cena pizza hamburguesa kebab cine copas discoteca helado cervezas tapas',
    'Coche': 'gasolinera repsol cepsa galp peaje itv parking coche',
    'Moto': 'moto casco carenado escape guantes',
    'Salud': 'peluqueria barberia farmacia dentista medico gafas oculista fisio',
    'Suscripciones': 'netflix spotify hbo disney twitch crunchyroll youtube prime icloud suscripcion',
    'Ropa': 'zara bershka pull stradivarius primark camiseta pantalon zapatillas sudadera calcetines chaqueta',
    'Luz, agua': 'luz agua internet fibra movistar vodafone orange gas factura',
    'Transporte público': 'bus autobus tren renfe taxi uber metro billete cabify',
    'Hobbys': 'steam playstation psn nintendo xbox videojuego juego hobby',
    'Decoración': 'figurita figura cuadro lampara poster teclado raton monitor auriculares alfombrilla funko',
    'Multas': 'multa dgt sancion',
    'Trámites': 'tasa tasas ayuntamiento registro certificado dni pasaporte tramite',
    'Gestoría': 'gestoria gestor asesoria',
    'Regalos': 'regalo cumpleanos flores',
    'Vivienda': 'alquiler hipoteca comunidad',
    'Inversión': 'inversion etf trade republic fondo',
    'Colchón': 'ahorro hucha colchon',
}
for clave, palabras in SEMILLA.items():
    cat = next((c for c in categorias if clave in c), None)
    if not cat:
        continue
    for w in palabras.split():
        if norm(w) not in dic:
            put(w, cat, 'semilla', n=0)
# "gasolina" suelta: se asocia a la categoría del coche si aparece así en tu historial
if any('gasolina' in k for k in dic):
    cat_coche = next(c for c in categorias if 'Coche' in c)
    dic.setdefault('gasolina', {'k': 'gasolina', 'c': cat_coche, 'n': 1, 's': 'historial'})

hist_rows = []
for r in range(10, 6010):
    f, cat, imp, tipo, det = [g.cell(r, c).value for c in (2, 3, 4, 5, 6)]
    if cat and imp:
        hist_rows.append({'fecha': f.strftime('%Y-%m-%d') if hasattr(f, 'strftime') else None, 'categoria': str(cat), 'importe': float(imp),
                          'tipo': str(tipo or 'Gasto'), 'detalle': str(det or '')})
json.dump(hist_rows, open('seed/history.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

seed = {'year0': year0, 'config': config, 'diccionario': sorted(dic.values(), key=lambda d: (-d['n'], d['k']))}
json.dump(seed, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'Seed escrito en {OUT}: {len(categorias)} categorias, sueldo={config["sueldo"]}, fijos={len(fijos)}, '
      f'suscripciones={len(suscripciones)}, diccionario={len(dic)} entradas '
      f'({sum(1 for d in dic.values() if d["s"] == "historial")} de tu historial, '
      f'{sum(1 for d in dic.values() if d["s"] == "semilla")} de semilla)')
