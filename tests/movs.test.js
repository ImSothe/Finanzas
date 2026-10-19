'use strict';
/* Movimientos de las cuentas: solo se añaden filas (nunca se pisa un saldo), sin duplicar por id y sin fórmulas. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeEnv } = require('./gs_harness');
const C = require('../app/core.js');

const DIST = path.join(__dirname, '..', 'dist', 'Code.gs');
const CODE = process.env.CODE_GS || (fs.existsSync(DIST) ? DIST : path.join(__dirname, '..', 'backend', 'Code.gs'));
const fresh = () => { const env = makeEnv(CODE); const token = env.setup(); return { env, token }; };
const mov = (o = {}) => ({ id: 'm-' + Math.random().toString(36).slice(2), cuenta: 'a1', delta: -12.5, fecha: '2026-10-15', nota: 'Gasto', ...o });
const peligros = (env) => Object.values(env.sheets).flatMap((sh) => sh.danger.map((d) => `${sh.name}!R${d.r}C${d.c}=${d.v}`));

test('addMov: guarda el movimiento, lo devuelve en "data" y no lo duplica si llega dos veces (dos dispositivos)', () => {
  const { env, token } = fresh();
  const m = mov({ id: 'auto-abc', delta: 1500, nota: 'Sueldo' });
  assert.equal(env.post({ token, action: 'addMov', rows: [m] }).added, 1);
  const otra = env.post({ token, action: 'addMov', rows: [m] });                       // el otro dispositivo manda el mismo movimiento
  assert.equal(otra.added, 0); assert.equal(otra.skipped, 1);
  const d = env.read('data', token);
  assert.equal(d.movs.length, 1); assert.deepEqual(d.movs[0], { id: 'auto-abc', fecha: '2026-10-15', cuenta: 'a1', delta: 1500, nota: 'Sueldo' });
});

test('addMov: dos dispositivos que añaden movimientos distintos se suman, ninguno pisa al otro', () => {
  const { env, token } = fresh();
  env.post({ token, action: 'addMov', rows: [mov({ delta: -10 })] });                  // móvil
  env.post({ token, action: 'addMov', rows: [mov({ delta: -5 })] });                   // PC, a la vez
  const total = env.read('data', token).movs.reduce((a, x) => a + x.delta, 0);
  assert.equal(total, -15);
});

test('addMov: valida cuenta, id, fecha e importe y no deja fórmulas en la hoja', () => {
  const { env, token } = fresh();
  for (const mal of [{ id: 'a b' }, { cuenta: '<x>' }, { fecha: 'ayer' }, { delta: 'abc' }, { delta: 1e12 }]) {
    assert.equal(env.post({ token, action: 'addMov', rows: [mov(mal)] }).ok, false);
  }
  const f = ['=IMPORTDATA("http://x")', '+cmd|calc', '@SUM(1,1)', '-2+3'];
  const r = env.post({ token, action: 'addMov', rows: f.map((n, i) => mov({ id: 'f' + i, nota: n })) });
  assert.equal(r.ok, true);
  assert.deepEqual(peligros(env), []);
  assert.equal(env.read('data', token).movs.find((x) => x.id === 'f0').nota, f[0]);
  assert.equal(env.post({ token: 'malo', action: 'addMov', rows: [mov()] }).code, 'auth');
});

test('cliente: movimientos automáticos con id fijo y sin repetir los que ya existen', () => {
  const cfg = { autoDesde: '2026-10-01', sueldo: [{ desde: '2026-01', importe: 1500 }], sueldoCuenta: { id: 'n', dia: 1 } };
  const [m] = C.dueMovements(cfg, '2026-10-10', new Set());
  assert.match(m.id, /^auto-[a-z0-9]+$/);
  assert.equal(C.dueMovements(cfg, '2026-10-10', new Set([m.id])).length, 0);          // otro dispositivo ya lo añadió
  assert.equal(C.dueMovements(cfg, '2026-10-10', new Set()).map((x) => x.id)[0], m.id); // mismo id en cualquier dispositivo
  assert.equal(C.cleanMov({ id: 'a', cuenta: 'b', delta: '12,5', fecha: '2026-10-01' }), null);
  assert.deepEqual(C.cleanMov({ id: 'a', cuenta: 'b', delta: 12.5, fecha: '2026-10-01', nota: 'x' }), { id: 'a', cuenta: 'b', delta: 12.5, fecha: '2026-10-01', nota: 'x' });
});
