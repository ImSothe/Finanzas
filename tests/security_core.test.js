'use strict';
/* Seguridad del núcleo: datos hostiles (de la hoja, de una copia de seguridad o de un Excel) no pueden contaminar objetos,
   romper los cálculos ni colar formatos inesperados. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/core.js');

const limpio = () => { assert.equal(({}).polluted, undefined); assert.equal(Object.prototype.polluted, undefined); assert.equal(Object.polluted, undefined); };

test('nombres: los que chocan con propiedades internas de JavaScript se rechazan', () => {
  for (const n of ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', '__defineGetter__', '  __proto__  ', '', '   ', null, undefined]) assert.equal(C.nameOk(n), '', String(n));
  assert.equal(C.nameOk('  🍕 Comida  '), '🍕 Comida');
  assert.equal(C.nameOk('a\u0000b\u001fc'), 'a b c');                                   // sin caracteres de control
  assert.equal(C.nameOk('x'.repeat(200)).length, 80);
  assert.equal(C.nameOk('constructora'), 'constructora');                               // solo el nombre exacto
});

test('normConfig con JSON hostil: no contamina el prototipo y descarta nombres peligrosos', () => {
  const hostil = JSON.parse('{"__proto__":{"polluted":1},"constructor":{"x":1},"categorias":["__proto__","constructor","toString","ok",{"nombre":"__proto__"}],"fijos":{"__proto__":[{"desde":"2026-01","importe":5}],"constructor":[{"desde":"2026-01","importe":5}],"toString":[{"desde":"2026-01","importe":5}],"ok":[{"desde":"2026-01","importe":7}]}}');
  const c = C.normConfig(hostil);
  limpio();
  assert.equal(Object.getPrototypeOf(c), Object.prototype);
  assert.deepEqual(c.categorias.map((x) => x.nombre), ['ok']);
  assert.deepEqual(Object.keys(c.fijos), ['ok']);
  assert.equal(Object.getPrototypeOf(c.fijos), Object.prototype);
  assert.equal(c.polluted, undefined); assert.equal(Object.keys(c).includes('__proto__'), false); assert.equal(Object.keys(c).includes('constructor'), false);
});

test('el cálculo aguanta categorías y gastos llamados constructor/__proto__ sin romperse ni contaminar', () => {
  const cats = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'Normal'];
  const d = { config: { categorias: cats.map((nombre) => ({ nombre, presupuesto: 10 })), sueldo: [{ desde: '2026-01', importe: 100 }], fijos: JSON.parse('{"__proto__":[{"desde":"2026-01","importe":9}]}'), suscripciones: [] },
    gastos: cats.map((categoria, i) => ({ id: 'g' + i, fecha: '2026-03-01', categoria, importe: 1 + i, tipo: 'Gasto' })), extras: [] };
  let m;
  assert.doesNotThrow(() => { m = C.computeMonth(d, '2026-03'); });
  limpio();
  assert.equal(m.dia, 15);                                                          // 1+2+3+4+5: todos los gastos cuentan
  assert.equal(m.filas.reduce((a, f) => a + f.total, 0), m.sale);
  assert.doesNotThrow(() => C.computeRange(d, '2026-01', '2026-06'));
  assert.doesNotThrow(() => C.budgetAlerts(m));
  limpio();
});

test('effectiveAt no revienta si recibe algo que no es una lista', () => {
  for (const x of [undefined, null, 5, 'texto', {}, function () {}, Object, [null], [{ desde: undefined }]]) assert.doesNotThrow(() => C.effectiveAt(x, '2026-01'));
  assert.equal(C.effectiveAt(Object, '2026-01'), 0);
  assert.equal(C.effectiveAt([{ desde: '2026-01', importe: '7' }], '2026-05'), 7);
});

test('esquema estricto: tipos, rangos y longitudes de suscripciones, deudas, metas, cartera y ahorros', () => {
  const c = C.normConfig({
    suscripciones: [{ nombre: 'N'.repeat(500), importe: '1e99', cada: -4, personas: 9999, dia: 99, desde: '2026-13', categoria: '__proto__', activa: 'no', extra: 'x' }, { nombre: '' }, 5, null],
    deudas: [{ tipo: 'hack', importe: 5 }, { id: '<b>', tipo: 'debo', fecha: 'ayer', persona: 'P'.repeat(500), importe: 'abc', devuelto: -3 }],
    metas: [{ nombre: 'M', objetivo: 'x', aportado: -1, fecha: 'pronto' }, { nombre: '' }],
    cartera: [{ id: 'ok-1', tipo: 'hack', nombre: 'BTC', simbolo: '<script>x</script>', cantidad: '2', compra: -5, cg: 'bitcoin"onerror="x', manual: '10', manualFecha: 'mal' }, { nombre: 'Ok', cg: 'solana' }],
    ahorros: { base: 'zzz', desde: '2026-99' }, tarifaHora: -9, subsModo: 'otra-cosa',
  });
  const s = c.suscripciones[0];
  assert.equal(c.suscripciones.length, 1);
  assert.equal(s.nombre.length, 80); assert.equal(s.importe, 1e9);                 // 1e99 se recorta al máximo assert.equal(s.cada, 1); assert.equal(s.personas, 50); assert.equal(s.dia, 31);
  assert.equal(s.desde, undefined); assert.equal(s.categoria, undefined); assert.equal(s.activa, true); assert.equal(s.extra, undefined);
  assert.equal(c.deudas.length, 1);
  const d = c.deudas[0];
  assert.match(d.id, /^[A-Za-z0-9_-]+$/); assert.equal(d.fecha, ''); assert.equal(d.persona.length, 80); assert.equal(d.importe, 0); assert.equal(d.devuelto, 0);
  assert.equal(c.metas.length, 1); assert.equal(c.metas[0].objetivo, 0); assert.equal(c.metas[0].aportado, 0); assert.equal(c.metas[0].fecha, '');
  assert.equal(c.cartera.length, 2);
  const p = c.cartera[0];
  assert.equal(p.tipo, 'otro'); assert.equal(p.simbolo, 'scriptxscript'.replace(/[^A-Za-z0-9.^=-]/g, '')); assert.equal(p.cg, ''); assert.equal(p.cantidad, 2); assert.equal(p.compra, 0);
  assert.equal(p.manual, 10); assert.equal(p.manualFecha, undefined);
  assert.equal(c.cartera[1].cg, 'solana');
  assert.deepEqual(c.ahorros, { base: 0, desde: null }); assert.equal(c.tarifaHora, 0); assert.equal(c.subsModo, 'prorrateo');
});

test('cantidades pequeñas de cripto se conservan (no se redondean a 2 decimales) y los importes tienen tope', () => {
  const c = C.normConfig({ cartera: [{ nombre: 'BTC', cantidad: 0.00012345, compra: 0.000012345, manual: 0.0000001 }, { nombre: 'Gigante', cantidad: 1e30, compra: 1e30 }],
    ahorros: { base: 1e30, desde: '2026-01' }, sueldo: [{ desde: '2026-01', importe: -1e30 }, { desde: '2026-02', importe: 1e30 }] });
  assert.equal(c.cartera[0].cantidad, 0.00012345); assert.equal(c.cartera[0].compra, 0.00001235); assert.equal(c.cartera[0].manual, 1e-7);
  assert.equal(c.cartera[1].cantidad, 1e15);
  assert.equal(c.ahorros.base, 1e9); assert.equal(c.sueldo[0].importe, -1e9); assert.equal(c.sueldo[1].importe, 1e9);
  const s = C.positionStats(c.cartera[0], 60000);
  assert.equal(s.valor, 7.41);                                                        // 0,00012345 BTC a 60.000 € = 7,41 €
  const plan = C.planRestore({ gastos: [], extras: [] }, { app: 'FinanzasApp', gastos: [{ id: 'a', fecha: '2026-01-01', importe: 1e99 }], extras: [{ id: 'b', fecha: '2026-01-01', importe: 1e99 }] });
  assert.equal(plan.gastos[0].importe, 1e9); assert.equal(plan.extras[0].importe, 1e9);
});

test('límites de tamaño: no se aceptan listas enormes', () => {
  const grande = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const c = C.normConfig({ categorias: grande(500, (i) => 'C' + i), suscripciones: grande(900, (i) => ({ nombre: 'S' + i, importe: 1 })), deudas: grande(900, (i) => ({ tipo: 'debo', importe: 1, id: 'd' + i })),
    metas: grande(500, (i) => ({ nombre: 'M' + i })), cartera: grande(900, (i) => ({ nombre: 'P' + i })), tiposExtra: grande(500, (i) => 'T' + i), sueldo: grande(900, (i) => ({ desde: '2026-01', importe: i })) });
  assert.equal(c.categorias.length, 100); assert.equal(c.suscripciones.length, 200); assert.equal(c.deudas.length, 500); assert.equal(c.metas.length, 100);
  assert.equal(c.cartera.length, 300); assert.equal(c.tiposExtra.length, 50); assert.equal(c.sueldo.length, 200);
});

test('copia de seguridad hostil: filas y configuración se limpian, lo imposible se descarta y se cuenta', () => {
  const b = JSON.parse(JSON.stringify({ app: 'FinanzasApp', v: 1, creado: 'Z'.repeat(500),
    config: JSON.parse('{"__proto__":{"polluted":1},"constructor":1,"categorias":["ok","__proto__"],"valido":{"a":1},"raro clave":1,"1mala":2}'),
    gastos: [
      { id: 'bien', fecha: '2026-01-02', categoria: 'C'.repeat(999), importe: '12.345', tipo: 'otro', detalle: 'D'.repeat(5000), comercio: '=cmd', items: 123, ticketId: 'T', origen: 'O'.repeat(99) },
      { id: '<img src=x>', fecha: '2026-01-02', importe: 5 }, { id: 'sinfecha', importe: 5 }, { id: 'fechamala', fecha: '02/01/2026', importe: 5 }, { id: 'negativo', fecha: '2026-01-02', importe: -5 },
      { id: 'nan', fecha: '2026-01-02', importe: 'abc' }, null, 5, 'x', { id: 'x'.repeat(61), fecha: '2026-01-02', importe: 1 }, { id: 'ya', fecha: '2026-01-02', importe: 1 }],
    extras: [{ id: 'e1', fecha: '2026-01-02', tipo: 'T'.repeat(500), importe: 3, detalle: 'x' }, { id: 'e2', fecha: 'nunca', importe: 3 }, null] }));
  const plan = C.planRestore({ gastos: [{ id: 'ya' }], extras: [], config: {} }, b);
  limpio();
  assert.equal(plan.gastos.length, 1); assert.equal(plan.extras.length, 1);
  const g = plan.gastos[0];
  assert.equal(g.categoria.length, 120); assert.equal(g.importe, 12.35); assert.equal(g.tipo, 'Gasto'); assert.equal(g.detalle.length, 1000); assert.equal(g.items, ''); assert.equal(g.origen.length, 20); assert.equal(g.comercio, '=cmd');
  assert.equal(plan.extras[0].tipo.length, 120);
  assert.equal(plan.descartadas, 11 - 1 + 2 - 0 - 1 + 0 + 0, 'descartadas');          // 10 filas de gastos inválidas (incluye las 3 no-objeto) y 2 extras inválidos, menos el duplicado "ya" que es válido
  assert.equal(plan.creado.length, 40);
  assert.deepEqual(Object.keys(plan.config).sort(), ['categorias', 'valido']);
  assert.deepEqual(plan.config.categorias.map((x) => x.nombre), ['ok']);
  for (const malo of [null, undefined, 5, 'x', [], {}, { app: 'otra' }, { app: 'FinanzasApp' }, { app: 'FinanzasApp', gastos: 'no', extras: [] }]) assert.equal(C.planRestore({ gastos: [], extras: [] }, malo), null);
});

test('un Excel hostil: nombres de categoría peligrosos en el Piloto se ignoran', () => {
  const rows = []; for (let i = 0; i < 70; i++) rows[i] = new Array(99).fill(null);
  const put = (i, a) => { rows[i] = a.concat(new Array(Math.max(0, 99 - a.length)).fill(null)); };
  put(7, [null, 'Concepto', 'Qué es', 'Enero']); put(8, [null, '💵 Sueldo', 'Entra', 100]);
  put(9, [null, '__proto__', 'Sale', 5]); put(10, [null, 'constructor', 'Sale', 6]); put(11, [null, 'Ocio', 'Sale', 7]);
  put(28, [null, 'TOTAL GASTOS FIJOS DEL MES']); put(66, [null, 'Primer año del archivo', 2026]);
  const p = C.parsePiloto(rows);
  limpio();
  assert.deepEqual(p.categorias.map((x) => x.nombre), ['Ocio']);
  assert.deepEqual(Object.keys(p.fijos), ['Ocio']);
});
