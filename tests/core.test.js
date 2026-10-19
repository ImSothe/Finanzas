'use strict';
/* Pruebas del núcleo con datos SINTÉTICOS (inventados solo para probar la lógica; no son datos de nadie). */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/core.js');

const CATS = ['🏠 Vivienda', '🛒 Supermercado y comida', '🎮 Suscripciones', '🖥️ Decoración, periféricos y gaming', '🍻 Ocio, cenas y salidas', '📦 Otros'];
const mkData = (over = {}) => ({
  config: { categorias: CATS.map((nombre) => ({ nombre, presupuesto: null })), sueldo: [{ desde: '2026-03', importe: 2000 }],
    fijos: { '🏠 Vivienda': [{ desde: '2026-01', importe: 600 }, { desde: '2026-06', importe: 650 }] },
    suscripciones: [{ nombre: 'A', importe: 10, activa: true }, { nombre: 'B', importe: 5, activa: false }], ...over.config },
  gastos: over.gastos || [], extras: over.extras || [],
});
const g = (fecha, categoria, importe, tipo = 'Gasto', extra = {}) => ({ id: Math.random().toString(36), fecha, categoria, importe, tipo, detalle: '', ...extra });

test('parseAmount: comas, puntos, miles y basura', () => {
  assert.equal(C.parseAmount('2,5'), 2.5);
  assert.equal(C.parseAmount('2.50'), 2.5);
  assert.equal(C.parseAmount('1.234,56'), 1234.56);
  assert.equal(C.parseAmount(' 12 € '), 12);
  assert.equal(C.parseAmount('abc'), null);
  assert.equal(C.parseAmount(''), null);
  assert.equal(C.parseAmount(3.456), 3.46);
});

test('norm quita tildes y signos', () => {
  assert.equal(C.norm('  Peluquería,  Madrid! '), 'peluqueria madrid');
});

test('effectiveAt hereda hacia delante como el Excel y es 0 antes del primer valor', () => {
  const s = [{ desde: '2026-03', importe: 100 }, { desde: '2026-06', importe: 150 }];
  assert.equal(C.effectiveAt(s, '2026-02'), 0);
  assert.equal(C.effectiveAt(s, '2026-03'), 100);
  assert.equal(C.effectiveAt(s, '2026-05'), 100);
  assert.equal(C.effectiveAt(s, '2027-01'), 150);
});

test('computeMonth: entra, fijos + suscripciones activas, día a día menos devoluciones', () => {
  const d = mkData({ gastos: [g('2026-07-02', CATS[1], 100), g('2026-07-05', CATS[1], 30, 'Devolución 🔄'), g('2026-07-06', CATS[4], 20), g('2026-06-30', CATS[1], 999)],
    extras: [{ id: 'e', fecha: '2026-07-10', tipo: 'x', importe: 50 }] });
  const m = C.computeMonth(d, '2026-07');
  assert.equal(m.entra, 2050);
  assert.equal(m.fijos, 660);                       // 650 vivienda + 10 suscripción activa (la inactiva no cuenta)
  assert.equal(m.dia, 90);                          // 100 - 30 + 20
  assert.equal(m.sale, 750);
  assert.equal(m.queda, 1300);
  assert.equal(m.semaforo, 'verde');
});

test('computeMonth: gasto con categoría desconocida cae en "Sin categoría" y el total sigue cuadrando', () => {
  const m = C.computeMonth(mkData({ gastos: [g('2026-07-02', 'Inventada', 7)] }), '2026-07');
  const sin = m.filas.find((f) => f.cat === 'Sin categoría');
  assert.equal(sin.total, 7);
  assert.equal(m.filas.reduce((a, f) => a + f.total, 0), m.sale);
});

test('semáforo: vacío, verde (<50 % gastado), amarillo (≥50 %), rojo (≥80 % o sin pasta)', () => {
  const cfg = { sueldo: [{ desde: '2026-01', importe: 100 }], fijos: {}, suscripciones: [] };
  const con = (imp) => C.computeMonth(mkData({ config: cfg, gastos: [g('2026-07-01', CATS[1], imp)] }), '2026-07');
  assert.equal(C.computeMonth(mkData({ config: { sueldo: [], fijos: {}, suscripciones: [] } }), '2026-01').semaforo, 'vacio');
  assert.equal(con(49).semaforo, 'verde');
  assert.equal(con(50).semaforo, 'amarillo');
  assert.equal(con(79).semaforo, 'amarillo');
  assert.equal(con(80).semaforo, 'rojo');                 // a partir del 80 % ya es alarma
  assert.equal(con(100).semaforo, 'rojo');
  assert.equal(C.computeMonth(mkData({ gastos: [g('2026-07-01', CATS[1], 5000)] }), '2026-07').semaforo, 'rojo');
  assert.match(C.semaforoMsg(con(66)), /66%/);
  assert.match(C.semaforoMsg(con(150)), /HAS GASTADO MÁS DE LO GENERADO/);
});

test('shiftMonth cruza años en ambos sentidos', () => {
  assert.equal(C.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(C.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(C.shiftMonth('2026-05', -17), '2024-12');
});

const dict = [{ k: 'figurita', c: CATS[3], n: 2, s: 'app' }, { k: 'cafe', c: CATS[4], n: 0, s: 'semilla' }, { k: 'taller moto', c: CATS[5], n: 1, s: 'historial' },
  { k: 'gasolina', c: CATS[5], n: 1, s: 'historial' }, { k: 'mercadona', c: CATS[1], n: 0, s: 'semilla' }];
const idx = C.buildIndex(dict);

test('predictCategory: exacta, por contener la clave, por palabra, y null si no sabe', () => {
  assert.equal(C.predictCategory('Figurita', idx, CATS).cat, CATS[3]);
  assert.equal(C.predictCategory('café con leche', idx, CATS).cat, CATS[4]);        // contiene la clave "cafe"
  assert.equal(C.predictCategory('xyzzy', idx, CATS), null);
});

test('predictCategory normaliza tildes: "café" encuentra "cafe"', () => {
  assert.equal(C.predictCategory('Café', idx, CATS).cat, CATS[4]);
  assert.equal(C.predictCategory('café solo', idx, CATS).cat, CATS[4]);
  assert.equal(C.predictCategory('compra mercadona hoy', idx, CATS).cat, CATS[1]);
  assert.equal(C.predictCategory('xyzzy', idx, CATS), null);
});

test('predictCategory ignora categorías que ya no existen', () => {
  assert.equal(C.predictCategory('figurita', idx, ['🏠 Vivienda']), null);
});

test('tus costumbres (app/historial) pesan más que la semilla genérica', () => {
  const i2 = C.buildIndex([{ k: 'cafe', c: CATS[4], n: 0, s: 'semilla' }, { k: 'cafe', c: CATS[5], n: 1, s: 'app' }]);
  assert.equal(C.predictCategory('cafe', i2, CATS).cat, CATS[5]);
});

test('suggest: primero tu historial (con último importe), luego el diccionario; sin duplicados', () => {
  const gastos = [g('2026-07-01', CATS[4], 1.5, 'Gasto', { detalle: 'Café Ruiz' }), g('2026-07-03', CATS[4], 1.6, 'Gasto', { detalle: 'Café Ruiz' })];
  const s = C.suggest('caf', gastos, idx);
  assert.equal(s[0].text, 'Café Ruiz');
  assert.equal(s[0].src, 'historial');
  assert.equal(s[0].importe, 1.6);
  assert.ok(s.some((x) => x.text === 'cafe' && x.src === 'semilla'));
  assert.deepEqual(C.suggest('c', gastos, idx), []);                               // menos de 2 letras no sugiere
});

test('topChips ordena por frecuencia, ignora devoluciones y conceptos vacíos', () => {
  const gastos = [1, 2, 3].map((i) => g('2026-07-0' + i, CATS[4], 1.5, 'Gasto', { detalle: 'Café' }))
    .concat([g('2026-07-04', CATS[1], 20, 'Gasto', { detalle: 'Súper' }), g('2026-07-05', CATS[1], 5, 'Devolución 🔄', { detalle: 'Devo' }),
      g('2026-07-06', CATS[1], 2, 'Gasto', { detalle: 'No se' })]);
  const chips = C.topChips(gastos, 8);
  assert.equal(chips[0].text, 'Café');
  assert.equal(chips[0].n, 3);
  assert.ok(!chips.some((c) => /devo|no se/i.test(c.text)));
});

const raw = { fecha: '2026-10-12', comercio: 'Supermercado X', importe_total: 170, lineas: [
  { nombre_articulo: 'Queso', precio: 3.5, categoria_sugerida: CATS[1] }, { nombre_articulo: 'Leche', precio: '1,20', categoria_sugerida: CATS[1] },
  { nombre_articulo: 'Lámpara', precio: 105.3, categoria_sugerida: '🖥️ Decoración, periféricos y gaming' }, { nombre_articulo: 'Cosa rara', precio: 20, categoria_sugerida: 'Categoría inventada' }] };

test('normalizeTicket: categorías válidas, números limpios y línea de ajuste para que cuadre el total', () => {
  const t = C.normalizeTicket(raw, CATS, idx, { hoy: '2026-10-16' });
  assert.equal(t.total, 170);
  assert.equal(t.lineas.find((l) => l.n === 'Leche').p, 1.2);
  assert.equal(t.lineas.find((l) => l.n === 'Cosa rara').c, CATS[5]);              // categoría inventada -> Otros
  assert.equal(t.ajuste, true);
  assert.equal(t.lineas.reduce((a, l) => a + l.p, 0).toFixed(2), '170.00');
  assert.equal(t.lineas.at(-1).ajuste, true);
});

test('normalizeTicket: sin fecha usa hoy; sin total usa la suma; mis costumbres mandan sobre la IA', () => {
  const t = C.normalizeTicket({ comercio: 'X', lineas: [{ nombre_articulo: 'figurita dragon', precio: 12, categoria_sugerida: CATS[1] }] }, CATS, idx, { hoy: '2026-10-16' });
  assert.equal(t.fecha, '2026-10-16');
  assert.equal(t.total, 12);
  assert.equal(t.ajuste, false);
  assert.equal(t.lineas[0].c, CATS[3]);                                            // "figurita" (app) pisa la sugerencia de la IA
});

test('groupLines: totales por categoría ordenados y porcentajes', () => {
  const t = C.normalizeTicket(raw, CATS, idx);
  const gr = C.groupLines(t.lineas);
  assert.equal(gr[0].cat, CATS[3]);
  assert.equal(Math.round(gr.reduce((a, x) => a + x.pct, 0) * 1000) / 1000, 1);
});

test('splitRows: una fila por categoría, la suma es EXACTAMENTE el total y comparten TicketID', () => {
  const t = C.normalizeTicket(raw, CATS, idx);
  let n = 0;
  const rows = C.splitRows(t, 'T1', () => 'id' + ++n);
  assert.equal(C.r2(rows.reduce((a, r) => a + r.importe, 0)), 170);
  assert.ok(rows.every((r) => r.ticketId === 'T1' && r.items));
  assert.equal(new Set(rows.map((r) => r.categoria)).size, rows.length);
  assert.ok(rows.every((r) => /Supermercado X/.test(r.detalle)));
  const it = JSON.parse(rows[0].items);
  assert.equal(it.t.id, 'T1');
});

test('splitRows: el redondeo de céntimos no rompe la suma con muchos grupos', () => {
  const lineas = Array.from({ length: 7 }, (_, i) => ({ n: 'a' + i, p: 0.333, c: CATS[i % 6] }));
  const t = { comercio: 'Z', fecha: '2026-01-01', total: C.r2(lineas.reduce((a, l) => a + l.p, 0)), lineas };
  const rows = C.splitRows(t, 'T', () => Math.random().toString());
  assert.equal(C.r2(rows.reduce((a, r) => a + r.importe, 0)), t.total);
});

test('singleRow: total completo en una fila con todo el desglose dentro', () => {
  const t = C.normalizeTicket(raw, CATS, idx);
  const r = C.singleRow(t, 'T2', CATS[1], () => 'x');
  assert.equal(r.importe, 170);
  assert.equal(JSON.parse(r.items).l.length, t.lineas.length);
  assert.equal(r.categoria, CATS[1]);
});

test('ticketOf reconstruye el ticket completo desde sus filas divididas', () => {
  const t = C.normalizeTicket(raw, CATS, idx);
  const rows = C.splitRows(t, 'T3', (() => { let i = 0; return () => 'r' + ++i; })());
  const tk = C.ticketOf(rows[0], rows);
  assert.equal(tk.lineas.length, t.lineas.length);
  assert.equal(tk.filas.length, rows.length);
});

test('búsqueda: encuentra "queso" dentro de un ticket de 170 € y también por comercio y categoría', () => {
  const t = C.normalizeTicket(raw, CATS, idx);
  const rows = [C.singleRow(t, 'T4', CATS[1], () => 'a'), g('2026-10-01', CATS[4], 2, 'Gasto', { detalle: 'Café' })];
  const r = C.searchGastos(rows, 'queso');
  assert.equal(r.length, 1);
  assert.equal(r[0].items[0].n, 'Queso');
  assert.equal(C.searchGastos(rows, 'supermercado x').length, 1);
  assert.equal(C.searchGastos(rows, 'cafe').length, 1);
  assert.equal(C.searchGastos(rows, 'queso lampara').length, 1);                   // varias palabras, mismo ticket
  assert.equal(C.searchGastos(rows, 'zzz').length, 0);
});

test('importRows: ids deterministas (reimportar no duplica), tipo devolución, filas sin fecha o sin importe', () => {
  const filas = [{ fecha: '2026-10-01', categoria: CATS[1], importe: 5, detalle: 'a' }, { fecha: '2026-10-01', categoria: CATS[1], importe: 5, detalle: 'a' },
    { fecha: '2026-10-02', categoria: CATS[1], importe: 3, tipo: 'Devolución 🔄', detalle: 'b' }, { fecha: null, categoria: CATS[0], importe: 9 }, { fecha: '2026-10-03', importe: 0 }];
  const a = C.importRows(filas, CATS, '2026-10-16'), b = C.importRows(filas, CATS, '2026-10-16');
  assert.equal(a.rows.length, 4);
  assert.equal(a.sinFecha, 1);
  assert.equal(a.descartadas, 1);
  assert.deepEqual(a.rows.map((r) => r.id), b.rows.map((r) => r.id));
  assert.equal(new Set(a.rows.map((r) => r.id)).size, 4);                          // dos filas idénticas siguen siendo dos gastos
  assert.equal(a.rows[2].tipo, C.TIPO_DEV);
});

test('monthsBetween: orden creciente, cruza años y tolera los extremos al revés', () => {
  assert.deepEqual(C.monthsBetween('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(C.monthsBetween('2027-02', '2026-11'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.deepEqual(C.monthsBetween('2026-05', '2026-05'), ['2026-05']);
});

test('computeRange: suma de meses = mismas cifras que mes a mes (fijos que cambian, devoluciones, categorías, presupuesto)', () => {
  const d = mkData({
    config: { categorias: CATS.map((nombre) => ({ nombre, presupuesto: nombre === CATS[1] ? 100 : null })) },
    gastos: [g('2026-05-10', CATS[1], 100), g('2026-07-02', CATS[1], 50), g('2026-07-09', CATS[1], 20, 'Devolución 🔄'), g('2026-08-01', CATS[1], 999)],
  });
  const r = C.computeRange(d, '2026-05', '2026-07');
  assert.equal(r.n, 3);
  assert.equal(r.entra, 6000);
  assert.equal(r.fijos, 1930);                       // (600+10) + (650+10) + (650+10)
  assert.equal(r.dia, 130);                          // 100 + 50 - 20; agosto queda fuera
  assert.equal(r.sale, 2060);
  assert.equal(r.queda, 3940);
  assert.equal(r.filas.find((f) => f.cat === CATS[0]).total, 1900);                // vivienda: 600 + 650 + 650
  const sup = r.filas.find((f) => f.cat === CATS[1]);
  assert.equal(sup.total, 130);
  assert.equal(sup.presupuesto, 300);                // 100 al mes x 3 meses
  assert.equal(C.r2(r.filas.reduce((a, f) => a + f.total, 0)), r.sale);
  const porMes = ['2026-05', '2026-06', '2026-07'].map((m) => C.computeMonth(d, m));
  assert.deepEqual(r.meses.map((m) => m.queda), porMes.map((m) => m.queda));
  assert.equal(r.mediaSale, C.r2(2060 / 3));
});

test('computeRange: un año completo y un solo mes coinciden con computeMonth', () => {
  const d = mkData({ gastos: [g('2026-04-03', CATS[1], 40)] });
  assert.equal(C.computeRange(d, '2026-04', '2026-04').queda, C.computeMonth(d, '2026-04').queda);
  const anio = C.computeRange(d, '2026-01', '2026-12');
  assert.equal(anio.n, 12);
  assert.equal(anio.sueldo, 20000);                  // sueldo desde marzo: 10 meses x 2000
});
