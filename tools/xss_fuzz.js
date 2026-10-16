/* Prueba de ataque XSS: se pega en la consola (o con evaluate_script) de la app abierta.
   Mete cargas maliciosas en TODOS los campos que escribe el usuario, recorre todas las pantallas y comprueba que no se ejecuta nada
   ni aparece ningún elemento inyectado. Devuelve la lista de pantallas con fallos (vacía = limpio). */
async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__xss = 0;
  const mk = (tag) => `"><img src=x onerror="window.__xss++">'><svg onload="window.__xss++">${tag}<script>window.__xss++<\/script>`;
  const P = (t) => mk(t);
  const d = FF.data;
  const cat1 = P('cat1'), cat2 = P('cat2');
  d.config.categorias = [{ nombre: cat1, presupuesto: 100 }, { nombre: cat2, presupuesto: null }, { nombre: '🎮 Suscripciones', presupuesto: null }];
  d.config.tiposExtra = [P('tipoextra')];
  d.config.sueldo = [{ desde: '2026-01', importe: 1500 }];
  d.config.fijos = { [cat1]: [{ desde: '2026-01', importe: 50 }] };
  d.config.suscripciones = [{ nombre: P('sub'), importe: 10, cada: 1, personas: 2, dia: 3, desde: '2026-01', categoria: cat2, activa: true }];
  d.config.metas = [{ id: 'm1', nombre: P('meta'), objetivo: 100, aportado: 10, fecha: '2027-01' }];
  d.config.deudas = [{ id: 'd1', tipo: 'debo', fecha: '2026-10-01', persona: P('persona'), motivo: P('motivo'), importe: 10, devuelto: 0 }, { id: 'd2', tipo: 'me_deben', fecha: '2026-10-01', persona: P('p2'), motivo: P('m2'), importe: 10, devuelto: 0 }];
  d.config.cartera = [{ id: 'c1', tipo: 'otro', nombre: P('cartera'), simbolo: P('simb'), cantidad: 1, compra: 10, manual: 12, manualFecha: '2026-10-01' }, { id: 'c2', tipo: 'cripto', nombre: P('cripto'), cg: 'bitcoin"onerror="window.__xss++', cantidad: 1, compra: 10 }];
  d.config.ahorros = { base: 10, desde: '2026-10' };
  const mkg = (i, extra) => ({ id: 'g' + i, fecha: C_today(), categoria: cat1, importe: 10 + i, tipo: 'Gasto', detalle: P('detalle' + i), comercio: P('comercio' + i), items: '', ticketId: '', origen: 'app', ...extra });
  function C_today() { return Core.todayISO(); }
  const items = JSON.stringify({ t: { c: P('tcomercio'), f: C_today(), total: 20 }, l: [{ n: P('item1'), p: 10, c: cat1 }, { n: P('item2'), p: 10, c: cat2 }] });
  d.gastos = [mkg(1), mkg(2, { tipo: 'Devolución 🔄', categoria: cat2 }), mkg(3, { items, ticketId: 'T1', comercio: P('com3') }), mkg(4, { categoria: 'inexistente' + P('x') })];
  d.extras = [{ id: 'e1', fecha: C_today(), tipo: P('extra'), importe: 5, detalle: P('extradet') }];
  d.diccionario = [{ k: P('dk'), c: cat1, n: 3, s: 'app' }];
  FF.rebuildIndex(); FF.persist();
  const fallos = [], vistas = [];
  const comprueba = (nombre) => {
    const inyect = document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onload], #pcMain script, #overlay script, main script').length;
    vistas.push(nombre);
    if (window.__xss > 0 || inyect > 0) fallos.push({ vista: nombre, ejecutado: window.__xss, elementos: inyect });
    window.__xss = 0;
  };
  const wasPC = FF.pcActive;
  // ---- modo avanzado (o página móvil) : todas las vistas
  const todas = ['cmd', 'gastos', 'dev', 'extras', 'anio', 'ahorros', 'deudas', 'graficos', 'cartera', 'piloto', 'guia'];
  for (const v of todas) {
    if (FF.pcActive) FF.pcGo(v); else FF.openPage(v);
    FF.renderAll(); await w(250); comprueba('pc:' + v);
  }
  // buscador del historial dentro del PC (reflejo de la búsqueda)
  if (FF.pcActive) { FF.pcGo('gastos'); await w(100); const q = document.getElementById('gQ'); if (q) { q.value = mk('busqueda'); q.dispatchEvent(new Event('input', { bubbles: true })); await w(400); comprueba('pc:buscar'); } }
  // rápida de Centro de Mando: concepto con payload y sugerencias/datalist
  if (FF.pcActive) { FF.pcGo('cmd'); await w(100); const c = document.getElementById('qCon'); if (c) { c.value = 'dk'; c.dispatchEvent(new Event('input', { bubbles: true })); await w(200); comprueba('pc:sugerencias'); } }
  // detalle de un gasto y ticket
  FF.openDetail('g3'); await w(300); comprueba('modal:detalle-ticket');
  document.querySelectorAll('#overlay .bk').forEach((b) => b.click()); await w(100);
  FF.openDetail('g1'); await w(300); comprueba('modal:detalle'); document.querySelectorAll('#overlay .bk').forEach((b) => b.click()); await w(100);
  // ---- vista simplificada
  FF.goMobile && 0;
  const verMovil = async (tab, nombre) => { if (FF.pcActive) return; const b = document.querySelector(`#tabs [data-go=${tab}]`); if (b) { b.click(); await w(300); comprueba('movil:' + nombre); } };
  await verMovil('home', 'hoy'); await verMovil('hist', 'historial'); await verMovil('res', 'resumen'); await verMovil('set', 'ajustes');
  // toast y selector de categoría
  FF.toast('x ' + FF.esc(mk('toast'))); await w(100); comprueba('toast');
  return { vistas: vistas.length, fallos };
}
