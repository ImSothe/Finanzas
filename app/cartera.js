/* Finanzas App · Cartera de inversión: lo que tienes, lo que has puesto y lo que ganas o pierdes, con precios al momento.
   Criptomonedas: CoinGecko (gratis, sin clave). Acciones y ETF: Finnhub (clave gratuita opcional, mercado de EE. UU.) o precio a mano.
   Datos informativos, pueden llevar retraso. No es asesoramiento financiero. */
(function () {
  'use strict';
  const C = window.Core;
  const FF = window.FF;
  if (!FF || !FF.views || !FF.charts) return;
  const esc = FF.esc;
  const fmt = (n) => C.fmtEUR(n);
  const $ = (s, r = document) => r.querySelector(s);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const readJSON = (k, d) => { try { return JSON.parse(lsGet(k)) || d; } catch (e) { return d; } };
  const pcMain = $('#pcMain');

  const COINS = [['Bitcoin', 'bitcoin', 'BTC'], ['Ethereum', 'ethereum', 'ETH'], ['Solana', 'solana', 'SOL'], ['XRP', 'ripple', 'XRP'], ['BNB', 'binancecoin', 'BNB'],
    ['Cardano', 'cardano', 'ADA'], ['Dogecoin', 'dogecoin', 'DOGE'], ['Litecoin', 'litecoin', 'LTC'], ['Polkadot', 'polkadot', 'DOT'], ['Chainlink', 'chainlink', 'LINK'],
    ['Avalanche', 'avalanche-2', 'AVAX'], ['Toncoin', 'the-open-network', 'TON'], ['Tron', 'tron', 'TRX']];
  const TIPOS = { cripto: '🪙 Criptomoneda', accion: '📈 Acción', etf: '🧺 ETF / fondo', otro: '💼 Otro' };

  let prices = readJSON('ff.prices', {});          // 'cg:bitcoin' | 'fh:AAPL' -> { p (€), ch (% 24 h), t (ms) }
  const st = { tipo: 'cripto', err: '', busy: false, last: 0 };
  const lista = () => (FF.data.config.cartera || []);
  const fhKey = () => lsGet('ff.fhkey') || '';
  const keyOf = (p) => (p.tipo === 'cripto' && p.cg ? 'cg:' + p.cg : (p.tipo === 'accion' || p.tipo === 'etf') && p.simbolo && fhKey() ? 'fh:' + String(p.simbolo).toUpperCase() : null);

  function precioDe(p) {
    const k = keyOf(p), c = k && prices[k];
    if (c && c.p > 0) return { p: c.p, ch: typeof c.ch === 'number' ? c.ch : null, src: 'vivo', t: c.t };
    if (Number(p.manual) > 0) return { p: Number(p.manual), ch: null, src: 'manual', t: p.manualFecha || null };
    return { p: null, ch: null, src: 'sin', t: null };
  }
  const hace = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };

  /* ------------------------------------------------------------------ precios */
  async function usdEur() {
    const fx = readJSON('ff.fx', null);
    if (fx && Date.now() - fx.t < 3600e3) return fx.r;
    try {
      const r = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR');
      const j = await r.json(); const v = j && j.rates && j.rates.EUR;
      if (v > 0) { lsSet('ff.fx', JSON.stringify({ r: v, t: Date.now() })); return v; }
    } catch (e) { /* usa el último conocido */ }
    if (fx) return fx.r;
    throw new Error('No he podido obtener el cambio dólar/euro');
  }

  async function refreshPrices() {
    if (st.busy) return;
    st.busy = true; st.err = '';
    try {
      const ids = [...new Set(lista().filter((p) => p.tipo === 'cripto' && p.cg).map((p) => p.cg))];
      if (ids.length) {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids.map(encodeURIComponent).join(',') + '&vs_currencies=eur&include_24hr_change=true');
        if (r.status === 429) throw new Error('CoinGecko pide esperar un minuto (límite gratuito)');
        if (!r.ok) throw new Error('CoinGecko respondió ' + r.status);
        const j = await r.json(), now = Date.now();
        ids.forEach((id) => { const x = j[id]; if (x && x.eur > 0) prices['cg:' + id] = { p: x.eur, ch: typeof x.eur_24h_change === 'number' ? x.eur_24h_change : null, t: now }; });
      }
      const syms = [...new Set(lista().filter((p) => (p.tipo === 'accion' || p.tipo === 'etf') && p.simbolo).map((p) => String(p.simbolo).toUpperCase()))];
      if (syms.length && fhKey()) {
        const rate = await usdEur();
        for (const s of syms) {
          const r = await fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(s) + '&token=' + encodeURIComponent(fhKey()));
          if (r.status === 401 || r.status === 403) throw new Error('La clave de Finnhub no es válida');
          if (r.status === 429) throw new Error('Finnhub: demasiadas consultas, espera un minuto');
          const q = await r.json();
          if (q && q.c > 0) prices['fh:' + s] = { p: C.r2(q.c * rate), ch: typeof q.dp === 'number' ? q.dp : null, t: Date.now() };
        }
      }
      lsSet('ff.prices', JSON.stringify(prices));
    } catch (e) {
      st.err = e && e.message && !/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? e.message : 'Sin conexión: se muestran los últimos precios guardados';
    } finally { st.busy = false; repaint(); }
  }
  function repaint() {
    if (!$('#crt')) return;
    const a = document.activeElement;
    if (a && pcMain.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;      // no interrumpas si estás escribiendo
    FF.renderNow();
  }
  setInterval(() => { if ($('#crt') && !document.hidden) { st.last = Date.now(); refreshPrices(); } }, 60000);

  /* ------------------------------------------------------------------ vista */
  const head = (t) => `${FF.pageOpen ? '<button class="pc-back" id="pcBack" type="button">← Volver a Ajustes</button>' : ''}<div class="pc-h"><h1>${t}</h1><div class="pc-hr"><button class="btn sec" id="crRef" type="button" style="width:auto;min-height:40px;padding:8px 16px;font-size:14px">🔄 Actualizar precios</button></div></div>`;
  const colorG = (v) => (v == null ? '' : v >= 0 ? 'color:var(--acc2)' : 'color:var(--bad)');
  const sgn = (v, f) => (v == null ? '–' : (v > 0 ? '+' : '') + f(v));
  const pct = (v) => (v * 100).toFixed(1).replace('.', ',') + '%';

  function carteraView() {
    if (Date.now() - st.last > 45000 && !st.busy) { st.last = Date.now(); setTimeout(refreshPrices, 30); }
    const rows = lista().map((p) => { const pr = precioDe(p); return { p, pr, s: C.positionStats(p, pr.p) }; });
    const tot = C.portfolioTotals(rows.map((r) => ({ stats: r.s, ch: r.pr.ch })));
    const don = rows.filter((r) => r.s.valor > 0).sort((a, b) => b.s.valor - a.s.valor).map((r) => ({ n: r.p.nombre, v: r.s.valor }));
    const tipo = st.tipo;
    const coinOpts = COINS.map(([n, id, sy]) => `<option value="${id}">${esc(n)} (${sy})</option>`).join('') + '<option value="__otra">Otra (escribir el id)…</option>';
    return `<div id="crt">${head('💼 Cartera')}
      <div class="small mut" style="margin:0 4px 12px">Lo que tienes invertido y lo que ganas o pierdes. Cripto con precio en directo; acciones y ETF con clave gratuita de Finnhub (opcional) o con el precio puesto a mano. <b>Datos informativos, pueden tener retraso: no es asesoramiento financiero.</b></div>
      ${st.err ? `<div class="warnbox">⚠️ ${esc(st.err)}</div>` : ''}
      <div class="pc-cards">
        <div class="pc-card g"><div class="l">💼 VALOR ACTUAL</div><div class="v">${esc(fmt(tot.valor))}</div><div class="s">${rows.length ? `Invertido ${esc(fmt(tot.invertido))}` : 'Añade tu primera inversión abajo'}${tot.sinPrecio ? ` · ${tot.sinPrecio} sin precio` : ''}</div></div>
        <div class="pc-card ${tot.gan >= 0 ? 'b' : 'o'}"><div class="l">📈 GANANCIA / PÉRDIDA</div><div class="v" style="${colorG(rows.length ? tot.gan : null)}">${rows.length ? esc(sgn(tot.gan, fmt)) : '–'}</div><div class="s">${tot.pct != null ? esc(sgn(tot.pct, pct)) + ' sobre lo invertido' : 'Sin datos todavía'}</div></div>
        <div class="pc-card"><div class="l">⏱️ VARIACIÓN EN 24 H</div><div class="v" style="${colorG(tot.hoyPct != null ? tot.hoy : null)}">${tot.hoyPct != null ? esc(sgn(tot.hoy, fmt)) : '–'}</div><div class="s">${tot.hoyPct != null ? esc(sgn(tot.hoyPct, pct)) + ' (solo los activos en directo)' : 'Se calcula con los activos en directo'}</div></div>
      </div>
      <div class="card" style="padding:0;overflow:auto"><table class="tbl grid"><thead><tr><th style="min-width:190px">Activo</th><th class="r" style="width:110px">Cantidad</th><th class="r" style="width:120px">Compra (€/ud.)</th><th class="r" style="min-width:150px">Precio actual</th><th class="r">Valor</th><th class="r">Ganancia</th><th class="r" style="width:80px">%</th><th class="r" style="width:80px">24 h</th><th style="width:50px"></th></tr></thead><tbody>
        ${rows.map(({ p, pr, s }) => `<tr><td><b>${esc(p.nombre)}</b><div class="small mut">${esc(TIPOS[p.tipo] || p.tipo)}${p.simbolo ? ' · ' + esc(p.simbolo) : ''}</div></td>
          <td><input type="number" step="any" min="0" class="cell r" data-cr="${esc(p.id)}" data-f="cantidad" value="${p.cantidad}"></td>
          <td><input type="number" step="any" min="0" class="cell r" data-cr="${esc(p.id)}" data-f="compra" value="${p.compra}"></td>
          <td class="r">${pr.src === 'vivo' ? `<b>${esc(fmt(pr.p))}</b><div class="small" style="color:var(--acc2)">🟢 ${esc(hace(pr.t))}</div>`
    : `<input type="number" step="any" min="0" class="cell r" data-cr="${esc(p.id)}" data-f="manual" value="${p.manual || ''}" placeholder="precio a mano"><div class="small mut">${pr.src === 'manual' ? '✋ a mano' + (pr.t ? ' · ' + esc(pr.t) : '') : (p.tipo === 'accion' || p.tipo === 'etf') && !fhKey() ? 'Pon tu clave de Finnhub o el precio' : 'Sin precio'}</div>`}</td>
          <td class="r"><b>${esc(s.valor != null ? fmt(s.valor) : '–')}</b></td>
          <td class="r" style="${colorG(s.gan)}"><b>${esc(sgn(s.gan, fmt))}</b></td><td class="r" style="${colorG(s.pct)}">${esc(sgn(s.pct, pct))}</td>
          <td class="r" style="${colorG(pr.ch)}">${pr.ch != null ? esc(sgn(pr.ch / 100, pct)) : '–'}</td>
          <td class="acc"><button class="ib" data-crdel="${esc(p.id)}" title="Quitar de la cartera">🗑</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Tu cartera está vacía. Añade una inversión con el formulario de abajo.</td></tr>'}
      </tbody></table></div>
      ${don.length ? `<div class="card"><h2>🍩 Reparto de tu cartera</h2><div class="gdon">${FF.charts.donut(don, tot.valor, 'VALOR')}<div class="gleg">${don.map((t, i) => `<div class="kv" style="padding:5px 0"><span><i class="gdot" style="background:${FF.charts.PALETA[i % FF.charts.PALETA.length]}"></i>${esc(t.n)}</span><b>${esc(fmt(t.v))} <span class="mut small">${Math.round((t.v / tot.valor) * 100)}%</span></b></div>`).join('')}</div></div></div>` : ''}
      <div class="card"><h2>➕ Añadir una inversión</h2>
        <div class="pc-qrow">
          <div><label class="f">Tipo</label><select id="crTipo" class="t">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === tipo ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          ${tipo === 'cripto' ? `<div class="pc-grow"><label class="f">Criptomoneda</label><select id="crCoin" class="t">${coinOpts}</select><input id="crCg" class="t" placeholder="id de CoinGecko (ej. pepe)" style="margin-top:6px" hidden></div>`
    : `<div class="pc-grow"><label class="f">Nombre</label><input id="crNom" class="t" placeholder="${tipo === 'otro' ? 'Fondo de pensiones, oro…' : 'Apple, S&P 500…'}"></div>${tipo === 'otro' ? '' : '<div><label class="f">Símbolo (para el precio en directo)</label><input id="crSim" class="t" placeholder="AAPL, VOO…" style="max-width:150px"></div>'}`}
          <div><label class="f">Cantidad</label><input id="crCant" type="number" step="any" min="0" class="t" placeholder="0,5" style="max-width:130px;text-align:right"></div>
          <div><label class="f">Precio de compra (€ por unidad)</label><input id="crCompra" type="number" step="any" min="0" class="t" placeholder="medio, en €" style="max-width:170px;text-align:right"></div>
          ${tipo === 'cripto' ? '' : '<div><label class="f">Precio actual a mano (opcional)</label><input id="crMan" type="number" step="any" min="0" class="t" placeholder="€" style="max-width:150px;text-align:right"></div>'}
          <div class="pc-btns"><button class="btn pri" id="crAdd" type="button">＋ Añadir</button></div>
        </div></div>
      <div class="card"><h2>🔑 Acciones y ETF en directo (opcional)</h2>
        <div class="small mut" style="margin-bottom:8px">Con una clave gratuita de <b>finnhub.io</b> (registrándote, sin tarjeta) se consultan acciones y ETF de EE. UU. y se pasan a euros. Los mercados europeos no suelen estar en el plan gratuito: ahí usa el precio a mano. La clave se queda solo en este dispositivo.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="crKey" class="t" type="password" autocomplete="off" placeholder="${fhKey() ? 'Clave guardada (escribe otra para cambiarla)' : 'Pega aquí tu clave de Finnhub'}" style="max-width:340px"><button class="btn sec" id="crKeySave" type="button" style="width:auto;min-height:48px;padding:8px 16px;font-size:15px">Guardar</button>${fhKey() ? '<button class="btn sec" id="crKeyDel" type="button" style="width:auto;min-height:48px;padding:8px 16px;font-size:15px">Quitar</button>' : ''}</div></div>
    </div>`;
  }
  FF.views.cartera = carteraView;

  /* ------------------------------------------------------------------ acciones */
  const save = (l) => FF.setConfig('cartera', l);
  const num = (id) => C.parseAmount(($('#' + id) || {}).value);
  function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.focus(); }

  function add() {
    const tipo = st.tipo, cant = num('crCant'), compra = num('crCompra');
    let nombre = '', cg = '', simbolo = '';
    if (tipo === 'cripto') {
      const sel = $('#crCoin').value;
      if (sel === '__otra') { cg = ($('#crCg').value || '').trim().toLowerCase(); if (!cg) return shake($('#crCg')); nombre = cg; }
      else { const c = COINS.find((x) => x[1] === sel); cg = sel; nombre = c ? c[0] : sel; simbolo = c ? c[2] : ''; }
    } else {
      nombre = ($('#crNom').value || '').trim(); simbolo = (($('#crSim') || {}).value || '').trim().toUpperCase();
      if (!nombre && simbolo) nombre = simbolo;
      if (!nombre) return shake($('#crNom'));
    }
    if (cant == null || cant <= 0) return shake($('#crCant'));
    if (compra == null || compra < 0) return shake($('#crCompra'));
    const man = tipo === 'cripto' ? null : num('crMan');
    const p = { id: C.uuid(), tipo, nombre, simbolo, cantidad: cant, compra, cg };
    if (man > 0) { p.manual = man; p.manualFecha = C.todayISO(); }
    save(lista().concat([p]));
    FF.toast('✓ Añadido a tu cartera'); st.last = 0; FF.renderNow();
  }

  pcMain.addEventListener('click', (e) => {
    if (!$('#crt')) return;
    if (e.target.closest('#crRef')) { st.last = Date.now(); refreshPrices(); return FF.toast('Actualizando precios…'); }
    if (e.target.closest('#crAdd')) return add();
    const d = e.target.closest('[data-crdel]');
    if (d) { if (confirm('¿Quitar esta inversión de la cartera?')) { save(lista().filter((p) => p.id !== d.dataset.crdel)); FF.renderNow(); } return; }
    if (e.target.closest('#crKeySave')) { const v = ($('#crKey').value || '').trim(); if (!v) return shake($('#crKey')); lsSet('ff.fhkey', v); FF.toast('🔑 Clave guardada'); st.last = 0; return FF.renderNow(); }
    if (e.target.closest('#crKeyDel')) { try { localStorage.removeItem('ff.fhkey'); } catch (er) { /* nada */ } FF.toast('Clave quitada'); return FF.renderNow(); }
  });
  pcMain.addEventListener('change', (e) => {
    const t = e.target;
    if (!$('#crt')) return;
    if (t.id === 'crTipo') { st.tipo = t.value; return FF.renderNow(); }
    if (t.id === 'crCoin') { const o = $('#crCg'); if (o) { o.hidden = t.value !== '__otra'; if (!o.hidden) o.focus(); } return; }
    if (t.dataset && t.dataset.cr) {
      const f = t.dataset.f, v = t.value.trim() === '' ? null : C.parseAmount(t.value);
      if ((f !== 'manual' && (v == null || v < 0)) || (v != null && v < 0)) { FF.toast('Número no válido'); return FF.renderNow(); }
      save(lista().map((p) => (p.id !== t.dataset.cr ? p : f === 'manual' ? { ...p, manual: v == null ? 0 : v, manualFecha: C.todayISO() } : { ...p, [f]: v })));
      FF.toast('✓ Guardado'); FF.renderNow();
    }
  });
  pcMain.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !$('#crt')) return;
    const t = e.target;
    if (t.dataset && t.dataset.cr) { e.preventDefault(); t.blur(); }
    else if (/^cr(Cant|Compra|Man|Nom|Sim)$/.test(t.id)) { e.preventDefault(); add(); }
  });

  /* ------------------------------------------------------------------ entradas de menú */
  const nav = $('#pcNav');
  if (nav && !$('[data-v="cartera"]', nav)) {
    const b = document.createElement('button'); b.dataset.v = 'cartera'; b.type = 'button'; b.textContent = '💼 Cartera';
    const ref = $('[data-v="graficos"]', nav); if (ref) nav.insertBefore(b, ref); else nav.appendChild(b);
  }
  const mas = $('[data-page="graficos"]');
  if (mas && !$('[data-page="cartera"]')) {
    const b = document.createElement('button'); b.className = 'btn sec'; b.dataset.page = 'cartera'; b.textContent = '💼 Cartera';
    mas.parentElement.insertBefore(b, mas);
  }
})();
