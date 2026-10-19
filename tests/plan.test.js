'use strict';
/* Cuentas y saldos, reparto del sueldo y proyección a largo plazo. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/core.js');

test('totales de cuentas: líquido (banco, efectivo, ahorro) y por tipo', () => {
  const t = C.accountTotals([{ tipo: 'banco', saldo: 1000.5 }, { tipo: 'efectivo', saldo: 50 }, { tipo: 'ahorro', saldo: 200 }, { tipo: 'inversion', saldo: 300 }, { tipo: 'raro', saldo: 999 }]);
  assert.equal(t.total, 1550.5); assert.equal(t.liquido, 1250.5); assert.equal(t.por.inversion, 300);
  assert.deepEqual(C.accountTotals(null).por, { banco: 0, efectivo: 0, ahorro: 0, inversion: 0, otro: 0 });
});

test('histórico: una foto por día, la de hoy se sustituye y queda ordenado', () => {
  let h = C.snapshotTotal([], '2026-10-18', 100);
  h = C.snapshotTotal(h, '2026-10-19', 150);
  h = C.snapshotTotal(h, '2026-10-19', 175.456);
  assert.deepEqual(h, [{ f: '2026-10-18', total: 100 }, { f: '2026-10-19', total: 175.46 }]);
});

test('reparto del sueldo: suma exacta con el ahorro absorbiendo el redondeo', () => {
  const r = C.splitIncome(1333.33, { nec: 50, des: 30, aho: 20 });
  assert.equal(C.r2(r.nec + r.des + r.aho), 1333.33);
  assert.deepEqual(C.splitIncome(-5, { nec: 50, des: 30, aho: 20 }), { nec: 0, des: 0, aho: 0 });
});

test('meses de colchón', () => {
  assert.equal(C.emergencyMonths(3000, 1000), 3);
  assert.equal(C.emergencyMonths(3000, 0), null);
  assert.equal(C.emergencyMonths(-10, 100), 0);
});

test('proyección: 0 % de rentabilidad = solo lo aportado; con interés compuesto crece más', () => {
  const z = C.projectGrowth({ inicial: 1000, aporte: 100, rentab: 0, anios: 10, inflacion: 0 });
  assert.equal(z.final, 13000); assert.equal(z.aportado, 13000); assert.equal(z.intereses, 0);
  const g = C.projectGrowth({ inicial: 0, aporte: 200, rentab: 6, anios: 30, inflacion: 2 });
  assert.equal(g.aportado, 72000); assert.ok(g.final > 190000 && g.final < 205000, String(g.final));
  assert.ok(g.real < g.final && g.real > 0); assert.equal(g.filas.length, 31);
  const una = C.projectGrowth({ inicial: 1000, aporte: 0, rentab: 5, anios: 1 });
  assert.equal(una.final, 1050);                                       // rentabilidad anual efectiva
});

test('comisiones: una más alta deja menos capital', () => {
  const a = C.projectGrowth({ aporte: 200, rentab: 6 - 0.2, anios: 30 }), b = C.projectGrowth({ aporte: 200, rentab: 6 - 1.5, anios: 30 });
  assert.ok(b.final < a.final * 0.85);
});

test('normConfig limpia cuentas, histórico y plan (valores raros acotados, nombres peligrosos fuera)', () => {
  const c = C.normConfig({ cuentas: [{ nombre: 'Nómina', tipo: 'banco', saldo: '12,5x' }, { nombre: ' ', saldo: 1 }, { nombre: 'X', tipo: 'hack', saldo: 1e30, fecha: '2026-10-19' }, null],
    cuentasHist: [{ f: '2026-10-19', total: 5 }, { f: 'mal', total: 1 }],
    plan: { preset: 'zzz', pct: { nec: 80, des: 90 }, rentab: 999, anios: 500, inflacion: -3, comision: 'a', aporte: -4 } });
  assert.equal(c.cuentas.length, 2); assert.equal(c.cuentas[0].saldo, 0); assert.equal(c.cuentas[1].tipo, 'banco'); assert.equal(c.cuentas[1].saldo, 1e9);
  assert.deepEqual(c.cuentasHist, [{ f: '2026-10-19', total: 5 }]);
  assert.equal(c.plan.preset, '50-30-20'); assert.equal(c.plan.pct.nec + c.plan.pct.des + c.plan.pct.aho, 100); assert.ok(c.plan.pct.aho >= 0);
  assert.equal(c.plan.rentab, 30); assert.equal(c.plan.anios, 60); assert.equal(c.plan.inflacion, 0); assert.equal(c.plan.aporte, undefined);
  assert.equal(C.normConfig({ plan: 'texto' }).plan, undefined);
});

test('cuenta de pago: un gasto resta, una devolución o un extra suman', () => {
  assert.equal(C.payDelta(C.TIPO_GASTO, 12.5), -12.5);
  assert.equal(C.payDelta(C.TIPO_DEV, 12.5), 12.5);
  assert.equal(C.payDelta('extra', 100), 100);
  assert.equal(C.payDelta(C.TIPO_GASTO, 'x'), 0);
});
