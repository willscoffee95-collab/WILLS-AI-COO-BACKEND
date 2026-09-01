(() => {
  'use strict';

  const CFG = window.WILLS_CONFIG || {};
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const state = {
    token: localStorage.getItem('wills_token') || '',
    user: null,
    dashboard: null,
    alertFilter: 'ALL'
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init(){
    paintStaticIcons();
    bindLogin();
    bindNav();
    bindProfile();
    bindPinToggle();
    registerSW();

    const started = Date.now();
    if (state.token && CFG.API_URL && !CFG.DEMO_MODE) {
      try {
        await restoreSession();
        await minSplash(started);
        hideSplash();
        return;
      } catch (_) {
        clearSession();
      }
    }

    await minSplash(started);
    showLogin();
    hideSplash();
  }

  async function minSplash(started){
    const wait = Math.max(0, 720 - (Date.now() - started));
    if(wait) await new Promise(r => setTimeout(r, wait));
  }

  function hideSplash(){
    const s = $('#splashView');
    s?.classList.add('out');
    setTimeout(() => s?.remove(), 520);
  }

  function showLogin(){
    $('#appShell').classList.add('hidden');
    $('#loginView').classList.remove('hidden');
  }

  function bindLogin(){
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (CFG.DEMO_MODE) return toast('Production UI aktif. Matikan DEMO_MODE dan sambungkan API_URL.');
      if (!CFG.API_URL) return toast('API_URL belum dikonfigurasi.');

      const button = $('#loginForm button[type="submit"]');
      const original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner-dot"></span><span>Memverifikasi…</span>`;
      try {
        const r = await api('login', {
          loginId: $('#loginId').value.trim(),
          pin: $('#pin').value
        }, false);
        if (!r.ok) throw new Error(r.error || 'Login gagal');
        state.token = r.token;
        state.user = r.user;
        localStorage.setItem('wills_token', state.token);
        await loadDashboard();
        enterApp();
      } catch (err) {
        toast(humanError(err));
      } finally {
        button.disabled = false;
        button.innerHTML = original;
        paintStaticIcons(button);
      }
    });
  }

  function bindPinToggle(){
    const btn = $('#togglePin');
    btn.addEventListener('click', () => {
      const input = $('#pin');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.dataset.icon = show ? 'eye-off' : 'eye';
      btn.innerHTML = icon(btn.dataset.icon);
    });
  }

  async function restoreSession(){
    const me = await api('me', {});
    if (!me.ok) throw new Error(me.error || 'SESSION_INVALID');
    state.user = me.user;
    await loadDashboard();
    enterApp();
  }

  async function loadDashboard(){
    const r = await api('dashboard', {});
    if (!r.ok) throw new Error(r.error || 'Gagal memuat dashboard');
    state.dashboard = r;
    state.user = r.user;
  }

  function enterApp(){
    $('#loginView').classList.add('hidden');
    $('#appShell').classList.remove('hidden');
    const first = String(state.user?.displayName || state.user?.role || 'Owner').split(' ')[0];
    $('#helloTitle').textContent = `${greeting()}, ${first}`;
    $('#profileBtn').textContent = initials(state.user?.displayName || state.user?.role);
    renderAll();
    switchPage('homePage');
  }

  function greeting(){
    const h = new Date().getHours();
    if(h < 11) return 'Selamat pagi';
    if(h < 15) return 'Selamat siang';
    if(h < 19) return 'Selamat sore';
    return 'Selamat malam';
  }

  function renderAll(){
    renderHome();
    renderOutlets();
    renderAlerts();
    renderWill();
    renderMore();
  }

  function renderHome(){
    const d = state.dashboard || {};
    const health = d.health || [];
    const sorted = health.slice().sort((a,b) => num(a['Health Score']) - num(b['Health Score']));
    const priority = sorted[0] || {};
    const networkScore = health.length ? health.reduce((s,x) => s + num(x['Health Score']), 0) / health.length : 0;
    const brief = d.morningBrief || [];
    const headline = findBriefSmart(brief, ['Network Headline Revenue 31/08','Revenue Last Complete Day','Revenue']);
    const organic = findBriefSmart(brief, ['Network Organic Revenue 31/08','Organic Revenue']);
    const highAlerts = (d.alerts || []).filter(x => ['HIGH','CRITICAL'].includes(String(x.Severity || '').toUpperCase())).length;
    const owner = state.user.role === 'OWNER';
    const healthLabel = owner ? 'Network Health' : 'Outlet Health';
    const status = owner ? networkStatus(networkScore) : (priority['Health Status'] || networkStatus(networkScore));

    $('#homePage').innerHTML = `
      <section class="hero-premium">
        <div class="hero-top">
          <span class="hero-label">${healthLabel.toUpperCase()}</span>
          <span class="hero-date">${esc(findBriefSmart(brief,['Official Health Day'])?.value || 'Latest complete day')}</span>
        </div>
        <div class="health-main">
          <div class="health-copy">
            <strong>${esc(status)}</strong>
            <p>${owner ? 'Ringkasan kesehatan seluruh jaringan berdasarkan hari operasional lengkap terakhir.' : 'Ringkasan kesehatan outlet yang terhubung ke akun ini.'}</p>
          </div>
          <div class="health-ring" style="--score:${Math.max(0,Math.min(100,networkScore))}">
            <div><b>${fmt1(networkScore)}</b><small>/ 100</small></div>
          </div>
        </div>
        <div class="hero-metrics">
          <div class="hero-metric"><span>Revenue</span><strong>${money(headline?.value)}</strong></div>
          <div class="hero-metric"><span>${owner ? 'Organic' : 'Status'}</span><strong>${owner ? money(organic?.value) : esc(priority['Health Status'] || '-')}</strong></div>
          <div class="hero-metric"><span>High Alert</span><strong>${highAlerts}</strong></div>
        </div>
      </section>

      <div class="section-title"><div><h3>Command Center</h3><p>Yang paling penting untuk keputusan cepat.</p></div></div>
      <div class="quick-grid">
        ${quickCard('chart','Revenue',''+money(headline?.value),'Latest complete day','red')}
        ${quickCard('bell','High Alerts',String(highAlerts),'Perlu perhatian','amber')}
        ${quickCard(owner?'warehouse':'store',owner?'Priority Outlet':'Outlet',owner?(priority['Outlet Code']||'-'):(priority['Outlet Name']||priority['Outlet Code']||'-'),priority['Key Driver']||'Health overview',owner?'blue':'green')}
        ${quickCard('spark','WILL','Ready','Ask business intelligence','green')}
      </div>

      <div class="section-title"><div><h3>${owner ? 'Outlet Health' : 'Outlet Saya'}</h3><p>Tap untuk melihat intelligence detail.</p></div><button class="section-action" data-go="outletsPage">Lihat semua</button></div>
      <div class="outlet-grid">${health.map(outletCard).join('')}</div>

      <div class="section-title"><div><h3>WILL Insight</h3><p>Interpretasi singkat dari kondisi terakhir.</p></div></div>
      <div class="will-insight">
        <div class="will-insight-head"><div class="will-orb">${icon('spark')}</div><div><span>WILL SAYS</span><strong>${owner ? ownerInsight(priority,d.alerts||[]) : investorInsight(priority)}</strong></div></div>
        <p>${owner ? 'Buka Alerts untuk bukti dan tindakan yang disarankan. Detail Tugas, Terima Bahan, Permintaan Bahan, Produksi, dan SO tetap OWNER ONLY.' : 'WILL hanya menggunakan data outlet yang ditetapkan untuk akun investor ini.'}</p>
      </div>

      <div class="section-title"><div><h3>Morning Brief</h3><p>Snapshot yang sudah disaring untuk Owner.</p></div></div>
      <div class="brief-list">${brief.slice(0,6).map(briefRow).join('') || '<div class="empty">Morning Brief belum tersedia.</div>'}</div>
    `;

    bindOutletCards('#homePage');
    $$('[data-go]').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.go)));
  }

  function renderOutlets(){
    const h = state.dashboard?.health || [];
    $('#outletsPage').innerHTML = `
      <div class="section-title"><div><h3>${state.user.role === 'OWNER' ? 'Outlet Intelligence' : 'Outlet Saya'}</h3><p>Health, sales, produk, inventory, dan tren.</p></div></div>
      <div class="outlet-grid">${h.map(outletCard).join('')}</div>`;
    bindOutletCards('#outletsPage');
  }

  function renderAlerts(filter = state.alertFilter){
    state.alertFilter = filter;
    const all = state.dashboard?.alerts || [];
    const alerts = filter === 'ALL' ? all : all.filter(a => String(a.Severity || '').toUpperCase() === filter);
    const counts = sev => all.filter(a => String(a.Severity || '').toUpperCase() === sev).length;
    $('#alertsPage').innerHTML = `
      <div class="section-title"><div><h3>Alert Center</h3><p>${state.user.role === 'OWNER' ? 'Network intelligence' : 'Assigned outlet only'} • ${all.length} signal</p></div></div>
      <div class="alert-filter">
        ${filterChip('ALL','Semua',all.length,filter)}
        ${filterChip('HIGH','High',counts('HIGH')+counts('CRITICAL'),filter)}
        ${filterChip('MEDIUM','Medium',counts('MEDIUM'),filter)}
        ${filterChip('INFO','Info',counts('INFO')+counts('LOW'),filter)}
      </div>
      <div class="alert-list">${alerts.length ? alerts.map(alertRow).join('') : '<div class="empty">Tidak ada alert pada filter ini.</div>'}</div>`;
    $$('.filter-chip').forEach(b => b.addEventListener('click', () => renderAlerts(b.dataset.filter)));
  }

  function renderWill(){
    const prompts = state.user.role === 'OWNER'
      ? ['Kondisi Wills hari ini?','Outlet mana prioritas?','Operasional semua outlet gimana?','Stok mana yang perlu dicek?','Finance gudang gimana?']
      : ['Kondisi outlet saya?','Penjualan minggu ini?','Produk paling laku?','Stok outlet aman?','Rating pelanggan gimana?'];

    $('#willPage').innerHTML = `
      <div class="will-shell">
        <div class="will-hero"><div class="will-orb">${icon('spark')}</div><div><strong>Ask WILL</strong><p>Business intelligence berbasis data dan scope akses kamu.</p></div></div>
        <div class="prompt-strip">${prompts.map(q => `<button class="prompt-chip" data-prompt="${escAttr(q)}">${esc(q)}</button>`).join('')}</div>
        <div id="chat" class="chat"><div class="bubble will"><b>WILL online.</b><br>${state.user.role === 'OWNER' ? 'Aku bisa membaca network, finance, warehouse, dan operational compliance.' : 'Aku hanya membaca outlet yang terdaftar untuk akun kamu.'}</div></div>
        <form id="askForm" class="chat-input"><input id="askInput" placeholder="Tanya WILL…" autocomplete="off"><button class="btn primary send-btn" aria-label="Kirim">${icon('arrow-up')}</button></form>
      </div>`;
    $('#askForm').addEventListener('submit', askWill);
    $$('.prompt-chip').forEach(b => b.addEventListener('click', () => {
      $('#askInput').value = b.dataset.prompt;
      $('#askInput').focus();
    }));
  }

  function renderMore(){
    const owner = state.user.role === 'OWNER';
    const cards = [
      ['warehouse','warehouse','Warehouse Intelligence','Stok, supply, request, SJ',owner],
      ['finance','wallet','Finance Command Center','Bank, kas, hutang, piutang',owner],
      ['operations','clipboard','Operational Control','Tugas, terima, request, produksi, SO',owner],
      ['reports','report','Reports & History','Brief dan riwayat periode',true],
      ['profile','user','Profile & Security','Role, scope, session, logout',true]
    ];
    $('#morePage').innerHTML = `
      <div class="section-title"><div><h3>More</h3><p>Menu otomatis mengikuti role dan scope.</p></div></div>
      <div class="more-grid">${cards.map(c => menuCard(...c)).join('')}</div>`;
    $$('[data-more]').forEach(b => b.addEventListener('click', () => openMore(b.dataset.more)));
  }

  async function openMore(kind){
    if(kind === 'profile') return showProfile();
    if(kind === 'reports') return showDetail('Reports & History','report','Struktur report siap. Data periode akan ditarik dari Wills Intelligence dan mengikuti role/scope akun.');
    showPageLoader(kind === 'operations' ? 'Membaca operational compliance…' : 'Membaca Intelligence…');
    try {
      const r = await api(kind, {});
      if(!r.ok) throw new Error(r.error || 'Tidak dapat dibuka');
      if(kind === 'operations') return renderOperations(r.operations || []);
      if(kind === 'warehouse') return renderGenericRows('Warehouse Intelligence','warehouse',[...(r.warehouse||[]).slice(-30), ...(r.supply||[]).slice(-20)]);
      if(kind === 'finance') return renderGenericRows('Finance Command Center','wallet',(r.finance||[]).slice(-50));
    } catch(err) {
      toast(humanError(err));
      switchPage('morePage');
    }
  }

  async function openOutlet(code){
    showPageLoader(`Membaca outlet ${code}…`);
    try {
      const r = await api('outlet',{outletCode:code});
      if(!r.ok) throw new Error(r.error || 'Gagal memuat outlet');
      renderOutletDetail(r);
    } catch(err) {
      showDetail('Outlet','store',humanError(err));
    }
  }

  function renderOutletDetail(r){
    const h = r.health || {};
    const daily = r.daily || [];
    const ops = r.operations;
    const products = r.topProducts || [];
    const customer = r.customer || [];
    switchPage('detailPage');
    $('#detailPage').innerHTML = `
      ${detailHeader(h['Outlet Name'] || r.outletCode, `${r.outletCode} • ${h['Health Status'] || 'MONITOR'}`, 'store')}
      <div class="kpi-grid">
        ${kpi('Health',fmt1(h['Health Score']),h['Confidence'] || 'Confidence')}
        ${kpi('Revenue',money(h['Revenue']),'Official day')}
        ${kpi('Organic',money(h['Organic Revenue']),'Bulk excluded')}
        ${kpi('Inventory',fmt1(h['Inventory Score']),'Health score')}
      </div>
      <div class="section-title"><div><h3>Key Driver</h3><p>Faktor utama yang menjelaskan kondisi outlet.</p></div></div>
      <div class="driver-card"><span>WILL ANALYSIS</span><strong>${esc(h['Key Driver'] || '-')}</strong><p>${esc(h['Owner Action'] || '')}</p></div>
      ${ops ? ownerOpsPanel(ops) : ''}
      ${products.length ? `<div class="section-title"><div><h3>Top Products</h3><p>Performa produk terbaru.</p></div></div>${simpleTable(products.slice(0,8),guessCols(products).slice(0,5))}` : ''}
      ${customer.length ? `<div class="section-title"><div><h3>Customer Signal</h3><p>Data rating yang tersedia.</p></div></div>${simpleTable(customer.slice(-8),guessCols(customer).slice(0,5))}` : ''}
      <div class="section-title"><div><h3>Recent Revenue</h3><p>Hari operasional terbaru.</p></div></div>
      ${simpleTable(daily.slice(-10),['Date','Revenue','Transactions','Avg Ticket','Data Confidence'])}`;
    bindBack('outletsPage');
  }

  function ownerOpsPanel(ops){
    const keys = [
      ['Task Pending','clipboard'],['Request Overdue','package'],['Production QC Issues','activity'],
      ['SO POTENSI BOCOR','scan'],['SO CEK DATA','database'],['Shift Closing','clock'],['Operational Status','shield']
    ];
    return `<div class="section-title"><div><h3>Operational Compliance</h3><p>OWNER ONLY • detail internal tidak tampil ke investor.</p></div></div><div class="data-list">${keys.map(([k,i]) => `<div class="brief-row"><div class="brief-icon">${icon(i)}</div><div><strong>${esc(k)}</strong><span>${esc(ops[k] ?? '-')}</span></div></div>`).join('')}</div>`;
  }

  async function askWill(e){
    e.preventDefault();
    const input = $('#askInput');
    const q = input.value.trim();
    if(!q) return;
    input.value = '';
    addBubble(q,'user');
    addBubble(`<span class="thinking">Membaca Intelligence<span>...</span></span>`,'will','thinking',true);
    try {
      const r = await api('askWill',{question:q});
      removeThinking();
      if(!r.ok) throw new Error(r.error || 'WILL gagal menjawab');
      addWillAnswer(r.answer);
    } catch(err) {
      removeThinking();
      addBubble(humanError(err),'will');
    }
  }

  function addWillAnswer(a){
    const ev = (a?.evidence || []).length ? `<ul class="evidence">${a.evidence.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    const html = `<b>${esc(a?.summary || '')}</b>${ev}<div style="margin-top:8px"><span class="pill blue">Confidence ${esc(a?.confidence || 'MEDIUM')}</span></div>`;
    addBubble(html,'will',null,true);
  }

  function renderOperations(rows){
    switchPage('detailPage');
    $('#detailPage').innerHTML = `
      ${detailHeader('Operational Control','OWNER ONLY • cross-check lima modul outlet','clipboard')}
      <div class="data-list">${rows.length ? rows.slice().reverse().map(r => {
        const status = r['Operational Status'] || 'MONITOR';
        return `<div class="card"><div class="outlet-top"><div class="outlet-ident"><div class="outlet-icon">${icon('store')}</div><div><div class="outlet-code">${esc(r['Outlet Code'] || '-')}</div><span class="outlet-name">${esc(r['Date'] || '')}</span></div></div>${pill(status)}</div><div class="quick-grid" style="margin-top:12px">${miniData('Task Pending',r['Task Pending'])}${miniData('Request Overdue',r['Request Overdue'])}${miniData('QC Issues',r['Production QC Issues'])}${miniData('SO Bocor',r['SO POTENSI BOCOR'])}</div><p class="driver">Closing: ${esc(r['Shift Closing'] || '-')} • Confidence: ${esc(r['Confidence'] || '-')}</p></div>`;
      }).join('') : '<div class="empty">Belum ada operational snapshot.</div>'}</div>`;
    bindBack('morePage');
  }

  function renderGenericRows(title,ico,rows,cols){
    switchPage('detailPage');
    cols = cols || guessCols(rows);
    $('#detailPage').innerHTML = `${detailHeader(title,'Live Intelligence view',ico)}${simpleTable(rows,cols)}`;
    bindBack('morePage');
  }

  function showProfile(){
    const outlet = (state.user.outletCodes || []).join(', ') || 'NETWORK';
    showDetail('Profile & Security','user',`
      <div class="brief-list">
        ${profileLine('Nama',state.user.displayName || '-')}
        ${profileLine('Role',state.user.role || '-')}
        ${profileLine('Scope',state.user.scopeType || '-')}
        ${profileLine('Outlet',outlet)}
      </div>
      <button id="logoutBtn" class="btn soft wide" style="margin-top:14px">${icon('logout')} Logout</button>`);
    setTimeout(() => $('#logoutBtn')?.addEventListener('click', () => logout(true)), 0);
  }

  function showDetail(title,ico,html){
    switchPage('detailPage');
    $('#detailPage').innerHTML = `${detailHeader(title,'Wills Intelligence',ico)}<div class="card">${html}</div>`;
    bindBack('morePage');
  }

  function showPageLoader(text){
    switchPage('detailPage');
    $('#detailPage').innerHTML = `<div class="section-title"><div><h3>${esc(text)}</h3><p>Sinkron dengan Intelligence…</p></div></div><div class="empty"><div class="splash-loader" style="margin:0 auto;background:#eee"><i style="background:var(--wills)"></i></div></div>`;
  }

  function detailHeader(title,sub,ico){
    return `<div class="detail-header"><div class="detail-title"><div class="detail-icon">${icon(ico)}</div><div><h3>${esc(title)}</h3><p>${esc(sub)}</p></div></div><button id="backDetail" class="btn back-btn" aria-label="Kembali">${icon('arrow-left')}</button></div>`;
  }

  function bindBack(page){
    $('#backDetail')?.addEventListener('click', () => switchPage(page));
  }

  function outletCard(h){
    const st = h['Health Status'] || 'MONITOR';
    return `<article class="card outlet-card"><button data-outlet="${escAttr(h['Outlet Code'])}"><div class="outlet-top"><div class="outlet-ident"><div class="outlet-icon">${icon('store')}</div><div><div class="outlet-code">${esc(h['Outlet Code'] || '-')}</div><span class="outlet-name">${esc(h['Outlet Name'] || '')}</span></div></div><div class="score-box"><strong>${fmt1(h['Health Score'])}</strong><small>HEALTH</small></div></div><p class="driver">${esc(h['Key Driver'] || 'Belum ada driver')}</p><div class="card-foot">${pill(st)}<span class="chev">${icon('chevron-right')}</span></div></button></article>`;
  }

  function bindOutletCards(scope){
    $$(`${scope} [data-outlet]`).forEach(b => b.addEventListener('click', () => openOutlet(b.dataset.outlet)));
  }

  function alertRow(a){
    let sev = String(a.Severity || 'INFO').toUpperCase();
    if(state.alertFilter === 'HIGH' && sev === 'CRITICAL') sev = 'HIGH';
    if(state.alertFilter === 'INFO' && sev === 'LOW') sev = 'INFO';
    return `<article class="alert-row"><div class="alert-icon ${sev}">${icon(sev === 'INFO' || sev === 'LOW' ? 'info' : 'warning')}</div><div><h4>${esc(a['Outlet/Scope'] || 'NETWORK')} • ${esc(a.Category || 'ALERT')}</h4><p>${esc(a.Signal || '')}</p><div class="alert-action">${esc(a['Recommended Action'] || '')}</div></div><div class="severity-tag">${esc(String(a.Severity || 'INFO').toUpperCase())}</div></article>`;
  }

  function quickCard(ico,label,value,note,color='red'){
    return `<article class="quick-card"><div class="quick-head"><div class="mini-icon ${color}">${icon(ico)}</div></div><div class="q-label">${esc(label)}</div><div class="q-value">${esc(value)}</div><div class="q-note">${esc(note)}</div></article>`;
  }

  function briefRow(b){
    return `<div class="brief-row"><div class="brief-icon">${icon(briefIcon(b.key))}</div><div><strong>${esc(b.key)}</strong><span>${formatSmart(b.value)}${b.interpretation ? ' • ' + esc(b.interpretation) : ''}</span></div></div>`;
  }

  function briefIcon(k){
    const s = String(k || '').toLowerCase();
    if(/revenue|sales/.test(s)) return 'chart';
    if(/health|priority/.test(s)) return 'activity';
    if(/supply|sj|draft/.test(s)) return 'package';
    if(/warehouse|inventory|stock/.test(s)) return 'warehouse';
    if(/bank|cash|payable|receivable|finance/.test(s)) return 'wallet';
    if(/closing|operation/.test(s)) return 'clipboard';
    return 'spark';
  }

  function menuCard(kind,ico,title,desc,allowed){
    return `<button class="menu-card ${allowed ? '' : 'locked'}" data-more="${kind}" ${allowed ? '' : 'disabled'}><div class="menu-icon">${icon(allowed ? ico : 'lock')}</div><strong>${esc(title)}</strong><span>${esc(desc)}</span></button>`;
  }

  function kpi(label,value,note){
    return `<div class="kpi-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
  }

  function miniData(label,value){
    return `<div class="kpi-card"><span>${esc(label)}</span><strong>${esc(value ?? '-')}</strong></div>`;
  }

  function profileLine(k,v){
    return `<div class="data-row"><strong>${esc(k)}</strong><span>${esc(v)}</span></div>`;
  }

  function filterChip(key,label,count,active){
    return `<button class="filter-chip ${active === key ? 'active' : ''}" data-filter="${key}">${esc(label)} ${count ? '· '+count : ''}</button>`;
  }

  function pill(status){
    const s = String(status || '').toUpperCase();
    const cls = /SEHAT|AMAN|PASS|CLOSED|SELESAI/.test(s) ? 'green' : /PRIORITAS|CRITICAL|HIGH|OPEN|OVERDUE/.test(s) ? 'red' : /INFO|MONITOR/.test(s) ? 'blue' : 'yellow';
    return `<span class="pill ${cls}">${esc(status || 'MONITOR')}</span>`;
  }

  function simpleTable(rows,cols){
    if(!rows?.length) return '<div class="empty">Belum ada data.</div>';
    return `<div class="table-wrap"><table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c] ?? '-')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function guessCols(rows){
    return rows?.length ? Object.keys(rows[0]).filter(k => !k.startsWith('__')).slice(0,8) : [];
  }

  function ownerInsight(priority,alerts){
    const hi = alerts.filter(a => ['HIGH','CRITICAL'].includes(String(a.Severity || '').toUpperCase()));
    if(priority['Outlet Code']) return `${priority['Outlet Code']} perlu perhatian utama${hi.length ? ` • ${hi.length} high alert aktif` : ''}`;
    return hi.length ? `${hi.length} high alert aktif` : 'Network dalam kondisi terkendali';
  }

  function investorInsight(priority){
    return priority['Key Driver'] || `Health ${fmt1(priority['Health Score'])}`;
  }

  function networkStatus(score){
    if(score >= 85) return 'Network Sehat';
    if(score >= 70) return 'Perlu Perhatian';
    return 'Prioritas Management';
  }

  function bindNav(){
    $$('.nav-item').forEach(b => b.addEventListener('click', () => switchPage(b.dataset.page, b)));
  }

  function switchPage(id,btn){
    $$('.page').forEach(p => p.classList.toggle('active', p.id === id));
    $$('.nav-item').forEach(x => x.classList.toggle('active', x === btn || x.dataset.page === id));
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function bindProfile(){
    $('#profileBtn').addEventListener('click', showProfile);
  }

  async function api(action,payload={},withToken=true){
    if(!CFG.API_URL) throw new Error('API_URL belum dikonfigurasi');
    const body = {action,...payload};
    if(withToken) body.token = state.token;
    const res = await fetch(CFG.API_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(body),
      redirect:'follow'
    });
    return await res.json();
  }

  function logout(show=true){
    clearSession();
    showLogin();
    $('#pin').value = '';
    if(show) toast('Logout berhasil');
  }

  function clearSession(){
    state.token = '';
    state.user = null;
    state.dashboard = null;
    localStorage.removeItem('wills_token');
  }

  function addBubble(text,type,id,html=false){
    const d = document.createElement('div');
    d.className = `bubble ${type}`;
    if(id) d.dataset.id = id;
    html ? d.innerHTML = text : d.textContent = text;
    $('#chat').appendChild(d);
    d.scrollIntoView({behavior:'smooth',block:'end'});
  }

  function removeThinking(){ $('[data-id="thinking"]')?.remove(); }

  function toast(msg){
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2700);
  }

  function humanError(e){
    const s = String(e?.message || e || 'Error');
    const map = {
      ROLE_DENIED:'Akses ini khusus Owner.',
      OUTLET_SCOPE_DENIED:'Akses hanya untuk outlet yang ditetapkan.',
      SESSION_EXPIRED:'Sesi berakhir. Silakan login lagi.',
      SESSION_INVALID:'Sesi tidak valid. Silakan login lagi.',
      SESSION_REVOKED:'Akses akun sudah dinonaktifkan.',
      LOGIN_DENIED:'Login ID atau PIN tidak cocok.',
      LOGIN_INVALID:'Login ID atau PIN tidak valid.'
    };
    return map[s] || s;
  }

  function findBriefSmart(arr,keys){
    for(const k of keys){
      const x = (arr || []).find(r => String(r.key || '').toLowerCase() === String(k).toLowerCase());
      if(x) return x;
    }
    for(const k of keys){
      const x = (arr || []).find(r => String(r.key || '').toLowerCase().includes(String(k).toLowerCase()));
      if(x) return x;
    }
    return null;
  }

  function money(x){
    const n = num(x);
    return 'Rp' + Math.round(n).toLocaleString('id-ID');
  }

  function formatSmart(x){
    const s = String(x ?? '');
    if(/^[-+]?\d+(\.\d+)?$/.test(s) && Math.abs(Number(s)) > 999) return money(s);
    return esc(s || '-');
  }

  function num(x){
    let s = String(x ?? '').replace(/Rp\s*/ig,'').trim().replace(/\s/g,'').replace(/[^0-9,.-]/g,'');
    if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g,'').replace(',','.');
    else if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g,'');
    else if(/^-?\d+,\d+$/.test(s)) s = s.replace(',','.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function fmt1(x){ return num(x).toFixed(1).replace('.0',''); }
  function initials(s){ return String(s || '').split(/\s+/).filter(Boolean).map(x => x[0]).join('').slice(0,2).toUpperCase(); }
  function esc(s){ return String(s ?? '').replace(/[&<>'"]/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function escAttr(s){ return esc(s).replace(/`/g,'&#96;'); }

  function paintStaticIcons(root=document){
    root.querySelectorAll?.('[data-icon]').forEach(el => {
      if(el.classList.contains('nav-item')){
        const slot = el.querySelector('.nav-icon');
        if(slot) slot.innerHTML = icon(el.dataset.icon);
      } else if(!el.innerHTML.trim()) {
        el.innerHTML = icon(el.dataset.icon);
      } else if(el.classList.contains('field-icon')) {
        el.innerHTML = icon(el.dataset.icon);
      }
    });
  }

  function icon(name){
    const paths = {
      user:'<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
      lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
      'eye-off':'<path d="m3 3 18 18"/><path d="M10.6 6.1A10.3 10.3 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.4 3.2"/><path d="M6.6 6.7C3.6 8.5 2 12 2 12s3.5 6 10 6c1 0 2-.15 2.8-.43"/>',
      'arrow-right':'<path d="M5 12h14"/><path d="m14 7 5 5-5 5"/>',
      'arrow-left':'<path d="M19 12H5"/><path d="m10 17-5-5 5-5"/>',
      'arrow-up':'<path d="M12 19V5"/><path d="m7 10 5-5 5 5"/>',
      shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
      home:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
      store:'<path d="M4 10v10h16V10"/><path d="M3 10 5 4h14l2 6"/><path d="M8 14h8v6"/><path d="M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2"/>',
      bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
      spark:'<path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/><path d="m5 14 .7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14Z"/>',
      grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
      chart:'<path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/>',
      warehouse:'<path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8"/><path d="M7 16h10"/>',
      wallet:'<path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h12"/><path d="M16 11h6v4h-6a2 2 0 0 1 0-4Z"/>',
      clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="m9 13 2 2 4-4"/>',
      package:'<path d="m3 7 9 5 9-5"/><path d="m3 7 9-5 9 5v10l-9 5-9-5V7Z"/><path d="M12 12v10"/>',
      activity:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',
      scan:'<path d="M4 7V4h3"/><path d="M17 4h3v3"/><path d="M20 17v3h-3"/><path d="M7 20H4v-3"/><path d="M7 12h10"/>',
      database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
      clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      report:'<path d="M5 3h10l4 4v14H5V3Z"/><path d="M14 3v5h5"/><path d="M8 13h8"/><path d="M8 17h6"/>',
      logout:'<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
      warning:'<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5"/><path d="M12 18h.01"/>',
      info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/>',
      'chevron-right':'<path d="m9 18 6-6-6-6"/>'
    };
    return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
  }

  function registerSW(){
    if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
