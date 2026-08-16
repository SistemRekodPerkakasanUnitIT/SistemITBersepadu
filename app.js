const cfg = window.PORTAL_CONFIG || {};
const API_URL = cfg.API_URL;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let session = null;
let systems = [];
let users = [];

function showToast(message, isError=false){
  const t=$("#toast"); t.textContent=message; t.className="toast show"+(isError?" error":"");
  clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>t.className="toast",2600);
}
function safe(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function roleLabel(role){return role==="ADMIN"?"Admin":"Staff IT";}
function requireApi(){
  if(!API_URL || API_URL.includes("PASTE_GOOGLE")){
    showToast("Sila tetapkan API_URL dalam config.js dahulu.",true); return false;
  }
  return true;
}
async function api(action,data={}){
  if(!requireApi()) throw new Error("API belum ditetapkan");
  const payload={action,...data};
  if(session?.token) payload.token=session.token;
  const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});
  const out=await res.json();
  if(!out.ok) throw new Error(out.message||"Ralat API");
  return out;
}
function setView(name){
  const map={dashboard:"#dashboardSection",settings:"#settingsSection",users:"#usersSection",profile:"#profileSection"};
  $$(".view-section").forEach(x=>x.classList.add("hidden"));
  $(map[name]).classList.remove("hidden");
  $$(".nav-btn[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
  $("#pageTitle").textContent={dashboard:"Dashboard",settings:"Tetapan Sistem",users:"Pengguna",profile:"Profil"}[name];
}
function applyRole(){
  const isAdmin=session?.user?.role==="ADMIN";
  $$(".admin-only").forEach(el=>el.classList.toggle("hidden",!isAdmin));
  $("#topName").textContent=session.user.displayName;
  $("#topRole").textContent=roleLabel(session.user.role);
  $("#sidebarRole").textContent=roleLabel(session.user.role);
  $("#welcomeName").textContent=session.user.displayName;
  $("#profileName").textContent=session.user.displayName;
  $("#profileUsername").textContent="@"+session.user.username;
  $("#profileRole").textContent=roleLabel(session.user.role);
}
function showPortal(){
  $("#loginView").classList.add("hidden"); $("#portalView").classList.remove("hidden");
  applyRole(); setView("dashboard"); loadSystems(); if(session.user.role==="ADMIN") loadUsers();
}
function getAccessStoreKey(){
  return "portalLastAccess_"+(session?.user?.username||"guest");
}
function getAccessHistory(){
  try{return JSON.parse(localStorage.getItem(getAccessStoreKey())||"{}");}catch(_){return {};}
}
function formatDateTime(value){
  if(!value)return "Belum pernah dibuka";
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return "Belum pernah dibuka";
  return new Intl.DateTimeFormat("ms-MY",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d);
}
function recordSystemAccess(id){
  const history=getAccessHistory();
  history[String(id)]=new Date().toISOString();
  localStorage.setItem(getAccessStoreKey(),JSON.stringify(history));
  renderDashboardSystems();
}
async function loadSystems(showMessage=false){
  const refreshBtn=$("#refreshSystemsBtn");
  if(refreshBtn){refreshBtn.classList.add("refreshing");refreshBtn.textContent="↻ Memuat...";}
  try{
    const out=await api("getSystems");
    systems=out.systems||[];
    renderSystems();
    if($("#lastUpdated")) $("#lastUpdated").textContent="Dikemas kini: "+formatDateTime(new Date().toISOString());
    if(showMessage)showToast("Senarai sistem telah disegarkan.");
  }catch(e){showToast(e.message,true);}
  finally{
    if(refreshBtn){refreshBtn.classList.remove("refreshing");refreshBtn.textContent="↻ Refresh";}
  }
}
function getActiveSystems(){
  return systems.filter(s=>s.status==="ACTIVE").sort((a,b)=>(+a.order||999)-(+b.order||999));
}
function renderDashboardSystems(){
  const active=getActiveSystems();
  const history=getAccessHistory();
  const q=($("#systemSearch")?.value||"").trim().toLowerCase();
  const filtered=active.filter(s=>`${s.name||""} ${s.description||""}`.toLowerCase().includes(q));

  $("#systemCount").textContent=active.length;
  if($("#activeSystemCount")) $("#activeSystemCount").textContent=active.length;
  if($("#inactiveSystemCount")) $("#inactiveSystemCount").textContent=systems.filter(s=>s.status!=="ACTIVE").length;

  $("#emptySystems").classList.toggle("hidden",active.length>0);
  $("#noSearchResults").classList.toggle("hidden",active.length===0 || filtered.length>0 || !q);
  $("#systemGrid").classList.toggle("hidden",active.length===0);

  $("#systemGrid").innerHTML=filtered.map(s=>`
    <article class="system-card">
      <div class="system-icon">${safe(s.icon||"🔗")}</div>
      <h3>${safe(s.name)}</h3>
      <p>${safe(s.description||"Akses sistem melalui pautan web.")}</p>
      <div class="system-meta">
        <span class="status-pill">● Aktif</span>
        <span class="last-access">Akses terakhir: ${safe(formatDateTime(history[String(s.id)]))}</span>
      </div>
      <div class="system-actions">
        <a class="open-btn" href="${safe(s.url)}" target="_blank" rel="noopener noreferrer" onclick="recordSystemAccess('${safe(s.id)}')">Buka Sistem ↗</a>
      </div>
    </article>`).join("");
}
function renderSystems(){
  renderDashboardSystems();

  if(session?.user?.role==="ADMIN"){
    const ordered=[...systems].sort((a,b)=>(+a.order||999)-(+b.order||999));
    $("#systemsTableBody").innerHTML=ordered.map(s=>`
      <tr>
        <td class="table-icon">${safe(s.icon||"🔗")}</td>
        <td><strong>${safe(s.name)}</strong><br><span class="muted">${safe(s.description||"")}</span></td>
        <td class="url-cell" title="${safe(s.url)}">${safe(s.url)}</td>
        <td><span class="status-pill">${s.status==="ACTIVE"?"Aktif":"Tidak Aktif"}</span></td>
        <td><div class="row-actions">
          <button class="small-btn edit" onclick="editSystem('${safe(s.id)}')">Kemaskini</button>
          <button class="small-btn delete" onclick="deleteSystem('${safe(s.id)}','${safe(s.name)}')">Padam</button>
        </div></td>
      </tr>`).join("");
  }
}
async function loadUsers(){
  try{const out=await api("getUsers"); users=out.users||[]; renderUsers();}catch(e){showToast(e.message,true);}
}
function renderUsers(){
  $("#usersTableBody").innerHTML=users.map(u=>`
    <tr>
      <td><strong>${safe(u.displayName)}</strong></td>
      <td>${safe(u.username)}</td>
      <td>${roleLabel(u.role)}</td>
      <td><span class="status-pill">${u.status==="ACTIVE"?"Aktif":"Tidak Aktif"}</span></td>
      <td><button class="small-btn edit" onclick="editUser('${safe(u.id)}')">Kemaskini</button></td>
    </tr>`).join("");
}
function openModal(id){$("#"+id).classList.remove("hidden")}
function closeModal(id){$("#"+id).classList.add("hidden")}
function editSystem(id){
  const s=systems.find(x=>String(x.id)===String(id)); if(!s)return;
  $("#systemModalTitle").textContent="Kemaskini Sistem"; $("#systemId").value=s.id; $("#systemName").value=s.name||"";
  $("#systemUrl").value=s.url||""; $("#systemDescription").value=s.description||""; $("#systemIcon").value=s.icon||"🔗";
  $("#systemStatus").value=s.status||"ACTIVE"; $("#systemOrder").value=s.order||1; openModal("systemModal");
}
async function deleteSystem(id,name){
  if(!confirm(`Padam "${name}" daripada portal?`))return;
  try{await api("deleteSystem",{id}); showToast("Sistem berjaya dipadam."); await loadSystems();}catch(e){showToast(e.message,true);}
}
function editUser(id){
  const u=users.find(x=>String(x.id)===String(id)); if(!u)return;
  $("#editUserId").value=u.id; $("#editDisplayName").value=u.displayName; $("#editUsername").value=u.username;
  $("#editPassword").value=""; $("#editUserStatus").value=u.status||"ACTIVE"; openModal("userModal");
}

$("#togglePassword").addEventListener("click",()=>{const p=$("#password");p.type=p.type==="password"?"text":"password"});
$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); const username=$("#username").value.trim(), password=$("#password").value;
  const btn=$("#loginBtn"); btn.disabled=true; btn.textContent="Memproses...";
  try{
    const out=await api("login",{username,password}); session={token:out.token,user:out.user};
    sessionStorage.setItem("portalSession",JSON.stringify(session));
    if($("#rememberMe").checked){
      localStorage.setItem("rememberedUsername",username);
      localStorage.setItem("rememberedPassword",password);
    }else{
      localStorage.removeItem("rememberedUsername"); localStorage.removeItem("rememberedPassword");
    }
    showPortal();
  }catch(err){showToast(err.message,true);}
  finally{btn.disabled=false;btn.textContent="Log Masuk";}
});
$("#logoutBtn").addEventListener("click",async()=>{
  try{await api("logout");}catch(_){}
  session=null;sessionStorage.removeItem("portalSession");$("#portalView").classList.add("hidden");$("#loginView").classList.remove("hidden");$("#password").value="";
});
$$(".nav-btn[data-view]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
$$("[data-close-modal]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.closeModal)));
$("#systemSearch").addEventListener("input",renderDashboardSystems);
$("#refreshSystemsBtn").addEventListener("click",()=>loadSystems(true));
$("#dashboardAddSystemBtn").addEventListener("click",()=>{
  $("#systemModalTitle").textContent="Tambah Sistem";
  $("#systemForm").reset();
  $("#systemId").value="";
  $("#systemOrder").value=(systems.length+1);
  openModal("systemModal");
});
$("#newSystemBtn").addEventListener("click",()=>{
  $("#systemModalTitle").textContent="Tambah Sistem";$("#systemForm").reset();$("#systemId").value="";$("#systemOrder").value=(systems.length+1);openModal("systemModal");
});
$("#systemForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const data={id:$("#systemId").value,name:$("#systemName").value.trim(),url:$("#systemUrl").value.trim(),
    description:$("#systemDescription").value.trim(),icon:$("#systemIcon").value,status:$("#systemStatus").value,order:Number($("#systemOrder").value||1)};
  try{
    await api(data.id?"updateSystem":"addSystem",{system:data});closeModal("systemModal");showToast("Maklumat sistem disimpan.");await loadSystems();
  }catch(err){showToast(err.message,true);}
});
$("#userForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const user={id:$("#editUserId").value,displayName:$("#editDisplayName").value.trim(),username:$("#editUsername").value.trim(),
    password:$("#editPassword").value,status:$("#editUserStatus").value};
  try{
    await api("updateUser",{user});closeModal("userModal");showToast("Maklumat pengguna dikemas kini.");await loadUsers();
  }catch(err){showToast(err.message,true);}
});
$("#changePasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    await api("changeOwnPassword",{currentPassword:$("#currentPassword").value,newPassword:$("#newPassword").value});
    $("#changePasswordForm").reset();showToast("Kata laluan berjaya ditukar.");
  }catch(err){showToast(err.message,true);}
});

(async function init(){
  const ru=localStorage.getItem("rememberedUsername"), rp=localStorage.getItem("rememberedPassword");
  if(ru){$("#username").value=ru;$("#password").value=rp||"";$("#rememberMe").checked=true;}
  try{
    const saved=JSON.parse(sessionStorage.getItem("portalSession")||"null");
    if(saved?.token){session=saved; const out=await api("me"); session.user=out.user; showPortal();}
  }catch(_){sessionStorage.removeItem("portalSession");}
})();
