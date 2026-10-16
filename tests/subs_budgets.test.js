'use strict';
/* Suscripciones (mensuales, trimestrales, anuales, cada N meses, compartidas), presupuestos, metas y copia de seguridad. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/core.js');

const CATS = ['🏠 Vivienda', '🎮 Suscripciones', '🚗 Coche', '🍻 Ocio'];
const mk = (cfg = {}, gastos = []) => ({ config: { categorias: CATS.map((nombre) => ({ nombre, presupuesto: null })), sueldo: [{ desde: '2026-01', importe: 2000 }], fijos: {}, suscripciones: [], ...cfg }, gastos, extras: [] });
const sub = (o) => ({ nombre: 'X', importe: 12, activa: true, ...o });
const fijoDe = (d, mkey, cat) => C.computeMonth(d, mkey).filas.find((f) => f.cat === cat).fijo;

test('suscripción mensual: igual que siempre (compatibilidad con datos antiguos sin periodicidad)', () => {
  const d = mk({ suscripciones: [sub({ importe: 10 }), sub({ importe: 5, activa: false })] });
  assert.equal(fijoDe(d, '2026-03', CATS[1]), 10);
  assert.equal(C.computeMonth(d, '2026-03').subs, 10);
});

test('compartida: solo cuenta tu parte (importe / personas, tú incluido)', () => {
  assert.equal(C.subShare({ importe: 17.99, personas: 4 }), 4.5);
  assert.equal(C.subShare({ importe: 10 }), 10);
  assert.equal(C.subShare({ importe: 10, personas: 0 }), 10);
});

test('anual en modo prorrateo: un doceavo cada mes; en modo cobro: todo en el mes del cobro', () => {
  const anual = sub({ nombre: 'Seguro', importe: 120, cada: 12, desde: '2026-03' });
  const pr = mk({ suscripciones: [anual] });
  assert.equal(fijoDe(pr, '2026-05', CATS[1]), 10);
  assert.equal(fijoDe(pr, '2026-02', CATS[1]), 0);                       // antes de empezar
  const co = mk({ suscripciones: [anual], subsModo: 'cobro' });
  assert.equal(fijoDe(co, '2026-03', CATS[1]), 120);
  assert.equal(fijoDe(co, '2026-04', CATS[1]), 0);
  assert.equal(fijoDe(co, '2027-03', CATS[1]), 120);                     // y al año siguiente
});

test('trimestral, semestral y cada 9 meses (raro pero real), compartida', () => {
  const t = sub({ importe: 30, cada: 3, desde: '2026-01' });
  assert.deepEqual(['2026-01', '2026-02', '2026-04', '2026-10'].map((m) => C.subCharges(t, m)), [true, false, true, true]);
  const s = sub({ importe: 60, cada: 6, desde: '2026-02' });
  assert.deepEqual(['2026-02', '2026-08', '2027-02', '2026-05'].map((m) => C.subCharges(s, m)), [true, true, true, false]);
  const n9 = sub({ importe: 90, cada: 9, desde: '2026-01', personas: 3 });          // 90 € entre 3 → 30 € tuyos cada 9 meses
  const d = mk({ suscripciones: [n9], subsModo: 'cobro' });
  assert.equal(fijoDe(d, '2026-10', CATS[1]), 30);                       // enero + 9 = octubre
  assert.equal(fijoDe(d, '2026-07', CATS[1]), 0);
  assert.equal(fijoDe(d, '2027-07', CATS[1]), 30);                       // octubre + 9 = julio
  assert.equal(fijoDe(mk({ suscripciones: [n9] }), '2026-05', CATS[1]), r(30 / 9));
});
function r(x) { return Math.round(x * 100) / 100; }

test('una suscripción puede ir a otra categoría (seguro del coche) y el total sigue cuadrando', () => {
  const d = mk({ suscripciones: [sub({ nombre: 'Seguro coche', importe: 600, cada: 12, desde: '2026-06', categoria: CATS[2] }), sub({ importe: 10 })], subsModo: 'cobro' });
  const m = C.computeMonth(d, '2026-06');
  assert.equal(m.filas.find((f) => f.cat === CATS[2]).fijo, 600);
  assert.equal(m.filas.find((f) => f.cat === CATS[1]).fijo, 10);
  assert.equal(m.subs, 610);
  assert.equal(m.fijos, 610);
  assert.equal(m.sale, 610);
});

test('sin categoría "Suscripciones" el dinero no se pierde: sale en su propia fila', () => {
  const d = { config: { categorias: [{ nombre: 'Otros', presupuesto: null }], sueldo: [{ desde: '2026-01', importe: 100 }], fijos: {}, suscripciones: [sub({ importe: 9 })] }, gastos: [], extras: [] };
  const m = C.computeMonth(d, '2026-02');
  assert.equal(m.sale, 9);
  assert.equal(m.filas.reduce((a, f) => a + f.total, 0), 9);
});

test('próximos cobros: fecha real, tu parte, ordenados y con el día clavado al fin de mes', () => {
  const cfg = { suscripciones: [
    sub({ nombre: 'Netflix', importe: 18, personas: 3, dia: 5 }),
    sub({ nombre: 'Hosting', importe: 100, cada: 12, desde: '2026-11', dia: 31 }),
    sub({ nombre: 'Febrero', importe: 5, cada: 12, desde: '2027-02', dia: 31 }),
    sub({ nombre: 'Parada', importe: 5, activa: false })] };
  const l = C.upcomingCharges(cfg, '2026-10-16', 10);
  assert.deepEqual(l.map((x) => [x.nombre, x.fecha, x.importe]), [['Netflix', '2026-11-05', 6], ['Hosting', '2026-11-30', 100], ['Febrero', '2027-02-28', 5]]);
  assert.equal(l[0].personas, 3); assert.equal(l[0].total, 18);
  assert.equal(C.upcomingCharges(cfg, '2026-11-05', 1)[0].fecha, '2026-11-05');   // el mismo día todavía cuenta
  assert.equal(C.subPeriodo({ cada: 3 }), 'cada 3 meses (trimestral)');
  assert.equal(C.subPeriodo({ cada: 9 }), 'cada 9 meses');
  assert.equal(C.subPeriodo({}), 'cada mes');
});

test('presupuesto: avisa al 80 % y al 100 %, y solo la vez que se cruza', () => {
  const cfg = { categorias: [{ nombre: CATS[3], presupuesto: 100 }, { nombre: CATS[0], presupuesto: null }, CATS[1], CATS[2]].map((c) => (typeof c === 'string' ? { nombre: c, presupuesto: null } : c)) };
  const g = (id, imp) => ({ id, fecha: '2026-05-10', categoria: CATS[3], importe: imp, tipo: 'Gasto' });
  const d1 = mk(cfg, [g('a', 70)]);
  assert.equal(C.budgetCrossing(d1, '2026-05', CATS[3], 70), null);                    // 70 %: nada
  const d2 = mk(cfg, [g('a', 70), g('b', 15)]);
  assert.equal(C.budgetCrossing(d2, '2026-05', CATS[3], 15).nivel, 'aviso');           // cruza el 80 %
  const d3 = mk(cfg, [g('a', 70), g('b', 15), g('c', 5)]);
  assert.equal(C.budgetCrossing(d3, '2026-05', CATS[3], 5), null);                     // ya estaba en aviso: no se repite
  const d4 = mk(cfg, [g('a', 70), g('b', 15), g('c', 5), g('d', 20)]);
  const x = C.budgetCrossing(d4, '2026-05', CATS[3], 20);
  assert.equal(x.nivel, 'pasado'); assert.equal(x.queda, -10);
  assert.equal(C.budgetCrossing(d4, '2026-05', CATS[0], 5), null);                     // sin presupuesto: sin aviso
  const al = C.budgetAlerts(C.computeMonth(d4, '2026-05'));
  assert.equal(al.length, 1); assert.equal(al[0].cat, CATS[3]);
});

test('meta de ahorro: porcentaje, lo que falta y cuánto toca ahorrar al mes', () => {
  const p = C.goalProgress({ objetivo: 500, aportado: 125, fecha: '2027-01' }, '2026-10');
  assert.equal(p.pct, 0.25); assert.equal(p.falta, 375); assert.equal(p.meses, 3); assert.equal(p.porMes, 125);
  assert.equal(C.goalProgress({ objetivo: 100, aportado: 150 }, '2026-10').hecha, true);
  assert.equal(C.goalProgress({ objetivo: 0, aportado: 0 }).pct, 0);
  assert.equal(C.goalProgress({ objetivo: 100, aportado: 10, fecha: '2026-01' }, '2026-10').meses, 0);   // fecha ya pasada
});

test('copia de seguridad: ida y vuelta sin duplicar, y rechaza ficheros que no son suyos', () => {
  const d = { config: { sueldo: [] }, diccionario: [], gastos: [{ id: 'g1', fecha: '2026-01-02', categoria: 'a', importe: 5, tipo: 'Gasto' }], extras: [{ id: 'e1', fecha: '2026-01-03', tipo: 't', importe: 9 }] };
  const b = JSON.parse(JSON.stringify(C.makeBackup(d)));
  assert.equal(b.app, 'FinanzasApp');
  const vacio = { config: {}, diccionario: [], gastos: [], extras: [] };
  const plan = C.planRestore(vacio, b);
  assert.equal(plan.gastos.length, 1); assert.equal(plan.extras.length, 1);
  const otra = C.planRestore(d, b);
  assert.equal(otra.gastos.length, 0); assert.equal(otra.extras.length, 0);
  assert.equal(C.planRestore(vacio, { hola: 1 }), null);
  assert.equal(C.planRestore(vacio, null), null);
  const malo = C.planRestore(vacio, { ...b, gastos: [{ id: 'x', fecha: 'mañana', importe: 'abc' }, { fecha: '2026-01-01', importe: 3 }] });
  assert.equal(malo.gastos.length, 0);
});

test('serie anual para gráficos: 12 meses y cuadra con computeMonth', () => {
  const d = mk({}, [{ id: 'a', fecha: '2026-03-04', categoria: CATS[3], importe: 50, tipo: 'Gasto' }]);
  const s = C.yearSeries(d, 2026);
  assert.equal(s.length, 12); assert.equal(s[2].sale, 50); assert.equal(s[2].queda, 1950); assert.equal(s[0].mk, '2026-01');
});
