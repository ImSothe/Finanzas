'use strict';
/* Modo Excel: el backend lee y escribe en las pestañas de la plantilla de Excel subida a Google Sheets.
   La pestaña Piloto es la REAL (calculada a partir de la plantilla con datos inventados); Gastos/Extras se simulan con sus cabeceras reales. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('./gs_harness');
const C = require('../app/core.js');

const FIX = path.join(__dirname, 'fixtures', 'excel_fixture.json');
const fx = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const DIST = path.join(__dirname, '..', 'dist', 'Code.gs');
const CODE = process.env.CODE_GS || (fs.existsSync(DIST) ? DIST : path.join(__dirname, '..', 'backend', 'Code.gs'));
const ROWS = 60;                                                    // filas de datos simuladas (en la hoja real son 6.000)

function excelEnv() {
  const env = makeEnv(CODE);
  const mk = (name, grid, cols) => {
    const sh = env.ss.insertSheet(name);
    sh.grid = grid.map((r) => r.slice());
    sh.maxRows = 9 + ROWS; sh.maxCols = cols;
    while (sh.grid.length < sh.maxRows) sh.grid.push(new Array(cols).fill(''));
    return sh;
  };
  const piloto = mk('⚙️ Piloto Automático', fx.piloto, 99);
  const gastos = mk('📝 Gastos', fx.gastosCab, 14);
  const extras = mk('🚀 Extras', fx.extrasCab, 11);
  for (let r = 10; r < 10 + ROWS; r++) { gastos.grid[r - 1][6] = '=FORMULA_MES'; gastos.grid[r - 1][7] = '=FORMULA_IMPACTO'; extras.grid[r - 1][6] = ''; }
  const token = env.setup();
  return { env, token, piloto, gastos, extras };
}
const row = (o = {}) => ({ id: 'id-' + Math.random().toString(36).slice(2), fecha: '2026-10-15', categoria: '🛒 Supermercado y comida', importe: 12.5,
  tipo: 'Gasto', detalle: 'Café', comercio: '', items: '', ticketId: '', origen: 'app', ...o });
const cell = (sh, ref) => { const m = ref.match(/^([A-Z]+)(\d+)$/); let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return sh.grid[+m[2] - 1][c - 1]; };

test('detecta el modo Excel, prepara el diccionario y no toca tus pestañas', () => {
  const { env, token } = excelEnv();
  assert.ok(token && token.length >= 32);
  assert.equal(env.read('info', token).mode, 'excel');
  assert.ok(env.sheets['Diccionario']);
  assert.ok(!env.sheets['Gastos'] && !env.sheets['Config'], 'no debe crear las pestañas del modo hoja');
  assert.match(env.lastAlert, /modo Excel/);
});

test('config: categorías, sueldo (con su subida), fijos, suscripciones y tipos de extra salen del Piloto', () => {
  const { env, token } = excelEnv();
  const cfg = env.read('data', token).config;
  const y = fx.year0;
  assert.equal(cfg.fuente, 'excel');
  assert.ok(cfg.categorias.length >= 16);
  assert.ok(cfg.categorias.some((c) => /Vivienda/.test(c.nombre)));
  assert.ok(cfg.categorias.some((c) => /Suscripci/.test(c.nombre)));
  assert.deepEqual(cfg.sueldo, [{ desde: `${y}-01`, importe: 2000 }, { desde: `${y + 1}-01`, importe: 2200 }]);
  const viv = Object.keys(cfg.fijos).find((k) => /Vivienda/.test(k));
  assert.deepEqual(cfg.fijos[viv], [{ desde: `${y}-01`, importe: 600 }]);
  assert.ok(!Object.keys(cfg.fijos).some((k) => /Suscripci/.test(k)), 'las suscripciones no cuentan como fijo');
  assert.deepEqual(cfg.suscripciones, [{ nombre: 'Streaming', importe: 10, activa: true }, { nombre: 'Otra', importe: 5, activa: false }]);
  assert.equal(cfg.tiposExtra.length, 4);
});

test('el núcleo calcula "cuánto me queda" con esa configuración (herencia y suscripción inactiva incluidas)', () => {
  const { env, token } = excelEnv();
  const d = env.read('data', token);
  const y = fx.year0;
  const m = C.computeMonth({ config: d.config, gastos: [], extras: [] }, `${y}-06`);
  assert.equal(m.entra, 2000);
  assert.equal(m.fijos, 610);                                       // 600 vivienda + 10 de la suscripción activa
  assert.equal(m.queda, 1390);
  assert.equal(C.computeMonth({ config: d.config, gastos: [], extras: [] }, `${y + 1}-03`).entra, 2200);
});

test('añadir gasto escribe en B..F y J..N de la primera fila libre y NO pisa las fórmulas de G y H', () => {
  const { env, token, gastos } = excelEnv();
  const r = row({ id: 'abc-1', detalle: 'Café', importe: 1.5 });
  assert.equal(env.post({ token, action: 'add', rows: [r] }).added, 1);
  assert.equal(cell(gastos, 'C10'), '🛒 Supermercado y comida');
  assert.equal(cell(gastos, 'D10'), 1.5);
  assert.equal(cell(gastos, 'F10'), 'Café');
  assert.equal(cell(gastos, 'N10'), 'abc-1');
  assert.equal(cell(gastos, 'G10'), '=FORMULA_MES');
  assert.equal(cell(gastos, 'H10'), '=FORMULA_IMPACTO');
  assert.ok(cell(gastos, 'B10') instanceof Date);
  const d = env.read('data', token).gastos;
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].fecha, d[0].importe, d[0].detalle, d[0].origen, d[0].id], ['2026-10-15', 1.5, 'Café', 'app', 'abc-1']);
});

test('reintento del mismo envío no duplica; las siguientes filas van seguidas', () => {
  const { env, token, gastos } = excelEnv();
  const a = row({ id: 'a' }), b = row({ id: 'b', detalle: 'Otro' });
  assert.equal(env.post({ token, action: 'add', rows: [a] }).added, 1);
  const r2 = env.post({ token, action: 'add', rows: [a, b] });
  assert.equal(r2.added, 1);
  assert.equal(r2.skipped, 1);
  assert.equal(cell(gastos, 'N11'), 'b');
  assert.equal(env.read('data', token).gastos.length, 2);
});

test('ticket dividido: filas con TicketID y Detalle_Items intactos', () => {
  const { env, token } = excelEnv();
  const items = JSON.stringify({ v: 1, t: { id: 'T1', c: 'Super', f: '2026-10-15', total: 170 }, l: [{ n: 'Queso', p: 3.5, c: 'x' }] });
  env.post({ token, action: 'add', rows: [row({ id: 's1', importe: 110, ticketId: 'T1', comercio: 'Super', items }), row({ id: 's2', importe: 60, ticketId: 'T1', comercio: 'Super', items })] });
  const g = env.read('data', token).gastos.filter((x) => x.ticketId === 'T1');
  assert.equal(g.length, 2);
  assert.equal(JSON.parse(g[0].items).t.c, 'Super');
});

test('fila escrita a mano en la hoja (solo B..F): la app la ve, le pone ID y fija la fecha si falta', () => {
  const { env, token, gastos } = excelEnv();
  const hoy = new Date().toISOString().slice(0, 10);
  gastos.grid[19][1] = new Date(Date.UTC(2026, 9, 3)); gastos.grid[19][2] = '🍻 Ocio, cenas y salidas'; gastos.grid[19][3] = 25; gastos.grid[19][5 - 0] = 'a mano';   // fila 20
  gastos.grid[20][2] = '🛒 Supermercado y comida'; gastos.grid[20][3] = 9.9;                                                                           // fila 21 sin fecha ni detalle
  const d = env.read('data', token).gastos;
  assert.equal(d.length, 2);
  const manual = d.find((x) => x.importe === 25), sinFecha = d.find((x) => x.importe === 9.9);
  assert.equal(manual.fecha, '2026-10-03');
  assert.ok(manual.id.length > 4);
  assert.equal(cell(gastos, 'N20'), manual.id);                     // el ID queda guardado en la hoja
  assert.equal(sinFecha.fecha, hoy);
  assert.ok(cell(gastos, 'B21') instanceof Date);                   // y la fecha se escribe para que no cambie cada día
  assert.equal(env.read('data', token).gastos.find((x) => x.importe === 25).id, manual.id);
});

test('borrar vacía las celdas de entrada (no elimina la fila) y esa fila se reutiliza', () => {
  const { env, token, gastos } = excelEnv();
  env.post({ token, action: 'add', rows: [row({ id: 'd1' }), row({ id: 'd2', detalle: 'dos' })] });
  assert.equal(env.post({ token, action: 'delete', id: 'd1' }).deleted, 1);
  assert.equal(env.post({ token, action: 'delete', id: 'd1' }).deleted, 0);
  assert.equal(cell(gastos, 'D10'), '');
  assert.equal(cell(gastos, 'G10'), '=FORMULA_MES');               // la fórmula sigue ahí
  assert.equal(env.read('data', token).gastos.length, 1);
  env.post({ token, action: 'add', rows: [row({ id: 'd3', detalle: 'tres' })] });
  assert.equal(cell(gastos, 'N10'), 'd3');                          // reutiliza el hueco de arriba
});

test('update cambia solo campos permitidos', () => {
  const { env, token, gastos } = excelEnv();
  env.post({ token, action: 'add', rows: [row({ id: 'u1' })] });
  assert.equal(env.post({ token, action: 'update', id: 'u1', fields: { categoria: '📦 Otros', importe: 20, id: 'hack' } }).ok, true);
  assert.equal(cell(gastos, 'C10'), '📦 Otros');
  assert.equal(cell(gastos, 'D10'), 20);
  assert.equal(cell(gastos, 'N10'), 'u1');
  assert.equal(env.post({ token, action: 'update', id: 'nope', fields: { categoria: 'x' } }).ok, false);
});

test('validaciones: importe/fecha/id inválidos no escriben nada', () => {
  const { env, token } = excelEnv();
  for (const bad of [row({ importe: 'abc' }), row({ fecha: '15/10/2026' }), row({ id: '' }), row({ importe: -3 })]) assert.equal(env.post({ token, action: 'add', rows: [bad] }).ok, false);
  assert.equal(env.read('data', token).gastos.length, 0);
});

test('extras: se guardan como pago fijo, la app lee el TOTAL calculado por la hoja y borrar los vacía', () => {
  const { env, token, extras } = excelEnv();
  const e = { id: 'x1', fecha: '2026-10-20', tipo: '⏱️ Horas extra', importe: 50, detalle: 'sábado' };
  assert.equal(env.post({ token, action: 'addExtra', rows: [e] }).added, 1);
  assert.equal(env.post({ token, action: 'addExtra', rows: [e] }).added, 0);
  assert.equal(cell(extras, 'F10'), 50);
  assert.equal(cell(extras, 'H10'), 'sábado');
  assert.equal(cell(extras, 'K10'), 'x1');
  extras.grid[9][6] = 50;                                           // la hoja calcula G = horas x precio + pago fijo
  // y un extra escrito a mano por horas: 5 h x 10 €/h = 50 (G lo calcula la hoja)
  extras.grid[10][1] = new Date(Date.UTC(2026, 9, 21)); extras.grid[10][3] = 5; extras.grid[10][4] = 10; extras.grid[10][6] = 50;
  const d = env.read('data', token).extras;
  assert.deepEqual(d.map((x) => x.importe).sort(), [50, 50]);
  assert.equal(env.post({ token, action: 'delete', sheet: 'extras', id: 'x1' }).deleted, 1);
  assert.equal(cell(extras, 'F10'), '');
});

test('la huella cambia al escribir en la hoja (la app se entera de los cambios hechos a mano)', () => {
  const { env, token, gastos } = excelEnv();
  const r0 = env.read('rev', token).rev;
  env.post({ token, action: 'add', rows: [row({ id: 'r1' })] });
  const r1 = env.read('rev', token).rev;
  assert.notEqual(r0, r1);
  gastos.grid[30][3] = 7;                                           // alguien teclea un gasto en la hoja
  assert.notEqual(env.read('rev', token).rev, r1);
});

test('hoja llena: error claro y sin escribir', () => {
  const { env, token, gastos } = excelEnv();
  for (let r = 10; r < 10 + ROWS; r++) gastos.grid[r - 1][3] = 1;
  const r = env.post({ token, action: 'add', rows: [row()] });
  assert.equal(r.ok, false);
  assert.match(r.error, /llena/);
});

test('el modo hoja sigue funcionando igual si no hay pestañas de Excel', () => {
  const env = makeEnv(CODE);
  const token = env.setup();
  assert.equal(env.read('info', token).mode, 'hoja');
  assert.ok(env.sheets['Gastos']);
});
