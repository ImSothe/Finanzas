'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeEnv } = require('./gs_harness');

const fs = require('fs');
const DIST = path.join(__dirname, '..', 'dist', 'Code.gs');
const CODE = process.env.CODE_GS || (fs.existsSync(DIST) ? DIST : path.join(__dirname, '..', 'backend', 'Code.gs'));
const fresh = () => { const env = makeEnv(CODE); const token = env.setup(); return { env, token }; };
const row = (o = {}) => ({ id: 'id-' + Math.random().toString(36).slice(2), fecha: '2026-10-15', categoria: '🛒 Supermercado y comida', importe: 12.5,
  tipo: 'Gasto', detalle: 'Café', comercio: '', items: '', ticketId: '', origen: 'app', ...o });

test('setup crea las 4 pestañas, token y datos de arranque', () => {
  const { env, token } = fresh();
  assert.ok(token && token.length >= 32);
  for (const n of ['Gastos', 'Extras', 'Config', 'Diccionario']) assert.ok(env.sheets[n], n);
  assert.equal(env.sheets.Gastos.grid[0][2], 'Importe');
  assert.match(env.lastAlert, /TOKEN/);
  const d = env.read('data', token);
  assert.equal(d.ok, true);
  assert.ok(Array.isArray(d.config.categorias));
  assert.ok(d.diccionario.length >= 0);
});

test('setup es idempotente: no duplica configuracion ni cambia el token', () => {
  const { env, token } = fresh();
  const n1 = env.sheets.Config.getLastRow();
  const t2 = env.setup();
  assert.equal(t2, token);
  assert.equal(env.sheets.Config.getLastRow(), n1);
});

test('sin token o con token malo todo se rechaza', () => {
  const { env } = fresh();
  assert.equal(env.read('data').code, 'auth');
  assert.equal(env.read('data', 'xx').code, 'auth');
  assert.equal(env.post({ action: 'add', rows: [row()] }).code, 'auth');
  assert.equal(env.post({ token: 'xx', action: 'add', rows: [row()] }).code, 'auth');
});

test('ping funciona sin token y no revela nada (ni versión, ni modo, ni si hay token)', () => {
  const { env } = fresh();
  const p = env.get({ action: 'ping' });
  assert.deepEqual(p, { ok: true, app: 'FinanzasApp' });
});

test('el token ya no viaja en la URL: las lecturas por GET se rechazan, aunque el token sea correcto', () => {
  const { env, token } = fresh();
  for (const action of ['data', 'rev', 'info', 'loquesea']) {
    const r = env.get({ action, token });
    assert.equal(r.ok, false); assert.equal(r.code, 'use-post');
    assert.equal(r.gastos, undefined); assert.equal(r.config, undefined);
  }
});

test('info (POST, con token) da versión y modo; sin token o con token mal, auth', () => {
  const { env, token } = fresh();
  const i = env.read('info', token);
  assert.equal(i.ok, true); assert.equal(i.mode, 'hoja'); assert.equal(i.v, 1);
  assert.equal(env.read('info').code, 'auth'); assert.equal(env.read('info', token + 'x').code, 'auth');
  assert.equal(env.read('info', token.slice(0, -1)).code, 'auth');
  assert.equal(env.read('info', 12345).code, 'auth');                   // token que no es texto
});

test('add guarda la fila, es idempotente por ID (reintentos offline) y sube la revision', () => {
  const { env, token } = fresh();
  const r = row({ id: 'abc-1' });
  const rev0 = env.read('rev', token).rev;
  const a1 = env.post({ token, action: 'add', rows: [r] });
  assert.equal(a1.added, 1);
  const a2 = env.post({ token, action: 'add', rows: [r] });          // reintento del mismo envio
  assert.equal(a2.added, 0);
  assert.equal(a2.skipped, 1);
  const d = env.read('data', token);
  assert.equal(d.gastos.length, 1);
  assert.equal(d.gastos[0].importe, 12.5);
  assert.equal(d.gastos[0].fecha, '2026-10-15');
  assert.notEqual(env.read('rev', token).rev, rev0);
});

test('ticket dividido: filas con TicketID y Detalle_Items se guardan y se leen intactas', () => {
  const { env, token } = fresh();
  const items = JSON.stringify({ ticket: { id: 'T1', comercio: 'Mercadona', total: 170 }, lineas: [{ n: 'Queso', p: 3.5 }] });
  env.post({ token, action: 'add', rows: [row({ id: 's1', importe: 110, ticketId: 'T1', comercio: 'Mercadona', items }),
    row({ id: 's2', importe: 60, categoria: '🖥️ Decoración, periféricos y gaming', ticketId: 'T1', comercio: 'Mercadona', items })] });
  const d = env.read('data', token);
  assert.equal(d.gastos.filter((g) => g.ticketId === 'T1').length, 2);
  assert.equal(JSON.parse(d.gastos[0].items).ticket.comercio, 'Mercadona');
});

test('validaciones: importe/fecha/id invalidos se rechazan sin escribir nada', () => {
  const { env, token } = fresh();
  for (const bad of [row({ importe: 'abc' }), row({ fecha: '15/10/2026' }), row({ id: '' }), row({ importe: -3 })]) {
    const r = env.post({ token, action: 'add', rows: [bad] });
    assert.equal(r.ok, false);
  }
  assert.equal(env.read('data', token).gastos.length, 0);
});

test('importe con coma decimal y redondeo a centimos', () => {
  const { env, token } = fresh();
  env.post({ token, action: 'add', rows: [row({ id: 'c1', importe: '2,345' })] });
  assert.equal(env.read('data', token).gastos[0].importe, 2.35);
});

test('update cambia solo campos permitidos; delete borra; borrar algo inexistente no falla', () => {
  const { env, token } = fresh();
  env.post({ token, action: 'add', rows: [row({ id: 'u1' })] });
  const u = env.post({ token, action: 'update', id: 'u1', fields: { categoria: '📦 Otros', importe: 20, id: 'hack', creado: 'x' } });
  assert.equal(u.ok, true);
  let g = env.read('data', token).gastos[0];
  assert.equal(g.categoria, '📦 Otros');
  assert.equal(g.importe, 20);
  assert.equal(g.id, 'u1');                                          // el ID no se puede sobrescribir
  assert.equal(env.post({ token, action: 'update', id: 'nope', fields: { categoria: 'x' } }).ok, false);
  assert.equal(env.post({ token, action: 'delete', id: 'u1' }).deleted, 1);
  assert.equal(env.post({ token, action: 'delete', id: 'u1' }).deleted, 0);
  assert.equal(env.read('data', token).gastos.length, 0);
});

test('extras: alta, idempotencia y borrado', () => {
  const { env, token } = fresh();
  const e = { id: 'x1', fecha: '2026-10-20', tipo: '⏱️ Horas extra', importe: 50, detalle: 'sábado' };
  assert.equal(env.post({ token, action: 'addExtra', rows: [e] }).added, 1);
  assert.equal(env.post({ token, action: 'addExtra', rows: [e] }).added, 0);
  assert.equal(env.read('data', token).extras[0].importe, 50);
  assert.equal(env.post({ token, action: 'delete', sheet: 'extras', id: 'x1' }).deleted, 1);
});

test('diccionario: dictSet crea y suma usos, dictDel borra', () => {
  const { env, token } = fresh();
  env.post({ token, action: 'dictSet', k: 'figurita', c: '🖥️ Decoración, periféricos y gaming' });
  env.post({ token, action: 'dictSet', k: 'figurita', c: '🖥️ Decoración, periféricos y gaming' });
  let d = env.read('data', token).diccionario.find((x) => x.k === 'figurita');
  assert.equal(d.n >= 1, true);
  assert.equal(env.post({ token, action: 'dictSet', k: '', c: 'x' }).ok, false);
  env.post({ token, action: 'dictDel', k: 'figurita' });
  assert.equal(env.read('data', token).diccionario.find((x) => x.k === 'figurita'), undefined);
});

test('configSet valida la clave y persiste JSON', () => {
  const { env, token } = fresh();
  assert.equal(env.post({ token, action: 'configSet', key: 'chips', value: ['a', 'b'] }).ok, true);
  assert.deepEqual(env.read('data', token).config.chips, ['a', 'b']);
  assert.equal(env.post({ token, action: 'configSet', key: '../x', value: 1 }).ok, false);
});

test('filas escritas a mano en la hoja reciben un ID y se leen (fecha dd/mm/aaaa incluida)', () => {
  const { env, token } = fresh();
  env.sheets.Gastos.appendRow(['15/10/2026', '🛒 Supermercado y comida', 9.9, '', 'a mano', '', '', '', '', '', '']);
  const d = env.read('data', token);
  assert.equal(d.gastos.length, 1);
  assert.equal(d.gastos[0].fecha, '2026-10-15');
  assert.ok(d.gastos[0].id.length > 4);
  assert.equal(env.read('data', token).gastos[0].id, d.gastos[0].id);   // el ID se queda fijo
});

test('JSON invalido y accion desconocida devuelven error limpio', () => {
  const { env, token } = fresh();
  assert.equal(env.post('{no json').code, 'bad-json');
  assert.equal(env.post({ token, action: 'borrarTodo' }).code, 'bad-action');
});

test('regenerar el token invalida el anterior', () => {
  const { env, token } = fresh();
  env.call('regenToken');
  assert.equal(env.read('data', token).code, 'auth');
});
