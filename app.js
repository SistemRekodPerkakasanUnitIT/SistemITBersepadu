const cfg = window.PORTAL_CONFIG || {};
const API_URL = cfg.API_URL || "";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let session = null;
let systems = [];
let users = [];
let pendingIconFile = null;
let pendingPortalLogoFile = null;
let portalLogoRemoved = false;
let portalSettings = {
  portalLogo: ""
};

function showToast(message, isError = false) {
  const t = $("#toast");
  t.textContent = message;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.className = "toast", 2800);
}

function safe(value = "") {
  return String(value).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function roleLabel(role) {
  return role === "ADMIN" ? "Admin" : "Staff IT";
}

function initials(name = "IT") {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "IT";
  return words.slice(0, 2).map(x => x[0]).join("").toUpperCase();
}

function isImageIcon(icon) {
  return /^(https?:\/\/|data:image\/)/i.test(String(icon || "").trim());
}

function iconMarkup(icon) {
  icon = String(icon || "↗").trim();
  return isImageIcon(icon)
    ? `<img src="${safe(icon)}" alt="Ikon sistem" loading="lazy" referrerpolicy="no-referrer">`
    : safe(icon || "↗");
}

function requireApi() {
  if (!API_URL || API_URL.includes("PASTE_GOOGLE")) {
    showToast("API_URL belum ditetapkan dalam config.js.", true);
    return false;
  }
  return true;
}

async function api(action, data = {}) {
  if (!requireApi()) throw new Error("API belum ditetapkan.");
  const payload = { action, ...data };
  if (session?.token) payload.token = session.token;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  const out = await res.json();
  if (!out.ok) throw new Error(out.message || out.error || "Ralat API.");
  return out;
}

function setView(name) {
  const map = {
    dashboard: "#dashboardSection",
    settings: "#settingsSection",
    users: "#usersSection",
    profile: "#profileSection"
  };

  $$(".view-section").forEach(el => el.classList.add("hidden"));
  $(map[name]).classList.remove("hidden");
  $$(".nav-btn[data-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.view === name));
  $("#pageTitle").textContent = {
    dashboard: "Dashboard",
    settings: "Tetapan Sistem",
    users: "Pengguna",
    profile: "Profil"
  }[name];
}

function applyRole() {
  const user = session.user;
  const isAdmin = user.role === "ADMIN";
  $$(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));

  const ini = initials(user.displayName);
  $("#topName").textContent = user.displayName;
  $("#topRole").textContent = roleLabel(user.role);
  $("#sidebarRole").textContent = roleLabel(user.role);
  $("#welcomeName").textContent = user.displayName;
  $("#profileName").textContent = user.displayName;
  $("#profileUsername").textContent = "@" + user.username;
  $("#profileRole").textContent = roleLabel(user.role);
  $("#topAvatar").textContent = ini;
  $("#profileAvatar").textContent = ini;
}

function updateClock() {
  const now = new Date();
  $("#topDate").textContent = new Intl.DateTimeFormat("ms-MY", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric"
  }).format(now);
  $("#topTime").textContent = new Intl.DateTimeFormat("ms-MY", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(now);

  const hour = now.getHours();
  $("#greetingText").textContent = hour < 12 ? "Selamat pagi" : hour < 18 ? "Selamat petang" : "Selamat malam";
}

function applyPortalLogo() {
  const logo = String(portalSettings.portalLogo || "").trim();

  $$(".portal-logo").forEach((wrap) => {
    const img = wrap.querySelector(".portal-logo-img");
    const fallback = wrap.querySelector(".portal-logo-fallback");
    if (!img || !fallback) return;

    if (logo) {
      img.src = logo;
      img.classList.remove("hidden");
      fallback.classList.add("hidden");
    } else {
      img.removeAttribute("src");
      img.classList.add("hidden");
      fallback.classList.remove("hidden");
    }
  });

  const preview = $("#portalLogoPreview");
  if (preview) {
    preview.innerHTML = logo
      ? `<img src="${safe(logo)}" alt="Logo PKPJ">`
      : "<span>PK</span>";
  }
}

function applyLoginVideo() {
  const video = $("#loginVideo");
  if (!video) return;

  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;

  // login.mp4 is embedded directly in index.html.
  video.play().catch(() => {
    setTimeout(() => video.play().catch(() => {}), 300);
  });
}

function populatePortalSettingsForm() {
  if (!$("#portalLogoForm")) return;

  $("#portalLogoFileName").textContent = portalSettings.portalLogo
    ? "Logo semasa telah disimpan"
    : "PNG/JPG/WebP, maksimum 2MB";

  applyPortalLogo();
}

async function loadPortalSettings() {
  try {
    const out = await api("getPublicSettings");
    portalSettings = {
      portalLogo: String(out.settings?.portalLogo || "")
    };
  } catch (_) {
    portalSettings = { portalLogo: "" };
  }

  applyPortalLogo();
  applyLoginVideo();
  populatePortalSettingsForm();
}

function initLoginVideo() {
  applyLoginVideo();
}

function showPortal() {
  $("#loginView").classList.add("hidden");
  $("#portalView").classList.remove("hidden");
  applyRole();
  updateClock();
  setView("dashboard");
  loadSystems();
  if (session.user.role === "ADMIN") {
    loadUsers();
    populatePortalSettingsForm();
  }
}

function getAccessStoreKey() {
  return "portalLastAccess_" + (session?.user?.username || "guest");
}

function getAccessHistory() {
  try { return JSON.parse(localStorage.getItem(getAccessStoreKey()) || "{}"); }
  catch (_) { return {}; }
}

function formatDateTime(value) {
  if (!value) return "Belum pernah";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Belum pernah";
  return new Intl.DateTimeFormat("ms-MY", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(d);
}

function recordSystemAccess(id) {
  const history = getAccessHistory();
  history[String(id)] = new Date().toISOString();
  localStorage.setItem(getAccessStoreKey(), JSON.stringify(history));
  renderDashboardSystems();
}

async function loadSystems(showMessage = false) {
  const btn = $("#refreshSystemsBtn");
  if (btn) { btn.classList.add("refreshing"); btn.textContent = "Memuat..."; }
  try {
    const out = await api("getSystems");
    systems = out.systems || [];
    renderSystems();
    $("#lastUpdated").textContent = "Dikemas kini " + formatDateTime(new Date().toISOString());
    if (showMessage) showToast("Senarai sistem telah disegarkan.");
  } catch (err) {
    showToast(err.message, true);
  } finally {
    if (btn) { btn.classList.remove("refreshing"); btn.textContent = "↻ Segarkan"; }
  }
}

function getActiveSystems() {
  return systems
    .filter(s => String(s.status).toUpperCase() === "ACTIVE")
    .sort((a, b) => (+a.order || 999) - (+b.order || 999));
}

function renderDashboardSystems() {
  const active = getActiveSystems();
  const history = getAccessHistory();

  $("#emptySystems").classList.toggle("hidden", active.length > 0);
  $("#systemGrid").classList.toggle("hidden", active.length === 0);

  $("#systemGrid").innerHTML = active.map((s, index) => `
    <article class="system-card card-theme-${(index % 6) + 1}">
      <div class="card-accent"></div>

      <div class="system-card-top">
        <div class="system-icon">${iconMarkup(s.icon)}</div>
        <span class="status-pill">AKTIF</span>
      </div>

      <div class="system-card-body">
        <h3>${safe(s.name)}</h3>
        <p>${safe(s.description || "Akses sistem melalui pautan web.")}</p>
      </div>

      <div class="system-meta">
        <span class="last-access">Akses terakhir: ${safe(formatDateTime(history[String(s.id)]))}</span>
      </div>

      <div class="system-actions">
        <a class="open-btn" href="${safe(s.url)}" target="_blank" rel="noopener noreferrer"
           onclick="recordSystemAccess('${safe(s.id)}')">
          <span>Buka Sistem</span><span class="open-arrow">↗</span>
        </a>
      </div>
    </article>
  `).join("");
}

function renderSystems() {
  renderDashboardSystems();
  if (session?.user?.role !== "ADMIN") return;

  const ordered = [...systems].sort((a, b) => (+a.order || 999) - (+b.order || 999));
  $("#systemsTableBody").innerHTML = ordered.map(s => `
    <tr>
      <td class="table-icon"><div class="system-icon">${iconMarkup(s.icon)}</div></td>
      <td><strong>${safe(s.name)}</strong><br><span class="muted">${safe(s.description || "")}</span></td>
      <td class="url-cell" title="${safe(s.url)}">${safe(s.url)}</td>
      <td><span class="status-pill ${s.status === "ACTIVE" ? "" : "inactive"}">${s.status === "ACTIVE" ? "Aktif" : "Tidak Aktif"}</span></td>
      <td><div class="row-actions">
        <button class="small-btn icon-only edit" title="Kemaskini" aria-label="Kemaskini" onclick="editSystem('${safe(s.id)}')">✎</button>
        <button class="small-btn icon-only delete" title="Padam" aria-label="Padam" onclick="deleteSystem('${safe(s.id)}','${safe(s.name)}')">⌫</button>
      </div></td>
    </tr>
  `).join("");
}

async function loadUsers() {
  try {
    const out = await api("getUsers");
    users = out.users || [];
    renderUsers();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderUsers() {
  if ($("#staffCount")) $("#staffCount").textContent = users.filter(u => u.role !== "ADMIN").length;
  $("#usersTableBody").innerHTML = users.map(u => {
    const canDelete = u.role !== "ADMIN" && String(u.id) !== String(session.user.id);
    return `
      <tr>
        <td><strong>${safe(u.displayName)}</strong></td>
        <td>${safe(u.username)}</td>
        <td>${roleLabel(u.role)}</td>
        <td><span class="status-pill ${u.status === "ACTIVE" ? "" : "inactive"}">${u.status === "ACTIVE" ? "Aktif" : "Tidak Aktif"}</span></td>
        <td><div class="row-actions">
          <button class="small-btn icon-only edit" title="Kemaskini" aria-label="Kemaskini" onclick="editUser('${safe(u.id)}')">✎</button>
          ${canDelete ? `<button class="small-btn icon-only delete" title="Padam" aria-label="Padam" onclick="deleteUser('${safe(u.id)}','${safe(u.displayName)}')">⌫</button>` : ""}
        </div></td>
      </tr>
    `;
  }).join("");
}

function openModal(id) { $("#" + id).classList.remove("hidden"); }
function closeModal(id) { $("#" + id).classList.add("hidden"); }

function setIconPreview(value) {
  const box = $("#systemIconPreview");
  box.innerHTML = iconMarkup(value || "↗");
}

function resetSystemIconControls(value = "↗") {
  pendingIconFile = null;
  $("#systemIconFile").value = "";
  $("#systemIconValue").value = value || "↗";
  $("#iconFileName").textContent = isImageIcon(value) ? "Ikon gambar semasa" : "Tiada fail dipilih";

  const preset = $("#systemIconPreset");
  const values = [...preset.options].map(o => o.value);
  preset.value = values.includes(value) ? value : "↗";
  setIconPreview(value);
}

function openNewSystem() {
  $("#systemModalTitle").textContent = "Tambah Sistem";
  $("#systemForm").reset();
  $("#systemId").value = "";
  $("#systemOrder").value = systems.length + 1;
  resetSystemIconControls("↗");
  openModal("systemModal");
}

function editSystem(id) {
  const s = systems.find(x => String(x.id) === String(id));
  if (!s) return;
  $("#systemModalTitle").textContent = "Kemaskini Sistem";
  $("#systemId").value = s.id;
  $("#systemName").value = s.name || "";
  $("#systemUrl").value = s.url || "";
  $("#systemDescription").value = s.description || "";
  $("#systemStatus").value = s.status || "ACTIVE";
  $("#systemOrder").value = s.order || 1;
  resetSystemIconControls(s.icon || "↗");
  openModal("systemModal");
}

async function deleteSystem(id, name) {
  if (!confirm(`Padam sistem "${name}" daripada portal?`)) return;
  try {
    await api("deleteSystem", { id });
    showToast("Sistem berjaya dipadam.");
    await loadSystems();
  } catch (err) {
    showToast(err.message, true);
  }
}

function compressIconFile(file) {
  return new Promise((resolve, reject) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      reject(new Error("Ikon mesti PNG, JPG atau WebP."));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error("Saiz ikon asal maksimum 2MB."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Fail ikon tidak dapat dibaca."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Gambar ikon tidak sah."));
      img.onload = () => {
        const attempts = [
          { size: 128, quality: .82 },
          { size: 112, quality: .76 },
          { size: 96, quality: .70 },
          { size: 80, quality: .64 },
          { size: 64, quality: .58 }
        ];

        const encode = (opt) => {
          const canvas = document.createElement("canvas");
          canvas.width = opt.size;
          canvas.height = opt.size;
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, opt.size, opt.size);

          const scale = Math.min(opt.size / img.width, opt.size / img.height);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const x = Math.round((opt.size - w) / 2);
          const y = Math.round((opt.size - h) / 2);
          ctx.drawImage(img, x, y, w, h);

          let dataUrl = canvas.toDataURL("image/webp", opt.quality);
          if (!dataUrl.startsWith("data:image/webp")) {
            dataUrl = canvas.toDataURL("image/jpeg", opt.quality);
          }
          return dataUrl;
        };

        for (const opt of attempts) {
          const dataUrl = encode(opt);
          // Simpan margin selamat di bawah had panjang teks sel Google Sheet.
          if (dataUrl.length <= 44000) {
            resolve(dataUrl);
            return;
          }
        }
        reject(new Error("Ikon masih terlalu besar selepas dikecilkan. Cuba gambar yang lebih ringkas."));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function uploadPendingIcon() {
  if (!pendingIconFile) return $("#systemIconValue").value || "↗";
  return await compressIconFile(pendingIconFile);
}


function compressPortalLogo(file) {
  return new Promise((resolve, reject) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      reject(new Error("Logo mesti PNG, JPG atau WebP."));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error("Saiz logo asal maksimum 2MB."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Fail logo tidak dapat dibaca."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Fail logo tidak sah."));
      img.onload = () => {
        const attempts = [
          { size: 220, quality: .90 },
          { size: 190, quality: .86 },
          { size: 160, quality: .82 },
          { size: 140, quality: .78 },
          { size: 120, quality: .72 }
        ];

        for (const opt of attempts) {
          const canvas = document.createElement("canvas");
          canvas.width = opt.size;
          canvas.height = opt.size;
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, opt.size, opt.size);

          const scale = Math.min(opt.size / img.width, opt.size / img.height);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const x = Math.round((opt.size - w) / 2);
          const y = Math.round((opt.size - h) / 2);
          ctx.drawImage(img, x, y, w, h);

          let dataUrl = canvas.toDataURL("image/webp", opt.quality);
          if (!dataUrl.startsWith("data:image/webp")) {
            dataUrl = canvas.toDataURL("image/png");
          }

          if (dataUrl.length <= 42000) {
            resolve(dataUrl);
            return;
          }
        }

        reject(new Error("Logo masih terlalu besar selepas dikecilkan. Cuba fail logo yang lebih ringkas."));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function previewPortalLogoData(dataUrl) {
  const preview = $("#portalLogoPreview");
  if (!preview) return;
  preview.innerHTML = dataUrl
    ? `<img src="${safe(dataUrl)}" alt="Preview Logo PKPJ">`
    : "<span>PK</span>";
}


function openNewUser() {
  $("#userModalTitle").textContent = "Tambah Staff IT";
  $("#userFormMode").value = "add";
  $("#userForm").reset();
  $("#editUserId").value = "";
  $("#editUserStatus").value = "ACTIVE";
  $("#editPassword").required = true;
  $("#passwordFieldLabel").textContent = "Kata Laluan";
  $("#passwordHelp").textContent = "Minimum 4 aksara.";
  $("#saveUserBtn").textContent = "Tambah Akaun";
  openModal("userModal");
}

function editUser(id) {
  const u = users.find(x => String(x.id) === String(id));
  if (!u) return;
  $("#userModalTitle").textContent = "Kemaskini Pengguna";
  $("#userFormMode").value = "edit";
  $("#editUserId").value = u.id;
  $("#editDisplayName").value = u.displayName || "";
  $("#editUsername").value = u.username || "";
  $("#editPassword").value = "";
  $("#editPassword").required = false;
  $("#editUserStatus").value = u.status || "ACTIVE";
  $("#passwordFieldLabel").textContent = "Kata Laluan Baharu";
  $("#passwordHelp").textContent = "Biarkan kosong jika kata laluan tidak berubah.";
  $("#saveUserBtn").textContent = "Kemaskini Akaun";
  openModal("userModal");
}

async function deleteUser(id, name) {
  if (!confirm(`Padam akaun "${name}"? Tindakan ini tidak boleh dibatalkan.`)) return;
  try {
    await api("deleteUser", { id });
    showToast("Akaun staff berjaya dipadam.");
    await loadUsers();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function refreshCurrentUser() {
  const out = await api("me");
  session.user = out.user;
  sessionStorage.setItem("portalSession", JSON.stringify(session));
  applyRole();
}

$("#togglePassword").addEventListener("click", () => {
  const p = $("#password");
  const show = p.type === "password";
  p.type = show ? "text" : "password";
  $("#togglePassword").textContent = show ? "Tutup" : "Lihat";
});

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = $("#username").value.trim();
  const password = $("#password").value;
  const btn = $("#loginBtn");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Memproses...";

  try {
    const out = await api("login", { username, password });
    session = { token: out.token, user: out.user };
    sessionStorage.setItem("portalSession", JSON.stringify(session));

    if ($("#rememberMe").checked) {
      localStorage.setItem("rememberedUsername", username);
      localStorage.setItem("rememberedPassword", password);
    } else {
      localStorage.removeItem("rememberedUsername");
      localStorage.removeItem("rememberedPassword");
    }
    showPortal();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = "Log Masuk";
  }
});

async function logoutPortal() {
  try { await api("logout"); } catch (_) {}
  session = null;
  sessionStorage.removeItem("portalSession");
  $("#portalView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
  if (!$("#rememberMe").checked) $("#password").value = "";
}

$("#logoutBtn").addEventListener("click", logoutPortal);
$("#mobileLogoutBtn").addEventListener("click", logoutPortal);

$$(".nav-btn[data-view]").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
$$('[data-close-modal]').forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.closeModal)));

$("#refreshSystemsBtn").addEventListener("click", () => loadSystems(true));
$("#dashboardAddSystemBtn").addEventListener("click", openNewSystem);
$("#newSystemBtn").addEventListener("click", openNewSystem);
$("#newUserBtn").addEventListener("click", openNewUser);

$("#portalLogoFile").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    e.target.value = "";
    showToast("Pilih logo PNG, JPG atau WebP sahaja.", true);
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    e.target.value = "";
    showToast("Saiz logo maksimum 2MB.", true);
    return;
  }

  pendingPortalLogoFile = file;
  portalLogoRemoved = false;
  $("#portalLogoFileName").textContent = file.name;

  const reader = new FileReader();
  reader.onload = () => previewPortalLogoData(String(reader.result));
  reader.readAsDataURL(file);
});

$("#removePortalLogoBtn").addEventListener("click", () => {
  pendingPortalLogoFile = null;
  portalLogoRemoved = true;
  $("#portalLogoFile").value = "";
  $("#portalLogoFileName").textContent = "Logo akan dibuang selepas Simpan Tetapan";
  previewPortalLogoData("");
});


$("#portalLogoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#savePortalLogoBtn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  try {
    let logo = portalSettings.portalLogo || "";

    if (portalLogoRemoved) {
      logo = "";
    } else if (pendingPortalLogoFile) {
      logo = await compressPortalLogo(pendingPortalLogoFile);
    }

    // Kekalkan nilai video backend sekadar kompatibiliti,
    // tetapi frontend tidak lagi menggunakan tetapan video ini.
    const current = await api("getPublicSettings").catch(() => ({ settings: {} }));

    const settings = {
      portalLogo: logo,
      loginVideoUrl: String(current.settings?.loginVideoUrl || "login.mp4"),
      loginVideoEnabled: true
    };

    const saved = await api("updatePortalSettings", { settings });

    portalSettings = {
      portalLogo: String(saved.settings?.portalLogo || logo || "")
    };

    pendingPortalLogoFile = null;
    portalLogoRemoved = false;
    $("#portalLogoFile").value = "";

    applyPortalLogo();
    populatePortalSettingsForm();
    showToast("Logo portal berjaya disimpan.");
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Simpan Logo";
  }
});


$("#systemIconPreset").addEventListener("change", (e) => {
  pendingIconFile = null;
  $("#systemIconFile").value = "";
  $("#iconFileName").textContent = "Ikon standard dipilih";
  $("#systemIconValue").value = e.target.value;
  setIconPreview(e.target.value);
});

$("#systemIconFile").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    e.target.value = "";
    showToast("Pilih fail PNG, JPG atau WebP sahaja.", true);
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    e.target.value = "";
    showToast("Saiz ikon maksimum 2MB.", true);
    return;
  }
  pendingIconFile = file;
  $("#iconFileName").textContent = file.name;
  const reader = new FileReader();
  reader.onload = () => setIconPreview(String(reader.result));
  reader.readAsDataURL(file);
});

$("#systemForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#saveSystemBtn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  try {
    const icon = await uploadPendingIcon();
    const data = {
      id: $("#systemId").value,
      name: $("#systemName").value.trim(),
      url: $("#systemUrl").value.trim(),
      description: $("#systemDescription").value.trim(),
      icon,
      status: $("#systemStatus").value,
      order: Number($("#systemOrder").value || 1)
    };

    await api(data.id ? "updateSystem" : "addSystem", { system: data });
    closeModal("systemModal");
    showToast("Maklumat sistem berjaya disimpan.");
    await loadSystems();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Simpan";
  }
});

$("#userForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mode = $("#userFormMode").value;
  const btn = $("#saveUserBtn");
  btn.disabled = true;
  btn.textContent = "Menyimpan...";

  const user = {
    id: $("#editUserId").value,
    displayName: $("#editDisplayName").value.trim(),
    username: $("#editUsername").value.trim(),
    password: $("#editPassword").value,
    status: $("#editUserStatus").value
  };

  try {
    if (mode === "add") {
      await api("addUser", { user });
      showToast("Akaun Staff IT berjaya ditambah.");
    } else {
      await api("updateUser", { user });
      showToast("Maklumat pengguna berjaya dikemas kini.");
      if (String(user.id) === String(session.user.id)) await refreshCurrentUser();
    }
    closeModal("userModal");
    await loadUsers();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = mode === "add" ? "Tambah Akaun" : "Kemaskini Akaun";
  }
});

$("#changePasswordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("changeOwnPassword", {
      currentPassword: $("#currentPassword").value,
      newPassword: $("#newPassword").value
    });
    $("#changePasswordForm").reset();
    showToast("Kata laluan berjaya ditukar.");
  } catch (err) {
    showToast(err.message, true);
  }
});

(async function init() {
  await loadPortalSettings();
  updateClock();
  setInterval(updateClock, 1000);

  const ru = localStorage.getItem("rememberedUsername");
  const rp = localStorage.getItem("rememberedPassword");
  if (ru) {
    $("#username").value = ru;
    $("#password").value = rp || "";
    $("#rememberMe").checked = true;
  }

  try {
    const saved = JSON.parse(sessionStorage.getItem("portalSession") || "null");
    if (saved?.token) {
      session = saved;
      const out = await api("me");
      session.user = out.user;
      showPortal();
    }
  } catch (_) {
    sessionStorage.removeItem("portalSession");
    session = null;
  }
})();
