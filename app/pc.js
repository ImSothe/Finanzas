/* Finanzas App · vista de escritorio (parecida a tu Excel). Se activa sola en pantallas anchas; en el móvil no cambia nada.
   Usa los mismos datos y la misma lógica que la vista móvil (window.FF las expone desde app.js). */
(function () {
  'use strict';
  const C = window.Core;
  const FF = window.FF;
  if (!FF || !FF.ui) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => FF.esc(s);
  const fmt = (n) => C.fmtEUR(n);
  const mq = window.matchMedia('(min-width: 1000px)');
  const KEY = 'ff.layout';
  let pref = 'auto';
  try { pref = localStorage.getItem(KEY) || 'auto'; } catch (e) { /* sin almacenamiento */ }
  let view = 'cmd';
  let pending = false, mpage = false, force = false;
  const st = { hasta: true, pil: null, gMes: null, gQ: '', gLimit: 150, anio: new Date().getFullYear(), q: { imp: '', con: '', fec: '', tipo: 'Gasto', cat: '', auto: false }, x: { fec: '', tipo: '', imp: '', det: '' } };
  const data = () => FF.data;
  const cats = () => FF.cats();
  const hoy = () => C.todayISO();
  const active = () => pref === 'pc' || (pref === 'auto' && mq.matches);
  const mesCorto = (m) => C.MESES[m - 1].slice(0, 3);

  /* ------------------------------------------------------------------ estructura */
  const nav = document.createElement('aside');
  nav.id = 'pcNav'; nav.hidden = true;
  nav.innerHTML = `<div class="pc-logo">💰 Finanzas</div>
    <button data-v="cmd">📊 Centro de Mando</button>
    <button data-v="gastos">📝 Gastos</button>
    <button data-v="dev">🔄 Devoluciones</button>
    <button data-v="extras">🚀 Extras</button>
    <button data-v="anio">📅 Resumen del Año</button>
    <button data-v="ahorros">🏦 Ahorros</button>
    <button data-v="deudas">🤝 Deudas</button>
    <button data-v="graficos">📈 Gráficos</button>
    <button data-v="piloto">⚙️ Piloto Automático</button>
    <button data-v="guia">📖 Empieza aquí</button>
    <button data-v="ajustes">🔧 Ajustes y conexión</button>
    <div class="pc-foot"><button class="pc-eye" data-eye type="button" title="Ocultar o mostrar los importes">👁️ Ocultar importes</button><span id="pcSync" class="chip">…</span><button id="pcToMobile" class="pc-link" type="button">📱 Vista simplificada</button></div>`;
  const advBtn = document.createElement('button');
  advBtn.id = 'pcToAdv'; advBtn.type = 'button'; advBtn.hidden = true; advBtn.textContent = '🖥️ Modo avanzado';
  advBtn.addEventListener('click', () => setPref('auto'));
  const pcMain = document.createElement('section');
  pcMain.id = 'pcMain'; pcMain.hidden = true;
  document.body.append(nav, pcMain, advBtn);

  function apply() {
    const on = active();
    if (on && mpage) closePage(true);
    FF.pcActive = on;
    document.body.classList.toggle('pc', on);
    nav.hidden = !on;
    const main = $('main');
    if (on) {
      pcMain.hidden = view === 'ajustes';
      main.hidden = view !== 'ajustes';
      if (view === 'ajustes') FF.goMobile('set');
      $$('#pcNav button[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
      render();
    } else {
      pcMain.hidden = true; main.hidden = false;
      FF.goMobile(FF.ui.view || 'home');
    }
    advBtn.hidden = on || !mq.matches;                      // vista simplificada en una pantalla ancha: ofrece volver al modo avanzado
    syncLayoutSelect();
  }

  /** Redibuja ya (tras guardar/borrar), aunque el cursor siga en un campo: así lo añadido se ve al instante. */
  function now() { pending = false; force = true; try { FF.renderAll(); } finally { force = false; } }
  FF.renderNow = now;

  const MAP = { home: 'cmd', hist: 'gastos', res: 'anio', set: 'ajustes' };
  FF.pcGo = (v) => { view = MAP[v] || v; apply(); window.scrollTo(0, 0); };
  FF.onNet = (t, k) => { const c = $('#pcSync'); if (c) { c.textContent = t; c.className = 'chip ' + k; } };
  FF.onRender = () => {
    if (view === 'ajustes' || (!FF.pcActive && !mpage)) return;
    const a = document.activeElement;
    if (!force && a && pcMain.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { pending = true; return; }   // no interrumpir mientras escribes (salvo que acabes de guardar algo)
    render();
  };
  document.addEventListener('focusout', () => { if (pending) setTimeout(() => { const a = document.activeElement; if (!(a && pcMain.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) { pending = false; if ((FF.pcActive || mpage) && view !== 'ajustes') render(); } }, 120); });
  mq.addEventListener('change', apply);

  /* ------------------------------------------------------------------ piezas comunes */
  const semaforo = (m) => {
    const col = { verde: 'var(--acc)', amarillo: 'var(--warn)', rojo: 'var(--bad)', vacio: 'var(--line)' }[m.semaforo];
    const msg = C.semaforoMsg(m);
    const w = m.semaforo === 'vacio' ? 0 : Math.max(2, Math.min(100, m.pctGastado * 100));
    return `<div class="pc-bat"><div class="pc-batbar"><i style="width:${w.toFixed(1)}%;background-size:${(w ? 10000 / w : 100).toFixed(1)}% 100%;box-shadow:0 0 16px ${m.semaforo === 'vacio' ? 'transparent' : col}"></i></div><div class="pc-batmsg" style="color:${m.semaforo === 'vacio' ? 'var(--mut)' : col}">${esc(msg)}</div></div>`;
  };

  function yearsList() {
    const set = new Set([new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]);
    data().gastos.forEach((g) => { if (g.fecha) set.add(+g.fecha.slice(0, 4)); });
    data().extras.forEach((g) => { if (g.fecha) set.add(+g.fecha.slice(0, 4)); });
    return [...set].sort((a, b) => a - b);
  }

  const monthSelect = () => {
    const [Y, M] = FF.ui.mk.split('-').map(Number);
    return `<select id="pcMes" class="t pc-sel">${C.MESES.map((n, i) => `<option value="${i + 1}" ${i + 1 === M ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select id="pcAnio" class="t pc-sel">${yearsList().map((y) => `<option ${y === Y ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
  };

  const head = (titulo, extra = '') => `${mpage ? '<button class="pc-back" id="pcBack" type="button">← Volver a Ajustes</button>' : ''}<div class="pc-h"><h1>${titulo}</h1><div class="pc-hr">${extra}</div></div>`;

  /** En el móvil, las secciones de escritorio se abren como página completa desde Ajustes. */
  function openPage(v) {
    mpage = true; FF.pageOpen = true; view = v;
    document.body.classList.add('pm');
    $('main').hidden = true; pcMain.hidden = false;
    render(); window.scrollTo(0, 0);
  }
  function closePage(silent) {
    mpage = false; FF.pageOpen = false;
    document.body.classList.remove('pm');
    if (!FF.pcActive) { pcMain.hidden = true; $('main').hidden = false; }
    if (!silent) FF.goMobile('set');
  }
  FF.closePage = closePage;
  FF.openPage = (v) => (FF.pcActive ? FF.pcGo(v) : openPage(v));

  /** gasto / devolución por categoría de un mes (para el desglose estilo Excel) */
  function catRows(mk, m) {
    const g = Object.create(null);
    data().gastos.forEach((x) => {
      if (C.monthKey(x.fecha) !== mk) return;
      const b = g[x.categoria] || (g[x.categoria] = { g: 0, d: 0 });
      if (x.tipo === C.TIPO_DEV) b.d += x.importe; else b.g += x.importe;
    });
    const fijoBy = Object.create(null);
    m.filas.forEach((f) => { fijoBy[f.cat] = f.fijo; });
    const nombres = cats().slice();
    Object.keys(g).forEach((n) => { if (!nombres.includes(n)) nombres.push(n); });
    const all = nombres.map((n) => { const b = g[n] || { g: 0, d: 0 }, fijo = fijoBy[n] || 0; return { cat: n, fijo, gasto: C.r2(b.g), dev: C.r2(b.d), neto: C.r2(fijo + b.g - b.d) }; });
    const tot = all.reduce((a, r) => ({ fijo: a.fijo + r.fijo, gasto: a.gasto + r.gasto, dev: a.dev + r.dev, neto: a.neto + r.neto }), { fijo: 0, gasto: 0, dev: 0, neto: 0 });
    return { all, tot: { fijo: C.r2(tot.fijo), gasto: C.r2(tot.gasto), dev: C.r2(tot.dev), neto: C.r2(tot.neto) } };
  }

  /* ------------------------------------------------------------------ 📊 CENTRO DE MANDO */
  function quickBar() {
    const q = st.q, extra = q.tipo === 'extra';
    const lista = extra ? (data().config.tiposExtra || []) : cats();
    return `<div class="card pc-quick">
      <div class="pc-qrow">
        <div><label class="f">Importe</label><input id="qImp" class="t" inputmode="decimal" placeholder="0,00" value="${esc(q.imp)}" autocomplete="off" style="text-align:right;font-weight:700"></div>
        <div class="pc-grow"><label class="f">Concepto</label><input id="qCon" class="t" list="qDl" placeholder="café, gasolina, figurita…" value="${esc(q.con)}" autocomplete="off"><datalist id="qDl"></datalist></div>
        <div class="pc-grow"><label class="f">${extra ? 'Tipo de ingreso' : 'Categoría'} ${q.auto ? '<span class="badge">auto ✨</span>' : ''}</label>
          <select id="qCat" class="t"><option value="">— elige —</option>${lista.map((c) => `<option ${c === q.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div><label class="f">Tipo</label><select id="qTipo" class="t"><option value="Gasto" ${q.tipo === 'Gasto' ? 'selected' : ''}>Gasto</option><option value="${C.TIPO_DEV}" ${q.tipo === C.TIPO_DEV ? 'selected' : ''}>↩ Devolución</option><option value="extra" ${extra ? 'selected' : ''}>＋ Ingreso extra</option></select></div>
        ${FF.payHas && FF.payHas() ? `<div><label class="f">Pagado con</label><select id="qPay" class="t">${FF.payOptions()}</select></div>` : ''}
        <div><label class="f">Fecha</label><input id="qFec" type="date" class="t" value="${esc(q.fec || hoy())}"></div>
        <div class="pc-btns"><button class="btn pri" id="qSave" type="button">💾 Guardar</button><button class="btn cam" id="qCam" type="button" title="Escanear un ticket con IA">📷</button></div>
      </div>
      <input type="file" id="pcCam" accept="image/*" hidden>
    </div>`;
  }

  function cmdView() {
    const mk = FF.ui.mk, m = C.computeMonth(data(), mk), cr = catRows(mk, m);
    const ex = Object.create(null);
    const tipos = (data().config.tiposExtra || []).slice();
    data().extras.filter((e) => C.monthKey(e.fecha) === mk).forEach((e) => { const k = tipos.includes(e.tipo) ? e.tipo : '❓ Extras sin tipo elegido'; ex[k] = C.r2((ex[k] || 0) + e.importe); });
    Object.keys(ex).forEach((t) => { if (!tipos.includes(t)) tipos.push(t); });
    const apartado = C.r2(m.filas.filter((f) => /inversi|colch/i.test(f.cat)).reduce((a, f) => a + f.total, 0));
    const totalSale = cr.tot.neto > 0 ? cr.tot.neto : 0;
    return head('📊 Centro de Mando', monthSelect()) + `
      <div class="pc-cards">
        <div class="pc-card g"><div class="l">💵 GANADO (sueldo + extras)</div><div class="v">${esc(fmt(m.entra))}</div><div class="s">Sueldo ${esc(fmt(m.sueldo))} + extras ${esc(fmt(m.extras))}</div></div>
        <div class="pc-card o"><div class="l">💸 GASTADO (fijos + suscripciones + día a día)</div><div class="v">${esc(fmt(m.sale))}</div><div class="s">Fijos ${esc(fmt(m.fijos))} + día a día ${esc(fmt(m.dia))}</div></div>
        <div class="pc-card b"><div class="l">🔥 ME QUEDA LIBRE</div><div class="v" style="${m.queda < 0 ? 'color:var(--bad)' : ''}">${esc(fmt(m.queda))}</div><div class="s">Lo ganado menos lo gastado</div></div>
      </div>
      ${semaforo(m)}
      ${apartado > 0 ? `<div class="small" style="margin:-6px 2px 14px;color:var(--acc2)">💪 De lo gastado, <b>${esc(fmt(apartado))}</b> es inversión y ahorro: no se pierde, es tuyo${m.entra > 0 ? ` (${Math.round((apartado / m.entra) * 100)}% de lo ganado)` : ''}.</div>` : ''}
      ${quickBar()}
      ${avisosCard(m)}
      <div class="pc-grid2">
        <div class="card"><h2>1 · Lo ganado este mes</h2>
          <table class="tbl"><thead><tr><th>Concepto</th><th class="r">Importe</th></tr></thead><tbody>
            <tr><td>💵 Mi sueldo del mes</td><td class="r">${esc(fmt(m.sueldo))}</td></tr>
            ${tipos.map((t) => `<tr><td>${esc(t)}</td><td class="r">${esc(fmt(ex[t] || 0))}</td></tr>`).join('')}
            <tr class="tot"><td>💰 TOTAL GANADO</td><td class="r">${esc(fmt(m.entra))}</td></tr></tbody></table></div>
        <div class="card"><h2>2 · Lo gastado este mes, por categorías</h2>
          <table class="tbl"><thead><tr><th>Categoría</th><th class="r">⚙️ Fijo</th><th class="r">📝 Día a día</th><th class="r">🔄 Devol.</th><th class="r">Gasto neto</th><th class="r">%</th></tr></thead><tbody>
            ${cr.all.map((r) => { const z = !r.fijo && !r.gasto && !r.dev; const bs = C.budgetStatus({ presupuesto: (catObjs().find((c) => c.nombre === r.cat) || {}).presupuesto, total: r.neto }); return `<tr class="${z ? 'zero' : ''}"><td>${esc(r.cat)}${bs ? `<div class="bud ${bs.nivel}" title="${Math.round(bs.pct * 100)}% del presupuesto"><i style="width:${Math.min(100, bs.pct * 100).toFixed(0)}%"></i></div>` : ''}</td><td class="r">${esc(fmt(r.fijo))}</td><td class="r">${esc(fmt(r.gasto))}</td><td class="r">${esc(fmt(r.dev))}</td>
              <td class="r nb"><span class="nbar" style="width:${totalSale > 0 && r.neto > 0 ? Math.min(100, (r.neto / totalSale) * 100 * 1.6).toFixed(1) : 0}%"></span><b>${esc(fmt(r.neto))}</b></td><td class="r mut">${totalSale > 0 && r.neto > 0 ? Math.round((r.neto / totalSale) * 100) + '%' : ''}</td></tr>`; }).join('')}
            <tr class="tot"><td>TOTAL GASTADO</td><td class="r">${esc(fmt(cr.tot.fijo))}</td><td class="r">${esc(fmt(cr.tot.gasto))}</td><td class="r">${esc(fmt(cr.tot.dev))}</td><td class="r">${esc(fmt(cr.tot.neto))}</td><td></td></tr></tbody></table></div>
      </div>`;
  }

  /* ------------------------------------------------------------------ 📝 GASTOS (tabla editable) */
  function mesesConDatos() {
    const s = new Set([C.monthKey(hoy()), FF.ui.mk]);
    data().gastos.forEach((g) => { if (g.fecha) s.add(C.monthKey(g.fecha)); });
    return [...s].sort().reverse();
  }

  function gastosFiltrados(kind) {
    const mes = st.gMes || FF.ui.mk;
    const q = C.norm(st.gQ);
    let lista = data().gastos.slice();
    if (kind === 'dev') lista = lista.filter((g) => g.tipo === C.TIPO_DEV);
    if (mes !== 'todos') lista = lista.filter((g) => C.monthKey(g.fecha) === mes);
    if (q) lista = C.searchGastos(lista, st.gQ).map((r) => r.g);
    return lista.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }

  const sumaNeta = (l) => C.r2(l.reduce((a, g) => a + (g.tipo === C.TIPO_DEV ? -g.importe : g.importe), 0));

  function gastoRow(g) {
    const opts = cats().includes(g.categoria) || !g.categoria ? cats() : cats().concat([g.categoria]);
    const t = g.items ? C.parseItems(g.items) : null;
    return `<tr data-row="${esc(g.id)}" class="${g.tipo === C.TIPO_DEV ? 'dev' : ''}">
      <td><input type="date" class="cell" data-id="${esc(g.id)}" data-f="fecha" value="${esc(g.fecha)}"></td>
      <td><select class="cell" data-id="${esc(g.id)}" data-f="categoria">${g.categoria ? '' : '<option value="">— sin categoría —</option>'}${opts.map((c) => `<option ${c === g.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
      <td><input type="number" step="0.01" min="0" class="cell r" data-id="${esc(g.id)}" data-f="importe" value="${g.importe}"></td>
      <td><select class="cell" data-id="${esc(g.id)}" data-f="tipo"><option value="Gasto" ${g.tipo !== C.TIPO_DEV ? 'selected' : ''}>Gasto</option><option value="${C.TIPO_DEV}" ${g.tipo === C.TIPO_DEV ? 'selected' : ''}>↩ Devolución</option></select></td>
      <td><input type="text" class="cell" data-id="${esc(g.id)}" data-f="detalle" value="${esc(g.detalle)}"></td>
      <td class="acc">${t ? `<button class="ib" data-tk="${esc(g.id)}" title="Ver el ticket desglosado">🧾</button>` : ''}<button class="ib" data-del="${esc(g.id)}" title="Eliminar">🗑</button></td></tr>`;
  }

  function gastosView(kind = 'gastos') {
    const dev = kind === 'dev';
    const mes = st.gMes || FF.ui.mk, lista = gastosFiltrados(kind), vis = lista.slice(0, st.gLimit);
    const opts = ['todos'].concat(mesesConDatos());
    return head(dev ? '🔄 Devoluciones' : '📝 Gastos', `<select id="gMes" class="t pc-sel">${opts.map((o) => `<option value="${o}" ${o === mes ? 'selected' : ''}>${o === 'todos' ? 'Todos los meses' : C.monthLabel(o)}</option>`).join('')}</select>
      <input id="gQ" class="t pc-sel" type="search" placeholder="🔎 Buscar (también dentro de tickets)" value="${esc(st.gQ)}" style="min-width:260px">`) + `
      ${FF.payHas && FF.payHas() ? `<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 16px"><label class="f" for="nPay" style="margin:0">💳 Pagado con (para el gasto nuevo de la fila de abajo)</label><select id="nPay" class="t" style="max-width:340px">${FF.payOptions()}</select></div>` : ''}
      <div class="card" style="padding:0;overflow:auto">
        <table class="tbl grid"><thead><tr><th style="width:140px">Fecha</th><th style="min-width:260px">Categoría</th><th class="r" style="width:120px">Importe €</th><th style="width:140px">Tipo</th><th>Detalle</th><th style="width:90px"></th></tr></thead>
        <tbody>
          <tr class="newrow"><td><input type="date" class="cell" id="nFec" value="${esc(st.q.fec || hoy())}"></td>
            <td><select class="cell" id="nCat"><option value="">— categoría —</option>${cats().map((c) => `<option>${esc(c)}</option>`).join('')}</select></td>
            <td><input type="number" step="0.01" min="0" class="cell r" id="nImp" placeholder="0,00"></td>
            <td><select class="cell" id="nTipo">${dev ? '' : '<option value="Gasto">Gasto</option>'}<option value="${C.TIPO_DEV}">↩ Devolución</option></select></td>
            <td><input type="text" class="cell" id="nDet" placeholder="Detalle (Enter para guardar)"></td>
            <td class="acc"><button class="ib add" id="nAdd" title="Añadir">＋</button></td></tr>
          ${vis.map(gastoRow).join('') || '<tr><td colspan="6" class="empty">Sin gastos en este periodo.</td></tr>'}
        </tbody>
        <tfoot><tr class="tot"><td colspan="2">${lista.length} gasto${lista.length === 1 ? '' : 's'}${lista.length > vis.length ? ` (se muestran ${vis.length})` : ''}</td><td class="r" id="gTot">${esc(fmt(dev ? C.r2(lista.reduce((a, g) => a + g.importe, 0)) : sumaNeta(lista)))}</td><td colspan="3" class="mut">${dev ? 'Total devuelto (resta de tu gasto)' : 'Total neto (restando devoluciones)'}</td></tr></tfoot></table>
      </div>
      ${lista.length > vis.length ? '<button class="btn sec" id="gMore" style="margin-top:12px;max-width:260px">Ver más</button>' : ''}`;
  }

  /* ------------------------------------------------------------------ 🚀 EXTRAS */
  function extrasView() {
    const lista = data().extras.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)), vis = lista.slice(0, 200);
    const tipos = data().config.tiposExtra || [], tarifa = data().config.tarifaHora;
    const payBar = FF.payHas && FF.payHas() ? `<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 16px"><label class="f" for="xPay" style="margin:0">💳 Ingresar en (para el extra nuevo)</label><select id="xPay" class="t" style="max-width:340px">${FF.payOptions('— No sumar a ninguna cuenta —')}</select></div>` : '';
    return head('🚀 Extras · horas extra y otros trabajos') + payBar + `<div class="small mut" style="margin:0 4px 12px">Apunta aquí lo que ganas aparte del sueldo. Para horas: nº de horas × € por hora. Si es un pago cerrado, usa “Pago fijo”. También puedes combinar las dos.</div>
      <div class="card" style="padding:0;overflow:auto"><table class="tbl grid"><thead><tr><th style="width:140px">Fecha</th><th style="min-width:220px">Tipo de extra</th><th class="r" style="width:100px">Nº horas</th><th class="r" style="width:110px">€ por hora</th><th class="r" style="width:120px">Pago fijo €</th><th class="r" style="width:120px">Total</th><th>Detalle</th><th style="width:50px"></th></tr></thead><tbody>
      <tr class="newrow"><td><input type="date" class="cell" id="xFec" value="${esc(st.x.fec || hoy())}"></td>
        <td><select class="cell" id="xTipo"><option value="">— tipo —</option>${tipos.map((t) => `<option>${esc(t)}</option>`).join('')}</select></td>
        <td><input type="number" step="0.25" min="0" class="cell r" id="xHor" placeholder="0"></td>
        <td><input type="number" step="0.01" min="0" class="cell r" id="xTar" placeholder="0,00" value="${tarifa != null ? tarifa : ''}"></td>
        <td><input type="number" step="0.01" min="0" class="cell r" id="xImp" placeholder="0,00"></td>
        <td class="r"><b id="xTot">0,00 €</b></td>
        <td><input type="text" class="cell" id="xDet" placeholder="Detalle (Enter para guardar)"></td>
        <td class="acc"><button class="ib add" id="xAdd" title="Añadir">＋</button></td></tr>
      ${vis.map((e) => `<tr><td>${esc(e.fecha)}</td><td colspan="4">${esc(e.tipo || '❓ sin tipo')}</td><td class="r"><b>${esc(fmt(e.importe))}</b></td><td>${esc(e.detalle)}</td><td class="acc"><button class="ib" data-xdel="${esc(e.id)}" title="Eliminar">🗑</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Aún no hay extras.</td></tr>'}
      </tbody><tfoot><tr class="tot"><td colspan="5">${lista.length} extra${lista.length === 1 ? '' : 's'}${lista.length > vis.length ? ` (se muestran ${vis.length})` : ''}</td><td class="r">${esc(fmt(C.r2(lista.reduce((a, e) => a + e.importe, 0))))}</td><td colspan="2"></td></tr></tfoot></table></div>`;
  }

  /* ------------------------------------------------------------------ 📅 RESUMEN DEL AÑO */
  function anioView() {
    const Y = st.anio, hoyMk = C.monthKey(hoy());
    const meses = Array.from({ length: 12 }, (_, i) => `${Y}-${String(i + 1).padStart(2, '0')}`);
    const lim = st.hasta ? hoyMk : '9999-99';                                // "Hasta hoy": los meses que aún no han llegado cuentan como vacíos
    const vacio = (m) => ({ ...m, sueldo: 0, extras: 0, entra: 0, fijos: 0, subs: 0, dia: 0, sale: 0, queda: 0, filas: m.filas.map((f) => ({ ...f, fijo: 0, dia: 0, total: 0 })) });
    const ms = meses.map((mk) => (mk > lim ? vacio(C.computeMonth(data(), mk)) : C.computeMonth(data(), mk)));
    const apart = (m) => m.filas.filter((f) => /inversi|colch/i.test(f.cat)).reduce((a, f) => a + f.total, 0);
    const filas = [
      ['💵 Mi sueldo', (m) => m.sueldo, ''], ['🚀 Dinero extra', (m) => m.extras, ''], ['💰 TOTAL GANADO', (m) => m.entra, 'tot g'],
      ['⚙️ Gastos fijos', (m) => m.fijos - m.subs, ''], ['🎮 Suscripciones', (m) => m.subs, ''], ['📝 Día a día (menos devoluciones)', (m) => m.dia, ''],
      ['💸 TOTAL GASTADO', (m) => m.sale, 'tot o'], ['🔥 ME QUEDA LIBRE', (m) => m.queda, 'tot b'], ['💪 Apartado (inversión + ahorro)', apart, 'ap'],
    ];
    const celda = (v, mk, neg) => `<td class="r ${mk > hoyMk ? 'fut' : ''}" ${neg && v < 0 ? 'style="color:var(--bad);font-weight:700"' : ''}>${v === 0 ? '<span class="mut">–</span>' : esc(fmt(v))}</td>`;
    const totalAnio = ms.reduce((a, m) => a + m.sale, 0);
    const sv = C.savingsSeries(data(), `${Y}-12`), svBy = {}; sv.filas.forEach((f) => { if (f.mk <= lim) svBy[f.mk] = f; });
    sv.filas = sv.filas.filter((f) => f.mk <= lim);
    const dash = (v, i, cls) => (v == null ? '<td class="r mut">–</td>' : `<td class="r ${meses[i] > hoyMk ? 'fut' : ''}">${esc(cls === 'pct' ? Math.round(v * 100) + '%' : fmt(v))}</td>`);
    const svRows = sv.desde ? `
        <tr class="ap"><td>📈 % del sueldo+extras</td>${ms.map((m, i) => dash(m.entra > 0 ? apart(m) / m.entra : null, i, 'pct')).join('')}<td></td></tr>
        <tr class="g"><td>💰 Ahorrado en el mes</td>${meses.map((mk, i) => dash(svBy[mk] ? svBy[mk].ahorrado : null, i)).join('')}<td class="r"><b>${esc(fmt(C.r2(sv.filas.reduce((a, f) => a + f.ahorrado, 0))))}</b></td></tr>
        <tr class="tot b"><td>🏦 MIS AHORROS A FINAL DE MES</td>${meses.map((mk, i) => dash(svBy[mk] ? svBy[mk].acumulado : null, i)).join('')}<td></td></tr>
        <tr class="ap"><td>🌅 Empiezo el mes con (del mes anterior)</td>${meses.map((mk, i) => dash(svBy[mk] ? C.r2(svBy[mk].acumulado - svBy[mk].ahorrado) : null, i)).join('')}<td></td></tr>` : '';
    return head('📅 Resumen del Año', `<div class="seg" style="min-width:250px"><button data-hasta="1" class="${st.hasta ? 'on' : ''}">Hasta hoy</button><button data-hasta="0" class="${st.hasta ? '' : 'on'}">Año completo</button></div><button class="nav-btn" data-y="-1" aria-label="Año anterior">‹</button><b style="min-width:60px;text-align:center;font-size:20px">${Y}</b><button class="nav-btn" data-y="1" aria-label="Año siguiente">›</button>`) + `
      <div class="card" style="padding:0;overflow:auto"><table class="tbl yr"><thead><tr><th style="min-width:250px">Concepto</th>${meses.map((mk, i) => `<th class="r">${mesCorto(i + 1)}</th>`).join('')}<th class="r">TOTAL ${Y}</th></tr></thead><tbody>
        ${filas.map(([n, f, cls]) => `<tr class="${cls}"><td>${esc(n)}</td>${ms.map((m, i) => celda(C.r2(f(m)), meses[i], cls.includes('b'))).join('')}<td class="r"><b>${esc(fmt(C.r2(ms.reduce((a, m) => a + f(m), 0))))}</b></td></tr>`).join('')}
        ${svRows}
      </tbody></table></div>
      <div class="small mut" style="margin:8px 4px 16px">${st.hasta ? 'Solo cuenta hasta el mes actual. Pulsa “Año completo” para ver también la previsión de los meses que faltan.' : 'Los meses futuros (en cursiva) son una previsión: repiten tu sueldo y tus gastos fijos.'}</div>
      <div class="card" style="padding:0;overflow:auto"><div style="padding:14px 14px 0"><h2>🧾 Gasto por categoría en el año</h2></div><table class="tbl yr"><thead><tr><th style="min-width:250px">Categoría</th>${meses.map((mk, i) => `<th class="r">${mesCorto(i + 1)}</th>`).join('')}<th class="r">TOTAL</th><th class="r">%</th></tr></thead><tbody>
        ${(() => {
    const nombres = cats().slice(); ms.forEach((m) => m.filas.forEach((f) => { if (!nombres.includes(f.cat)) nombres.push(f.cat); }));
    return nombres.map((n) => {
      const vals = ms.map((m) => { const f = m.filas.find((x) => x.cat === n); return f ? f.total : 0; });
      const tot = C.r2(vals.reduce((a, b) => a + b, 0));
      return `<tr class="${tot === 0 ? 'zero' : ''}"><td>${esc(n)}</td>${vals.map((v, i) => celda(C.r2(v), meses[i], false)).join('')}<td class="r"><b>${esc(fmt(tot))}</b></td><td class="r mut">${totalAnio > 0 && tot > 0 ? Math.round((tot / totalAnio) * 100) + '%' : ''}</td></tr>`;
    }).join('');
  })()}
        <tr class="tot"><td>TOTAL GASTADO</td>${ms.map((m, i) => celda(m.sale, meses[i], false)).join('')}<td class="r">${esc(fmt(C.r2(totalAnio)))}</td><td></td></tr></tbody></table></div>`;
  }

  /* ------------------------------------------------------------------ 🔄 DEVOLUCIONES (misma tabla que Gastos, solo devoluciones) */
  function devView() { return gastosView('dev'); }

  /* ------------------------------------------------------------------ 🏦 AHORROS */
  function ahorrosView() {
    const [Y, M] = FF.ui.mk.split('-').map(Number), hoyMk = C.monthKey(hoy());
    const a = data().config.ahorros || {}, ser = C.savingsSeries(data(), FF.ui.mk), all = C.savingsSeries(data(), `${Y}-12`);
    const [dY, dM] = (a.desde || hoyMk).split('-').map(Number);
    const por = {}; all.filas.forEach((f) => { por[f.mk] = f; });
    const meses = Array.from({ length: 12 }, (_, i) => `${Y}-${String(i + 1).padStart(2, '0')}`);
    const cell = (v, mk) => (v == null ? '<td class="r mut">–</td>' : `<td class="r ${mk > hoyMk ? 'fut' : ''}">${esc(fmt(v))}</td>`);
    return head('🏦 Mis Ahorros', monthSelect()) + `
      <div class="pc-cards">
        <div class="pc-card g"><div class="l">🏦 MIS AHORROS (a final de ${esc(C.MESES[M - 1].toLowerCase())})</div><div class="v">${esc(fmt(ser.actual))}</div><div class="s">Se actualiza solo con lo que ahorras cada mes</div></div>
        <div class="pc-card b"><div class="l">📈 AHORRADO EN EL AÑO (hasta ese mes)</div><div class="v">${esc(fmt(ser.enAnio))}</div><div class="s">Ganado − gastado + lo apartado (inversión + colchón)</div></div>
        <div class="pc-card o"><div class="l">🧮 AHORRADO DESDE QUE EMPECÉ</div><div class="v">${esc(fmt(ser.desdeInicio))}</div><div class="s">Sin contar lo que ya tenías</div></div>
      </div>
      <div class="card"><h2>✍️ Solo 2 casillas</h2>
        <div class="pc-qrow">
          <div><label class="f">💰 Mis ahorros AHORA (€) — lo que tienes hoy</label><input id="aBase" type="number" step="0.01" class="t" value="${a.base != null ? a.base : ''}" placeholder="0 si empiezas de cero" style="text-align:right"></div>
          <div><label class="f">📅 Empiezo a contar desde</label><div style="display:flex;gap:8px"><select id="aMes" class="t">${C.MESES.map((n, i) => `<option value="${i + 1}" ${i + 1 === dM ? 'selected' : ''}>${n}</option>`).join('')}</select>
            <select id="aAnio" class="t">${yearsList().concat([dY]).filter((x, i, l) => l.indexOf(x) === i).sort().map((y) => `<option ${y === dY ? 'selected' : ''}>${y}</option>`).join('')}</select></div></div>
          <div class="pc-btns"><button class="btn pri" id="aSave" type="button">💾 Guardar</button></div>
        </div>
        <p class="small mut" style="margin:10px 0 0">${a.desde ? '' : '⚠️ Aún no has puesto desde cuándo cuentas: sin eso no se calcula nada. '}Al cambiar de año los ahorros siguen: el 1 de enero empiezas con lo que tenías a 31 de diciembre.</p></div>
      ${metasCard()}
      <div class="card" style="padding:0;overflow:auto"><table class="tbl yr"><thead><tr><th>${Y}</th><th class="r">💵 Ganado</th><th class="r">💸 Gastado</th><th class="r">💪 Apartado</th><th class="r">💰 Ahorrado en el mes</th><th class="r">🏦 Ahorros a final de mes</th></tr></thead><tbody>
        ${meses.map((mk, i) => { const f = por[mk]; return `<tr><td>${esc(C.MESES[i])}</td>${cell(f ? f.entra : null, mk)}${cell(f ? f.sale : null, mk)}${cell(f ? f.apartado : null, mk)}${cell(f ? f.ahorrado : null, mk)}${cell(f ? f.acumulado : null, mk)}</tr>`; }).join('')}
      </tbody></table></div>`;
  }

  /* ------------------------------------------------------------------ 🤝 DEUDAS */
  function deudasView() {
    const lista = data().config.deudas || [], t = C.debtTotals(lista);
    const sec = (tipo, titulo, sub) => {
      const filas = lista.filter((d) => d.tipo === tipo).sort((x, y) => (x.fecha < y.fecha ? 1 : -1));
      return `<div class="card" style="padding:0;overflow:auto"><div style="padding:14px 14px 0"><h2>${titulo}</h2><div class="small mut" style="margin:-4px 0 8px">${sub}</div></div>
        <table class="tbl grid"><thead><tr><th style="width:140px">Fecha</th><th>Persona</th><th>Motivo</th><th class="r" style="width:120px">Importe €</th><th class="r" style="width:150px">Devuelto hasta ahora €</th><th class="r" style="width:110px">Pendiente</th><th style="width:130px">Estado</th><th style="width:50px"></th></tr></thead><tbody>
        <tr class="newrow" data-new="${tipo}"><td><input type="date" class="cell" data-n="fecha" value="${esc(hoy())}"></td><td><input type="text" class="cell" data-n="persona" placeholder="Quién"></td><td><input type="text" class="cell" data-n="motivo" placeholder="Motivo"></td>
          <td><input type="number" step="0.01" min="0" class="cell r" data-n="importe" placeholder="0,00"></td><td><input type="number" step="0.01" min="0" class="cell r" data-n="devuelto" placeholder="0,00"></td><td></td><td></td><td class="acc"><button class="ib add" data-dadd="${tipo}" title="Añadir">＋</button></td></tr>
        ${filas.map((d) => { const p = C.pendiente(d); return `<tr><td><input type="date" class="cell" data-d="${esc(d.id)}" data-f="fecha" value="${esc(d.fecha)}"></td><td><input type="text" class="cell" data-d="${esc(d.id)}" data-f="persona" value="${esc(d.persona)}"></td>
          <td><input type="text" class="cell" data-d="${esc(d.id)}" data-f="motivo" value="${esc(d.motivo)}"></td><td><input type="number" step="0.01" min="0" class="cell r" data-d="${esc(d.id)}" data-f="importe" value="${d.importe}"></td>
          <td><input type="number" step="0.01" min="0" class="cell r" data-d="${esc(d.id)}" data-f="devuelto" value="${d.devuelto || 0}"></td><td class="r"><b>${esc(fmt(p))}</b></td>
          <td>${p <= 0 ? '✅ Saldado' : tipo === 'me_deben' ? '⏳ Me debe' : '⏳ Lo debo'}</td><td class="acc"><button class="ib" data-ddel="${esc(d.id)}" title="Eliminar">🗑</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Nada apuntado.</td></tr>'}
        </tbody></table></div>`;
    };
    return head('🤝 Deudas · quién me debe y a quién debo') + `
      <div class="pc-cards">
        <div class="pc-card g"><div class="l">🟢 ME DEBE (a mi favor)</div><div class="v">${esc(fmt(t.meDeben))}</div><div class="s">Lo que aún me tienen que devolver</div></div>
        <div class="pc-card o"><div class="l">🔴 DEBO (a pagar)</div><div class="v">${esc(fmt(t.debo))}</div><div class="s">Lo que aún tengo que devolver</div></div>
        <div class="pc-card b"><div class="l">⚖️ BALANCE</div><div class="v" style="${t.balance < 0 ? 'color:var(--bad)' : ''}">${esc(fmt(t.balance))}</div><div class="s">Positivo: te deben más de lo que debes</div></div>
      </div>
      <div class="small mut" style="margin:0 4px 12px">Cuando prestes dinero, apunta una línea. Cuando te lo devuelvan, súmalo en “Devuelto hasta ahora”: el pendiente se calcula solo.</div>
      ${sec('me_deben', '🟢 1. Dinero que he prestado (me lo debe)', 'Quién me debe dinero')}
      ${sec('debo', '🔴 2. Dinero que me han prestado (lo debo)', 'A quién debo dinero')}`;
  }

  /* ------------------------------------------------------------------ ⚙️ PILOTO (sueldo, fijos, suscripciones, tipos de extra) */
  const catObjs = () => (data().config.categorias || []).map((c) => (typeof c === 'string' ? { nombre: c, presupuesto: null } : c));
  const serieUpsert = (serie, mk, importe) => {
    const s = (serie || []).filter((e) => e.desde !== mk);
    s.push({ desde: mk, importe });
    return s.sort((a, b) => (a.desde < b.desde ? -1 : 1));
  };

  const SUBF = ['nombre', 'importe', 'cada', 'personas', 'dia', 'desde', 'categoria', 'cuenta', 'activa'];
  const ensureAuto = () => { if (!data().config.autoDesde) FF.setConfig('autoDesde', hoy()); };
  const accOpts = (cur, vacio) => `<option value="">${esc(vacio)}</option>${(data().config.cuentas || []).map((c) => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}`;
  const nextCharge = (s) => C.upcomingCharges({ suscripciones: [s] }, hoy(), 1)[0];
  const ddmm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

  function pilotoView() {
    const mk = st.pil || FF.ui.mk, [Y, M] = mk.split('-').map(Number), cfg = data().config, ex = cfg.fuente === 'excel';
    const sel = `<select id="pMes" class="t pc-sel">${C.MESES.map((n, i) => `<option value="${i + 1}" ${i + 1 === M ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <select id="pAnio" class="t pc-sel">${yearsList().concat([Y]).filter((x, i, l) => l.indexOf(x) === i).sort().map((y) => `<option ${y === Y ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
    const desdeDe = (serie) => { let b = null; (serie || []).forEach((e) => { if (e.desde <= mk && (!b || e.desde >= b.desde)) b = e; }); return b ? C.monthLabel(b.desde) : '—'; };
    const inp = (key, serie) => `<input type="number" step="0.01" min="0" class="cell r" data-pil="${esc(key)}" value="${C.effectiveAt(serie, mk)}" ${ex ? 'disabled' : ''}>`;
    if (ex) return head('⚙️ Piloto') + '<div class="card">Tu hoja está en <b>modo Excel</b>: el sueldo, los gastos fijos, las suscripciones y los tipos de extra se editan en la pestaña <b>⚙️ Piloto Automático</b> de tu Google Sheet y la app los lee de allí.</div>';
    const cats = catObjs(), subs = cfg.suscripciones || [], modoCobro = cfg.subsModo === 'cobro';
    const mesActual = C.monthKey(hoy());
    const catOpts = (cur) => `<option value="">Suscripciones (por defecto)</option>${cats.filter((c) => !/suscripci/i.test(c.nombre)).map((c) => `<option ${c.nombre === cur ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}`;
    const subTot = C.subsForMonth(cfg, mk, cats.map((c) => c.nombre)).total;
    return head('⚙️ Piloto Automático · lo que se repite', `<span class="mut small">Los cambios valen a partir de:</span>${sel}`) + `
      <div class="small mut" style="margin:0 4px 12px">Escribe el importe en el mes en el que cambia: <b>se queda así todos los meses siguientes</b> (igual que en el Excel). Para cambiarlo más adelante, elige ese mes arriba y escribe el nuevo importe. El <b>presupuesto</b> es lo máximo que quieres gastar al mes en esa categoría: la app te avisa al llegar al 80 %.</div>
      ${(cfg.cuentas || []).length ? `<div class="card" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 16px"><b>💵 Mi sueldo entra en</b><select id="pSueldoCta" class="t" style="max-width:260px">${accOpts((cfg.sueldoCuenta || {}).id, '— no sumarlo a ninguna cuenta —')}</select><span>el día</span><input id="pSueldoDia" type="number" min="1" max="31" class="t" value="${(cfg.sueldoCuenta || {}).dia || 1}" style="max-width:80px;text-align:right"><span class="small mut">Se suma solo ese día (desde que lo activas). Las suscripciones con cuenta se descuentan igual el día de su cobro.</span></div>` : '<div class="small mut" style="margin:0 4px 12px">💡 Crea tus cuentas en <b>💰 Mi dinero</b> para que el sueldo y las suscripciones se sumen y descuenten solos.</div>'}
      <div class="card" style="padding:0;overflow:auto"><table class="tbl grid"><thead><tr><th style="min-width:280px">Concepto</th><th class="r" style="width:170px">Importe/mes desde ${esc(C.MESES[M - 1].slice(0, 3))} ${Y}</th><th style="width:150px">Vigente desde</th><th class="r" style="width:150px">🚦 Presupuesto/mes</th><th style="width:50px"></th></tr></thead><tbody>
        <tr><td><b>💵 Mi sueldo (lo que cobro cada mes)</b></td><td>${inp('__sueldo', cfg.sueldo)}</td><td class="mut">${esc(desdeDe(cfg.sueldo))}</td><td></td><td></td></tr>
        ${cats.map((c) => { const pres = `<td><input type="number" step="1" min="0" class="cell r" data-pres="${esc(c.nombre)}" value="${c.presupuesto != null ? c.presupuesto : ''}" placeholder="sin límite"></td>`; return /suscripci/i.test(c.nombre)
    ? `<tr><td>${esc(c.nombre)}</td><td class="r mut">${esc(fmt(subTot))}</td><td class="mut">automático (tabla de abajo)</td>${pres}<td></td></tr>`
    : `<tr><td>${esc(c.nombre)}</td><td>${inp(c.nombre, (cfg.fijos || {})[c.nombre])}</td><td class="mut">${esc(desdeDe((cfg.fijos || {})[c.nombre]))}</td>${pres}<td class="acc"><button class="ib" data-catdel="${esc(c.nombre)}" title="Quitar categoría">🗑</button></td></tr>`; }).join('')}
        <tr class="newrow"><td><input type="text" class="cell" id="pCatNew" placeholder="➕ Nueva categoría (con emoji, ej. 🐶 Mascotas)"></td><td></td><td></td><td></td><td class="acc"><button class="ib add" id="pCatAdd" title="Añadir categoría">＋</button></td></tr>
      </tbody></table></div>
      <div class="small mut" style="margin:6px 4px 16px">Las categorías que quites no borran sus gastos: pasarán a “Sin categoría”. Para renombrar una, créala nueva y recategoriza sus gastos.</div>

      <div class="card" style="padding:0;overflow:auto"><div style="padding:14px 14px 0"><h2>🎮 Mis suscripciones y pagos periódicos</h2>
        <div class="small mut" style="margin:-4px 0 10px">Mensuales, trimestrales, semestrales, anuales o <b>cada N meses</b>. Si la compartes, pon entre cuántas personas (tú incluido) y se cuenta solo <b>tu parte</b>. “Desde” es el mes de un cobro (el primero o cualquiera) y de ahí se cuentan los siguientes.</div>
        <label class="f">Cómo contarlas en tu mes</label>
        <select id="pModo" class="t pc-sel" style="margin-bottom:10px"><option value="prorrateo" ${modoCobro ? '' : 'selected'}>Repartidas: cada mes una parte (una anual de 120 € = 10 € al mes)</option><option value="cobro" ${modoCobro ? 'selected' : ''}>En el mes del cobro: el importe entero cuando toca (120 € en marzo)</option></select></div>
        <table class="tbl grid"><thead><tr><th style="min-width:170px">Nombre</th><th class="r" style="width:110px">Importe del cobro €</th><th class="r" style="width:90px" title="1 = mensual · 3 = trimestral · 6 = semestral · 12 = anual · o los meses que sean">Cada (meses)</th><th class="r" style="width:90px">Personas</th><th class="r" style="width:100px">Tu parte €</th><th class="r" style="width:70px">Día</th><th style="width:140px">Desde</th><th style="min-width:190px">Categoría</th><th style="min-width:170px" title="Cuenta de la que se descuenta el día del cobro">💳 Se carga en</th><th style="width:110px">Próximo cobro</th><th style="width:70px">¿Activa?</th><th style="width:50px"></th></tr></thead><tbody>
        <tr class="newrow"><td><input type="text" class="cell" id="pSubN" placeholder="➕ Netflix, seguro, gym…"></td><td><input type="number" step="0.01" min="0" class="cell r" id="pSubI" placeholder="0,00"></td>
          <td><input type="number" step="1" min="1" class="cell r" id="pSubC" value="1" list="pCadaDl"></td><td><input type="number" step="1" min="1" class="cell r" id="pSubP" value="1"></td><td></td>
          <td><input type="number" step="1" min="1" max="31" class="cell r" id="pSubD" value="1"></td><td><input type="month" class="cell" id="pSubM" value="${mesActual}"></td>
          <td><select class="cell" id="pSubK">${catOpts('')}</select></td><td><select class="cell" id="pSubA">${accOpts('', '— ninguna —')}</select></td><td></td><td></td><td class="acc"><button class="ib add" id="pSubAdd" title="Añadir">＋</button></td></tr>
        ${subs.map((s, i) => { const nx = nextCharge(s); return `<tr class="${s.activa === false ? 'zero' : ''}"><td><input type="text" class="cell" data-sub="${i}" data-f="nombre" value="${esc(s.nombre)}"></td>
          <td><input type="number" step="0.01" min="0" class="cell r" data-sub="${i}" data-f="importe" value="${s.importe}"></td>
          <td><input type="number" step="1" min="1" class="cell r" data-sub="${i}" data-f="cada" value="${C.subEvery(s)}" list="pCadaDl" title="${esc(C.subPeriodo(s))}"></td>
          <td><input type="number" step="1" min="1" class="cell r" data-sub="${i}" data-f="personas" value="${Math.max(1, Math.floor(Number(s.personas) || 1))}"></td>
          <td class="r"><b>${esc(fmt(C.subShare(s)))}</b></td>
          <td><input type="number" step="1" min="1" max="31" class="cell r" data-sub="${i}" data-f="dia" value="${s.dia || 1}"></td>
          <td><input type="month" class="cell" data-sub="${i}" data-f="desde" value="${esc(s.desde || '')}"></td>
          <td><select class="cell" data-sub="${i}" data-f="categoria">${catOpts(s.categoria || '')}</select></td>
          <td><select class="cell" data-sub="${i}" data-f="cuenta">${accOpts(s.cuenta || '', '— ninguna —')}</select></td>
          <td class="mut">${nx ? esc(ddmm(nx.fecha)) + ' · ' + esc(fmt(nx.importe)) : '—'}</td>
          <td style="text-align:center"><input type="checkbox" data-sub="${i}" data-f="activa" ${s.activa !== false ? 'checked' : ''}></td><td class="acc"><button class="ib" data-subdel="${i}" title="Eliminar">🗑</button></td></tr>`; }).join('')}
        <tr class="tot"><td colspan="4">Cuentan en ${esc(C.monthLabel(mk))} (${modoCobro ? 'en el mes del cobro' : 'repartidas'})</td><td class="r">${esc(fmt(subTot))}</td><td colspan="7"></td></tr>
        </tbody></table><datalist id="pCadaDl"><option value="1">mensual</option><option value="3">trimestral</option><option value="6">semestral</option><option value="12">anual</option></datalist></div>

      <div class="pc-grid2" style="grid-template-columns:1fr 1fr">
        <div class="card"><h2>🚀 Mis tipos de dinero extra</h2><div class="chips" style="margin-bottom:10px">${(cfg.tiposExtra || []).map((t, i) => `<span class="chip" style="font-size:14px;padding:7px 12px">${esc(t)} <button data-tdel="${i}" aria-label="Quitar" style="color:var(--bad);margin-left:6px">✕</button></span>`).join('') || '<span class="mut small">Aún no hay tipos.</span>'}</div>
          <div style="display:flex;gap:8px"><input id="pTipoN" class="t" placeholder="➕ Nuevo tipo (ej. ⏱️ Horas extra)" style="padding:9px 12px;font-size:15px"><button class="ib add" id="pTipoAdd" style="width:44px;height:44px" title="Añadir">＋</button></div></div>
        <div class="card"><h2>⏱️ Tarifa por hora</h2><label class="f">Lo que cobras por hora extra (€). Se rellena sola en Extras.</label><input id="pTarifa" type="number" step="0.01" min="0" class="t" value="${cfg.tarifaHora != null ? cfg.tarifaHora : ''}" placeholder="0,00" style="text-align:right"></div>
      </div>`;
  }

  /** Presupuestos pasados y próximos cobros: lo que conviene ver nada más abrir. */
  function avisosCard(m) {
    const al = C.budgetAlerts(m), prox = C.upcomingCharges(data().config, hoy(), 5), corto = (n) => String(n).replace(/\s*\(.*$/, '');
    if (!al.length && !prox.length) return '';
    return `<div class="pc-grid2" style="grid-template-columns:${al.length && prox.length ? '1fr 1fr' : '1fr'};margin-bottom:14px">
      ${al.length ? `<div class="card" style="margin:0"><h2>🚦 Presupuestos</h2>${al.map((a) => `<div class="kv"><span>${a.nivel === 'pasado' ? '🚨' : '⚠️'} ${esc(corto(a.cat))}</span><b style="color:${a.nivel === 'pasado' ? 'var(--bad)' : 'var(--warn)'}">${Math.round(a.pct * 100)}% de ${esc(fmt(a.presupuesto))}</b></div>`).join('')}</div>` : ''}
      ${prox.length ? `<div class="card" style="margin:0"><h2>🗓️ Próximos cobros</h2>${prox.map((p) => `<div class="kv"><span>${esc(p.nombre)} <span class="mut small">${esc(ddmm(p.fecha))}${p.personas > 1 ? ` · tu parte de ${esc(fmt(p.total))} entre ${p.personas}` : ''}${p.cada > 1 ? ' · ' + esc(C.subPeriodo({ cada: p.cada })) : ''}</span></span><b>${esc(fmt(p.importe))}</b></div>`).join('')}</div>` : ''}
    </div>`;
  }

  /** Metas de ahorro con barra de progreso. */
  function metasCard() {
    const metas = data().config.metas || [], hm = C.monthKey(hoy());
    return `<div class="card"><h2>🎯 Mis metas de ahorro</h2>
      ${metas.map((g) => { const p = C.goalProgress(g, hm); return `<div style="margin-bottom:14px"><div class="kv" style="padding:0"><span><b>${esc(g.nombre)}</b> ${p.hecha ? '🎉' : ''}</span><b>${esc(fmt(g.aportado || 0))} <span class="mut small">de ${esc(fmt(g.objetivo))} · ${Math.round(p.pct * 100)}%</span></b></div>
        <div class="goalbar"><i style="width:${(p.pct * 100).toFixed(1)}%"></i></div>
        <div class="small mut" style="margin:4px 0 6px">${p.hecha ? '¡Conseguida!' : `Te faltan ${esc(fmt(p.falta))}`}${g.fecha ? ` · para ${esc(C.monthLabel(g.fecha))}${p.porMes != null && !p.hecha ? ` → ${esc(fmt(p.porMes))} al mes` : ''}` : ''}</div>
        <div style="display:flex;gap:8px;align-items:center"><input type="number" step="0.01" min="0" class="t" data-mi="${esc(g.id)}" placeholder="Aportar €" style="max-width:150px;padding:8px 10px;font-size:15px;text-align:right"><button class="btn sec" data-maport="${esc(g.id)}" style="width:auto;min-height:38px;padding:6px 14px;font-size:14px">＋ Aportar</button><button class="ib" data-mdel="${esc(g.id)}" title="Eliminar meta">🗑</button></div></div>`; }).join('') || '<div class="mut small" style="margin-bottom:10px">Aún no tienes metas: un viaje, un móvil, un colchón de emergencia…</div>'}
      <div class="pc-qrow" style="border-top:1px solid var(--line);padding-top:12px">
        <div class="pc-grow"><label class="f">Nueva meta</label><input id="mNom" class="t" placeholder="Viaje a Japón"></div>
        <div><label class="f">Objetivo €</label><input id="mObj" type="number" step="1" min="1" class="t" placeholder="500" style="text-align:right;max-width:130px"></div>
        <div><label class="f">Para cuándo (opcional)</label><input id="mFec" type="month" class="t"></div>
        <div class="pc-btns"><button class="btn pri" id="mAdd" type="button">🎯 Crear</button></div>
      </div></div>`;
  }

  /** Sin categorías no se puede apuntar nada: ofrece las 19 de ejemplo, importar el Excel o crearlas en el Piloto. */
  function noCatsCard() {
    return `<div class="card" style="border-color:var(--acc)"><h2>👋 Aún no tienes categorías</h2>
      <p style="margin:0 0 12px">Sin categorías no se puede clasificar ningún gasto. Elige cómo empezar:</p>
      <div class="pc-btns" style="flex-wrap:wrap"><button class="btn pri" id="ncDef" type="button">➕ Cargar las 19 categorías de ejemplo</button>
      <button class="btn sec" id="ncXl" type="button" style="width:auto">📥 Importar mi Excel</button>
      <button class="btn sec" id="ncPil" type="button" style="width:auto">⚙️ Crearlas yo en el Piloto</button></div>
      <input type="file" id="ncFile" accept=".xlsx,.xls,.csv" hidden></div>`;
  }

  /* ------------------------------------------------------------------ render */
  function render() {
    if ((!FF.pcActive && !mpage) || view === 'ajustes') return;
    $$('#pcNav button[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === view));
    const keepScroll = window.scrollY;
    const sinCats = !cats().length && !['guia', 'graficos', 'piloto', 'deudas', 'ahorros', 'cartera', 'dinero', 'plan'].includes(view);
    pcMain.innerHTML = (sinCats ? noCatsCard() : '') + ({ cmd: cmdView, gastos: () => gastosView('gastos'), dev: devView, extras: extrasView, anio: anioView, ahorros: ahorrosView, deudas: deudasView, piloto: pilotoView, ...(FF.views || {}) }[view] || cmdView)();
    if (view === 'cmd') { fillDatalist(); }
    window.scrollTo(0, keepScroll);
  }

  function fillDatalist() {
    const dl = $('#qDl'); if (!dl) return;
    dl.innerHTML = C.suggest(st.q.con, data().gastos, FF.index, 8).map((s) => `<option value="${esc(s.text)}">${esc((s.cat || '').slice(0, 30))}</option>`).join('');
  }

  /* ------------------------------------------------------------------ acciones */
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.focus(); }

  function quickSave() {
    const q = st.q, imp = C.parseAmount(q.imp), fecha = q.fec || hoy(), extra = q.tipo === 'extra', concept = (q.con || '').trim();
    if (imp == null || imp <= 0) { shake($('#qImp')); FF.toast('Pon un importe mayor que 0'); return; }
    if (!q.cat) { shake($('#qCat')); FF.toast(extra ? 'Elige el tipo de ingreso' : 'Elige una categoría'); return; }
    if (extra) {
      FF.addExtraRow({ id: C.uuid(), fecha, tipo: q.cat, importe: imp, detalle: concept });
      const pe = FF.payApply ? FF.payApply('extra', imp) : '';
      FF.toast(`💵 Extra guardado · Te quedan <b>${esc(fmt(C.computeMonth(data(), C.monthKey(fecha)).queda))}</b>${pe ? ' · ' + esc(pe) : ''}`);
    } else {
      const row = { id: C.uuid(), fecha, categoria: q.cat, importe: imp, tipo: q.tipo, detalle: concept, comercio: '', items: '', ticketId: '', origen: 'app' };
      FF.addGastos([row]);
      const pt = q.tipo === C.TIPO_DEV ? C.TIPO_DEV : C.TIPO_GASTO, pg = FF.payApply ? FF.payApply(pt, imp) : '', pid = FF.payLastId;
      if (concept) FF.learn(concept, q.cat);
      FF.toast(`✓ Guardado · Te quedan <b>${esc(fmt(C.computeMonth(data(), C.monthKey(fecha)).queda))}</b>${pg ? ' · ' + esc(pg) : ''}`, { label: 'Deshacer', fn: () => { FF.delGasto(row.id); if (pg && FF.payApply) FF.payApply(pt, imp, pid); FF.renderAll(); } });
    }
    Object.assign(st.q, { imp: '', con: '', fec: '', cat: '', auto: false, tipo: extra ? 'Gasto' : q.tipo });
    if (C.monthKey(fecha) !== FF.ui.mk) FF.ui.mk = C.monthKey(fecha);
    now();
    setTimeout(() => { const i = $('#qImp'); if (i) i.focus(); }, 30);
  }

  function nuevaFila() {
    const imp = C.parseAmount($('#nImp').value), cat = $('#nCat').value, fecha = $('#nFec').value || hoy();
    if (imp == null || imp <= 0) { shake($('#nImp')); return; }
    if (!cat) { shake($('#nCat')); FF.toast('Elige una categoría'); return; }
    const row = { id: C.uuid(), fecha, categoria: cat, importe: imp, tipo: $('#nTipo').value, detalle: $('#nDet').value.trim(), comercio: '', items: '', ticketId: '', origen: 'app' };
    FF.addGastos([row]); if (row.detalle) FF.learn(row.detalle, cat);
    const pg = FF.payApply ? FF.payApply(row.tipo === C.TIPO_DEV ? C.TIPO_DEV : C.TIPO_GASTO, imp) : '';
    FF.toast('✓ ' + (row.tipo === C.TIPO_DEV ? 'Devolución añadida' : 'Gasto añadido') + (pg ? ' · ' + esc(pg) : '')); now();
    setTimeout(() => { const i = $('#nImp'); if (i) i.focus(); }, 30);
  }

  function totalExtraForm() {
    const h = C.parseAmount($('#xHor').value), t = C.parseAmount($('#xTar').value), f = C.parseAmount($('#xImp').value);
    return { h, t, f, total: C.extraAmount(h, t, f) };
  }

  function nuevoExtra() {
    const { h, t, f, total } = totalExtraForm(), tipo = $('#xTipo').value;
    if (!(total > 0)) { shake($('#xHor').value ? $('#xTar') : $('#xImp')); FF.toast('Pon horas × tarifa o un pago fijo'); return; }
    if (!tipo) { shake($('#xTipo')); return; }
    const n2 = (x) => String(x).replace('.', ','), det = $('#xDet').value.trim(), horas = h > 0 && t > 0 ? `${n2(h)} h × ${n2(t)} €${f > 0 ? ' + ' + n2(f) + ' € fijos' : ''}` : '';
    FF.addExtraRow({ id: C.uuid(), fecha: $('#xFec').value || hoy(), tipo, importe: total, detalle: [horas, det].filter(Boolean).join(' · ') });
    const pe = FF.payApply ? FF.payApply('extra', total) : '';
    if (t > 0 && t !== data().config.tarifaHora) FF.setConfig('tarifaHora', t);
    FF.toast(`✓ Extra añadido: ${esc(fmt(total))}${pe ? ' · ' + esc(pe) : ''}`); now();
  }

  /* ---- deudas */
  const deudas = () => (data().config.deudas || []).slice();
  function deudaAdd(tipo) {
    const tr = $(`tr[data-new="${tipo}"]`), v = (n) => $(`[data-n="${n}"]`, tr).value;
    const imp = C.parseAmount(v('importe'));
    if (imp == null || imp <= 0) { shake($('[data-n="importe"]', tr)); return; }
    if (!v('persona').trim()) { shake($('[data-n="persona"]', tr)); return; }
    FF.setConfig('deudas', deudas().concat([{ id: C.uuid(), tipo, fecha: v('fecha') || hoy(), persona: v('persona').trim(), motivo: v('motivo').trim(), importe: imp, devuelto: C.parseAmount(v('devuelto')) || 0 }]));
    FF.toast('✓ Deuda apuntada'); pending = false; render();
  }
  function deudaEdit(el) {
    const l = deudas(), d = l.find((x) => x.id === el.dataset.d), f = el.dataset.f;
    if (!d) return;
    if (f === 'importe' || f === 'devuelto') { const n = C.parseAmount(el.value); if (n == null || n < 0) { el.value = d[f]; return; } d[f] = n; } else d[f] = el.value;
    FF.setConfig('deudas', l); pending = true; FF.toast('✓ Guardado');
  }

  /* ---- piloto */
  function pilotoEdit(el) {
    const cfg = data().config, mk = st.pil || FF.ui.mk, n = C.parseAmount(el.value);
    if (n == null || n < 0) { FF.toast('Importe no válido'); render(); return; }
    if (el.dataset.pil === '__sueldo') FF.setConfig('sueldo', serieUpsert(cfg.sueldo, mk, n));
    else { const f = Object.assign({}, cfg.fijos || {}); f[el.dataset.pil] = serieUpsert(f[el.dataset.pil], mk, n); FF.setConfig('fijos', f); }
    FF.toast(`✓ Desde ${esc(C.monthLabel(mk))}: ${esc(fmt(n))}`); pending = true;
  }
  function subEdit(el) {
    const l = (data().config.suscripciones || []).map((x) => Object.assign({}, x)), s0 = l[+el.dataset.sub], f = el.dataset.f;
    if (!s0 || !SUBF.includes(f)) return;
    const num = (min, max) => { const n = C.parseAmount(el.value); if (n == null || n < min || (max && n > max)) return null; return Math.round(n); };
    if (f === 'importe') { const n = C.parseAmount(el.value); if (n == null || n < 0) { FF.toast('Importe no válido'); render(); return; } s0.importe = n; }
    else if (f === 'cada' || f === 'personas') { const n = num(1); if (n == null) { FF.toast('Pon un número de 1 en adelante'); render(); return; } s0[f] = n; }
    else if (f === 'dia') { const n = num(1, 31); if (n == null) { FF.toast('El día va de 1 a 31'); render(); return; } s0.dia = n; }
    else if (f === 'activa') s0.activa = el.checked;
    else if (f === 'desde') s0.desde = /^\d{4}-\d{2}$/.test(el.value) ? el.value : '';
    else if (f === 'categoria') s0.categoria = el.value;
    else if (f === 'cuenta') { if (el.value) { s0.cuenta = el.value; ensureAuto(); } else delete s0.cuenta; }
    else s0.nombre = el.value.trim() || s0.nombre;
    FF.setConfig('suscripciones', l); FF.toast('✓ Guardado'); now();
  }

  function editarCampo(el) {
    const g = data().gastos.find((x) => x.id === el.dataset.id), f = el.dataset.f;
    if (!g) return;
    let v = el.value;
    if (f === 'importe') { const n = C.parseAmount(v); if (!(n > 0)) { el.value = g.importe; FF.toast('Importe no válido'); return; } v = n; }
    if (f === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { el.value = g.fecha; return; }
    if (f === 'categoria' && !v) { el.value = g.categoria; return; }
    g[f] = v; FF.persist(); FF.enqueue('update', { id: g.id, fields: { [f]: v } });
    if (f === 'categoria' && g.detalle) FF.learn(g.detalle, v);
    const tr = el.closest('tr'); if (tr && f === 'tipo') tr.classList.toggle('dev', v === C.TIPO_DEV);
    const t = $('#gTot'); if (t) { const l = gastosFiltrados(view === 'dev' ? 'dev' : 'gastos'); t.textContent = fmt(view === 'dev' ? C.r2(l.reduce((a, x) => a + x.importe, 0)) : sumaNeta(l)); }
    FF.toast('✓ Cambio guardado');
  }

  /* ------------------------------------------------------------------ eventos (delegados) */
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (b) { view = b.dataset.v; apply(); window.scrollTo(0, 0); return; }
    if (e.target.closest('#pcToMobile')) { setPref('mobile'); }
  });

  pcMain.addEventListener('click', (e) => {
    if (e.target.closest('#qSave')) return quickSave();
    if (e.target.closest('#qCam')) return $('#pcCam').click();
    if (e.target.closest('#pcBack')) return closePage(false);
    if (e.target.closest('#ncDef')) return FF.loadDefaultCats();
    if (e.target.closest('#ncXl')) return $('#ncFile').click();
    if (e.target.closest('#ncPil')) return FF.openPage('piloto');
    if (e.target.closest('#nAdd')) return nuevaFila();
    const da = e.target.closest('[data-dadd]'); if (da) return deudaAdd(da.dataset.dadd);
    const dd = e.target.closest('[data-ddel]');
    if (dd) { if (confirm('¿Eliminar esta deuda?')) { FF.setConfig('deudas', deudas().filter((x) => x.id !== dd.dataset.ddel)); pending = false; render(); } return; }
    if (e.target.closest('#aSave')) {
      const b = C.parseAmount($('#aBase').value);
      FF.setConfig('ahorros', { base: b == null ? 0 : b, desde: `${$('#aAnio').value}-${String($('#aMes').value).padStart(2, '0')}` });
      FF.toast('✓ Ahorros guardados'); pending = false; return render();
    }
    if (e.target.closest('#pCatAdd')) {
      const n = C.nameOk($('#pCatNew').value);
      if (!n) { FF.toast('Pon un nombre válido para la categoría'); return shake($('#pCatNew')); }
      if (cats().some((c) => C.norm(c) === C.norm(n))) { FF.toast('Esa categoría ya existe'); return; }
      FF.setConfig('categorias', catObjs().concat([{ nombre: n, presupuesto: null }])); FF.toast('✓ Categoría añadida'); return now();
    }
    const cd = e.target.closest('[data-catdel]');
    if (cd) { if (confirm(`¿Quitar “${cd.dataset.catdel}”? Sus gastos no se borran: pasarán a “Sin categoría”.`)) { FF.setConfig('categorias', catObjs().filter((c) => c.nombre !== cd.dataset.catdel)); now(); } return; }
    if (e.target.closest('#pSubAdd')) {
      const n = $('#pSubN').value.trim(), i = C.parseAmount($('#pSubI').value);
      const cada = Math.round(C.parseAmount($('#pSubC').value) || 0), pers = Math.round(C.parseAmount($('#pSubP').value) || 0), dia = Math.round(C.parseAmount($('#pSubD').value) || 0);
      if (!n) return shake($('#pSubN'));
      if (i == null || i < 0) return shake($('#pSubI'));
      if (cada < 1) return shake($('#pSubC'));
      if (pers < 1) return shake($('#pSubP'));
      if (dia < 1 || dia > 31) return shake($('#pSubD'));
      const desde = /^\d{4}-\d{2}$/.test($('#pSubM').value) ? $('#pSubM').value : C.monthKey(hoy());
      FF.setConfig('suscripciones', (data().config.suscripciones || []).concat([{ nombre: n, importe: i, cada, personas: pers, dia, desde, categoria: $('#pSubK').value, activa: true, ...($('#pSubA').value ? { cuenta: $('#pSubA').value } : {}) }]));
      if ($('#pSubA').value) ensureAuto();
      FF.toast('✓ Añadida'); return now();
    }
    if (e.target.closest('#mAdd')) {
      const n = $('#mNom').value.trim(), o = C.parseAmount($('#mObj').value), f = $('#mFec').value;
      if (!n) return shake($('#mNom'));
      if (o == null || o <= 0) return shake($('#mObj'));
      FF.setConfig('metas', (data().config.metas || []).concat([{ id: C.uuid(), nombre: n, objetivo: o, aportado: 0, fecha: /^\d{4}-\d{2}$/.test(f) ? f : '' }]));
      FF.toast('🎯 Meta creada'); return now();
    }
    const ma = e.target.closest('[data-maport]');
    if (ma) {
      const inp = $(`[data-mi="${ma.dataset.maport}"]`), v = C.parseAmount(inp.value);
      if (v == null || v <= 0) return shake(inp);
      FF.setConfig('metas', (data().config.metas || []).map((g) => (g.id === ma.dataset.maport ? { ...g, aportado: C.r2((Number(g.aportado) || 0) + v) } : g)));
      FF.toast('✓ Aportado ' + esc(fmt(v))); return now();
    }
    const md = e.target.closest('[data-mdel]');
    if (md) { if (confirm('¿Eliminar esta meta?')) { FF.setConfig('metas', (data().config.metas || []).filter((g) => g.id !== md.dataset.mdel)); now(); } return; }
    const sd = e.target.closest('[data-subdel]');
    if (sd) { FF.setConfig('suscripciones', (data().config.suscripciones || []).filter((_, i) => i !== +sd.dataset.subdel)); return now(); }
    if (e.target.closest('#pTipoAdd')) {
      const n = $('#pTipoN').value.trim(); if (!n) return shake($('#pTipoN'));
      FF.setConfig('tiposExtra', (data().config.tiposExtra || []).concat([n])); return now();
    }
    const td = e.target.closest('[data-tdel]');
    if (td) { FF.setConfig('tiposExtra', (data().config.tiposExtra || []).filter((_, i) => i !== +td.dataset.tdel)); return now(); }
    if (e.target.closest('#xAdd')) return nuevoExtra();
    if (e.target.closest('#gMore')) { st.gLimit += 150; return render(); }
    const hs = e.target.closest('[data-hasta]'); if (hs) { st.hasta = hs.dataset.hasta === '1'; return render(); }
    const y = e.target.closest('button[data-y]'); if (y) { st.anio += +y.dataset.y; return render(); }
    const tk = e.target.closest('[data-tk]'); if (tk) return FF.openDetail(tk.dataset.tk);
    const del = e.target.closest('[data-del]');
    if (del) { if (confirm('¿Eliminar este gasto?')) { FF.delGasto(del.dataset.del); FF.toast('Eliminado'); now(); } return; }
    const xd = e.target.closest('[data-xdel]');
    if (xd && confirm('¿Eliminar este extra?')) { FF.delExtra(xd.dataset.xdel); now(); }
  });

  pcMain.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'pcMes' || t.id === 'pcAnio') { const m = $('#pcMes').value.padStart(2, '0'), y = $('#pcAnio').value; FF.ui.mk = `${y}-${m}`; now(); return; }
    if (t.id === 'pMes' || t.id === 'pAnio') { st.pil = `${$('#pAnio').value}-${String($('#pMes').value).padStart(2, '0')}`; pending = false; return render(); }
    if (t.id === 'pModo') { FF.setConfig('subsModo', t.value === 'cobro' ? 'cobro' : 'prorrateo'); FF.toast('✓ Guardado'); return now(); }
    if (t.dataset.pres != null) {
      const v = t.value.trim() === '' ? null : C.parseAmount(t.value);
      if (v != null && v < 0) { FF.toast('Importe no válido'); return render(); }
      FF.setConfig('categorias', catObjs().map((c) => (c.nombre === t.dataset.pres ? { ...c, presupuesto: v } : c)));
      FF.toast(v == null ? '✓ Sin límite' : '✓ Presupuesto ' + esc(fmt(v))); pending = true; return;
    }
    if (t.id === 'pSueldoCta' || t.id === 'pSueldoDia') {
      const id = ($('#pSueldoCta') || {}).value, dia = Math.round(C.parseAmount(($('#pSueldoDia') || {}).value) || 1);
      if (!id) { FF.setConfig('sueldoCuenta', null); FF.toast('Sueldo sin cuenta'); return now(); }
      FF.setConfig('sueldoCuenta', { id, dia: Math.min(31, Math.max(1, dia)) }); ensureAuto();
      FF.toast('✓ Sueldo → ' + esc(((data().config.cuentas || []).find((c) => c.id === id) || {}).nombre || '')); return now();
    }
    if (t.id === 'pTarifa') { const n = C.parseAmount(t.value); if (n != null && n >= 0) { FF.setConfig('tarifaHora', n); FF.toast('✓ Tarifa guardada'); } return; }
    if (t.dataset.pil != null) return pilotoEdit(t);
    if (t.dataset.sub != null) return subEdit(t);
    if (t.dataset.d && t.dataset.f) return deudaEdit(t);
    if (t.id === 'gMes') { st.gMes = t.value; st.gLimit = 150; pending = false; return render(); }
    if (t.id === 'qFec') { st.q.fec = t.value; return; }
    if (t.id === 'qTipo') { st.q.tipo = t.value; st.q.cat = ''; st.q.auto = false; pending = false; return render(); }
    if (t.id === 'qCat') { st.q.cat = t.value; st.q.auto = false; return; }
    if (t.id === 'ncFile') { const f = t.files[0]; t.value = ''; if (f) FF.importXlsx(f); return; }
    if (t.id === 'pcCam') { const f = t.files[0]; t.value = ''; if (f) FF.scan(f); return; }
    if (t.dataset && t.dataset.id && t.dataset.f) editarCampo(t);
  });

  pcMain.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'xHor' || t.id === 'xTar' || t.id === 'xImp') { const o = $('#xTot'); if (o) o.textContent = fmt(totalExtraForm().total); return; }
    if (t.id === 'qImp') st.q.imp = t.value;
    else if (t.id === 'qCon') {
      st.q.con = t.value; fillDatalist();
      if (st.q.tipo !== 'extra' && (st.q.auto || !st.q.cat)) {
        let p = C.predictCategory(t.value, FF.index, cats());
        if (!p && C.norm(t.value).length >= 3) { const s = C.suggest(t.value, data().gastos, FF.index, 1)[0]; if (s && cats().includes(s.cat)) p = { cat: s.cat }; }
        if (p) { st.q.cat = p.cat; st.q.auto = true; } else if (st.q.auto) { st.q.cat = ''; st.q.auto = false; }
        const sel = $('#qCat'); if (sel) sel.value = st.q.cat;
        const lbl = sel && sel.previousElementSibling; if (lbl) lbl.innerHTML = `Categoría ${st.q.auto ? '<span class="badge">auto ✨</span>' : ''}`;
      }
    } else if (t.id === 'gQ') { st.gQ = t.value; clearTimeout(input.t); input.t = setTimeout(() => { pending = false; const pos = t.selectionStart; render(); const n = $('#gQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 180); }
  });
  const input = {};

  pcMain.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const id = e.target.id;
    if (e.target.classList && e.target.classList.contains('cell') && (e.target.dataset.id || e.target.dataset.d || e.target.dataset.pil != null || e.target.dataset.sub != null)) { e.preventDefault(); e.target.blur(); return; }
    if (id === 'qImp' || id === 'qCon' || id === 'qFec') { e.preventDefault(); if (id === 'qImp' && !st.q.con) { $('#qCon').focus(); return; } quickSave(); }
    else if (id === 'nDet' || id === 'nImp') { e.preventDefault(); nuevaFila(); }
    else if (id === 'xDet' || id === 'xImp' || id === 'xHor' || id === 'xTar') { e.preventDefault(); nuevoExtra(); }
  });

  /* ------------------------------------------------------------------ preferencia de vista (Ajustes) */
  function setPref(p) { pref = p; try { localStorage.setItem(KEY, p); } catch (e) { /* nada */ } apply(); }
  function syncLayoutSelect() { const s = $('#sLayout'); if (s) s.value = pref; }
  (function injectSetting() {
    const host = $('#v-set'); if (!host) return;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2>Vista</h2><select id="sLayout" class="t"><option value="auto">Automática (modo avanzado en pantallas anchas)</option><option value="pc">Siempre modo avanzado</option><option value="mobile">Siempre vista simplificada</option></select>
      <p class="small mut" style="margin:10px 0 0"><b>Modo avanzado</b>: Centro de Mando, tablas editables, Ahorros, Deudas, Piloto y resumen del año, parecido a tu Excel. <b>Vista simplificada</b>: la de móvil, rápida para apuntar gastos.</p>`;
    host.insertBefore(card, host.firstElementChild);
    const mas = document.createElement('div');
    mas.className = 'card mobile-only';
    mas.innerHTML = `<h2>Más secciones</h2><div class="grid2" style="gap:10px">
      <button class="btn sec" data-page="dev">🔄 Devoluciones</button><button class="btn sec" data-page="extras">🚀 Extras</button>
      <button class="btn sec" data-page="ahorros">🏦 Ahorros</button><button class="btn sec" data-page="deudas">🤝 Deudas</button>
      <button class="btn sec" data-page="piloto">⚙️ Piloto</button><button class="btn sec" data-page="gastos">📝 Gastos (tabla)</button>
      <button class="btn sec" data-page="graficos">📈 Gráficos</button><button class="btn sec" data-page="guia">📖 Empieza aquí</button></div>`;
    host.insertBefore(mas, host.firstElementChild);
    mas.addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) openPage(b.dataset.page); });
    $('#sLayout', card).addEventListener('change', (e) => setPref(e.target.value));
  })();

  apply();
})();
