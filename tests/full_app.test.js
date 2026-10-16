'use strict';
/* Ahorros, deudas, horas extra, lectura de la estructura del Excel, prompt del escáner y backend de configuración. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../app/core.js');
const { makeEnv } = require('./gs_harness');

const cats = ['🏠 Vivienda (alquiler / hipoteca)', '🛒 Supermercado y comida', '🚗 Coche (gasolina, seguro, taller)', '📈 Inversión', '🖥️ Decoración, periféricos y gaming', '📦 Otros'];
const base = (over = {}) => ({ config: { categorias: cats.map((nombre) => ({ nombre, presupuesto: null })), sueldo: [{ desde: '2026-01', importe: 1000 }], fijos: { [cats[3]]: [{ desde: '2026-01', importe: 100 }] }, suscripciones: [], ...over.config }, gastos: over.gastos || [], extras: [] });

test('ahorros: base + (entra − sale + apartado) mes a mes, y sigue en el año siguiente', () => {
  const d = base({ config: { ahorros: { base: 500, desde: '2026-11' } }, gastos: [{ id: 'a', fecha: '2026-11-03', categoria: cats[1], importe: 300, tipo: 'Gasto' }] });
  const s = C.savingsSeries(d, '2027-01');
  assert.equal(s.filas.length, 3);
  assert.equal(s.filas[0].ahorrado, 700);                 // 1000 − (100 inversión + 300) + 100 apartado
  assert.equal(s.filas[0].acumulado, 1200);
  assert.equal(s.filas[2].mk, '2027-01');
  assert.equal(s.actual, 500 + 700 + 1000 + 1000);        // en enero empieza con lo que había a 31 de diciembre
  assert.equal(s.desdeInicio, 2700);
  assert.equal(s.enAnio, 1000);
  assert.equal(C.savingsSeries(d, '2026-10').actual, 500);   // antes de "desde": solo la base
  assert.equal(C.savingsSeries(base(), '2026-12').filas.length, 0);
});

test('deudas: pendiente = importe − devuelto (nunca negativo) y balance', () => {
  const l = [{ tipo: 'me_deben', importe: 260, devuelto: 150 }, { tipo: 'me_deben', importe: 50, devuelto: 80 }, { tipo: 'debo', importe: 100, devuelto: 40 }];
  assert.deepEqual(C.debtTotals(l), { meDeben: 110, debo: 60, balance: 50 });
  assert.deepEqual(C.debtTotals(undefined), { meDeben: 0, debo: 0, balance: 0 });
});

test('horas extra: horas × tarifa + pago fijo', () => {
  assert.equal(C.extraAmount(8, 12.5, 0), 100);
  assert.equal(C.extraAmount(2, 10, 5), 25);
  assert.equal(C.extraAmount(null, null, 30), 30);
});

test('semáforo y mensaje: a partir del 80 % gastado es alarma', () => {
  const m = C.computeMonth(base({ gastos: [{ id: 'a', fecha: '2026-03-01', categoria: cats[1], importe: 700, tipo: 'Gasto' }] }), '2026-03');   // 100 fijo + 700 = 80 %
  assert.equal(m.semaforo, 'rojo');
  assert.match(C.semaforoMsg(m), /ALARMA/);
});

/* --- lectura de la estructura de TU Excel (aoa = filas de la hoja, empezando en la columna A) --- */
function pilotoAoa() {
  const rows = [];
  const put = (i, arr) => { rows[i] = arr.concat(new Array(Math.max(0, 99 - arr.length)).fill(null)); };
  for (let i = 0; i < 70; i++) rows[i] = new Array(99).fill(null);
  put(7, [null, 'Concepto (puedes renombrarlo)', 'Qué es', 'Enero', 'Febrero']);
  put(8, [null, '💵 Mi sueldo', 'Entra', 1200, null, null, 1300]);          // sube en abril
  put(9, [null, cats[0], 'Sale', 500]);
  put(10, [null, '🎮 Suscripciones', 'Auto', 99]);
  put(11, [null, cats[3], 'Sale', 0, 50]);
  put(28, [null, 'TOTAL GASTOS FIJOS DEL MES']);
  put(31, [null, 'Nombre', 'Importe al mes (€)', 'Día de cobro', '¿Activa?']);
  put(32, [null, 'Netflix', 12, null, 'Sí']);
  put(33, [null, 'Gimnasio', 30, null, 'No']);
  put(57, [null, 'Nombre (renómbralos a tu gusto)']);
  put(58, [null, '⏱️ Horas extra']); put(59, [null, '🎁 Ventas']);
  put(66, [null, 'Primer año del archivo (no lo cambies)', 2026]);
  return rows;
}

test('parsePiloto: categorías, sueldo con herencia, fijos, suscripciones y tipos de extra', () => {
  const p = C.parsePiloto(pilotoAoa());
  assert.deepEqual(p.categorias.map((c) => c.nombre), [cats[0], '🎮 Suscripciones', cats[3]]);
  assert.deepEqual(p.sueldo, [{ desde: '2026-01', importe: 1200 }, { desde: '2026-04', importe: 1300 }]);
  assert.deepEqual(p.fijos[cats[0]], [{ desde: '2026-01', importe: 500 }]);
  assert.deepEqual(p.fijos[cats[3]], [{ desde: '2026-02', importe: 50 }]);     // el 0 inicial no cuenta; empieza en febrero
  assert.equal(p.fijos['🎮 Suscripciones'], undefined);                         // las suscripciones salen de su tabla
  assert.deepEqual(p.suscripciones, [{ nombre: 'Netflix', importe: 12, activa: true }, { nombre: 'Gimnasio', importe: 30, activa: false }]);
  assert.deepEqual(p.tiposExtra, ['⏱️ Horas extra', '🎁 Ventas']);
  assert.equal(C.parsePiloto([[null, 'otra cosa']]), null);
});

test('parseExtras (con horas), parseDeudas y parseAhorros', () => {
  const ex = [[], [], [null, 'Fecha', 'Tipo de extra ▼', 'Nº horas', '€ por hora', 'Pago fijo €\n(sin horas)', 'Total 🔒', 'Detalle'],
    [null, '2026-10-05', '⏱️ Horas extra', 8, 12.5, null, null, 'sábado'], [null, '2026-10-06', '🎁 Ventas', null, null, 40, 40, null], [null, null, null, null, null, null, null, null]];
  const e = C.parseExtras(ex);
  assert.equal(e.length, 2);
  assert.equal(e[0].importe, 100); assert.match(e[0].detalle, /8 h × 12.5 €.*sábado/);
  assert.equal(e[1].importe, 40);
  assert.deepEqual(C.parseExtras(ex).map((x) => x.id), e.map((x) => x.id));        // ids deterministas: reimportar no duplica

  const de = [[null, '🟢  1. DINERO QUE HE PRESTADO (me lo debe)'], [null, 'Fecha', 'Persona', 'Motivo', 'Importe (€)', 'Devuelto hasta ahora (€)'], [null, '2026-10-15', 'Hermano', 'Prestado', 260, 150],
    [null, 'TOTAL QUE ME DEBE', null, null, 260], [null, '🔴  2. DINERO QUE ME HAN PRESTADO (lo debo)'], [null, 'Fecha'], [null, '2026-10-20', 'Padre', 'Coche', 100, null]];
  const d = C.parseDeudas(de);
  assert.deepEqual(d.map((x) => [x.tipo, x.persona, x.importe, x.devuelto]), [['me_deben', 'Hermano', 260, 150], ['debo', 'Padre', 100, 0]]);

  const ah = [[], [], [null, '💰 Mis ahorros AHORA (€)', null, 1500], [null, '📅 Empiezo a contar desde', null, 'Octubre', 2026]];
  assert.deepEqual(C.parseAhorros(ah), { base: 1500, desde: '2026-10' });
  assert.equal(C.parseAhorros([[null, 'otra hoja']]), null);
});

test('escáner: prompt compacto con categorías numeradas sin emojis y ejemplos de uso', () => {
  const p = C.buildTicketPrompt(cats, [{ k: 'queso', c: cats[1], n: 3, s: 'app' }, { k: 'x', c: cats[2], n: 1, s: 'semilla' }]);
  assert.match(p, /\n3 Coche \(gasolina, seguro, taller\) — ej: gasolina, aceite de motor/);
  assert.match(p, /\n2 Supermercado y comida — ej: .*aceite de cocina/);
  assert.match(p, /\n5 Decoración, periféricos y gaming — ej: ratón, teclado/);
  assert.doesNotMatch(p, /\p{Extended_Pictographic}/u);
  assert.match(p, /"queso"→2/);
  assert.doesNotMatch(p, /"x"→/);                          // las semillas no se repiten en cada petición
  const largo = C.buildTicketPrompt(Array.from({ length: 19 }, (_, i) => `🅰️ Cat ${i}`), []);
  assert.ok(largo.length < 1700, 'prompt corto: ' + largo.length);
});

test('escáner: decodeTicket traduce nº de categoría (y acepta el formato largo)', () => {
  const t = C.decodeTicket({ f: '2026-10-01', s: 'Tienda', t: 30, l: [{ n: 'aceite motor', p: 10, c: '3' }, { n: 'ratón', p: 20, c: 5 }, { n: 'raro', p: 1, c: '99' }] }, cats);
  assert.equal(t.lineas[0].categoria_sugerida, cats[2]);
  assert.equal(t.lineas[1].categoria_sugerida, cats[4]);
  assert.equal(t.lineas[2].categoria_sugerida, '99');
  const n = C.normalizeTicket(t, cats, C.buildIndex([]));
  assert.equal(n.lineas[2].c, cats[5]);                    // código inválido -> Otros
  assert.equal(C.decodeTicket({ lineas: [{ nombre_articulo: 'a', precio: 1, categoria_sugerida: cats[0] }], importe_total: 1 }, cats).lineas[0].categoria_sugerida, cats[0]);
});

/* --- backend --- */
const DIST = path.join(__dirname, '..', 'dist', 'Code.gs');
const CODE = process.env.CODE_GS || (fs.existsSync(DIST) ? DIST : path.join(__dirname, '..', 'backend', 'Code.gs'));

test('backend: configSet guarda deudas/ahorros y cambia la revisión (otro dispositivo lo ve)', () => {
  const env = makeEnv(CODE); const token = env.setup();
  const rev0 = env.read('rev', token).rev;
  assert.equal(env.post({ token, action: 'configSet', key: 'deudas', value: [{ id: 'd1', tipo: 'debo', importe: 5 }] }).ok, true);
  assert.equal(env.post({ token, action: 'configSet', key: 'ahorros', value: { base: 10, desde: '2026-10' } }).ok, true);
  assert.notEqual(env.read('rev', token).rev, rev0);
  const cfg = env.read('data', token).config;
  assert.equal(cfg.deudas[0].id, 'd1'); assert.deepEqual(cfg.ahorros, { base: 10, desde: '2026-10' });
});

test('backend modo Excel: deudas, ahorros y tarifa se guardan aparte y se leen junto al Piloto', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'excel_fixture.json'), 'utf8'));
  const env = makeEnv(CODE);
  const mk = (name, grid, cols) => { const sh = env.ss.insertSheet(name); sh.grid = grid.map((r) => r.slice()); sh.maxRows = 69; sh.maxCols = cols; while (sh.grid.length < 69) sh.grid.push(new Array(cols).fill('')); return sh; };
  mk('⚙️ Piloto Automático', fx.piloto, 99); mk('📝 Gastos', fx.gastosCab, 14); mk('🚀 Extras', fx.extrasCab, 11);
  const token = env.setup();
  assert.equal(env.post({ token, action: 'configSet', key: 'tarifaHora', value: 12.5 }).ok, true);
  assert.equal(env.post({ token, action: 'configSet', key: 'deudas', value: [{ id: 'x', tipo: 'debo', importe: 1 }] }).ok, true);
  const cfg = env.read('data', token).config;
  assert.equal(cfg.fuente, 'excel');
  assert.equal(cfg.tarifaHora, 12.5); assert.equal(cfg.deudas[0].id, 'x');
  assert.ok(cfg.categorias.length > 5);                    // y el Piloto sigue mandando para lo demás
});
