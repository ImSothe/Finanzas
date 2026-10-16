'use strict';
/* Cálculo de la cartera de inversión: valor, invertido, ganancia y variación de 24 h. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/core.js');

test('una posición: valor, invertido, ganancia y % sobre lo invertido', () => {
  const s = C.positionStats({ cantidad: 0.5, compra: 40000 }, 60000);
  assert.deepEqual(s, { cant: 0.5, invertido: 20000, valor: 30000, gan: 10000, pct: 0.5 });
  const p = C.positionStats({ cantidad: 10, compra: 100 }, 80);
  assert.equal(p.gan, -200); assert.equal(p.pct, -0.2);
});

test('sin precio no hay valor ni ganancia (no se inventa una pérdida del 100 %)', () => {
  const s = C.positionStats({ cantidad: 3, compra: 10 }, null);
  assert.equal(s.valor, null); assert.equal(s.gan, null); assert.equal(s.pct, null); assert.equal(s.invertido, 30);
  assert.equal(C.positionStats({ cantidad: 3, compra: 10 }, 0).valor, null);
  assert.equal(C.positionStats({ cantidad: 'x', compra: undefined }, 5).valor, 0);
  assert.equal(C.positionStats({ cantidad: 2, compra: 0 }, 5).pct, null);              // regalo / airdrop: sin base para un %
});

test('totales: la ganancia solo cuenta lo que tiene precio y se avisa de lo que no', () => {
  const a = { stats: C.positionStats({ cantidad: 1, compra: 100 }, 150), ch: null };
  const b = { stats: C.positionStats({ cantidad: 2, compra: 50 }, 40), ch: null };
  const sin = { stats: C.positionStats({ cantidad: 5, compra: 20 }, null), ch: null };
  const t = C.portfolioTotals([a, b, sin]);
  assert.equal(t.valor, 230); assert.equal(t.invertido, 200); assert.equal(t.gan, 30); assert.equal(t.pct, 0.15);
  assert.equal(t.sinPrecio, 1); assert.equal(t.invertidoTotal, 300);
  const v = C.portfolioTotals([]);
  assert.equal(v.valor, 0); assert.equal(v.pct, null); assert.equal(v.hoyPct, null);
});

test('variación de 24 h: ayer valía valor / (1 + %), y solo cuentan los activos con dato', () => {
  const up = { stats: C.positionStats({ cantidad: 1, compra: 100 }, 110), ch: 10 };        // ayer 100 -> hoy 110: +10
  const dn = { stats: C.positionStats({ cantidad: 1, compra: 100 }, 90), ch: -10 };          // ayer 100 -> hoy 90: -10
  const sinCh = { stats: C.positionStats({ cantidad: 1, compra: 100 }, 100), ch: null };
  assert.equal(C.portfolioTotals([up]).hoy, 10);
  assert.equal(C.portfolioTotals([up, dn]).hoy, 0);
  const t = C.portfolioTotals([up, sinCh]);
  assert.equal(t.hoy, 10);
  assert.equal(Math.round(t.hoyPct * 1000) / 1000, 0.05);                               // +10 sobre los 210 − 10 = 200 que valía ayer = 5 %
});

test('la configuración de la cartera sobrevive a una celda mal escrita', () => {
  assert.deepEqual(C.normConfig({ cartera: 'basura' }).cartera, []);
  assert.deepEqual(C.normConfig({ cartera: [{ nombre: 'BTC', cantidad: 1 }, null, { sin: 'nombre' }] }).cartera.map((p) => p.nombre), ['BTC']);
  assert.equal(C.normConfig({}).cartera, undefined);
});
