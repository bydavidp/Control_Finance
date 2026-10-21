/* Control Finance — PWA de finanzas personales.
   Datos reales guardados en localStorage (sin backend todavía). */

const KEY = "controlfinance.v1";

const CONFIG = window.CF_CONFIG || {};
const cloudEnabled = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
let sb = null;
if (cloudEnabled && window.supabase?.createClient) {
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

const cloud = {
  enabled: cloudEnabled && Boolean(sb),
  uid: null,
  email: "",
  status: "local",
  lastSync: null,
  syncing: false,
  connecting: false,
  syncAgain: false,
  checked: false,
  unlocked: false,
  passwordFallback: false,
  channel: null,
  quickToken: "",
  hasQuickToken: false,
  message: "",
};

const CATS = {
  expense: [
    { name: "Comida", color: "#FFC65C" },
    { name: "Transporte", color: "#4FC3F7" },
    { name: "Hogar", color: "#8B5CF6" },
    { name: "Ocio", color: "#FF8A65" },
    { name: "Salud", color: "#2BD98A" },
    { name: "Compras", color: "#F06292" },
    { name: "Otros", color: "#8B98AA" },
  ],
  income: [
    { name: "Salario", color: "#2BD98A" },
    { name: "Freelance", color: "#3D7DFF" },
    { name: "Ventas", color: "#FFC65C" },
    { name: "Regalo", color: "#8B5CF6" },
    { name: "Otros", color: "#8B98AA" },
  ],
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const params = new URLSearchParams(location.search);
const staticMode = params.get("static") === "1";
if (staticMode) document.body.classList.add("static");

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------- fechas y formato ---------------- */
const pad = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoDate(new Date());
const monthOf = (date) => date.slice(0, 7);
const currentMonth = () => monthOf(todayISO());

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  return monthOf(isoDate(new Date(y, m - 1 + delta, 1)));
}

function cap(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function monthName(key, withYear = false) {
  const [y, m] = key.split("-").map(Number);
  return MONTHS[m - 1] + (withYear ? ` de ${y}` : "");
}

function money(n) {
  return "$ " + Math.round(Math.abs(n)).toLocaleString("es-CO");
}

function signedMoney(n) {
  return (n < 0 ? "−" : "") + money(n);
}

function compactMoney(n) {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1000000) {
    const value = (abs / 1000000).toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
    return `${sign}$ ${value}M`;
  }
  if (abs >= 1000) return `${sign}$ ${Math.round(abs / 1000)}k`;
  return sign + money(abs);
}

function compact(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(Math.round(n));
}

function dateLabel(dateStr) {
  if (dateStr === todayISO()) return "Hoy";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === isoDate(yesterday)) return "Ayer";
  const d = parseDate(dateStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "tx-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function catInfo(type, name) {
  const list = CATS[type] || CATS.expense;
  return list.find((c) => c.name === name) || list[list.length - 1];
}

/* ---------------- estado ---------------- */
function defaultState() {
  return {
    version: 1,
    onboarded: false,
    settings: { name: "David", goal: 2000000 },
    transactions: [],
    pending: [],
  };
}

function normalize(raw) {
  if (!raw || typeof raw !== "object") return null;
  const data = raw.state && Array.isArray(raw.state.transactions) ? raw.state : raw;
  if (!Array.isArray(data.transactions)) return null;

  const transactions = data.transactions
    .filter((t) => t && typeof t.amount === "number" && t.amount > 0)
    .map((t) => ({
      id: String(t.id || uid()),
      type: t.type === "income" ? "income" : "expense",
      amount: Math.round(t.amount),
      category: String(t.category || "Otros").slice(0, 24),
      note: String(t.note || t.category || "Movimiento").slice(0, 80),
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : todayISO(),
      createdAt: Number(t.createdAt) || 0,
    }));

  const pending = (Array.isArray(data.pending) ? data.pending : [])
    .filter((op) => op && typeof op.op === "string")
    .slice(-200);

  return {
    version: 1,
    onboarded: Boolean(data.onboarded),
    settings: {
      name: String(data.settings?.name || "David").slice(0, 24),
      goal: Math.max(0, Number(data.settings?.goal) || 0),
    },
    transactions,
    pending,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch (err) {
    console.warn("No se pudo leer el almacenamiento:", err);
    return null;
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    toast("No se pudo guardar en este dispositivo");
    console.error(err);
  }
}

const stored = loadState();
let state = stored || defaultState();

const ui = {
  tab: "home",
  month: currentMonth(),
  filter: "Todas",
  draft: { type: "expense", category: "Comida" },
  detailId: null,
};
if (params.get("tab") && ["home", "movimientos", "perfil"].includes(params.get("tab"))) {
  ui.tab = params.get("tab");
}
if (!stored && params.get("demo") === "1") seedDemo(false, false);

/* ---------------- cálculos ---------------- */
const byDateDesc = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

function monthTransactions(month) {
  return state.transactions
    .filter((t) => t.date.slice(0, 7) === month)
    .sort(byDateDesc);
}

function totals(list) {
  return list.reduce((acc, t) => {
    if (t.type === "income") acc.income += t.amount;
    else acc.expense += t.amount;
    return acc;
  }, { income: 0, expense: 0 });
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join("") || "CF").toUpperCase();
}

/* ---------------- render: inicio ---------------- */
function renderHome() {
  const month = currentMonth();
  const list = monthTransactions(month);
  const { income, expense } = totals(list);
  const balance = income - expense;

  $("#hero-label").textContent = `Balance de ${monthName(month)}`;
  $("#balance").textContent = signedMoney(balance);

  const prevKey = shiftMonth(month, -1);
  const prevList = monthTransactions(prevKey);
  const prev = totals(prevList);
  const prevBalance = prev.income - prev.expense;
  const trend = $("#trend");
  const trendSub = $("#trend-sub");

  trend.className = "trend";
  if (!prevList.length) {
    trend.textContent = "—";
    trend.classList.add("neutral");
    trendSub.textContent = "sin datos del mes anterior";
  } else if (prevBalance === 0) {
    trend.textContent = "—";
    trend.classList.add("neutral");
    trendSub.textContent = `vs. ${monthName(prevKey)}`;
  } else {
    const pct = ((balance - prevBalance) / Math.abs(prevBalance)) * 100;
    trend.textContent = `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1).replace(".", ",")} %`;
    if (pct < 0) trend.classList.add("negative");
    trendSub.textContent = `vs. ${monthName(prevKey)}`;
  }

  renderSparkline();

  const recent = list.slice(0, 3);
  $("#home-list").innerHTML = recent.map(rowHTML).join("");
  $("#home-empty").hidden = recent.length > 0;
  $("#home-list").hidden = recent.length === 0;

  const saved = Math.max(0, balance);
  const goal = state.settings.goal || 0;
  const pct = goal > 0 ? Math.min(100, (saved / goal) * 100) : 0;
  $("#goal-values").textContent = `${money(saved)} / ${money(goal)}`;
  $("#goal-bar").style.width = `${pct}%`;
  $("#goal-caption").textContent = goal <= 0
    ? "Define tu meta en Perfil"
    : `${Math.round(pct)} % completado · ${pct >= 100 ? "¡meta cumplida!" : "faltan " + money(goal - saved)}`;

  renderInsight(list);
}

function renderSparkline() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = isoDate(d);
    const total = state.transactions
      .filter((t) => t.type === "expense" && t.date === iso)
      .reduce((sum, t) => sum + t.amount, 0);
    days.push(total);
  }
  const max = Math.max(...days, 1);
  const pts = days.map((v, i) => ({
    x: 4 + (142 * i) / 6,
    y: 40 - (v / max) * 30,
  }));

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const mid = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${mid} ${pts[i - 1].y}, ${mid} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`;
  }
  $("#spark-path").setAttribute("d", d);
  const last = pts[pts.length - 1];
  const dot = $("#spark-dot");
  dot.setAttribute("cx", last.x);
  dot.setAttribute("cy", last.y);
}

function renderInsight(list) {
  const byCat = {};
  list.filter((t) => t.type === "expense").forEach((t) => {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  const ranked = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const icon = $("#insight-icon");
  if (!ranked.length) {
    $("#insight-title").textContent = "Sin gastos este mes";
    $("#insight-text").textContent = "Añade un gasto para ver en qué se va tu dinero.";
    icon.style.color = "var(--yellow)";
    return;
  }
  const [name, total] = ranked[0];
  $("#insight-title").textContent = `Mayor gasto: ${name}`;
  $("#insight-text").textContent = `${money(total)} este mes · ${ranked.length} categoría${ranked.length === 1 ? "" : "s"}`;
  icon.style.color = catInfo("expense", name).color;
}

/* ---------------- render: movimientos ---------------- */
function renderMovements() {
  const list = monthTransactions(ui.month);
  const { income, expense } = totals(list);

  $("#month-label").textContent = cap(monthName(ui.month, true));
  $("#next-month").disabled = ui.month >= currentMonth();
  $("#sum-in").textContent = money(income);
  $("#sum-out").textContent = money(expense);

  renderChart(list);
  renderList(list);
}

function renderChart(list) {
  const [year, month] = ui.month.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekCount = Math.ceil(daysInMonth / 7);
  const weeks = Array(weekCount).fill(0);
  list.filter((t) => t.type === "expense").forEach((t) => {
    const day = Number(t.date.slice(8, 10));
    const index = Math.min(weekCount - 1, Math.floor((day - 1) / 7));
    weeks[index] += t.amount;
  });
  const total = weeks.reduce((a, b) => a + b, 0);
  const max = Math.max(...weeks, 0);
  const peak = max > 0 ? weeks.indexOf(max) : -1;

  $("#chart-total").textContent = "−" + money(total);
  $("#chart-sub").textContent = total
    ? `${monthName(ui.month)} · ${list.filter((t) => t.type === "expense").length} gastos`
    : "Sin gastos este mes";

  $("#bars").innerHTML = weeks.map((value, i) => {
    const height = max > 0 ? Math.max(value > 0 ? 6 : 2, (value / max) * 86) : 2;
    const label = i === peak ? `data-label="${compact(value)}"` : "";
    return `<div class="bar ${i === peak ? "is-peak" : ""}" style="--v:${height}%" ${label}></div>`;
  }).join("");

  $("#days").innerHTML = weeks.map((_, i) => `<span>S${i + 1}</span>`).join("");
}

function renderList(list) {
  const rows = ui.filter === "Todas"
    ? list
    : list.filter((t) => t.type === (ui.filter === "Ingresos" ? "income" : "expense"));

  $("#activity-list").innerHTML = rows.map(rowHTML).join("");
  $("#activity-list").hidden = rows.length === 0;
  $("#activity-empty").hidden = rows.length > 0;
  $("#count").textContent = `${rows.length} registro${rows.length === 1 ? "" : "s"}`;
}

function rowHTML(t) {
  const cat = catInfo(t.type, t.category);
  return `
    <button class="tx" data-id="${esc(t.id)}">
      <span class="tx-ico" style="color:${cat.color}">${esc(t.category.charAt(0).toUpperCase())}</span>
      <span class="tx-body">
        <span class="tx-title">${esc(t.note)}</span>
        <span class="tx-sub">${esc(dateLabel(t.date))} · ${esc(t.category)}</span>
      </span>
      <span class="tx-amount ${t.type === "income" ? "income" : ""}">
        ${t.type === "income" ? "+" : "−"}${money(t.amount)}
      </span>
    </button>`;
}

/* ---------------- render: perfil ---------------- */
function renderProfile() {
  const name = state.settings.name || "David";
  $("#profile-name").textContent = name;
  $("#avatar").textContent = initials(name).slice(0, 1);
  $("#avatar-lg").textContent = initials(name);
  if (document.activeElement !== $("#input-name")) $("#input-name").value = name;
  if (document.activeElement !== $("#input-goal")) $("#input-goal").value = state.settings.goal || "";

  const distinctMonths = new Set(state.transactions.map((t) => t.date.slice(0, 7))).size;
  const balance = state.transactions.reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0
  );
  $("#stat-tx").textContent = state.transactions.length;
  $("#stat-months").textContent = distinctMonths;
  $("#stat-saved").textContent = compactMoney(balance);
  $("#stat-saved").title = signedMoney(balance);
  renderCloudUI();
}

function renderChrome() {
  const hour = new Date().getHours();
  $("#greeting").textContent = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  $("#user-name").textContent = state.settings.name || "David";
  $("#avatar").textContent = initials(state.settings.name || "David").slice(0, 1);
  $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.filter === ui.filter));
}

function renderAll() {
  renderChrome();
  renderHome();
  renderMovements();
  renderProfile();
}

/* ---------------- navegación ---------------- */
function showTab(tab) {
  ui.tab = tab;
  $$(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${tab}`));
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("#main").scrollTop = 0;
  if (tab === "movimientos") renderMovements();
  if (tab === "perfil") renderProfile();
}

/* ---------------- hojas ---------------- */
let openSheetId = null;

function openSheet(id) {
  ["sheet-add", "sheet-detail", "sheet-welcome"].forEach((name) => {
    const el = document.getElementById(name);
    if (el) el.hidden = name !== id;
  });
  $("#backdrop").hidden = false;
  document.body.classList.add("sheet-open");
  openSheetId = id;
}

function closeSheets() {
  ["sheet-add", "sheet-detail", "sheet-welcome"].forEach((name) => {
    const el = document.getElementById(name);
    if (el) el.hidden = true;
  });
  $("#backdrop").hidden = true;
  document.body.classList.remove("sheet-open");
  openSheetId = null;
}

function openAdd(type = "expense") {
  ui.draft = { type, category: (CATS[type] || CATS.expense)[0].name };
  $("#f-amount").value = "";
  $("#f-note").value = "";
  $("#f-date").value = todayISO();
  setDraftType(type);
  openSheet("sheet-add");
  if (!staticMode) setTimeout(() => $("#f-amount").focus(), 240);
}

function setDraftType(type) {
  ui.draft.type = type;
  ui.draft.category = (CATS[type] || CATS.expense)[0].name;
  $("#add-title").textContent = type === "income" ? "Nuevo ingreso" : "Nuevo gasto";
  $$("#type-seg button").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
  renderCategories();
}

function renderCategories() {
  const list = CATS[ui.draft.type];
  $("#cats").innerHTML = list.map((c) => `
    <button class="cat ${c.name === ui.draft.category ? "active" : ""}" data-cat="${esc(c.name)}">
      ${esc(c.name)}
    </button>`).join("");
}

function saveTransaction() {
  const amount = Math.round(Number($("#f-amount").value));
  if (!Number.isFinite(amount) || amount <= 0) {
    toast("Escribe un monto mayor a 0");
    $("#f-amount").focus();
    return;
  }
  const category = ui.draft.category;
  const note = $("#f-note").value.trim().slice(0, 40) || category;
  const date = $("#f-date").value || todayISO();

  const tx = {
    id: uid(),
    type: ui.draft.type,
    amount,
    category,
    note,
    date,
    createdAt: Date.now(),
  };
  state.transactions.push(tx);
  state.onboarded = true;
  queueCloud({ op: "upsert", tx });
  persist();

  ui.month = monthOf(date);
  ui.filter = "Todas";
  closeSheets();
  renderAll();
  showTab("home");
  toast("Movimiento guardado");
}

function openDetail(id) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  ui.detailId = id;
  const cat = catInfo(tx.type, tx.category);
  const icon = $("#d-icon");
  icon.textContent = tx.category.charAt(0).toUpperCase();
  icon.style.color = cat.color;

  $("#d-amount").textContent = `${tx.type === "income" ? "+" : "−"}${money(tx.amount)}`;
  $("#d-amount").style.color = tx.type === "income" ? "var(--green)" : "var(--text)";
  $("#d-meta").textContent = tx.note;
  $("#d-cat").textContent = tx.category;
  $("#d-date").textContent = `${dateLabel(tx.date)} · ${tx.date}`;
  $("#d-type").textContent = tx.type === "income" ? "Ingreso" : "Gasto";
  openSheet("sheet-detail");
}

function deleteTransaction() {
  const tx = state.transactions.find((t) => t.id === ui.detailId);
  if (!tx) return;
  if (!confirm(`¿Eliminar "${tx.note}"? Esta acción no se puede deshacer.`)) return;
  state.transactions = state.transactions.filter((t) => t.id !== tx.id);
  queueCloud({ op: "delete", id: tx.id });
  persist();
  closeSheets();
  renderAll();
  toast("Movimiento eliminado");
}

/* ---------------- ajustes y datos ---------------- */
function saveSettings() {
  const name = $("#input-name").value.trim().slice(0, 24) || "David";
  const goal = Math.max(0, Math.round(Number($("#input-goal").value) || 0));
  state.settings = { name, goal };
  queueCloud({ op: "settings", settings: { ...state.settings } });
  persist();
  renderAll();
  toast("Ajustes guardados");
}

function exportData() {
  const payload = {
    app: "Control Finance",
    version: 1,
    exportedAt: new Date().toISOString(),
    state: { ...state, pending: [] },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `control-finance-${todayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Copia de seguridad generada");
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = normalize(JSON.parse(reader.result));
      if (!parsed) throw new Error("Formato no válido");
      if (!confirm(`Se reemplazarán tus datos actuales por ${parsed.transactions.length} movimientos. ¿Continuar?`)) return;
      state = parsed;
      state.onboarded = true;
      state.pending = [];
      if (cloud.uid) {
        state.pending = [{
          op: "replace",
          transactions: state.transactions.map((t) => ({ ...t })),
        }];
        scheduleSync(100);
      }
      persist();
      ui.month = currentMonth();
      renderAll();
      showTab("home");
      toast("Datos importados");
    } catch (err) {
      console.error(err);
      toast("El archivo no tiene un formato válido");
    }
  };
  reader.readAsText(file);
}

async function resetData() {
  if (!confirm("¿Borrar TODOS tus movimientos y ajustes? Esta acción no se puede deshacer.")) return;
  const logged = Boolean(cloud.uid);
  localStorage.removeItem(KEY);
  state = defaultState();
  state.onboarded = false;

  if (logged) {
    state.pending = [{ op: "reset" }];
    cloud.hasQuickToken = false;
    cloud.quickToken = "";
    localStorage.removeItem("cf.quickToken." + cloud.uid);
    persist();
    await syncNow(true);
    // Con sesión no mostramos la bienvenida: evita subir datos de ejemplo a la nube.
    state.onboarded = true;
    persist();
  }

  ui.month = currentMonth();
  ui.filter = "Todas";
  renderAll();
  if (!logged) openSheet("sheet-welcome");
  toast("Datos borrados");
}

/* ---------------- datos de ejemplo ---------------- */
function seedDemo(showToast = true, render = true) {
  const now = new Date();
  const current = now.getMonth();
  const year = now.getFullYear();

  function tx(monthOffset, day, type, amount, category, note) {
    const base = new Date(year, current + monthOffset, 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const safeDay = Math.min(day, monthOffset === 0 ? Math.max(1, Math.min(now.getDate(), lastDay)) : lastDay);
    return {
      id: uid(),
      type,
      amount,
      category,
      note,
      date: `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(safeDay)}`,
      createdAt: Date.now() - Math.round(Math.random() * 1e6),
    };
  }

  state.transactions = [
    tx(0, 1, "income", 4250000, "Salario", "Nómina del mes"),
    tx(0, 2, "expense", 860400, "Hogar", "Arriendo"),
    tx(0, 4, "expense", 86400, "Comida", "Mercado semanal"),
    tx(0, 6, "expense", 16900, "Ocio", "Spotify"),
    tx(0, 8, "expense", 12300, "Transporte", "Uber al trabajo"),
    tx(0, 11, "expense", 45000, "Comida", "Almuerzos"),
    tx(0, 13, "income", 320000, "Freelance", "Diseño web"),
    tx(0, 15, "expense", 120000, "Compras", "Ropa"),
    tx(0, 18, "expense", 68000, "Salud", "Farmacia"),
    tx(-1, 1, "income", 4250000, "Salario", "Nómina del mes"),
    tx(-1, 3, "expense", 860400, "Hogar", "Arriendo"),
    tx(-1, 8, "expense", 210000, "Comida", "Mercado"),
    tx(-1, 12, "expense", 60000, "Transporte", "Gasolina"),
    tx(-1, 16, "expense", 150000, "Ocio", "Salida"),
    tx(-1, 20, "expense", 80000, "Salud", "Farmacia"),
    tx(-2, 4, "expense", 95000, "Comida", "Restaurante"),
  ];
  state.onboarded = true;
  persist();
  if (render) renderAll();
  if (showToast) toast("Datos de ejemplo cargados");
}

/* ---------------- nube: Supabase ---------------- */
let syncTimer = null;

function toCloud(tx) {
  return {
    id: tx.id,
    user_id: cloud.uid,
    type: tx.type,
    amount: tx.amount,
    category: tx.category,
    note: tx.note,
    date: tx.date,
    created_at: tx.createdAt ? new Date(tx.createdAt).toISOString() : new Date().toISOString(),
  };
}

function fromCloud(row) {
  return {
    id: String(row.id),
    type: row.type === "income" ? "income" : "expense",
    amount: Math.max(0, Math.round(Number(row.amount) || 0)),
    category: String(row.category || "Otros"),
    note: String(row.note || row.category || "Movimiento"),
    date: String(row.date || todayISO()).slice(0, 10),
    createdAt: row.created_at ? Date.parse(row.created_at) || Date.now() : Date.now(),
  };
}

function queueCloud(op) {
  if (!cloud.uid) return;
  state.pending = state.pending || [];
  state.pending.push(op);
  scheduleSync();
}

function scheduleSync(delay = 600) {
  if (!cloud.uid || !cloud.enabled) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(true), delay);
}

function cloudLabels(status) {
  return {
    local: "LOCAL",
    connecting: "CONECTANDO",
    syncing: "SINC",
    synced: "NUBE",
    offline: "OFFLINE",
    error: "ERROR",
  }[status] || "LOCAL";
}

function cloudBadgeClass(status) {
  if (status === "synced") return "badge";
  if (status === "error") return "badge badge--error";
  if (status === "offline") return "badge badge--warn";
  if (status === "syncing" || status === "connecting") return "badge badge--sync";
  return "badge badge--soft";
}

function setCloudStatus(status, message = "") {
  cloud.status = status;
  cloud.message = message;
  renderCloudUI();
}

function setMsg(id, text, tone = "") {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  el.className = "auth-msg" + (tone ? " " + tone : "");
}

function setAuthMessage(text, tone = "", prefix = "auth") {
  setMsg("#" + prefix + "-msg", text, tone);
}

function renderCloudUI() {
  renderGate();
  const badge = $("#cloud-badge");
  if (!badge) return;
  const card = $("#account-card");
  const quick = $("#quick-card");

  if (!cloud.enabled) {
    if (card) card.hidden = true;
    if (quick) quick.hidden = true;
    badge.textContent = "LOCAL";
    badge.className = "badge badge--soft";
    return;
  }

  const logged = Boolean(cloud.uid);
  if (card) card.hidden = false;
  if (quick) quick.hidden = !logged;
  $("#auth-form").hidden = logged;
  $("#account-panel").hidden = !logged;
  $("#account-hint").hidden = logged;

  badge.textContent = cloudLabels(cloud.status);
  badge.className = cloudBadgeClass(cloud.status);
  const status = $("#account-status");
  status.textContent = cloudLabels(cloud.status);
  status.className = cloudBadgeClass(cloud.status);

  if (logged) {
    $("#account-email").textContent = cloud.email;
    const when = cloud.lastSync
      ? new Date(cloud.lastSync).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
      : "—";
    const info = {
      connecting: "Conectando con la nube…",
      syncing: "Sincronizando cambios…",
      offline: "Sin conexión. Se reintentará al volver.",
      error: "No se pudo sincronizar. Revisa tu conexión.",
      synced: `Última sincronización: ${when}`,
    };
    $("#sync-info").textContent = info[cloud.status] || `Última sincronización: ${when}`;
    $("#sync-info").title = cloud.message || "";
  }

  const box = $("#quick-token-box");
  const input = $("#quick-token");
  if (logged && cloud.quickToken) {
    input.value = cloud.quickToken;
    box.hidden = false;
  } else {
    input.value = "";
    box.hidden = true;
  }
  const gen = $('#quick-card [data-action="gen-token"]');
  if (gen) gen.textContent = cloud.hasQuickToken ? "Regenerar token del atajo" : "Generar token del atajo";
  renderPinUI();
}

function translateAuthError(message) {
  const text = String(message || "");
  if (/invalid login credentials/i.test(text)) return "Email o contraseña incorrectos.";
  if (/email not confirmed/i.test(text)) return "Confirma tu correo antes de entrar.";
  if (/user already registered/i.test(text)) return "Ese email ya tiene cuenta. Toca Entrar.";
  if (/password should be at least/i.test(text)) return "La contraseña debe tener al menos 6 caracteres.";
  if (/unable to validate email/i.test(text)) return "Escribe un email válido.";
  if (/fetch|network|failed/i.test(text)) return "Sin conexión. Inténtalo de nuevo.";
  return text || "No se pudo completar la operación.";
}

function authCredentials(prefix = "auth") {
  const email = $("#" + prefix + "-email").value.trim();
  const password = $("#" + prefix + "-password").value;
  if (!email || !email.includes("@")) {
    setAuthMessage("Escribe un email válido.", "error", prefix);
    return null;
  }
  if (password.length < 6) {
    setAuthMessage("La contraseña debe tener al menos 6 caracteres.", "error", prefix);
    return null;
  }
  return { email, password };
}

async function signIn(prefix = "auth") {
  if (!sb) return;
  const credentials = authCredentials(prefix);
  if (!credentials) return;
  setAuthMessage("Entrando…", "", prefix);
  setCloudStatus("connecting");
  const { data, error } = await sb.auth.signInWithPassword(credentials);
  if (error) {
    setAuthMessage(translateAuthError(error.message), "error", prefix);
    setCloudStatus(cloud.uid ? "error" : "local", error.message);
    return;
  }
  setAuthMessage("", "", prefix);
  $("#" + prefix + "-password").value = "";
  unlockApp();
  await onSignedIn(data.session);
}

async function signUp(prefix = "auth") {
  if (!sb) return;
  const credentials = authCredentials(prefix);
  if (!credentials) return;
  setAuthMessage("Creando cuenta…", "", prefix);
  setCloudStatus("connecting");
  const { data, error } = await sb.auth.signUp({
    ...credentials,
    options: { data: { name: state.settings.name, goal: state.settings.goal } },
  });
  if (error) {
    setAuthMessage(translateAuthError(error.message), "error", prefix);
    setCloudStatus(cloud.uid ? "error" : "local", error.message);
    return;
  }
  if (!data.session) {
    setAuthMessage("Cuenta creada. Revisa tu correo para confirmarla y luego toca Entrar.", "ok", prefix);
    setCloudStatus("local");
    return;
  }
  setAuthMessage("", "", prefix);
  $("#" + prefix + "-password").value = "";
  unlockApp();
  await onSignedIn(data.session);
}

async function onSignedIn(session) {
  if (!session?.user || !sb) return;
  if (cloud.uid === session.user.id && cloud.status === "synced") return;
  if (cloud.connecting) return;

  cloud.connecting = true;
  cloud.uid = session.user.id;
  cloud.email = session.user.email || "";
  localStorage.setItem("cf.lastEmail", cloud.email);
  setCloudStatus("connecting");

  try {
    await ensureProfile();
    await initialSync();
    subscribeRealtime();
    cloud.lastSync = Date.now();
    setCloudStatus("synced");
    renderAll();
  } catch (error) {
    console.error("Nube:", error);
    setCloudStatus("error", error.message);
    toast("No se pudo sincronizar con la nube");
  } finally {
    cloud.connecting = false;
    if (cloud.syncAgain) {
      cloud.syncAgain = false;
      setTimeout(() => syncNow(true), 100);
    }
  }
}

async function ensureProfile() {
  const select = "id,name,goal,quick_token_hash";
  let { data, error } = await sb.from("profiles").select(select).eq("id", cloud.uid).maybeSingle();
  if (error) throw error;

  if (!data) {
    const inserted = await sb.from("profiles")
      .insert({ id: cloud.uid, name: state.settings.name, goal: state.settings.goal })
      .select(select)
      .maybeSingle();
    if (inserted.error) throw inserted.error;
    data = inserted.data;
  }

  if (data) {
    cloud.hasQuickToken = Boolean(data.quick_token_hash);
    if (data.name) state.settings.name = data.name;
    if (data.goal != null) state.settings.goal = Number(data.goal) || 0;
  }
  cloud.quickToken = localStorage.getItem("cf.quickToken." + cloud.uid) || "";
  persist();
}

async function initialSync() {
  const { data, error } = await sb.from("transactions").select("*");
  if (error) throw error;

  const remote = (data || []).map(fromCloud);
  const remoteIds = new Set(remote.map((t) => t.id));
  const localOnly = state.transactions.filter((t) => !remoteIds.has(t.id));

  if (localOnly.length) {
    const { error: uploadError } = await sb.from("transactions")
      .upsert(localOnly.map(toCloud), { onConflict: "id" });
    if (uploadError) throw uploadError;
  }

  const map = new Map(remote.map((t) => [t.id, t]));
  state.transactions.forEach((t) => { if (!map.has(t.id)) map.set(t.id, t); });
  state.transactions = [...map.values()].sort(byDateDesc);

  await flushQueue();
  await pullCloud();
}

async function flushQueue() {
  state.pending = state.pending || [];
  while (state.pending.length) {
    const op = state.pending[0];
    let error = null;

    if (op.op === "upsert" && op.tx) {
      ({ error } = await sb.from("transactions").upsert(toCloud(op.tx), { onConflict: "id" }));
    } else if (op.op === "delete" && op.id) {
      ({ error } = await sb.from("transactions").delete().eq("id", op.id));
    } else if (op.op === "settings" && op.settings) {
      ({ error } = await sb.from("profiles")
        .update({ name: op.settings.name, goal: op.settings.goal })
        .eq("id", cloud.uid));
    } else if (op.op === "replace") {
      ({ error } = await sb.from("transactions").delete().eq("user_id", cloud.uid));
      const rows = (op.transactions || []).map((t) => toCloud(t));
      for (let i = 0; !error && i < rows.length; i += 200) {
        ({ error } = await sb.from("transactions").insert(rows.slice(i, i + 200)));
      }
    } else if (op.op === "reset") {
      ({ error } = await sb.from("transactions").delete().eq("user_id", cloud.uid));
      if (!error) {
        ({ error } = await sb.from("profiles")
          .update({ name: "David", goal: 2000000, quick_token_hash: null })
          .eq("id", cloud.uid));
      }
      if (!error) {
        cloud.hasQuickToken = false;
        cloud.quickToken = "";
        localStorage.removeItem("cf.quickToken." + cloud.uid);
      }
    }

    if (error) throw error;
    state.pending.shift();
    persist();
  }
}

async function pullCloud() {
  const { data, error } = await sb.from("transactions")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  const remote = (data || []).map(fromCloud);
  const pendingUpserts = (state.pending || [])
    .filter((op) => op.op === "upsert" && op.tx)
    .map((op) => op.tx);
  const pendingDeletes = new Set(
    (state.pending || []).filter((op) => op.op === "delete").map((op) => op.id)
  );

  const map = new Map(
    remote.filter((t) => !pendingDeletes.has(t.id)).map((t) => [t.id, t])
  );
  for (const tx of pendingUpserts) map.set(tx.id, tx);

  state.transactions = [...map.values()].sort(byDateDesc);
  persist();
  renderAll();
}

async function syncNow(silent = false) {
  if (!cloud.uid || !sb) return;
  if (cloud.connecting || cloud.syncing) {
    cloud.syncAgain = true;
    return;
  }
  if (!navigator.onLine) {
    setCloudStatus("offline");
    if (!silent) toast("Sin conexión");
    return;
  }

  cloud.syncing = true;
  setCloudStatus("syncing");
  try {
    await flushQueue();
    await pullCloud();
    cloud.lastSync = Date.now();
    setCloudStatus("synced");
  } catch (error) {
    console.error("Sync:", error);
    setCloudStatus("error", error.message);
    if (!silent) toast("No se pudo sincronizar");
  } finally {
    cloud.syncing = false;
    renderCloudUI();
    if (cloud.syncAgain) {
      cloud.syncAgain = false;
      setTimeout(() => syncNow(true), 100);
    }
  }
}

function subscribeRealtime() {
  if (!sb || !cloud.uid || CONFIG.realtime === false) return;
  if (cloud.channel) sb.removeChannel(cloud.channel);
  cloud.channel = sb.channel("cf-" + cloud.uid)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "transactions",
      filter: `user_id=eq.${cloud.uid}`,
    }, () => scheduleSync(300))
    .subscribe();
}

function onSignedOut() {
  if (cloud.channel && sb) sb.removeChannel(cloud.channel);
  cloud.channel = null;
  cloud.uid = null;
  cloud.email = "";
  cloud.quickToken = "";
  cloud.hasQuickToken = false;
  cloud.lastSync = null;
  cloud.connecting = false;
  cloud.syncing = false;
  cloud.syncAgain = false;
  cloud.unlocked = false;
  cloud.passwordFallback = false;
  setCloudStatus("local");
  renderAll();
}

/* ---------------- acceso: sesión y PIN ---------------- */
const PIN_MAX_FAILS = 5;
const LOCK_AFTER_MS = 60000;
let hiddenAt = 0;
let pinInput = "";
let pinBusy = false;

function pinKey() {
  return "cf.pin." + cloud.uid;
}

function readPin() {
  try {
    return JSON.parse(localStorage.getItem(pinKey()) || "null");
  } catch (error) {
    return null;
  }
}

function pinSet() {
  return Boolean(cloud.uid && readPin());
}

function isLocked() {
  return Boolean(cloud.uid && pinSet() && !cloud.unlocked);
}

function gateMode() {
  if (!cloud.enabled) return "";
  if (!cloud.checked) return "loading";
  if (!cloud.uid) return "login";
  if (isLocked()) {
    const record = readPin();
    return cloud.passwordFallback || record.fails >= PIN_MAX_FAILS ? "login" : "pin";
  }
  return "";
}

function renderGate() {
  const gate = $("#gate");
  if (!gate) return;
  const mode = gateMode();
  if (mode === gate.dataset.mode) return;
  const wasOpen = Boolean(gate.dataset.mode);
  gate.dataset.mode = mode;
  gate.hidden = !mode;
  $("#gate-loading").hidden = mode !== "loading";
  $("#gate-login").hidden = mode !== "login";
  $("#gate-pin").hidden = mode !== "pin";
  $("#gate-signup").hidden = Boolean(cloud.uid);
  $("#gate-login-hint").textContent = cloud.uid
    ? "Inicia sesión con tu contraseña para continuar."
    : "Entra con tu email y contraseña para ver tus finanzas.";
  pinInput = "";
  updatePinDots();
  setMsg("#gate-pin-msg", "");
  setMsg("#gate-msg", "");
  if (wasOpen && !mode && !state.onboarded) openSheet("sheet-welcome");
}

function unlockApp() {
  cloud.unlocked = true;
  cloud.passwordFallback = false;
  const record = readPin();
  if (record && record.fails) {
    record.fails = 0;
    localStorage.setItem(pinKey(), JSON.stringify(record));
  }
  renderGate();
}

function updatePinDots() {
  $$("#pin-dots span").forEach((dot, i) => dot.classList.toggle("filled", i < pinInput.length));
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));
}

async function derivePin(pin, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations: 150000 },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function pressPinKey(key) {
  if (pinBusy || !isLocked()) return;
  if (key === "back") pinInput = pinInput.slice(0, -1);
  else if (pinInput.length < 4) pinInput += key;
  updatePinDots();
  if (pinInput.length === 4) await checkPin();
}

async function checkPin() {
  pinBusy = true;
  const record = readPin();
  const hash = await derivePin(pinInput, record.salt);
  pinInput = "";
  updatePinDots();
  if (hash === record.hash) {
    pinBusy = false;
    return unlockApp();
  }
  record.fails = (record.fails || 0) + 1;
  localStorage.setItem(pinKey(), JSON.stringify(record));
  pinBusy = false;
  const left = PIN_MAX_FAILS - record.fails;
  renderGate();
  if (left > 0) {
    setMsg("#gate-pin-msg", `PIN incorrecto. Te quedan ${left} intentos.`, "error");
  } else {
    setMsg("#gate-msg", "Demasiados intentos. Inicia sesión con tu contraseña.", "error");
  }
}

function renderPinUI() {
  const set = pinSet();
  const status = $("#pin-status");
  status.textContent = set ? "ACTIVO" : "DESACTIVADO";
  status.className = set ? "badge" : "badge badge--soft";
  $("#pin-save").textContent = set ? "Cambiar PIN" : "Activar PIN";
  $("#pin-remove").hidden = !set;
}

async function savePin() {
  const pin = $("#pin-new").value.trim();
  const repeat = $("#pin-confirm").value.trim();
  if (!/^\d{4}$/.test(pin)) return setMsg("#pin-msg", "El PIN debe tener 4 números.", "error");
  if (pin !== repeat) return setMsg("#pin-msg", "Los PIN no coinciden.", "error");
  if (!crypto.subtle) return setMsg("#pin-msg", "Este navegador no permite usar PIN.", "error");

  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derivePin(pin, salt);
  localStorage.setItem(pinKey(), JSON.stringify({ salt, hash, fails: 0 }));
  $("#pin-new").value = "";
  $("#pin-confirm").value = "";
  setMsg("#pin-msg", "PIN guardado. Te lo pediremos al abrir la app en este iPhone.", "ok");
  renderPinUI();
}

function removePin() {
  if (!confirm("¿Quitar el PIN de este dispositivo? Seguirás con sesión iniciada.")) return;
  localStorage.removeItem(pinKey());
  setMsg("#pin-msg", "");
  renderPinUI();
  toast("PIN quitado");
}

async function logout() {
  if (!confirm("¿Cerrar sesión? Tus datos seguirán en la nube y en este dispositivo.")) return;
  try {
    if (sb) await sb.auth.signOut({ scope: "local" });
  } catch (error) {
    console.warn(error);
  }
  onSignedOut();
  toast("Sesión cerrada");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateQuickToken() {
  if (!cloud.uid || !sb) return;
  if (!crypto.subtle) {
    toast("Este navegador no permite generar el token");
    return;
  }
  if (cloud.hasQuickToken && !confirm("Esto invalida el token anterior. El Atajo dejará de funcionar hasta que lo actualices. ¿Continuar?")) return;

  const token = randomToken();
  const hash = await sha256Hex(token);
  const { error } = await sb.from("profiles").update({ quick_token_hash: hash }).eq("id", cloud.uid);
  if (error) {
    console.error(error);
    toast("No se pudo generar el token");
    return;
  }

  cloud.quickToken = token;
  cloud.hasQuickToken = true;
  localStorage.setItem("cf.quickToken." + cloud.uid, token);
  renderCloudUI();
  $("#quick-token").value = token;
  $("#quick-token-box").hidden = false;
  toast("Token generado");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      return true;
    } catch (err) {
      return false;
    }
  }
}

async function copyQuickToken() {
  if (!cloud.quickToken) {
    toast("Genera un token primero");
    return;
  }
  const ok = await copyText(cloud.quickToken);
  toast(ok ? "Token copiado" : "No se pudo copiar");
}

async function copyShortcutConfig() {
  const token = cloud.quickToken || "GENERA_UN_TOKEN";
  const payload = {
    url: `${CONFIG.supabaseUrl}/rest/v1/rpc/cf_quick_add`,
    method: "POST",
    headers: {
      apikey: CONFIG.supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: {
      p_token: token,
      p_amount: 25000,
      p_type: "expense",
      p_category: "Comida",
      p_note: "Café",
      p_date: todayISO(),
    },
  };
  const ok = await copyText(JSON.stringify(payload, null, 2));
  toast(ok ? "Configuración copiada (contiene tu token)" : "No se pudo copiar");
}

function initCloud() {
  if (!cloud.enabled) {
    renderCloudUI();
    return;
  }

  const savedEmail = localStorage.getItem("cf.lastEmail");
  if (savedEmail) {
    $("#auth-email").value = savedEmail;
    $("#gate-email").value = savedEmail;
  }

  $("#auth-password").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      signIn();
    }
  });

  $("#gate-password").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      signIn("gate");
    }
  });

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      onSignedOut();
      return;
    }
    if (!session) return;
    if (cloud.uid === session.user.id && cloud.status === "synced") return;
    onSignedIn(session);
  });

  sb.auth.getSession()
    .then(({ data }) => {
      cloud.checked = true;
      renderGate();
      if (data?.session && !cloud.uid) return onSignedIn(data.session);
    })
    .catch((error) => {
      cloud.checked = true;
      renderGate();
      console.warn("Sesión:", error);
    });

  renderCloudUI();

  setInterval(() => {
    if (cloud.uid && !cloud.syncing && document.visibilityState === "visible" && navigator.onLine) {
      syncNow(true);
    }
  }, 30000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (cloud.uid && pinSet() && Date.now() - hiddenAt > LOCK_AFTER_MS) {
      cloud.unlocked = false;
      cloud.passwordFallback = false;
      renderGate();
    }
    if (cloud.uid) syncNow(true);
  });
  window.addEventListener("online", () => {
    if (cloud.uid) syncNow(true);
  });
  window.addEventListener("offline", () => {
    if (cloud.uid) setCloudStatus("offline");
  });
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ---------------- eventos ---------------- */
document.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === "tab") return showTab(actionEl.dataset.tab);
    if (action === "add") return openAdd(actionEl.dataset.type || "expense");
    if (action === "close-sheet") {
      if (openSheetId === "sheet-welcome") return;
      return closeSheets();
    }
    if (action === "save-tx") return saveTransaction();
    if (action === "delete-tx") return deleteTransaction();
    if (action === "prev-month") { ui.month = shiftMonth(ui.month, -1); return renderMovements(); }
    if (action === "next-month") { ui.month = shiftMonth(ui.month, 1); return renderMovements(); }
    if (action === "save-settings") return saveSettings();
    if (action === "login") return signIn();
    if (action === "signup") return signUp();
    if (action === "gate-login") return signIn("gate");
    if (action === "gate-signup") return signUp("gate");
    if (action === "gate-password") {
      cloud.passwordFallback = true;
      return renderGate();
    }
    if (action === "pin-key") return pressPinKey(actionEl.dataset.key);
    if (action === "save-pin") return savePin();
    if (action === "remove-pin") return removePin();
    if (action === "logout") return logout();
    if (action === "sync-now") return syncNow(false);
    if (action === "gen-token") return generateQuickToken();
    if (action === "copy-token") return copyQuickToken();
    if (action === "copy-shortcut") return copyShortcutConfig();
    if (action === "export") return exportData();
    if (action === "import") return $("#import-file").click();
    if (action === "reset") return resetData();
    if (action === "welcome-start") {
      closeSheets();
      return setTimeout(() => openAdd("expense"), 180);
    }
    if (action === "welcome-demo") {
      seedDemo(false);
      closeSheets();
      renderAll();
      showTab("home");
      return toast("Datos de ejemplo cargados");
    }
    if (action === "welcome-blank") {
      state.onboarded = true;
      persist();
      closeSheets();
      return;
    }
  }

  const chip = event.target.closest(".chip");
  if (chip) {
    ui.filter = chip.dataset.filter;
    $$(".chip").forEach((c) => c.classList.toggle("active", c === chip));
    renderList(monthTransactions(ui.month));
    return;
  }

  const cat = event.target.closest(".cat");
  if (cat) {
    ui.draft.category = cat.dataset.cat;
    $$(".cat").forEach((c) => c.classList.toggle("active", c === cat));
    return;
  }

  const typeBtn = event.target.closest("#type-seg button");
  if (typeBtn) {
    setDraftType(typeBtn.dataset.type);
    return;
  }

  const row = event.target.closest(".tx");
  if (row && row.dataset.id) openDetail(row.dataset.id);
});

$("#import-file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importData(file);
  event.target.value = "";
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && openSheetId && openSheetId !== "sheet-welcome") closeSheets();
});

/* ---------------- arranque ---------------- */
renderAll();
showTab(ui.tab);

if (!state.onboarded && !cloud.enabled) openSheet("sheet-welcome");

initCloud();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
