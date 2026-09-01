(() => {
'use strict';
const CFG = window.WILLS_CONFIG || {};
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const state = {
  token: localStorage.getItem('wills_token') || '', user:null, dashboard:null, view:'chat', drawer:false,
  chats: loadChats(), activeChat: null
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
function minSplash(t){return new Promise(r=>setTimeout(r,Math.max(0,520-(Date.now()-t))))}
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
  showView('chat');
}
function bindUI(){
  $('#loginForm').addEventListener('submit',login);
  $('#togglePin').addEventListener('click',()=>{const i=$('#pin');i.type=i.type==='password'?'text':'password';$('#togglePin').dataset.icon=i.type==='text'?'eye-off':'eye';paintIcons($('#togglePin'))});
  $('#menuBtn').addEventListener('click',openDrawer);$('#closeDrawer').addEventListener('click',closeDrawer);$('#drawerScrim').addEventListener('click',closeDrawer);
  $('#headerAvatar').addEventListener('click',()=>{openDrawer();setTimeout(()=>scrollDrawerBottom(),120)});
  $('#headerBrand').addEventListener('click',()=>showView('chat'));
  $('#newChatBtn').addEventListener('click',()=>{newChat(true);closeDrawer();showView('chat')});
  $('#logoutBtn').addEventListener('click',()=>logout());
  $$('.drawer-link[data-view]').forEach(b=>b.addEventListener('click',()=>{const v=b.dataset.view;closeDrawer();showView(v)}));
  $$('.suggestions button[data-prompt]').forEach(b=>b.addEventListener('click',()=>sendQuestion(b.dataset.prompt)));
  $('#composer').addEventListener('submit',e=>{e.preventDefault();sendQuestion($('#askInput').value)});
  $('#askInput').addEventListener('input',autoGrow);
  $('#askInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#composer').requestSubmit()}});
  $('#apiHelpBtn').addEventListener('click',()=>toast('Isi API_URL pada config.js dengan Web App URL Apps Script yang berakhir /exec.'));
}
async function login(e){
  e.preventDefault();if(!CFG.API_URL)return toast('Backend belum tersambung. Isi API_URL pada config.js.');
  const b=$('#loginBtn'),old=b.textContent;b.disabled=true;b.textContent='Memverifikasi…';
  try{const r=await api('login',{loginId:$('#loginId').value.trim(),pin:$('#pin').value},false);if(!r.ok)throw new Error(r.error||'Login gagal');state.token=r.token;state.user=r.user;localStorage.setItem('wills_token',state.token);await loadDashboard();enterApp()}catch(err){toast(humanError(err))}finally{b.disabled=false;b.textContent=old}
}
async function restoreSession(){const me=await api('me',{});if(!me.ok)throw new Error(me.error||'SESSION_INVALID');state.user=me.user;await loadDashboard()}
async function loadDashboard(){const r=await api('dashboard',{});if(!r.ok)throw new Error(r.error||'Gagal memuat Intelligence');state.dashboard=r;state.user=r.user}

function showView(v){
  state.view=v;$('.chat-view').classList.toggle('active',v==='chat');$('.panel-view').classList.toggle('active',v!=='chat');
  $$('.drawer-link[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  const titles={chat:'Wills Intelligence',summary:'Ringkasan Bisnis',outlets:'Outlet',alerts:'Alerts',operations:'Operasional',warehouse:'Warehouse',finance:'Finance',profile:'Profile & Akses'};
  $('#viewSubtitle').textContent=titles[v]||'Wills Intelligence';
  if(v==='chat'){renderChat();setTimeout(()=>$('#askInput').focus({preventScroll:true}),100);return}
  renderPanel(v);
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
  const revenue=briefValue(brief,['Network Headline Revenue 31/08','Network Revenue 31/08','Revenue Last Complete Day']);
  const organic=briefValue(brief,['Network Organic Revenue 31/08','Organic Revenue']);
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Ringkasan Bisnis','Snapshot Intelligence untuk hari operasional lengkap terakhir')}
    <div class="hero"><span>WILL BUSINESS HEALTH</span><h3>${fmt1(score)} / 100</h3><p>${healthStatus(score)} • ${health.length} outlet terpantau</p></div>
    <div class="section-title">KPI UTAMA</div><div class="metric-grid">${metric('Revenue',money(revenue),'headline')}${metric('Organic',money(organic),'bulk dipisahkan')}${metric('Terbaik',best['Outlet Code']||'-',fmt1(best['Health Score']))}${metric('Prioritas',worst['Outlet Code']||'-',fmt1(worst['Health Score']))}</div>
    <div class="section-title">MORNING BRIEF</div><div class="card-list">${brief.slice(0,12).map((r,i)=>rowCard(i<4?'pulse':'message',r.key||'-',r.value||'',String(r.note||''))).join('')}</div></div>`;
}
function renderOutlets(){
  const rows=state.dashboard?.health||[];
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Outlet','Health dan performa outlet sesuai akses akun')}<div class="outlet-grid">${rows.map(r=>`<button class="outlet-card" data-outlet="${esc(r['Outlet Code'])}"><strong>${esc(r['Outlet Code'])}</strong><span>${esc(r['Outlet Name']||'')}</span><div class="score">${fmt1(r['Health Score'])}</div><small>${esc(r['Health Status']||'MONITOR')}</small></button>`).join('')}</div></div>`;
  $$('[data-outlet]').forEach(b=>b.addEventListener('click',()=>openOutlet(b.dataset.outlet)));
}
async function openOutlet(code){
  $('#panelContent').innerHTML=`<div class="panel">${panelHead(code,'Membaca detail outlet…')}<div class="empty-panel">Memuat…</div></div>`;
  try{const r=await api('outlet',{outletCode:code});if(!r.ok)throw new Error(r.error);const h=r.health||{};const daily=r.daily||[];const ops=r.operations;
    $('#panelContent').innerHTML=`<div class="panel">${panelHead(`${h['Outlet Name']||code} · ${code}`,h['Health Status']||'MONITOR')}
      <div class="metric-grid">${metric('Health',fmt1(h['Health Score']),h['Confidence']||'')}${metric('Revenue',money(h['Revenue']),'official day')}${metric('Organic',money(h['Organic Revenue']),'bulk excluded')}${metric('Inventory',fmt1(h['Inventory Score']),'score')}</div>
      <div class="section-title">WILL ANALYSIS</div><div class="hero"><span>KEY DRIVER</span><h3>${esc(h['Key Driver']||'-')}</h3><p>${esc(h['Owner Action']||'')}</p></div>
      ${ops&&state.user?.role==='OWNER'?`<div class="section-title">OPERASIONAL · OWNER ONLY</div><div class="card-list">${rowCard('clipboard','Task Pending',ops['Task Pending']||0,'')}${rowCard('package','Request Overdue',ops['Request Overdue']||0,'')}${rowCard('pulse','Production QC Issues',ops['Production QC Issues']||0,'')}${rowCard('scan','SO Potensi Bocor',ops['SO POTENSI BOCOR']||0,'Bukan kehilangan terkonfirmasi')}${rowCard('clock','Closing',ops['Shift Closing']||'-',ops['Operational Status']||'')}</div>`:''}
      <div class="section-title">REVENUE TERBARU</div>${table(daily.slice(-10),['Date','Revenue','Transactions','Avg Ticket','Data Confidence'])}</div>`;
  }catch(err){toast(humanError(err))}
}
function renderAlerts(rows){
  const sev=x=>String(x.Severity||'INFO').toUpperCase();
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Alerts','Masalah yang memerlukan perhatian berdasarkan Intelligence')}<div class="card-list">${rows.length?rows.map(r=>`<div class="card-row"><div class="row-icon">${icon('bell')}</div><div><b>${esc(r['Outlet/Scope']||r.Category||'Alert')} · ${esc(r.Entity||'')}</b><span>${esc(r.Signal||'')}</span><span>${esc(r['Recommended Action']||'')}</span></div><em class="badge ${sev(r)==='HIGH'||sev(r)==='CRITICAL'?'red':sev(r)==='MEDIUM'?'amber':'green'}">${sev(r)}</em></div>`).join(''):'<div class="empty-panel">Tidak ada alert.</div>'}</div></div>`;
}
function renderOperations(rows){
  const latest=rows.slice(-15).reverse();
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Operasional','OWNER ONLY · Tugas, Terima Bahan, Request, Produksi, SO, Closing')}<div class="card-list">${latest.map(r=>rowCard('clipboard',`${r['Outlet Code']} · ${r.Date}`,r['Operational Status']||'MONITOR',`Task pending ${r['Task Pending']||0} · Request overdue ${r['Request Overdue']||0} · QC ${r['Production QC Issues']||0} · SO ${r['SO POTENSI BOCOR']||0}`)).join('')}</div></div>`;
}
function renderWarehouse(r){
  const wh=r.warehouse||[], supply=r.supply||[];const summary=wh.find(x=>x['Material Code']==='__SUMMARY__')||wh[0]||{};
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Warehouse','Stok dan supply chain Wills')}<div class="metric-grid">${metric('Inventory',money(summary['Inventory Value']||summary['Stock Value']),'warehouse')}${metric('Bank',money(summary['Bank Balance']),'current')}${metric('Kas',money(summary['Cash Balance']),'current')}${metric('Supply Open',String(supply.length),'rows')}</div><div class="section-title">SUPPLY CHAIN</div>${table(supply.slice(-15),['Outlet Code','SJ Number','SJ Status','Request Status','SLA Status','Last Error'])}</div>`;
}
function renderFinance(rows){
  $('#panelContent').innerHTML=`<div class="panel">${panelHead('Finance','OWNER ONLY · posisi kas, bank, hutang, dan piutang')}${table(rows.slice(-40),['Date','Metric Type','Net Amount','Due Date','Status','Source Ledger'])}</div>`;
}
function renderProfile(){
  const u=state.user||{};$('#panelContent').innerHTML=`<div class="panel">${panelHead('Profile & Akses','Hak akses ditentukan backend')}<div class="profile-card"><div class="big-avatar">${initials(u.displayName||u.role)}</div><h3>${esc(u.displayName||'-')}</h3><p>${esc(u.role||'')} · ${esc(u.scopeType||'')}</p><div class="profile-meta"><div><span>Role</span><b>${esc(u.role||'-')}</b></div><div><span>Scope</span><b>${esc((u.outletCodes||[]).join(', ')||'ALL')}</b></div></div></div></div>`;
}

function newChat(save=true){if(save&&state.activeChat)persistActive();state.activeChat={id:'c_'+Date.now(),created:Date.now(),messages:[]};renderChat()}
function renderChat(){
  const msgs=state.activeChat?.messages||[];$('#chatEmpty').classList.toggle('hidden',msgs.length>0);const box=$('#chatMessages');box.innerHTML='';msgs.forEach(m=>appendMessage(m,false));setTimeout(()=>scrollChat(false),30)
}
async function sendQuestion(raw){
  const q=String(raw||'').trim();if(!q)return;showView('chat');$('#askInput').value='';autoGrow({target:$('#askInput')});
  if(!state.activeChat)newChat(false);state.activeChat.messages.push({role:'user',text:q});appendMessage({role:'user',text:q});$('#chatEmpty').classList.add('hidden');
  const think={role:'thinking',id:'thinking'};appendMessage(think);$('#sendBtn').disabled=true;
  try{const r=await api('askWill',{question:q});removeThinking();if(!r.ok)throw new Error(r.error||'WILL gagal menjawab');const a=r.answer||{};const m={role:'assistant',summary:a.summary||'',evidence:a.evidence||[],confidence:a.confidence||'MEDIUM'};state.activeChat.messages.push(m);appendMessage(m);persistActive()}catch(err){removeThinking();const m={role:'assistant',summary:humanError(err),evidence:[],confidence:'LOW'};state.activeChat.messages.push(m);appendMessage(m)}finally{$('#sendBtn').disabled=false;scrollChat()}
}
function appendMessage(m,scroll=true){
  const box=$('#chatMessages'),el=document.createElement('div');
  if(m.role==='user'){el.className='message user';el.innerHTML=`<div class="message-body">${esc(m.text)}</div>`}
  else if(m.role==='thinking'){el.className='message assistant';el.dataset.id='thinking';el.innerHTML=`<div class="assistant-avatar"><img src="assets/wills-brand.png" alt="W"></div><div class="message-body"><div class="thinking"><i></i><i></i><i></i></div></div>`}
  else{el.className='message assistant';const ev=(m.evidence||[]).length?`<ul>${m.evidence.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'';el.innerHTML=`<div class="assistant-avatar"><img src="assets/wills-brand.png" alt="W"></div><div class="message-body"><b>${esc(m.summary||'')}</b>${ev}<span class="confidence">Confidence ${esc(m.confidence||'MEDIUM')}</span></div>`}
  box.appendChild(el);if(scroll)scrollChat()
}
function removeThinking(){$('[data-id="thinking"]')?.remove()}
function persistActive(){if(!state.activeChat||!state.activeChat.messages.length)return;const arr=loadChats().filter(x=>x.id!==state.activeChat.id);arr.unshift(state.activeChat);localStorage.setItem('wills_chats',JSON.stringify(arr.slice(0,10)))}
function loadChats(){try{return JSON.parse(localStorage.getItem('wills_chats')||'[]')}catch(_){return[]}}
function autoGrow(e){const t=e.target;t.style.height='auto';t.style.height=Math.min(t.scrollHeight,130)+'px'}
function scrollChat(smooth=true){const x=$('#chatScroller');x.scrollTo({top:x.scrollHeight,behavior:smooth?'smooth':'auto'})}

function openDrawer(){state.drawer=true;$('#drawer').classList.add('open');$('#drawerScrim').classList.add('open')}
function closeDrawer(){state.drawer=false;$('#drawer').classList.remove('open');$('#drawerScrim').classList.remove('open')}
function scrollDrawerBottom(){const d=$('#drawer');d.scrollTop=d.scrollHeight}
function logout(){persistActive();clearSession();closeDrawer();$('#pin').value='';showLogin();toast('Kamu sudah keluar dari WILL')}
function clearSession(){state.token='';state.user=null;state.dashboard=null;localStorage.removeItem('wills_token')}

async function api(action,payload={},withToken=true){
  if(!CFG.API_URL)throw new Error('API_URL belum dikonfigurasi');const body={action,...payload};if(withToken)body.token=state.token;
  const res=await fetch(CFG.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),redirect:'follow',cache:'no-store'});return await res.json();
}
function panelHead(title,sub){return `<div class="panel-head"><div><span>WILLS INTELLIGENCE</span><h2>${esc(title)}</h2><p>${esc(sub||'')}</p></div></div>`}
function metric(k,v,n=''){return `<div class="metric"><span>${esc(k)}</span><b>${esc(v??'-')}</b><small>${esc(n)}</small></div>`}
function rowCard(ico,title,value,note=''){return `<div class="card-row"><div class="row-icon">${icon(ico)}</div><div><b>${esc(title)}</b><span>${esc(value)}</span>${note?`<span>${esc(note)}</span>`:''}</div></div>`}
function table(rows,cols){if(!rows?.length)return '<div class="empty-panel">Belum ada data.</div>';return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${esc(r[c]??'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function briefValue(arr,keys){for(const k of keys){const r=(arr||[]).find(x=>String(x.key||'').toLowerCase()===k.toLowerCase());if(r)return r.value}return 0}
function t(v){return ({summary:'Ringkasan Bisnis',outlets:'Outlet',alerts:'Alerts',operations:'Operasional',warehouse:'Warehouse',finance:'Finance',profile:'Profile & Akses'})[v]||v}
function healthStatus(s){return s>=85?'SEHAT':s>=70?'PERLU PERHATIAN':s>=60?'WASPADA':'PRIORITAS'}
function num(v){const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0}
function money(v){const n=num(v);return 'Rp'+Math.round(n).toLocaleString('id-ID')}
function fmt1(v){return num(v).toLocaleString('id-ID',{minimumFractionDigits:0,maximumFractionDigits:1})}
function initials(s){return String(s||'W').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function humanError(e){const s=String(e?.message||e||'Error');return ({ROLE_DENIED:'Akses ini khusus Owner.',OUTLET_SCOPE_DENIED:'Akses hanya untuk outlet yang ditetapkan.',SESSION_EXPIRED:'Sesi berakhir. Silakan login lagi.',SESSION_INVALID:'Sesi tidak valid. Silakan login lagi.',SESSION_REVOKED:'Akses akun sudah dinonaktifkan.',LOGIN_DENIED:'Login ID atau PIN tidak cocok.',LOGIN_INVALID:'Login ID atau PIN tidak valid.',OUTLET_REQUIRED:'Sebutkan outlet yang ingin dianalisis.'})[s]||s}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2800)}
function paintIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon)})}
function icon(name){const p={
 user:'<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>','eye-off':'<path d="m3 3 18 18"/><path d="M10.6 6.1A10.3 10.3 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.4 3.2"/><path d="M6.6 6.7C3.6 8.5 2 12 2 12s3.5 6 10 6c1 0 2-.15 2.8-.43"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',x:'<path d="m6 6 12 12M18 6 6 18"/>',edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',message:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/>',pulse:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',store:'<path d="M4 10v10h16V10"/><path d="M3 10 5 4h14l2 6"/><path d="M8 14h8v6"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2"/><path d="m9 13 2 2 4-4"/>',warehouse:'<path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8"/><path d="M7 16h10"/>',wallet:'<path d="M4 6h14a2 2 0 0 1 2 2v10H4a2 2 0 0 1-2-2V7a3 3 0 0 1 3-3h12"/><path d="M16 11h6v4h-6a2 2 0 0 1 0-4Z"/>',logout:'<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
 'arrow-up':'<path d="M12 19V5"/><path d="m7 10 5-5 5 5"/>','arrow-up-right':'<path d="M7 17 17 7M8 7h9v9"/>',package:'<path d="m3 7 9 5 9-5"/><path d="m3 7 9-5 9 5v10l-9 5-9-5V7Z"/>',scan:'<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 12h10"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};return `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${p[name]||p.message}</svg>`}
function registerSW(){if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v=0.3.0').catch(()=>{})}
})();
