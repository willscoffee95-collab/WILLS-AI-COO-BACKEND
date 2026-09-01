(() => {
  'use strict';
  const CFG = window.WILLS_CONFIG || {};
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const state = { token: localStorage.getItem('wills_token') || '', user:null, dashboard:null, demoRole:null };

  document.addEventListener('DOMContentLoaded', init);

  function init(){
    bindNav(); bindLogin(); bindDemo(); bindProfile(); registerSW();
    if(CFG.DEMO_MODE){ $('#demoHint').classList.remove('hidden'); $('#demoActions').classList.remove('hidden'); }
    if(state.token && CFG.API_URL && !CFG.DEMO_MODE) restoreSession();
  }

  function bindLogin(){
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      if(CFG.DEMO_MODE) return toast('Preview Demo aktif. Gunakan tombol Demo Owner / Investor.');
      setBusy(true);
      try{
        const r = await api('login',{loginId:$('#loginId').value,pin:$('#pin').value},false);
        if(!r.ok) throw new Error(r.error||'Login gagal');
        state.token=r.token; state.user=r.user; localStorage.setItem('wills_token',state.token); await loadDashboard(); enterApp();
      }catch(err){toast(humanError(err));}finally{setBusy(false)}
    });
  }

  function bindDemo(){
    $$('#demoActions button').forEach(b=>b.addEventListener('click',()=>{
      const role=b.dataset.demo; state.demoRole=role; state.dashboard=deepClone(window.WILLS_DEMO[role]); state.user=state.dashboard.user; enterApp(); renderAll();
    }));
  }

  async function restoreSession(){
    try{ const r=await api('me',{}); if(!r.ok) throw new Error(); state.user=r.user; await loadDashboard(); enterApp(); }catch(_){logout(false)}
  }

  async function loadDashboard(){
    const r=await api('dashboard',{}); if(!r.ok) throw new Error(r.error||'Gagal memuat dashboard'); state.dashboard=r; state.user=r.user;
  }

  function enterApp(){
    $('#loginView').classList.add('hidden'); $('#appShell').classList.remove('hidden');
    $('#helloTitle').textContent=`Halo, ${state.user.displayName || state.user.role}`; $('#profileBtn').textContent=initials(state.user.displayName||state.user.role); renderAll();
  }

  function renderAll(){ renderHome(); renderOutlets(); renderAlerts(); renderWill(); renderMore(); }

  function renderHome(){
    const d=state.dashboard||{}; const health=d.health||[]; const priority=health.slice().sort((a,b)=>num(a['Health Score'])-num(b['Health Score']))[0]||{};
    const networkScore=health.length?(health.reduce((s,x)=>s+num(x['Health Score']),0)/health.length):0;
    const brief=d.morningBrief||[]; const headline=findBrief(brief,'Network Headline Revenue 31/08') || findBrief(brief,'Revenue Last Complete Day');
    const organic=findBrief(brief,'Network Organic Revenue 31/08');
    $('#homePage').innerHTML=`
      <div class="hero">
        <p class="eyebrow">BUSINESS HEALTH</p>
        <div class="hero-grid"><div><div class="health-number">${fmt1(networkScore)}<small>/100</small></div><p class="muted">${state.user.role==='OWNER'?'Network provisional health':'Assigned outlet health'}</p></div><div>${pill(priority['Health Status']||'MONITOR')}</div></div>
        <div class="kpi-grid">
          <div class="kpi-card"><span>${state.user.role==='OWNER'?'Headline Revenue':'Revenue'}</span><strong>${money(headline?.value)}</strong><small>latest complete day</small></div>
          <div class="kpi-card"><span>${state.user.role==='OWNER'?'Organic Revenue':'Health Score'}</span><strong>${state.user.role==='OWNER'?money(organic?.value):fmt1(priority['Health Score'])}</strong><small>${state.user.role==='OWNER'?'bulk/B2B dipisah':'assigned outlet'}</small></div>
          <div class="kpi-card"><span>High Alerts</span><strong>${(d.alerts||[]).filter(x=>['HIGH','CRITICAL'].includes(String(x.Severity||x['Severity']).toUpperCase())).length}</strong><small>needs attention</small></div>
          <div class="kpi-card"><span>${state.user.role==='OWNER'?'Priority Outlet':'Status'}</span><strong>${state.user.role==='OWNER'?(priority['Outlet Code']||'-'):(priority['Health Status']||'-')}</strong><small>${priority['Key Driver']||''}</small></div>
        </div>
      </div>
      <div class="section-title"><div><h3>${state.user.role==='OWNER'?'Outlet Health':'Kondisi Outlet'}</h3><p>Tap kartu untuk detail.</p></div></div>
      <div class="outlet-grid">${health.map(outletCard).join('')}</div>
      <div class="section-title"><div><h3>WILL Morning Brief</h3><p>Ringkas, berbasis data, tanpa spekulasi.</p></div></div>
      <div class="brief-list">${brief.slice(0,7).map(b=>`<div class="brief-row"><strong>${esc(b.key)}</strong><span>${formatSmart(b.value)} · ${esc(b.interpretation||'')}</span></div>`).join('')}</div>
      <div class="priority-box"><p class="eyebrow">WILL SAYS</p><p>${state.user.role==='OWNER'?'Fokus ke alert HIGH/CRITICAL dulu. Detail operasional hanya terlihat pada akun Owner.':'Kamu hanya melihat data outlet yang ditetapkan untuk akun investor ini.'}</p></div>`;
    bindOutletCards('#homePage');
  }

  function renderOutlets(){
    const h=state.dashboard?.health||[];
    $('#outletsPage').innerHTML=`<div class="section-title"><div><h3>${state.user.role==='OWNER'?'Outlet Intelligence':'Outlet Saya'}</h3><p>Health, revenue, produk, dan tren.</p></div></div><div class="outlet-grid">${h.map(outletCard).join('')}</div>`;
    bindOutletCards('#outletsPage');
  }

  function renderAlerts(){
    const alerts=state.dashboard?.alerts||[];
    $('#alertsPage').innerHTML=`<div class="section-title"><div><h3>Alert Center</h3><p>${state.user.role==='OWNER'?'Seluruh jaringan':'Hanya scope outlet kamu'}</p></div></div><div class="alert-list">${alerts.length?alerts.map(alertRow).join(''):'<div class="empty">Tidak ada alert yang bisa ditampilkan.</div>'}</div>`;
  }

  function renderWill(){
    $('#willPage').innerHTML=`<div class="will-shell"><div class="section-title"><div><h3>Tanya WILL</h3><p>${state.user.role==='OWNER'?'Network + operational intelligence':'Hanya outlet yang menjadi hak akses kamu'}</p></div></div><div id="chat" class="chat"><div class="bubble will">Aku siap membaca Wills Intelligence. Coba tanya: <b>“Kondisi outlet hari ini?”</b>${state.user.role==='OWNER'?'<br>atau <b>“Operasional semua outlet gimana?”</b>':''}</div></div><form id="askForm" class="chat-input"><input id="askInput" placeholder="Tanya WILL..." autocomplete="off"><button class="btn primary" aria-label="Kirim">➜</button></form></div>`;
    $('#askForm').addEventListener('submit',askWill);
  }

  function renderMore(){
    const owner=state.user.role==='OWNER';
    const cards=[
      ['warehouse','Warehouse Intelligence','Stok, request, SJ, transit',owner],
      ['finance','Finance Command Center','Bank, kas, hutang, piutang',owner],
      ['operations','Operational Control','Tugas, terima, request, produksi, SO',owner],
      ['reports','Reports','History & monthly brief',true],
      ['profile','Profile & Security','Role, scope, logout',true]
    ];
    $('#morePage').innerHTML=`<div class="section-title"><div><h3>More</h3><p>Menu mengikuti role dan scope.</p></div></div><div class="more-grid">${cards.map(c=>`<button class="menu-card ${c[3]?'':'locked'}" data-more="${c[0]}" ${c[3]?'':'disabled'}><strong>${c[1]}</strong><span>${c[2]}</span></button>`).join('')}</div>`;
    $$('[data-more]').forEach(b=>b.addEventListener('click',()=>openMore(b.dataset.more)));
  }

  async function openMore(kind){
    if(kind==='profile') return showProfile();
    if(kind==='reports') return showDetail('Reports','V0.1 menyiapkan struktur. Monthly Brief akan mengambil data periode dari Intelligence.');
    setBusy(true);
    try{
      const r=state.demoRole?demoMore(kind):await api(kind,{});
      if(!r.ok) throw new Error(r.error||'Tidak dapat dibuka');
      if(kind==='operations') return renderOperations(r.operations||[]);
      if(kind==='warehouse') return renderGenericRows('Warehouse Intelligence',[...(r.warehouse||[]).slice(-30),...(r.supply||[]).slice(-20)]);
      if(kind==='finance') return renderGenericRows('Finance Command Center',(r.finance||[]).slice(-50));
    }catch(err){toast(humanError(err))}finally{setBusy(false)}
  }

  async function openOutlet(code){
    switchPage('detailPage'); setBusy(true);
    try{
      const r=state.demoRole?demoOutlet(code):await api('outlet',{outletCode:code});
      if(!r.ok) throw new Error(r.error||'Gagal memuat outlet'); renderOutletDetail(r);
    }catch(err){showDetail('Outlet',humanError(err))}finally{setBusy(false)}
  }

  function renderOutletDetail(r){
    const h=r.health||{}; const daily=r.daily||[]; const ops=r.operations;
    $('#detailPage').innerHTML=`<div class="section-title"><div><h3>${esc(h['Outlet Name']||r.outletCode)}</h3><p>${esc(r.outletCode)} · ${esc(h['Health Status']||'')}</p></div><button id="backDetail" class="btn soft">Kembali</button></div>
    <div class="kpi-grid"><div class="kpi-card"><span>Health</span><strong>${fmt1(h['Health Score'])}</strong><small>${esc(h['Confidence']||'')}</small></div><div class="kpi-card"><span>Revenue</span><strong>${money(h['Revenue'])}</strong><small>official day</small></div><div class="kpi-card"><span>Organic</span><strong>${money(h['Organic Revenue'])}</strong><small>bulk excluded</small></div><div class="kpi-card"><span>Inventory</span><strong>${fmt1(h['Inventory Score'])}</strong><small>health score</small></div></div>
    <div class="section-title"><div><h3>Key Driver</h3></div></div><div class="card"><strong>${esc(h['Key Driver']||'-')}</strong><p class="muted">${esc(h['Owner Action']||'')}</p></div>
    ${ops?`<div class="section-title"><div><h3>Operational Compliance — Owner Only</h3></div></div><div class="data-list">${['Task Pending','Request Overdue','Production QC Issues','SO POTENSI BOCOR','SO CEK DATA','Shift Closing','Operational Status'].map(k=>`<div class="data-row"><strong>${k}</strong><span>${esc(ops[k]||'-')}</span></div>`).join('')}</div>`:''}
    <div class="section-title"><div><h3>Recent Revenue</h3></div></div>${simpleTable(daily.slice(-10),['Date','Revenue','Transactions','Avg Ticket','Data Confidence'])}`;
    $('#backDetail').addEventListener('click',()=>switchPage('outletsPage'));
  }

  async function askWill(e){
    e.preventDefault(); const input=$('#askInput'); const q=input.value.trim(); if(!q)return; input.value=''; addBubble(q,'user'); addBubble('Membaca Intelligence…','will','thinking');
    try{
      const r=state.demoRole?demoAsk(q):await api('askWill',{question:q}); removeThinking();
      if(!r.ok) throw new Error(r.error||'WILL gagal menjawab'); addWillAnswer(r.answer);
    }catch(err){removeThinking();addBubble(humanError(err),'will')}
  }

  function addWillAnswer(a){
    const ev=(a.evidence||[]).length?`<ul class="evidence">${a.evidence.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'';
    const html=`<b>${esc(a.summary||'')}</b>${ev}<div style="margin-top:8px"><span class="pill orange">Confidence ${esc(a.confidence||'MEDIUM')}</span></div>`;
    addBubble(html,'will',null,true);
  }

  function bindNav(){ $$('.nav-item').forEach(b=>b.addEventListener('click',()=>switchPage(b.dataset.page,b))); }
  function switchPage(id,btn){ $$('.page').forEach(p=>p.classList.toggle('active',p.id===id)); $$('.nav-item').forEach(x=>x.classList.toggle('active',x===btn || x.dataset.page===id)); window.scrollTo({top:0,behavior:'smooth'}); }
  function bindProfile(){ $('#profileBtn').addEventListener('click',showProfile); }
  function showProfile(){ showDetail('Profile & Security',`${esc(state.user.displayName)}<br>Role: <b>${esc(state.user.role)}</b><br>Scope: ${esc(state.user.scopeType)}<br>Outlet: ${esc((state.user.outletCodes||[]).join(', ')||'NETWORK')}<br><br><button id="logoutBtn" class="btn soft">Logout</button>`); setTimeout(()=>$('#logoutBtn')?.addEventListener('click',()=>logout(true)),0); }
  function showDetail(title,html){ switchPage('detailPage'); $('#detailPage').innerHTML=`<div class="section-title"><div><h3>${title}</h3></div><button id="backDetail" class="btn soft">Kembali</button></div><div class="card">${html}</div>`; $('#backDetail').addEventListener('click',()=>switchPage('morePage')); }
  function renderOperations(rows){ renderGenericRows('Operational Control — OWNER ONLY',rows,['Date','Outlet Code','Operational Status','Task Pending','Request Overdue','Production QC Issues','SO POTENSI BOCOR','SO CEK DATA','Shift Closing','Confidence']); }
  function renderGenericRows(title,rows,cols){ switchPage('detailPage'); cols=cols||guessCols(rows); $('#detailPage').innerHTML=`<div class="section-title"><div><h3>${title}</h3></div><button id="backDetail" class="btn soft">Kembali</button></div>${simpleTable(rows,cols)}`; $('#backDetail').addEventListener('click',()=>switchPage('morePage')); }

  function outletCard(h){ const st=h['Health Status']||''; return `<div class="card outlet-card"><button data-outlet="${esc(h['Outlet Code'])}"><div class="outlet-top"><div><div class="outlet-code">${esc(h['Outlet Code'])}</div><small class="muted">${esc(h['Outlet Name']||'')}</small></div><div class="score">${fmt1(h['Health Score'])}</div></div><div style="margin-top:10px">${pill(st)}</div><p class="driver">${esc(h['Key Driver']||'-')}</p></button></div>`; }
  function bindOutletCards(scope){ $$(`${scope} [data-outlet]`).forEach(b=>b.addEventListener('click',()=>openOutlet(b.dataset.outlet))); }
  function alertRow(a){ const sev=String(a.Severity||a['Severity']||'INFO').toUpperCase(); return `<div class="alert-row"><i class="severity-dot ${sev}"></i><div><h4>${esc(sev)} · ${esc(a['Outlet/Scope']||'')}</h4><p>${esc(a.Signal||a['Signal']||'')}<br><b>${esc(a['Recommended Action']||'')}</b></p></div></div>`; }
  function pill(status){ const s=String(status||'').toUpperCase(); const cls=/SEHAT|AMAN|PASS/.test(s)?'green':/PRIORITAS|CRITICAL|HIGH/.test(s)?'red':'yellow'; return `<span class="pill ${cls}">${esc(status||'MONITOR')}</span>`; }
  function simpleTable(rows,cols){ if(!rows?.length)return '<div class="empty">Belum ada data.</div>'; return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c]??'-')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
  function guessCols(rows){ return rows?.length?Object.keys(rows[0]).filter(k=>!k.startsWith('__')).slice(0,8):[]; }

  async function api(action,payload={},withToken=true){
    if(!CFG.API_URL) throw new Error('API_URL belum dikonfigurasi');
    const body={action,...payload}; if(withToken)body.token=state.token;
    const res=await fetch(CFG.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow'}); return await res.json();
  }

  function demoOutlet(code){ const h=(window.WILLS_DEMO[state.demoRole].health||[]).find(x=>x['Outlet Code']===code)||{}; return {ok:true,outletCode:code,health:h,daily:[],topProducts:[],customer:[],operations:state.demoRole==='OWNER'?{'Task Pending':'13','Request Overdue':code==='UPI'?'1':'0','Production QC Issues':code==='UPI'?'2':'0','SO POTENSI BOCOR':code==='UPI'?'8':'4','SO CEK DATA':'3','Shift Closing':code==='CPK'?'OPEN':'CLOSED','Operational Status':code==='CPK'?'CRITICAL_REVIEW':'ATTENTION'}:null}; }
  function demoMore(kind){ if(kind==='operations')return {ok:true,operations:(window.WILLS_DEMO.OWNER.health||[]).map(h=>demoOutlet(h['Outlet Code']).operations?{Date:'31/08/2026','Outlet Code':h['Outlet Code'],...demoOutlet(h['Outlet Code']).operations}:null).filter(Boolean)}; if(kind==='warehouse')return {ok:true,warehouse:[{Metric:'Inventory Value',Value:'Rp8.081.199'}],supply:[{Status:'LINK INTEGRITY REVIEW',Scope:'TM + CPK'}]}; if(kind==='finance')return {ok:true,finance:[{Metric:'Bank',Value:'Rp446.992'},{Metric:'Hutang Supplier',Value:'Rp1.320.000'},{Metric:'Piutang Outlet',Value:'Rp4.882.824'}]}; return {ok:true}; }
  function demoAsk(q){ const lower=q.toLowerCase(); if(state.demoRole==='INVESTOR' && /operasional|produksi|so|terima bahan|permintaan bahan|gudang/.test(lower)) return {ok:false,error:'ROLE_DENIED'}; let summary='Kondisi bisnis dibaca dari snapshot demo Intelligence.'; let evidence=['Gunakan backend live untuk jawaban aktual.']; if(/upi/.test(lower)){summary='UPI menjadi prioritas pada snapshot terakhir.';evidence=['Health 54.72','Transaction volume turun','Inventory integrity perlu review'];} if(/operasional/.test(lower)){summary='Operational Compliance menunjukkan Cikopak perlu review paling tinggi.';evidence=['Closing masih OPEN pada snapshot','Produksi memiliki QC issue','Supply link perlu verifikasi'];} return {ok:true,answer:{summary,evidence,confidence:'DEMO'}}; }

  function logout(show=true){ state.token='';state.user=null;state.dashboard=null;state.demoRole=null;localStorage.removeItem('wills_token');$('#appShell').classList.add('hidden');$('#loginView').classList.remove('hidden');if(show)toast('Logout berhasil'); }
  function setBusy(x){ document.body.style.cursor=x?'progress':''; }
  function addBubble(text,type,id,html=false){ const d=document.createElement('div'); d.className=`bubble ${type}`; if(id)d.dataset.id=id; html?d.innerHTML=text:d.textContent=text; $('#chat').appendChild(d); d.scrollIntoView({behavior:'smooth',block:'end'}); }
  function removeThinking(){ $('[data-id="thinking"]')?.remove(); }
  function toast(msg){ const t=$('#toast'); t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600); }
  function humanError(e){ const s=String(e?.message||e||'Error'); const map={ROLE_DENIED:'Akses ini khusus Owner.',OUTLET_SCOPE_DENIED:'Akses hanya untuk outlet yang ditetapkan.',SESSION_EXPIRED:'Sesi berakhir. Silakan login lagi.',LOGIN_DENIED:'Login ID atau PIN tidak cocok.'}; return map[s]||s; }
  function findBrief(a,k){return (a||[]).find(x=>x.key===k)}
  function money(x){const n=num(x);return n?'Rp'+Math.round(n).toLocaleString('id-ID'):'Rp0'} function formatSmart(x){return /^-?\d+(\.\d+)?$/.test(String(x||''))?money(x):esc(x||'-')}
  function num(x){let s=String(x??'').replace(/Rp\s*/ig,'').trim().replace(/\s/g,'').replace(/[^0-9,.-]/g,'');if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,'').replace(',','.');else if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,'');else if(/^-?\d+,\d+$/.test(s))s=s.replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0}
  function fmt1(x){return num(x).toFixed(1).replace('.0','')} function initials(s){return String(s||'').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}
  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function deepClone(x){return JSON.parse(JSON.stringify(x))}
  function registerSW(){ if('serviceWorker'in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{}); }
})();
