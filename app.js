(() => {
'use strict';
const CFG = window.WILLS_CONFIG || {};
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const state = {
  token: localStorage.getItem('wills_token') || '', user:null, dashboard:null, view:'chat', drawer:false,
  chats: loadChats(), activeChat: null, lastIntent:'', lastOutlet:'', sending:false,
  historyReady:false, pendingViewFromDrawer:'', scrollPositions:{chat:0,panels:{}}
};
document.addEventListener('DOMContentLoaded', init);

async function init(){
  paintIcons(); bindUI(); registerSW();
  const started=Date.now();
  if(state.token && CFG.API_URL){
    try{ await restoreSession(); await minSplash(started); hideSplash(); enterApp(); return; }catch(_){ clearSession(); }
  }
  await minSplash(started); hideSplash(); showLogin();
}
function minSplash(t){return new Promise(r=>setTimeout(r,Math.max(0,900-(Date.now()-t))))}
function hideSplash(){$('#splash').classList.add('out');setTimeout(()=>$('#splash')?.remove(),460)}
function showLogin(){$('#appShell').classList.add('hidden');$('#loginView').classList.remove('hidden');if(!CFG.API_URL)$('#apiHelpBtn').classList.remove('hidden')}
function enterApp(){
  $('#loginView').classList.add('hidden');$('#appShell').classList.remove('hidden');
  const n=state.user?.displayName||state.user?.role||'Owner';
  $('#headerAvatar').textContent=initials(n);$('#drawerAvatar').textContent=initials(n);$('#drawerName').textContent=n;$('#drawerRole').textContent=state.user?.role||'';
  $$('.owner-only').forEach(x=>x.classList.toggle('hidden',state.user?.role!=='OWNER'));
  const high=(state.dashboard?.alerts||[]).filter(x=>['HIGH','CRITICAL'].includes(String(x.Severity||'').toUpperCase())).length;
  const c=$('#drawerAlertCount');c.textContent=high;c.classList.toggle('show',high>0);
  if(!state.activeChat) newChat(false);
  initAppHistory();
  showView('chat',{fromHistory:true,force:true});
}
function bindUI(){
  $('#loginForm').addEventListener('submit',login);
  $('#togglePin').addEventListener('click',()=>{const i=$('#pin');i.type=i.type==='password'?'text':'password';$('#togglePin').dataset.icon=i.type==='text'?'eye-off':'eye';paintIcons($('#togglePin'))});
  $('#menuBtn').addEventListener('click',openDrawer);$('#closeDrawer').addEventListener('click',requestDrawerClose);$('#drawerScrim').addEventListener('click',requestDrawerClose);
  $('#headerAvatar').addEventListener('click',()=>{openDrawer();setTimeout(()=>scrollDrawerBottom(),120)});
  $('#headerBrand').addEventListener('click',()=>showView('chat'));
  $('#newChatBtn').addEventListener('click',()=>navigateFromDrawer('chat',()=>newChat(true)));
  $('#logoutBtn').addEventListener('click',()=>logout());
  $$('.drawer-link[data-view]').forEach(b=>b.addEventListener('click',()=>navigateFromDrawer(b.dataset.view)));
  $$('.suggestions button[data-prompt]').forEach(b=>b.addEventListener('click',()=>sendQuestion(b.dataset.prompt)));
  $('#composer').addEventListener('submit',e=>{e.preventDefault();sendQuestion($('#askInput').value)});
  $('#askInput').addEventListener('input',autoGrow);
  $('#askInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#composer').requestSubmit()}});
  $('#apiHelpBtn').addEventListener('click',()=>toast('Isi API_URL pada config.js dengan Web App URL Apps Script yang berakhir /exec.'));
  window.addEventListener('popstate',handlePopState);
  window.addEventListener('pageshow',()=>{ if(state.historyReady && !history.state?.wills && !history.state?.willsBoundary) rearmRootGuard(); });
  installMobileGuards();
}
async function login(e){
  e.preventDefault();if(!CFG.API_URL)return toast('Backend belum tersambung. Isi API_URL pada config.js.');
  const b=$('#loginBtn'),old=b.textContent;b.disabled=true;b.textContent='Memverifikasi…';
  try{const r=await api('login',{loginId:$('#loginId').value.trim(),pin:$('#pin').value},false);if(!r.ok)throw new Error(r.error||'Login gagal');state.token=r.token;state.user=r.user;localStorage.setItem('wills_token',state.token);await loadDashboard();enterApp()}catch(err){toast(humanError(err))}finally{b.disabled=false;b.textContent=old}
}
async function restoreSession(){const me=await api('me',{});if(!me.ok)throw new Error(me.error||'SESSION_INVALID');state.user=me.user;await loadDashboard()}
async function loadDashboard(){const r=await api('dashboard',{});if(!r.ok)throw new Error(r.error||'Gagal memuat Intelligence');state.dashboard=r;state.user=r.user}

function showView(v,opts={}){
  const prev=state.view;
  captureViewScroll(prev);
  state.view=v;
  $('.chat-view').classList.toggle('active',v==='chat');$('.panel-view').classList.toggle('active',v!=='chat');
  $$('.drawer-link[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  const titles={chat:'Wills Intelligence',summary:'Ringkasan Bisnis',outlets:'Outlet',alerts:'Alerts',operations:'Operasional',warehouse:'Warehouse',finance:'Finance',profile:'Profile & Akses'};
  $('#viewSubtitle').textContent=titles[v]||'Wills Intelligence';
  if(state.historyReady&&!opts.fromHistory&&prev!==v)pushViewHistory(v);
  if(v==='chat'){
    renderChat();
    restoreViewScroll('chat');
    if(window.matchMedia('(pointer:fine)').matches)setTimeout(()=>$('#askInput').focus({preventScroll:true}),100);
    return;
  }
  dismissKeyboard();
  renderPanel(v);restoreViewScroll(v);
}
async function renderPanel(v){
  const p=$('#panelContent');p.innerHTML=panelHead(t(v),'Memuat Intelligence terbaru…')+`<div class="empty-panel">Memuat…</div>`;
  try{
    if(v==='summary')return renderSummary();
    if(v==='outlets')return renderOutlets();
    if(v==='alerts')return renderAlerts(state.dashboard?.alerts||[]);
    if(v==='profile')return renderProfile();
    if(v==='operations'){const r=await api('operations',{});if(!r.ok)throw new Error(r.error);return renderOperations(r.operations||[])}
    if(v==='warehouse'){const r=await api('warehouse',{});if(!r.ok)throw new Error(r.error);return renderWarehouse(r)}
    if(v==='finance'){const r=await api('finance',{});if(!r.ok)throw new Error(r.error);return renderFinance(r.finance||[])}
  }catch(err){p.innerHTML=panelHead(t(v),'Tidak dapat memuat')+`<div class="empty-panel">${esc(humanError(err))}</div>`}
}
function renderSummary(){
  const d=state.dashboard||{}, health=d.health||[], brief=d.morningBrief||[];
  const score=health.length?health.reduce((s,x)=>s+num(x['Health Score']),0)/health.length:0;
  const best=health.slice().sort((a,b)=>num(b['Health Score'])-num(a['Health Score']))[0]||{};
  const worst=health.slice().sort((a,b)=>num(a['Health Score'])-num(b['Health Score']))[0]||{};
  const revenue=briefValue(brief,['Network Headline Revenue','Network Revenue','Revenue Last Complete Day']);
  const organic=briefValue(brief,['Network Organic Revenue','Organic Revenue']);
  const usefulBrief=(brief||[]).filter(r=>/priority|supply urgent|closing|inventory|liquidity|health|revenue/i.test(String(r.key||''))).slice(0,8);
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Ringkasan Bisnis','Versi singkat supaya kamu cepat paham kondisi bisnis tanpa harus baca laporan panjang.')}
    <div class="hero"><span>KESEHATAN BISNIS</span><h3>${fmt1(score)} / 100</h3><p>${healthStatusText(score)} · Ini skor gabungan kondisi penjualan, stok, keseimbangan, dan operasional ${health.length} outlet.</p></div>
    <div class="section-title">ANGKA YANG PALING PENTING</div>
    <div class="metric-grid">
      ${metric('Penjualan terakhir',money(revenue),'total penjualan pada hari operasional lengkap terakhir')}
      ${metric('Penjualan reguler',money(organic),'penjualan setelah pesanan besar/bulk dipisahkan')}
      ${metric('Outlet paling sehat',best['Outlet Code']||'-',`${fmt1(best['Health Score'])}/100`)}
      ${metric('Perlu perhatian',worst['Outlet Code']||'-',`${fmt1(worst['Health Score'])}/100`)}
    </div>
    <div class="section-title">YANG PERLU KAMU TAHU</div>
    <div class="card-list">${usefulBrief.length?usefulBrief.map((r,i)=>rowCard(i<3?'pulse':'message',friendlyBriefKey(r.key),plainText(r.value||''),plainText(r.interpretation||''))).join(''):'<div class="empty-panel">Belum ada ringkasan tambahan.</div>'}</div>
  </div>`;
}
function renderOutlets(){
  const rows=state.dashboard?.health||[];
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Outlet','Lihat kondisi masing-masing outlet. Angka 100 berarti semakin sehat.')}<div class="outlet-grid">${rows.map(r=>`<button class="outlet-card" data-outlet="${esc(r['Outlet Code'])}"><strong>${esc(r['Outlet Code'])}</strong><span>${esc(r['Outlet Name']||'')}</span><div class="score">${fmt1(r['Health Score'])}</div><small>${esc(friendlyHealthStatus(r['Health Status']))}</small></button>`).join('')}</div></div>`;
  $$('[data-outlet]').forEach(b=>b.addEventListener('click',()=>openOutlet(b.dataset.outlet)));
}
async function openOutlet(code){
  $('#panelContent').innerHTML=`<div class="panel">${panelHead(code,'WILL sedang membaca kondisi outlet…')}<div class="empty-panel">Memuat…</div></div>`;
  try{const r=await api('outlet',{outletCode:code});if(!r.ok)throw new Error(r.error);const h=r.health||{};const daily=r.daily||[];const ops=r.operations;
    $('#panelContent').innerHTML=`<div class="panel">${panelHead(`${h['Outlet Name']||code} · ${code}`,friendlyHealthStatus(h['Health Status']||'MONITOR'))}
      <div class="metric-grid">
        ${metric('Kesehatan',`${fmt1(h['Health Score'])}/100`,friendlyHealthStatus(h['Health Status']))}
        ${metric('Penjualan',money(h['Revenue']),'hari lengkap terakhir')}
        ${metric('Penjualan reguler',money(h['Organic Revenue']),'di luar pesanan besar/bulk')}
        ${metric('Kondisi stok',`${fmt1(h['Inventory Score'])}/100`,'semakin tinggi semakin sehat')}
      </div>
      <div class="section-title">PENJELASAN WILL</div>
      <div class="hero"><span>YANG PALING BERPENGARUH</span><h3>${esc(plainText(h['Key Driver']||'-'))}</h3><p>${esc(plainText(h['Owner Action']||'Belum ada tindakan khusus yang perlu dilakukan.'))}</p></div>
      ${ops&&state.user?.role==='OWNER'?`<div class="section-title">OPERASIONAL · KHUSUS OWNER</div><div class="card-list">
        ${rowCard('clipboard','Tugas belum selesai',ops['Task Pending']||0,'Belum otomatis berarti barista salah; lihat apakah fitur tugas sudah benar-benar dipakai.')}
        ${rowCard('package','Permintaan bahan terlambat',ops['Request Overdue']||0,'Perlu dicek jika tanggal kebutuhan sudah lewat.')}
        ${rowCard('pulse','Produksi perlu dicek',ops['Production QC Issues']||0,'Jumlah hasil produksi yang berada di luar target QC.')}
        ${rowCard('scan','SO perlu dicek',ops['SO POTENSI BOCOR']||0,'Ini tanda selisih stok, bukan kehilangan yang sudah terbukti.')}
        ${rowCard('clock','Status closing',friendlyClosing(ops['Shift Closing']),plainText(ops['Operational Status']||''))}
      </div>`:''}
      <div class="section-title">PENJUALAN TERBARU</div>${table(daily.slice(-10),['Date','Revenue','Transactions','Avg Ticket','Data Confidence'])}</div>`;
  }catch(err){toast(humanError(err))}
}
function renderAlerts(rows){
  const sev=x=>String(x.Severity||'INFO').toUpperCase();
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Alerts','WILL memilih hal yang layak kamu cek. HIGH bukan berarti bisnis sedang gagal; artinya perlu dilihat lebih dulu.')}<div class="card-list">${rows.length?rows.map(r=>`<div class="card-row"><div class="row-icon">${icon('bell')}</div><div><b>${esc(r['Outlet/Scope']||r.Category||'Alert')} · ${esc(plainText(r.Entity||''))}</b><span>${esc(plainText(r.Signal||''))}</span><span><strong>Saran:</strong> ${esc(plainText(r['Recommended Action']||''))}</span></div><em class="badge ${sev(r)==='HIGH'||sev(r)==='CRITICAL'?'red':sev(r)==='MEDIUM'?'amber':'green'}">${friendlySeverity(sev(r))}</em></div>`).join(''):'<div class="empty-panel">Tidak ada hal penting yang perlu kamu cek saat ini.</div>'}</div></div>`;
}
function renderOperations(rows){
  const latest=rows.slice(-15).reverse();
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Operasional','Khusus Owner · WILL merangkum tugas, penerimaan bahan, permintaan bahan, produksi, SO, dan closing.')}<div class="card-list">${latest.map(r=>rowCard('clipboard',`${r['Outlet Code']} · ${r.Date}`,friendlyOperational(r['Operational Status']||'MONITOR'),`Tugas belum selesai ${r['Task Pending']||0} · Permintaan terlambat ${r['Request Overdue']||0} · Produksi perlu dicek ${r['Production QC Issues']||0} · SO perlu dicek ${r['SO POTENSI BOCOR']||0}`)).join('')}</div></div>`;
}
function renderWarehouse(r){
  const wh=r.warehouse||[], supply=r.supply||[];const summary=wh.find(x=>x['Material Code']==='__SUMMARY__')||wh[0]||{};
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Warehouse','Ringkasan gudang dengan istilah sederhana.')}
    <div class="metric-grid">
      ${metric('Nilai stok gudang',money(summary['Inventory Value']||summary['Stock Value']),'perkiraan nilai barang yang ada di gudang')}
      ${metric('Saldo bank gudang',money(summary['Bank Balance']),'uang di rekening gudang pada snapshot terakhir')}
      ${metric('Kas gudang',money(summary['Cash Balance']),'uang tunai gudang')}
      ${metric('Alur bahan terbuka',String(supply.length),'permintaan/SJ yang masih ada di data supply')}
    </div>
    <div class="section-title">PENGIRIMAN & PERMINTAAN BAHAN</div>${table(supply.slice(-15),['Outlet Code','SJ Number','SJ Status','Request Status','SLA Status','Last Error'])}</div>`;
}
function renderFinance(rows){
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Finance','Khusus Owner · posisi uang gudang, hutang supplier, dan piutang outlet.')}<div class="beginner-note"><b>Cara membacanya:</b> angka saldo menunjukkan uang yang sudah tersedia. Piutang adalah uang yang masih harus diterima, jadi jangan dianggap sebagai kas sampai benar-benar dibayar.</div>${table(rows.slice(-40),['Date','Metric Type','Net Amount','Due Date','Status','Source Ledger'])}</div>`;
}
function renderProfile(){
  const u=state.user||{};$('#panelContent').innerHTML=`<div class="panel">${panelHead('Profile & Akses','Hak akses ditentukan backend')}<div class="profile-card"><div class="big-avatar">${initials(u.displayName||u.role)}</div><h3>${esc(u.displayName||'-')}</h3><p>${esc(u.role||'')} · ${esc(u.scopeType||'')}</p><div class="profile-meta"><div><span>Role</span><b>${esc(u.role||'-')}</b></div><div><span>Scope</span><b>${esc((u.outletCodes||[]).join(', ')||'ALL')}</b></div></div></div></div>`;
}

function newChat(save=true){if(save&&state.activeChat)persistActive();state.activeChat={id:'c_'+Date.now(),created:Date.now(),messages:[]};renderChat()}
function renderChat(){
  const msgs=state.activeChat?.messages||[];$('#chatEmpty').classList.toggle('hidden',msgs.length>0);const box=$('#chatMessages');box.innerHTML='';msgs.forEach(m=>appendMessage(m,false));setTimeout(()=>scrollChat(false),30)
}
async function sendQuestion(raw){
  const q=String(raw||'').trim();if(!q||state.sending)return;state.sending=true;showView('chat');$('#askInput').value='';autoGrow({target:$('#askInput')});
  if(!state.activeChat)newChat(false);state.activeChat.messages.push({role:'user',text:q});appendMessage({role:'user',text:q});$('#chatEmpty').classList.add('hidden');
  const think={role:'thinking',id:'thinking'};appendMessage(think);$('#sendBtn').disabled=true;
  try{
    const r=await api('askWill',{question:q,context:{lastIntent:state.lastIntent||'',lastOutlet:state.lastOutlet||''}});
    removeThinking();if(!r.ok)throw new Error(r.error||'WILL gagal menjawab');
    const a=r.answer||{};
    if(r.intent)state.lastIntent=r.intent;
    if(r.outletCode)state.lastOutlet=r.outletCode;
    else{const found=findOutletInText(q);if(found)state.lastOutlet=found}
    const m={role:'assistant',summary:a.summary||'',evidence:a.evidence||[],nextStep:a.nextStep||'',confidence:a.confidence||'MEDIUM'};
    state.activeChat.messages.push(m);appendMessage(m);persistActive()
  }catch(err){
    removeThinking();const m={role:'assistant',summary:humanError(err),evidence:[],confidence:'LOW'};
    state.activeChat.messages.push(m);appendMessage(m)
  }finally{state.sending=false;$('#sendBtn').disabled=false;scrollChat()}
}
function appendMessage(m,scroll=true){
  const box=$('#chatMessages'),el=document.createElement('div');
  if(m.role==='user'){el.className='message user';el.innerHTML=`<div class="message-body">${esc(m.text)}</div>`}
  else if(m.role==='thinking'){el.className='message assistant';el.dataset.id='thinking';el.innerHTML=`<div class="assistant-avatar"><img src="./icons/icon-192.png" alt="Wills Intelligence"></div><div class="message-body"><div class="thinking"><i></i><i></i><i></i></div></div>`}
  else{
    el.className='message assistant';
    const ev=(m.evidence||[]).length?`<ul>${m.evidence.map(x=>`<li>${esc(plainText(x))}</li>`).join('')}</ul>`:'';
    const next=m.nextStep?`<div class="next-step"><b>Kalau mau ditindaklanjuti:</b> ${esc(plainText(m.nextStep))}</div>`:'';
    el.innerHTML=`<div class="assistant-avatar"><img src="./icons/icon-192.png" alt="Wills Intelligence"></div><div class="message-body"><div class="assistant-summary">${esc(plainText(m.summary||''))}</div>${ev}${next}<span class="confidence">Keyakinan data: ${esc(friendlyConfidence(m.confidence||'MEDIUM'))}</span></div>`
  }
  box.appendChild(el);if(scroll)scrollChat()
}
function removeThinking(){$('[data-id="thinking"]')?.remove()}
function persistActive(){if(!state.activeChat||!state.activeChat.messages.length)return;const arr=loadChats().filter(x=>x.id!==state.activeChat.id);arr.unshift(state.activeChat);localStorage.setItem('wills_chats',JSON.stringify(arr.slice(0,10)))}
function loadChats(){try{return JSON.parse(localStorage.getItem('wills_chats')||'[]')}catch(_){return[]}}
function autoGrow(e){const t=e.target;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,130)+'px'}
function scrollChat(smooth=true){const x=$('#chatScroller');x.scrollTo({top:x.scrollHeight,behavior:smooth?'smooth':'auto'})}

function appBaseUrl(){return location.pathname+location.search}
function viewUrl(v){return appBaseUrl()+'#'+(v||'chat')}
function initAppHistory(){
  if(state.historyReady)return;
  state.historyReady=true;
  history.replaceState({willsBoundary:true},'',appBaseUrl());
  history.pushState({wills:true,view:'chat'},'',viewUrl('chat'));
}
function pushViewHistory(v){
  if(!state.historyReady)return;
  history.pushState({wills:true,view:v},'',viewUrl(v));
}
function rearmRootGuard(){
  if(!state.historyReady)return;
  history.pushState({wills:true,view:'chat'},'',viewUrl('chat'));
}
function openDrawer(){
  if(state.drawer)return;
  dismissKeyboard();state.drawer=true;document.body.classList.add('drawer-open');$('#drawer').classList.add('open');$('#drawerScrim').classList.add('open');
  if(state.historyReady)history.pushState({wills:true,view:state.view,overlay:'drawer'},'',viewUrl(state.view));
}
function closeDrawerDirect(){state.drawer=false;document.body.classList.remove('drawer-open');$('#drawer').classList.remove('open');$('#drawerScrim').classList.remove('open')}
function requestDrawerClose(){
  if(!state.drawer)return;
  if(state.historyReady&&history.state?.overlay==='drawer')history.back();else closeDrawerDirect();
}
function navigateFromDrawer(v,before){
  state.pendingViewFromDrawer=v||'chat';state.pendingDrawerAction=before||null;
  if(state.drawer&&state.historyReady&&history.state?.overlay==='drawer'){history.back();return}
  closeDrawerDirect();if(state.pendingDrawerAction){state.pendingDrawerAction();state.pendingDrawerAction=null}showView(state.pendingViewFromDrawer);state.pendingViewFromDrawer='';
}
function handlePopState(e){
  if(!state.historyReady||$('#appShell').classList.contains('hidden'))return;
  const hs=e.state||{};
  if(state.drawer){
    closeDrawerDirect();
    const pending=state.pendingViewFromDrawer,action=state.pendingDrawerAction;
    state.pendingViewFromDrawer='';state.pendingDrawerAction=null;
    if(pending){if(action)action();setTimeout(()=>showView(pending),0);return}
  }
  if(hs.willsBoundary){
    showView('chat',{fromHistory:true,force:true});
    rearmRootGuard();
    toast('Kamu sudah di halaman utama WILL.');
    return;
  }
  if(hs.wills){showView(hs.view||'chat',{fromHistory:true,force:true});return}
  showView('chat',{fromHistory:true,force:true});rearmRootGuard();
}
function captureViewScroll(v){
  if(v==='chat'){const x=$('#chatScroller');if(x)state.scrollPositions.chat=x.scrollTop;return}
  const p=$('#panelView');if(p)state.scrollPositions.panels[v]=p.scrollTop;
}
function restoreViewScroll(v){setTimeout(()=>{if(v==='chat'){const x=$('#chatScroller');if(x&&state.scrollPositions.chat>0)x.scrollTop=state.scrollPositions.chat;return}const p=$('#panelView');if(p)p.scrollTop=state.scrollPositions.panels[v]||0},30)}
function dismissKeyboard(){const a=document.activeElement;if(a&&/INPUT|TEXTAREA/.test(a.tagName))a.blur()}
function installMobileGuards(){
  // Native mobile behavior: normal vertical scrolling, no document pull-to-refresh.
  // Do NOT prevent touchmove globally because it can lock nested scroll containers.
  document.documentElement.style.overscrollBehaviorY='none';
  document.body.style.overscrollBehaviorY='none';
}
function scrollDrawerBottom(){const d=$('#drawer');d.scrollTop=d.scrollHeight}
function logout(){persistActive();clearSession();closeDrawerDirect();state.historyReady=false;state.pendingViewFromDrawer='';$('#pin').value='';history.replaceState(null,'',appBaseUrl());showLogin();toast('Kamu sudah keluar dari WILL')}
function clearSession(){state.token='';state.user=null;state.dashboard=null;localStorage.removeItem('wills_token')}

async function api(action,payload={},withToken=true){
  if(!CFG.API_URL)throw new Error('API_URL belum dikonfigurasi');const body={action,...payload};if(withToken)body.token=state.token;
  const res=await fetch(CFG.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow',cache:'no-store'});return await res.json();
}
function panelHead(title,sub){return `<div class="panel-head"><div><span>WILLS INTELLIGENCE</span><h2>${esc(title)}</h2><p>${esc(sub||'')}</p></div></div>`}
function metric(k,v,n=''){return `<div class="metric"><span>${esc(k)}</span><b>${esc(v??'-')}</b><small>${esc(n)}</small></div>`}
function rowCard(ico,title,value,note=''){return `<div class="card-row"><div class="row-icon">${icon(ico)}</div><div><b>${esc(title)}</b><span>${esc(plainText(value))}</span>${note?`<span>${esc(plainText(note))}</span>`:''}</div></div>`}
function table(rows,cols){if(!rows?.length)return '<div class="empty-panel">Belum ada data.</div>';return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${esc(friendlyColumn(c))}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(formatCell(c,r[c]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function briefValue(arr,keys){for(const k of keys){const r=(arr||[]).find(x=>String(x.key||'').toLowerCase().includes(String(k).toLowerCase()));if(r)return r.value}return 0}
function t(v){return ({summary:'Ringkasan Bisnis',outlets:'Outlet',alerts:'Alerts',operations:'Operasional',warehouse:'Warehouse',finance:'Finance',profile:'Profile & Akses'})[v]||v}
function healthStatus(s){return s>=85?'SEHAT':s>=70?'PERLU PERHATIAN':s>=60?'WASPADA':'PRIORITAS'}
function healthStatusText(s){return s>=85?'Secara umum sehat':s>=70?'Cukup sehat, tapi ada beberapa hal yang perlu diperhatikan':s>=60?'Perlu lebih sering dipantau':'Perlu menjadi prioritas kamu'}
function friendlyHealthStatus(s){const u=String(s||'').toUpperCase();return ({SEHAT:'Sehat',PERLU_PERHATIAN:'Perlu perhatian',WASPADA:'Perlu dipantau',PRIORITAS:'Prioritas'})[u]||plainText(s||'Pantau')}
function friendlyClosing(s){const u=String(s||'').toUpperCase();return u==='CLOSED'?'Sudah closing':u==='OPEN'?'Belum closing':plainText(s||'-')}
function friendlyOperational(s){const u=String(s||'').toUpperCase();if(/CRITICAL/.test(u))return 'Perlu dicek segera';if(/HIGH/.test(u))return 'Perlu diperiksa';if(/ATTENTION/.test(u))return 'Ada yang perlu diperhatikan';return plainText(s||'Terpantau')}
function friendlySeverity(s){return ({CRITICAL:'SANGAT PENTING',HIGH:'PENTING',MEDIUM:'PERHATIKAN',LOW:'RINGAN',INFO:'INFO'})[String(s||'').toUpperCase()]||s}
function friendlyConfidence(s){return ({HIGH:'Tinggi','MEDIUM-HIGH':'Cukup tinggi',MEDIUM:'Sedang',LOW:'Rendah'})[String(s||'').toUpperCase()]||String(s||'Sedang')}
function friendlyBriefKey(k){let s=String(k||'');s=s.replace(/PRIORITY/ig,'Prioritas').replace(/Supply Urgent/ig,'Pengiriman bahan yang perlu dicek').replace(/Closing Alert/ig,'Closing yang perlu dicek').replace(/Inventory Data Quality/ig,'Kualitas data stok').replace(/Warehouse Liquidity/ig,'Kondisi uang gudang').replace(/Network Headline Revenue.*$/i,'Penjualan jaringan').replace(/Network Organic Revenue.*$/i,'Penjualan reguler jaringan');return s}
function friendlyColumn(c){return ({Date:'Tanggal',Revenue:'Penjualan',Transactions:'Transaksi','Avg Ticket':'Rata-rata per transaksi','Data Confidence':'Kualitas data','Outlet Code':'Outlet','SJ Number':'No. Surat Jalan','SJ Status':'Status SJ','Request Status':'Status Permintaan','SLA Status':'Ketepatan waktu','Last Error':'Catatan','Metric Type':'Jenis','Net Amount':'Nilai','Due Date':'Jatuh tempo','Source Ledger':'Sumber data'})[c]||c}
function formatCell(c,v){if(['Revenue','Avg Ticket','Net Amount'].includes(c))return money(v);return plainText(v??'')}
function num(v){
  let s=String(v??'').replace(/Rp\s*/ig,'').trim().replace(/\s/g,'').replace(/[^0-9,.-]/g,'');
  if(!s)return 0;
  if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,'');
  else if(/^-?\d+,\d+$/.test(s))s=s.replace(',','.');
  const n=Number(s);return Number.isFinite(n)?n:0
}
function money(v){const n=num(v);return 'Rp'+Math.round(n).toLocaleString('id-ID')}
function fmt1(v){return num(v).toLocaleString('id-ID',{minimumFractionDigits:0,maximumFractionDigits:1})}
function initials(s){return String(s||'W').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function findOutletInText(s){const u=String(s||'').toUpperCase();if(/PASAR\s*REBO|\bRB\b/.test(u))return'RB';if(/TEGAL\s*MUNJUL|\bTGM\b|\bTM\b/.test(u))return'TM';if(/\bUPI\b/.test(u))return'UPI';if(/CIKOPAK|\bCPK\b/.test(u))return'CPK';if(/CIPAISAN|\bCPS\b/.test(u))return'CPS';return''}
function plainText(v){
  let s=String(v??'');
  const reps=[
    [/sales below baseline/ig,'penjualan lebih rendah dari pola biasanya'],
    [/inventory variance/ig,'ada selisih stok yang perlu dicek'],
    [/transaction volume/ig,'jumlah transaksi'],
    [/organic/ig,'penjualan reguler'],
    [/bulk\/B2B/ig,'pesanan besar/B2B'],
    [/bulk/ig,'pesanan besar'],
    [/headline revenue/ig,'total penjualan'],
    [/revenue/ig,'penjualan'],
    [/driver utama/ig,'penyebab utama'],
    [/audit variance material/ig,'cek bahan yang memiliki selisih stok'],
    [/POTENSI BOCOR/ig,'potensi selisih stok'],
    [/CEK DATA/ig,'data perlu dicek'],
    [/DATA TIDAK VALID/ig,'data belum valid'],
    [/link integrity review/ig,'cek kecocokan nomor/tautan data'],
    [/supplier payable/ig,'hutang supplier'],
    [/receivable/ig,'piutang'],
    [/cash/ig,'kas'],
    [/closing/ig,'penutupan outlet'],
    [/task pending/ig,'tugas belum selesai'],
    [/request overdue/ig,'permintaan bahan terlambat'],
    [/QC issue/ig,'hasil produksi perlu dicek']
  ];
  reps.forEach(([a,b])=>s=s.replace(a,b));
  return s
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function humanError(e){const s=String(e?.message||e||'Error');return ({ROLE_DENIED:'Bagian ini khusus Owner.',OUTLET_SCOPE_DENIED:'Akun ini hanya boleh melihat outlet yang sudah ditetapkan.',SESSION_EXPIRED:'Sesi kamu sudah berakhir. Silakan login lagi.',SESSION_INVALID:'Sesi tidak valid. Silakan login lagi.',SESSION_REVOKED:'Akses akun sudah dinonaktifkan.',LOGIN_DENIED:'Login ID atau PIN belum cocok.',LOGIN_INVALID:'Login ID atau PIN belum valid.',OUTLET_REQUIRED:'Boleh beb, tapi aku perlu tahu outlet mana yang mau kamu bahas. Cukup ketik misalnya “Pasar Rebo” atau “UPI”.'})[s]||plainText(s)}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),3000)}

function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon)})}
function icon(name){const p={
 user:'<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>','eye-off':'<path d="m3 3 18 18"/><path d="M10.6 6.1A10.3 10.3 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.4 3.2"/><path d="M6.6 6.7C3.6 8.5 2 12 2 12s3.5 6 10 6c1 0 2-.15 2.8-.43"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',x:'<path d="m6 6 12 12M18 6 6 18"/>',edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',message:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',pulse:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',store:'<path d="M4 10v10h16V10"/><path d="M3 10 5 4h14l2 6"/><path d="M8 14h8v6"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="m9 13 2 2 4-4"/>',warehouse:'<path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8"/><path d="M7 16h10"/>',wallet:'<path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h12"/><path d="M16 11h6v4h-6a2 2 0 0 1 0-4Z"/>',logout:'<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
 'arrow-up':'<path d="M12 19V5"/><path d="m7 10 5-5 5 5"/>','arrow-up-right':'<path d="M7 17 17 7M8 7h9v9"/>',package:'<path d="m3 7 9 5 9-5"/><path d="m3 7 9-5 9 5v10l-9 5-9-5V7Z"/>',scan:'<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 12h10"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${p[name]||p.message}</svg>`}
function registerSW(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=0.4.0').catch(()=>{})}
})();
