/* Finanzas App · "Mi dinero" (cuentas y saldos al día) y "Planning e inversión" (reparto del sueldo, escalera de prioridades,
   simulador de interés compuesto y lecciones). Material educativo con supuestos tuyos: no es asesoramiento financiero. */
(function () {
  'use strict';
  const C = window.Core;
  const FF = window.FF;
  if (!FF || !FF.views || !FF.charts) return;
  const esc = FF.esc;
  const fmt = (n) => C.fmtEUR(n);
  const $ = (s, r = document) => r.querySelector(s);
  const pcMain = $('#pcMain');
  const data = () => FF.data;
  const cuentas = () => (data().config.cuentas || []);
  const hist = () => (data().config.cuentasHist || []);
  /* El saldo de una cuenta = saldo inicial (en la config) + suma de sus movimientos. Los movimientos solo se añaden, así dos dispositivos no se pisan. */
  const movs = () => data().movs || [];
  const efec = (c) => C.r2((Number(c.saldo) || 0) + movs().filter((m) => m.cuenta === c.id).reduce((a, m) => a + m.delta, 0));
  const lastDate = (c) => movs().filter((m) => m.cuenta === c.id).map((m) => m.fecha).concat([c.fecha || '']).sort().pop();
  const cuentasEf = () => cuentas().map((c) => ({ ...c, saldo: efec(c), fecha: lastDate(c) }));
  const TIPOS = { banco: '🏦 Banco', efectivo: '💶 Efectivo', ahorro: '🐖 Ahorro', inversion: '📈 Inversión', otro: '📦 Otro' };
  const PRESETS = { '50-30-20': '50 / 30 / 20 · clásico', '60-20-20': '60 / 20 / 20 · gastos altos', '70-20-10': '70 / 20 / 10 · ajustado', '50-20-30': '50 / 20 / 30 · ahorrador', custom: 'Personalizado' };
  const DEF = { preset: '50-30-20', pct: { nec: 50, des: 30, aho: 20 }, rentab: 6, anios: 20, inflacion: 2.5, comision: 0.3 };
  const plan = () => ({ ...DEF, ...(data().config.plan || {}), pct: { ...DEF.pct, ...((data().config.plan || {}).pct || {}) } });
  const head = (t) => `${FF.pageOpen ? '<button class="pc-back" id="pcBack" type="button">← Volver a Ajustes</button>' : ''}<div class="pc-h"><h1>${t}</h1></div>`;
  const pctTxt = (v) => (v * 100).toFixed(0) + '%';
  const num1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');

  /* ------------------------------------------------------------------ datos derivados */
  const carteraTot = () => (FF.carteraTotals ? FF.carteraTotals() : { valor: 0, invertido: 0, porTipo: {}, n: 0 });
  function patrimonio() {
    const a = C.accountTotals(cuentasEf()), cr = carteraTot();
    return { ...a, cartera: cr.valor, total: C.r2(a.total + cr.valor), invertido: C.r2(a.por.inversion + cr.valor) };
  }
  /** Gasto mensual medio de los últimos 3 meses con movimiento (fijos + suscripciones + día a día). */
  function gastoMedio(mk) {
    const v = [0, -1, -2].map((d) => C.computeMonth(data(), C.shiftMonth(mk, d)).sale).filter((x) => x > 0);
    return v.length ? C.r2(v.reduce((a, b) => a + b, 0) / v.length) : 0;
  }

  /* ------------------------------------------------------------------ vista: Mi dinero */
  function linea(h) {
    if (h.length < 2) return '';
    const W = 720, H = 190, pl = 70, pb = 24, pt = 12, iw = W - pl - 12, ih = H - pb - pt;
    const vs = h.map((x) => x.total), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
    const t0 = Date.parse(h[0].f), dt = Date.parse(h[h.length - 1].f) - t0 || 1;
    const X = (f) => pl + ((Date.parse(f) - t0) / dt) * iw, Y = (v) => pt + ih - ((v - lo) / span) * ih;
    const pts = h.map((x) => `${X(x.f).toFixed(1)},${Y(x.total).toFixed(1)}`).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" class="gbars" role="img" aria-label="Evolución de tu dinero"><line x1="${pl}" x2="${W - 12}" y1="${Y(lo).toFixed(1)}" y2="${Y(lo).toFixed(1)}" stroke="#ffffff18"/><line x1="${pl}" x2="${W - 12}" y1="${Y(hi).toFixed(1)}" y2="${Y(hi).toFixed(1)}" stroke="#ffffff18"/>
      <text x="${pl - 6}" y="${(Y(hi) + 4).toFixed(1)}" text-anchor="end" fill="#8f9cd0" font-size="10">${esc(fmt(hi))}</text><text x="${pl - 6}" y="${(Y(lo) + 4).toFixed(1)}" text-anchor="end" fill="#8f9cd0" font-size="10">${esc(fmt(lo))}</text>
      <polyline points="${pts}" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linejoin="round"/>${h.map((x) => `<circle cx="${X(x.f).toFixed(1)}" cy="${Y(x.total).toFixed(1)}" r="3.5" fill="#22d3ee"><title>${esc(x.f)}: ${esc(fmt(x.total))}</title></circle>`).join('')}
      <text x="${pl}" y="${H - 6}" fill="#8f9cd0" font-size="10">${esc(h[0].f)}</text><text x="${W - 12}" y="${H - 6}" text-anchor="end" fill="#8f9cd0" font-size="10">${esc(h[h.length - 1].f)}</text></svg>`;
  }

  /** Ingreso de la nómina del mes en la cuenta que elijas (efectivo incluido). */
  function nominaCard(l) {
    if (!l.length) return '';
    const mk = C.monthKey(C.todayISO()), hecha = (data().config.nominas || []).includes(mk), sueldo = C.effectiveAt(data().config.sueldo, mk);
    const pref = lsGet('ff.nomacc') || '';
    return `<div class="card"><h2>💵 Nómina de ${esc(C.monthLabel(mk))}</h2>
      <div class="small mut" style="margin-bottom:8px">${hecha ? '✅ Ya la has ingresado este mes. Puedes ingresar otra cantidad si cobras algo más.' : 'Cuando cobres, dime en qué cuenta entra y se suma a su saldo.'}</div>
      <div class="pc-qrow"><div><label class="f">Importe (€)</label><input id="nmImp" type="number" step="0.01" min="0" class="t" value="${sueldo || ''}" style="max-width:150px;text-align:right"></div>
        <div class="pc-grow"><label class="f">Ingresa en</label><select id="nmCta" class="t">${l.map((c) => `<option value="${esc(c.id)}" ${c.id === pref ? 'selected' : ''}>${esc(c.nombre)} · ${esc(fmt(c.saldo))}</option>`).join('')}</select></div>
        <div class="pc-btns"><button class="btn pri" id="nmAdd" type="button">💵 Ingresar</button></div></div></div>`;
  }

  function dineroView() {
    const p = patrimonio(), l = cuentasEf(), h = hist().slice(-30);
    const ult = l.map((c) => c.fecha).filter(Boolean).sort().pop();
    return `<div id="mdn">${head('💰 Mi dinero')}
      <div class="small mut" style="margin:0 4px 12px">Lo que tienes <b>ahora mismo</b>, cuenta a cuenta. Cuando apuntes gastos en la app, abre aquí y pon el saldo real que ves en tu banco: así este sitio siempre cuadra con la realidad. Se guarda en tu hoja y se ve igual en el PC y en el móvil.</div>
      <div class="pc-cards">
        <div class="pc-card g"><div class="l">🧮 TOTAL (cuentas + cartera)</div><div class="v">${esc(fmt(p.total))}</div><div class="s">${ult ? 'Última actualización: ' + esc(ult) : 'Añade tus cuentas abajo'}</div></div>
        <div class="pc-card b"><div class="l">💧 DISPONIBLE AHORA</div><div class="v">${esc(fmt(p.liquido))}</div><div class="s">Banco + efectivo + ahorro</div></div>
        <div class="pc-card o"><div class="l">📈 INVERTIDO</div><div class="v">${esc(fmt(p.invertido))}</div><div class="s">Cuentas de inversión${p.cartera ? ' + cartera ' + esc(fmt(p.cartera)) : ''}</div></div>
      </div>
      <div class="card" style="padding:0;overflow:auto"><table class="tbl grid"><thead><tr><th style="min-width:180px">Cuenta</th><th style="width:150px">Tipo</th><th class="r" style="width:150px">Saldo (€)</th><th style="width:120px">Actualizado</th><th class="acc"></th></tr></thead><tbody>
        ${l.map((c) => `<tr><td><input class="cell" data-cu="${esc(c.id)}" data-f="nombre" value="${esc(c.nombre)}" maxlength="80"></td>
          <td><select class="cell" data-cu="${esc(c.id)}" data-f="tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${k === c.tipo ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
          <td><input type="number" step="0.01" class="cell r" data-cu="${esc(c.id)}" data-f="saldo" value="${c.saldo}"></td>
          <td class="small mut">${esc(c.fecha || '–')}</td><td class="acc"><button class="ib" data-cudel="${esc(c.id)}" title="Quitar cuenta">🗑</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aún no has añadido ninguna cuenta. Empieza por tu cuenta del banco y el efectivo.</td></tr>'}
      </tbody></table></div>
      ${nominaCard(l)}
      <div class="card"><h2>➕ Añadir una cuenta</h2><div class="pc-qrow">
        <div class="pc-grow"><label class="f">Nombre</label><input id="cuNom" class="t" placeholder="Cuenta nómina, Cartera, Hucha…" maxlength="80"></div>
        <div><label class="f">Tipo</label><select id="cuTipo" class="t">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><label class="f">Saldo ahora (€)</label><input id="cuSaldo" type="number" step="0.01" class="t" placeholder="0,00" style="max-width:150px;text-align:right"></div>
        <div class="pc-btns"><button class="btn pri" id="cuAdd" type="button">＋ Añadir</button></div></div>
        ${p.cartera ? `<div class="small mut" style="margin-top:8px">Tu <b>Cartera</b> (${esc(fmt(p.cartera))}) ya se suma sola al total; no hace falta crearla aquí como cuenta.</div>` : ''}</div>
      ${h.length >= 2 ? `<div class="card"><h2>📊 Cómo ha evolucionado</h2>${linea(h)}<div class="small mut">Una foto por día en que actualizas un saldo. La última: ${esc(fmt(h[h.length - 1].total))} (${esc(h[h.length - 1].f)}).</div></div>` : ''}
    </div>`;
  }
  FF.views.dinero = dineroView;

  /* ------------------------------------------------------------------ vista: Planning e inversión */
  const LECCIONES = [
    ['🌱 El interés compuesto, tu mejor aliado', 'Las ganancias también generan ganancias. 200 €/mes al 6 % durante 30 años son 72.000 € aportados que se convierten en unos 200.000 €: más de la mitad lo ha hecho el tiempo. Por eso importa más <b>empezar pronto y no parar</b> que acertar el momento.'],
    ['🛟 Primero el colchón', 'Antes de invertir, ten de 3 a 6 meses de gastos en una cuenta de fácil acceso (la escalera de arriba lo mide con tus datos). Sin colchón, el primer imprevisto te obliga a vender justo cuando puede estar en pérdidas.'],
    ['🧺 Diversifica con fondos indexados / ETF', 'Un fondo indexado global compra cientos o miles de empresas de golpe. Reduce el riesgo de que una sola empresa te hunda y no necesitas elegir ganadoras. Muchos gestores activos no consiguen batir a su índice de forma sostenida una vez descontadas las comisiones.'],
    ['✂️ Las comisiones se comen tu rentabilidad', 'Un 1,5 % anual de comisión parece poco, pero a 30 años puede quitarte una parte enorme del capital final frente a un 0,2 %. Mira el <b>TER</b> del fondo y compáralo en el simulador de abajo.'],
    ['📅 Aportar cada mes (DCA)', 'Invertir una cantidad fija periódica te quita la presión de adivinar el mejor día: compras más barato cuando cae y menos cuando sube. Automatiza la aportación el día de cobro, antes de gastar.'],
    ['⏳ Horizonte y riesgo', 'La renta variable sube y baja mucho a corto plazo (han ocurrido caídas del 30–50 %). Solo se invierte el dinero que no vas a necesitar en <b>5–10 años o más</b>. Lo que necesitas pronto va en cuenta o depósito.'],
    ['🧯 Cripto y activos arriesgados: una parte pequeña', 'Muchas guías prudentes limitan lo especulativo (cripto, acciones sueltas) a un porcentaje pequeño de la cartera, el que puedas ver irse a cero sin que cambie tu vida. El núcleo, diversificado y barato.'],
    ['🧾 Impuestos (España)', 'Las ganancias de fondos, acciones y cripto tributan como renta del ahorro. En los <b>fondos de inversión</b> puedes traspasar entre fondos sin pagar hasta que reembolsas, lo que ayuda al interés compuesto. Consulta tu caso con un profesional o con la Agencia Tributaria.'],
    ['🔁 Revisa una vez al año', 'No mires el valor cada día. Una vez al año: ¿ha cambiado tu sueldo?, ¿sigues aportando lo previsto?, ¿se ha desequilibrado la cartera? Reajusta y sigue.']
  ];
  const PERFILES = [['🛡️ Prudente', 30, 60, 10, 'Para plazos de 3–7 años o si las caídas te quitan el sueño.'], ['⚖️ Equilibrado', 60, 30, 10, 'Plazos de 7–15 años. Buen punto medio.'], ['🚀 Dinámico', 85, 10, 5, 'Más de 15 años y capacidad de aguantar caídas grandes.']];
  const NOMT = { cripto: '🪙 Cripto', accion: '📈 Acciones', etf: '🧺 ETF / fondos', otro: '💼 Otros' };

  function chartCrecimiento(filas) {
    const W = 720, H = 240, pl = 70, pb = 26, pt = 14, iw = W - pl - 12, ih = H - pb - pt;
    const max = Math.max(1, ...filas.map((f) => f.capital)), n = filas.length - 1 || 1;
    const X = (i) => pl + (i / n) * iw, Y = (v) => pt + ih - (Math.max(0, v) / max) * ih;
    const area = (key) => `${filas.map((f, i) => `${X(i).toFixed(1)},${Y(f[key]).toFixed(1)}`).join(' ')} ${X(n).toFixed(1)},${Y(0).toFixed(1)} ${X(0).toFixed(1)},${Y(0).toFixed(1)}`;
    const marks = [0, 0.5, 1].map((f) => `<line x1="${pl}" x2="${W - 12}" y1="${Y(max * f).toFixed(1)}" y2="${Y(max * f).toFixed(1)}" stroke="#ffffff12"/><text x="${pl - 6}" y="${(Y(max * f) + 4).toFixed(1)}" text-anchor="end" fill="#8f9cd0" font-size="10">${esc(fmt(Math.round(max * f)))}</text>`).join('');
    const paso = Math.max(1, Math.round(n / 6));
    const xs = filas.filter((f) => f.y === 0 || f.y === n || f.y % paso === 0).map((f) => `<text x="${X(f.y).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#8f9cd0" font-size="10">${f.y === 0 ? 'Hoy' : f.y + ' a.'}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="gbars" role="img" aria-label="Crecimiento de tu inversión año a año">${marks}
      <polygon points="${area('capital')}" fill="#22d3ee" fill-opacity=".28"/><polygon points="${area('aportado')}" fill="#fb923c" fill-opacity=".45"/>
      <polyline points="${filas.map((f, i) => `${X(i).toFixed(1)},${Y(f.capital).toFixed(1)}`).join(' ')}" fill="none" stroke="#22d3ee" stroke-width="2.5"/>
      <polyline points="${filas.map((f, i) => `${X(i).toFixed(1)},${Y(f.real).toFixed(1)}`).join(' ')}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-dasharray="5 4"/>${xs}</svg>`;
  }

  function planView() {
    const pl = plan(), mk = C.monthKey(C.todayISO()), m = C.computeMonth(data(), mk), p = patrimonio();
    const ingreso = m.entra > 0 ? m.entra : 0, reparto = C.splitIncome(ingreso, pl.pct);
    const gMes = gastoMedio(mk), meses = C.emergencyMonths(p.liquido, gMes), deuda = C.debtTotals(data().config.deudas || []).debo;
    const aporteAuto = Math.max(0, reparto.aho), aporte = pl.aporte != null ? pl.aporte : aporteAuto;
    const inicial = Math.max(0, p.invertido);
    const sim = (rentab) => C.projectGrowth({ inicial, aporte, rentab, anios: pl.anios, inflacion: pl.inflacion });
    const neto = sim(pl.rentab - pl.comision), caro = sim(pl.rentab - 1.5), colchon = sim(0);
    const cr = carteraTot(), crTot = Object.values(cr.porTipo).reduce((a, v) => a + v, 0);
    const reales = [['Necesidades (fijos + suscripciones)', pl.pct.nec, reparto.nec, m.fijos, true], ['Deseos (día a día)', pl.pct.des, reparto.des, m.dia, true], ['Ahorro e inversión', pl.pct.aho, reparto.aho, Math.max(0, m.queda), false]];
    const pasos = [
      { ok: meses != null && meses >= 3, t: '1 · Colchón de emergencia', s: meses == null ? 'Apunta tus gastos y tus cuentas para medirlo.' : `Tienes ${num1(meses)} meses de gastos cubiertos (${esc(fmt(p.liquido))} disponibles ÷ ${esc(fmt(gMes))} al mes). Objetivo: 3 a 6.`, go: 'dinero', gl: 'Actualizar mi dinero' },
      { ok: deuda <= 0, t: '2 · Quitar deudas caras', s: deuda > 0 ? `Debes ${esc(fmt(deuda))} (según tu apartado Deudas). Una deuda con interés alto sale más a cuenta pagarla que invertir.` : 'No tienes deudas apuntadas. ✅', go: 'deudas', gl: 'Ver deudas' },
      { ok: aporte > 0 && p.invertido > 0, t: '3 · Invertir cada mes, aunque sea poco', s: aporte > 0 ? `Tu plan aporta ${esc(fmt(aporte))} al mes${p.invertido > 0 ? '.' : '; aún no has apuntado nada como invertido.'}` : 'Ahora mismo no sobra para aportar: revisa el reparto.', go: 'cartera', gl: 'Abrir cartera' },
      { ok: false, t: '4 · Revisar una vez al año', s: 'Sueldo, aportación y reparto. Lo demás: no mirar cada día.', go: null }
    ];
    return `<div id="pln">${head('🧭 Planning e inversión')}
      <div class="small mut" style="margin:0 4px 12px">Un plan sencillo en 4 pasos: <b>repartes tu sueldo</b>, <b>aseguras el colchón</b>, <b>inviertes cada mes</b> y dejas que el tiempo haga el resto. Todo se calcula con tus datos reales. <b>Es material educativo con supuestos tuyos: no es asesoramiento financiero ni garantiza rentabilidades.</b></div>

      <div class="card"><h2>1 · Reparto de tu sueldo</h2>
        ${ingreso > 0 ? `<div class="small mut" style="margin-bottom:8px">Ingresos de ${esc(C.monthLabel(mk))}: <b>${esc(fmt(ingreso))}</b></div>` : '<div class="warnbox">⚠️ Aún no hay sueldo configurado este mes: ponlo en el Piloto Automático para calcular el reparto.</div>'}
        <div class="pc-qrow"><div class="pc-grow"><label class="f">Método</label><select id="plPreset" class="t">${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}" ${k === pl.preset ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          ${pl.preset === 'custom' ? `<div><label class="f">Necesidades %</label><input id="plNec" type="number" min="0" max="100" class="t" value="${pl.pct.nec}" style="max-width:110px;text-align:right"></div><div><label class="f">Deseos %</label><input id="plDes" type="number" min="0" max="100" class="t" value="${pl.pct.des}" style="max-width:110px;text-align:right"></div><div class="small mut" style="align-self:end;padding-bottom:10px">Ahorro e inversión: <b>${pl.pct.aho}%</b></div>` : ''}</div>
        <table class="tbl" style="margin-top:10px"><thead><tr><th></th><th class="r">Plan</th><th class="r">Real este mes</th><th></th></tr></thead><tbody>
          ${reales.map(([n, pc, objetivo, real, tope]) => { const bad = tope ? real > objetivo + 0.5 : real < objetivo - 0.5; return `<tr><td>${esc(n)}<div class="small mut">${pc}% del sueldo</div></td><td class="r"><b>${esc(fmt(objetivo))}</b></td><td class="r" style="${bad ? 'color:var(--bad)' : 'color:var(--acc2)'}"><b>${esc(fmt(real))}</b></td><td class="small">${ingreso > 0 ? (bad ? (tope ? '⚠️ por encima' : '⚠️ por debajo') : '✅ en plan') : ''}</td></tr>`; }).join('')}
        </tbody></table>
        <div class="small mut" style="margin-top:8px">“Real” usa lo que llevas en el mes (a final de mes será más fiable). Cada método es solo una guía: ajústalo a tu vida.</div></div>

      <div class="card"><h2>2 · Tu escalera de prioridades</h2>
        ${pasos.map((s) => `<div class="kv" style="align-items:flex-start;gap:10px"><span style="flex:1"><b>${s.ok ? '✅' : '⬜'} ${esc(s.t)}</b><div class="small mut">${s.s}</div></span>${s.go ? `<button class="btn sec" data-plgo="${s.go}" type="button" style="width:auto;min-height:36px;padding:6px 12px">${esc(s.gl)}</button>` : ''}</div>`).join('')}</div>

      <div class="card"><h2>3 · Simulador: ¿qué pasa si inviertes cada mes?</h2>
        <div class="pc-qrow">
          <div><label class="f">Aportación al mes (€)</label><input id="plAporte" type="number" step="1" min="0" class="t" value="${aporte}" style="max-width:140px;text-align:right"><div class="small mut">${pl.aporte != null ? '<a href="#" id="plAuto">usar la del reparto (' + esc(fmt(aporteAuto)) + ')</a>' : 'la del reparto'}</div></div>
          <div><label class="f">Rentabilidad anual %</label><input id="plRent" type="number" step="0.5" class="t" value="${pl.rentab}" style="max-width:120px;text-align:right"></div>
          <div><label class="f">Años</label><input id="plAnios" type="number" step="1" min="1" max="60" class="t" value="${pl.anios}" style="max-width:90px;text-align:right"></div>
          <div><label class="f">Inflación %</label><input id="plInfl" type="number" step="0.5" min="0" class="t" value="${pl.inflacion}" style="max-width:100px;text-align:right"></div>
          <div><label class="f">Comisión fondo %</label><input id="plCom" type="number" step="0.1" min="0" class="t" value="${pl.comision}" style="max-width:110px;text-align:right"></div>
        </div>
        <div class="small mut" style="margin:8px 0">Escenarios: <button class="btn sec" data-plr="3" type="button" style="width:auto;min-height:30px;padding:3px 10px">🛡️ Prudente 3%</button> <button class="btn sec" data-plr="6" type="button" style="width:auto;min-height:30px;padding:3px 10px">⚖️ Medio 6%</button> <button class="btn sec" data-plr="8" type="button" style="width:auto;min-height:30px;padding:3px 10px">🚀 Optimista 8%</button> · Capital de partida: <b>${esc(fmt(inicial))}</b> (tu dinero invertido)</div>
        <div class="pc-cards" style="margin-top:10px">
          <div class="pc-card g"><div class="l">🎯 EN ${pl.anios} AÑOS</div><div class="v">${esc(fmt(neto.final))}</div><div class="s">Tras comisión ${num1(pl.comision)}% · en euros de hoy: ${esc(fmt(neto.real))}</div></div>
          <div class="pc-card o"><div class="l">💼 TÚ PONES</div><div class="v">${esc(fmt(neto.aportado))}</div><div class="s">${esc(fmt(inicial))} de partida + ${esc(fmt(aporte))} × ${pl.anios * 12} meses</div></div>
          <div class="pc-card b"><div class="l">⏳ LO QUE HACE EL TIEMPO</div><div class="v">${esc(fmt(neto.intereses))}</div><div class="s">${neto.final > 0 ? pctTxt(Math.max(0, neto.intereses) / neto.final) + ' del total son intereses' : ''}</div></div>
        </div>
        <div style="margin-top:10px">${chartCrecimiento(neto.filas)}</div>
        <div class="small mut"><i class="gdot" style="background:#22d3ee"></i>Capital &nbsp; <i class="gdot" style="background:#fb923c"></i>Lo que has aportado &nbsp; <i class="gdot" style="background:#a78bfa"></i>Capital en euros de hoy</div>
        <table class="tbl" style="margin-top:12px"><thead><tr><th>Si lo dejas…</th><th class="r">Capital final</th><th class="r">Frente al fondo barato</th></tr></thead><tbody>
          <tr><td>📈 Fondo barato (${num1(pl.comision)}%)</td><td class="r"><b>${esc(fmt(neto.final))}</b></td><td class="r">–</td></tr>
          <tr><td>💸 Fondo caro (comisión 1,5%)</td><td class="r"><b>${esc(fmt(caro.final))}</b></td><td class="r" style="color:var(--bad)">${esc(fmt(caro.final - neto.final))}</td></tr>
          <tr><td>🛏️ Sin invertir (0 %, y la inflación lo erosiona)</td><td class="r"><b>${esc(fmt(colchon.final))}</b></td><td class="r" style="color:var(--bad)">${esc(fmt(colchon.final - neto.final))}</td></tr>
        </tbody></table>
        <div class="small mut" style="margin-top:8px">La rentabilidad es un <b>supuesto</b>: la bolsa mundial ha dado históricamente en torno al 6–8 % anual a muchos años vista, pero con años muy negativos, y el pasado no garantiza el futuro. Prueba también el escenario prudente.</div></div>

      <div class="card"><h2>4 · Cómo repartir lo que inviertes</h2>
        <div class="small mut" style="margin-bottom:8px">Ejemplos de reparto <b>renta variable / renta fija / liquidez</b> según el plazo y lo que aguantes. No es una recomendación personal.</div>
        <div class="pc-cards">${PERFILES.map(([n, rv, rf, li, d]) => `<div class="pc-card"><div class="l">${esc(n)}</div><div class="v" style="font-size:24px">${rv} / ${rf} / ${li}</div><div class="s">${esc(d)}</div></div>`).join('')}</div>
        ${cr.n ? `<div style="margin-top:10px"><b>Tu cartera hoy</b> (${esc(fmt(cr.valor))}):<div class="small mut">${Object.entries(cr.porTipo).map(([k, v]) => `${esc(NOMT[k] || k)} ${esc(pctTxt(crTot > 0 ? v / crTot : 0))}`).join(' · ') || 'sin precios todavía'}</div>
          ${crTot > 0 && (cr.porTipo.cripto || 0) / crTot > 0.2 ? '<div class="warnbox">⚠️ Más del 20 % de tu cartera está en cripto: es muy volátil. Muchas guías prudentes lo limitan a una parte pequeña.</div>' : ''}</div>` : '<div class="small mut" style="margin-top:10px">Cuando añadas inversiones en la Cartera, aquí verás cómo está repartida.</div>'}</div>

      <div class="card"><h2>📚 Aprende a invertir (en corto)</h2>
        ${LECCIONES.map(([t, b]) => `<details><summary><b>${esc(t)}</b></summary><div class="small" style="padding:0 0 10px 4px">${b}</div></details>`).join('')}
        <div class="small mut" style="margin-top:8px">Contenido educativo general. Antes de decisiones importantes, consulta con un profesional independiente.</div></div>
    </div>`;
  }
  FF.views.plan = planView;

  /* ------------------------------------------------------------------ acciones */
  const num = (id) => C.parseAmount(($('#' + id) || {}).value);
  function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.focus(); }
  /** Guarda las cuentas y deja una foto del total de hoy para la gráfica. */
  function saveCuentas(l) {
    FF.setConfig('cuentas', l);
    FF.setConfig('cuentasHist', C.snapshotTotal(hist(), C.todayISO(), patrimonio().total));
  }
  function savePlan(patch) {
    const cur = plan(), o = { ...cur, ...patch, pct: { ...cur.pct, ...(patch.pct || {}) } };
    FF.setConfig('plan', C.normConfig({ plan: o }).plan);
  }

  /* ------------------------------------------------------------------ cuenta de pago: al apuntar un gasto se descuenta de ella (la opción vacía no descuenta) */
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const payList = () => cuentasEf();
  /* Por defecto: la primera cuenta que no sea efectivo (si solo hay una cuenta, esa). El efectivo nunca se elige solo. Lo que elijas vale para un apunte y luego vuelve a la de por defecto. */
  let payChoice = null;
  const payDefault = () => { const l = payList(); if (l.length === 1) return l[0].id; const b = l.find((c) => c.tipo !== 'efectivo'); return b ? b.id : ''; };
  const payId = () => (payChoice !== null && (payChoice === '' || payList().some((c) => c.id === payChoice)) ? payChoice : payDefault());
  FF.payHas = () => payList().length > 0;
  FF.payOptions = (vacio) => `<option value="">${esc(vacio || '— No descontar de ninguna cuenta —')}</option>${payList().map((c) => `<option value="${esc(c.id)}" ${c.id === payId() ? 'selected' : ''}>${esc(c.nombre)} · ${esc(fmt(c.saldo))}</option>`).join('')}`;
  /** Rellena el selector del móvil y lo oculta si no hay cuentas. */
  FF.payFill = () => { const w = $('#payWrap'), s = $('#payAcc'); if (!w || !s) return; w.hidden = !FF.payHas(); s.innerHTML = FF.payOptions(); };
  /** Aplica (o deshace) el efecto de un apunte en la cuenta elegida. Devuelve el texto para el aviso. */
  function applyTo(id, d, nota, movId) {
    const c = cuentasEf().find((x) => x.id === id); if (!c || !d) return '';
    FF.addMov({ id: movId || C.uuid(), cuenta: id, delta: d, fecha: C.todayISO(), nota: nota || '' });
    FF.setConfig('cuentasHist', C.snapshotTotal(hist(), C.todayISO(), patrimonio().total));
    FF.payFill();
    return `${d < 0 ? '−' : '+'}${fmt(Math.abs(d))} en ${c.nombre}`;
  }
  FF.payApply = (tipo, importe, undo) => {
    const id = typeof undo === 'string' ? undo : payId();
    if (typeof undo !== 'string') { FF.payLastId = id; payChoice = null; }
    return id ? applyTo(id, C.payDelta(tipo, importe) * (typeof undo === 'string' ? -1 : 1), typeof undo === 'string' ? 'Deshacer' : (tipo === 'extra' ? 'Extra' : tipo === C.TIPO_DEV ? 'Devolución' : 'Gasto')) : '';
  };
  /** Aplica los movimientos automáticos vencidos (sueldo y suscripciones con cuenta) una sola vez y avisa. */
  FF.autoPost = () => {
    const cfg = data().config, ids = new Set(movs().map((m) => m.id));
    const due = C.dueMovements(cfg, C.todayISO(), ids).filter((m) => cuentas().some((c) => c.id === m.cuenta));
    if (!due.length) return;
    due.forEach((m) => FF.addMov({ id: m.id, cuenta: m.cuenta, delta: m.delta, fecha: m.fecha, nota: m.concepto }));
    const nom = due.filter((m) => m.key.startsWith('s|')).map((m) => m.mes);
    if (nom.length) FF.setConfig('nominas', [...new Set([...(cfg.nominas || []), ...nom])]);
    FF.setConfig('cuentasHist', C.snapshotTotal(hist(), C.todayISO(), patrimonio().total));
    const name = (id) => (cuentas().find((c) => c.id === id) || {}).nombre || '';
    FF.toast('🤖 Movimientos automáticos: ' + due.slice(0, 4).map((m) => `${m.delta < 0 ? '−' : '+'}${fmt(Math.abs(m.delta))} ${esc(m.concepto)} (${esc(name(m.cuenta))})`).join(' · ') + (due.length > 4 ? ` y ${due.length - 4} más` : ''));
    FF.payFill();
    if (FF.renderNow) FF.renderNow();
  };
  document.addEventListener('change', (e) => { const t = e.target; if (t && (t.id === 'payAcc' || t.id === 'qPay' || t.id === 'nPay' || t.id === 'xPay')) { payChoice = t.value; FF.payFill(); } });

  pcMain.addEventListener('click', (e) => {
    if ($('#mdn')) {
      if (e.target.closest('#cuAdd')) {
        const nombre = C.nameOk(($('#cuNom') || {}).value), saldo = num('cuSaldo');
        if (!nombre) return shake($('#cuNom'));
        if (saldo == null) return shake($('#cuSaldo'));
        saveCuentas(cuentas().concat([{ id: C.uuid(), nombre, tipo: $('#cuTipo').value, saldo, fecha: C.todayISO() }]));
        FF.toast('✓ Cuenta añadida'); return FF.renderNow();
      }
      if (e.target.closest('#nmAdd')) {
        const imp = num('nmImp'), id = ($('#nmCta') || {}).value;
        if (imp == null || imp <= 0) return shake($('#nmImp'));
        lsSet('ff.nomacc', id);
        const msg = applyTo(id, imp, 'Nómina'), mk = C.monthKey(C.todayISO());
        FF.setConfig('nominas', [...new Set([...(data().config.nominas || []), mk])]);
        FF.toast('💵 Nómina ingresada · ' + esc(msg)); return FF.renderNow();
      }
      const d = e.target.closest('[data-cudel]');
      if (d) { if (confirm('¿Quitar esta cuenta?')) { saveCuentas(cuentas().filter((c) => c.id !== d.dataset.cudel)); FF.renderNow(); } return; }
    }
    if ($('#pln')) {
      const g = e.target.closest('[data-plgo]');
      if (g) { const b = document.querySelector(`#pcNav [data-v="${g.dataset.plgo}"]`) || document.querySelector(`[data-page="${g.dataset.plgo}"]`); if (b) b.click(); return; }
      const r = e.target.closest('[data-plr]');
      if (r) { savePlan({ rentab: Number(r.dataset.plr) }); return FF.renderNow(); }
      if (e.target.closest('#plAuto')) { e.preventDefault(); const p = { ...(data().config.plan || plan()) }; delete p.aporte; FF.setConfig('plan', p); return FF.renderNow(); }
    }
  });
  pcMain.addEventListener('change', (e) => {
    const t = e.target;
    if ($('#mdn') && t.dataset && t.dataset.cu) {
      const f = t.dataset.f, id = t.dataset.cu;
      if (f === 'nombre') { const n = C.nameOk(t.value); if (!n) { FF.toast('Pon un nombre'); return FF.renderNow(); } saveCuentas(cuentas().map((c) => (c.id === id ? { ...c, nombre: n } : c))); }
      else if (f === 'tipo') saveCuentas(cuentas().map((c) => (c.id === id ? { ...c, tipo: t.value } : c)));
      else { const v = C.parseAmount(t.value); if (v == null) { FF.toast('Número no válido'); return FF.renderNow(); } const cur = cuentasEf().find((c) => c.id === id); if (cur) applyTo(id, C.r2(v - cur.saldo), 'Ajuste manual'); }
      FF.toast('✓ Guardado'); return FF.renderNow();
    }
    if (!$('#pln')) return;
    const v = C.parseAmount(t.value);
    switch (t.id) {
      case 'plPreset': { const q = C.PLAN_PRESETS[t.value]; savePlan(q ? { preset: t.value, pct: { nec: q[0], des: q[1], aho: q[2] } } : { preset: 'custom' }); break; }
      case 'plNec': savePlan({ preset: 'custom', pct: { nec: v == null ? 50 : v } }); break;
      case 'plDes': savePlan({ preset: 'custom', pct: { des: v == null ? 30 : v } }); break;
      case 'plAporte': if (v == null || v < 0) return FF.renderNow(); savePlan({ aporte: v }); break;
      case 'plRent': if (v == null) return FF.renderNow(); savePlan({ rentab: v }); break;
      case 'plAnios': if (v == null) return FF.renderNow(); savePlan({ anios: v }); break;
      case 'plInfl': if (v == null) return FF.renderNow(); savePlan({ inflacion: v }); break;
      case 'plCom': if (v == null) return FF.renderNow(); savePlan({ comision: v }); break;
      default: return;
    }
    FF.renderNow();
  });
  pcMain.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if ($('#mdn') && t.dataset && t.dataset.cu) { e.preventDefault(); t.blur(); }
    else if ($('#mdn') && /^cu(Nom|Saldo)$/.test(t.id)) { e.preventDefault(); const b = $('#cuAdd'); if (b) b.click(); }
    else if ($('#pln') && /^pl/.test(t.id || '')) { e.preventDefault(); t.blur(); }
  });

  /* ------------------------------------------------------------------ entradas de menú */
  const nav = $('#pcNav');
  const refNav = nav && ($('[data-v="cartera"]', nav) || $('[data-v="graficos"]', nav));
  const refMas = $('[data-page="cartera"]') || $('[data-page="graficos"]');
  [['dinero', '💰 Mi dinero'], ['plan', '🧭 Planning']].forEach(([v, txt]) => {
    if (nav && !$(`[data-v="${v}"]`, nav)) {
      const b = document.createElement('button'); b.dataset.v = v; b.type = 'button'; b.textContent = txt;
      if (refNav) nav.insertBefore(b, refNav); else nav.appendChild(b);
    }
    if (refMas && !$(`[data-page="${v}"]`)) {
      const b = document.createElement('button'); b.className = 'btn sec'; b.dataset.page = v; b.textContent = txt;
      refMas.parentElement.insertBefore(b, refMas);
    }
  });
})();
