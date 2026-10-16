'use strict';
/* La configuración sale de una celda editable a mano: una celda mal escrita no puede dejar la app sin categorías ni romperla. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/core.js');

const nombres = (c) => c.categorias.map((x) => x.nombre);

test('categorías: lista correcta se queda igual (y conserva el presupuesto)', () => {
  const c = C.normConfig({ categorias: [{ nombre: 'Ocio', presupuesto: 100 }, 'Coche', { nombre: 'Casa', presupuesto: '' }] });
  assert.deepEqual(c.categorias, [{ nombre: 'Ocio', presupuesto: 100 }, { nombre: 'Coche', presupuesto: null }, { nombre: 'Casa', presupuesto: null }]);
});

test('categorías escritas a mano como texto (con comas, saltos de línea o JSON) se reconocen', () => {
  assert.deepEqual(nombres(C.normConfig({ categorias: 'Comida, Ocio; Coche\nCasa' })), ['Comida', 'Ocio', 'Coche', 'Casa']);
  assert.deepEqual(nombres(C.normConfig({ categorias: '["🛒 Súper","🚗 Coche"]' })), ['🛒 Súper', '🚗 Coche']);
  assert.deepEqual(nombres(C.normConfig({ categorias: { 0: 'A', 1: { nombre: 'B' } } })), ['A', 'B']);
});

test('categorías: sin duplicados, sin vacías y sin nombres raros', () => {
  assert.deepEqual(nombres(C.normConfig({ categorias: ['A', ' A ', '', null, 5, { nombre: '' }, { x: 1 }, 'B'] })), ['A', 'B']);
  assert.deepEqual(C.normConfig({ categorias: { nombre: 'Solo' } }).categorias.map((x) => x.nombre), ['Solo']);
});

test('lo demás también: nunca devuelve algo que no sea lista/objeto, y no inventa claves opcionales', () => {
  const c = C.normConfig({ categorias: null, sueldo: 'x', fijos: [1], suscripciones: 7, tiposExtra: 'Horas, Ventas', deudas: 'nada', ahorros: [3] });
  assert.deepEqual(c.categorias, []); assert.deepEqual(c.sueldo, []); assert.deepEqual(c.fijos, {}); assert.deepEqual(c.suscripciones, []);
  assert.deepEqual(c.tiposExtra, ['Horas', 'Ventas']); assert.deepEqual(c.deudas, []); assert.equal(c.ahorros, undefined); assert.equal(c.metas, undefined);
  assert.deepEqual(C.normConfig(undefined).categorias, []);
  assert.deepEqual(C.normConfig('basura').sueldo, []);
});

test('el cálculo no se rompe aunque le llegue una configuración sin normalizar', () => {
  const d = { config: { categorias: 'Comida, Ocio', sueldo: [{ desde: '2026-01', importe: 100 }], fijos: {}, suscripciones: [] }, gastos: [], extras: [] };
  assert.doesNotThrow(() => C.computeMonth(d, '2026-03'));
  assert.equal(C.computeMonth(d, '2026-03').entra, 100);
  const ok = { ...d, config: C.normConfig(d.config), gastos: [{ id: 'a', fecha: '2026-03-02', categoria: 'Ocio', importe: 10, tipo: 'Gasto' }] };
  assert.equal(C.computeMonth(ok, '2026-03').filas.find((f) => f.cat === 'Ocio').total, 10);
});
