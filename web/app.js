/* Control Finance — PWA de finanzas personales.
   Datos reales guardados en localStorage (sin backend todavía). */

const KEY = "controlfinance.v1";

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

  return {
    version: 1,
    onboarded: Boolean(data.onboarded),
    settings: {
      name: String(data.settings?.name || "David").slice(0, 24),
      goal: Math.max(0, Number(data.settings?.goal) || 0),
    },
    transactions,
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
  $("#input-name").value = name;
  $("#input-goal").value = state.settings.goal || "";

  const distinctMonths = new Set(state.transactions.map((t) => t.date.slice(0, 7))).size;
  const balance = state.transactions.reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0
  );
  $("#stat-tx").textContent = state.transactions.length;
  $("#stat-months").textContent = distinctMonths;
  $("#stat-saved").textContent = compactMoney(balance);
  $("#stat-saved").title = signedMoney(balance);
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

  state.transactions.push({
    id: uid(),
    type: ui.draft.type,
    amount,
    category,
    note,
    date,
    createdAt: Date.now(),
  });
  state.onboarded = true;
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
  persist();
  renderAll();
  toast("Ajustes guardados");
}

function exportData() {
  const payload = {
    app: "Control Finance",
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
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

function resetData() {
  if (!confirm("¿Borrar TODOS tus movimientos y ajustes? Esta acción no se puede deshacer.")) return;
  localStorage.removeItem(KEY);
  state = defaultState();
  state.onboarded = false;
  ui.month = currentMonth();
  ui.filter = "Todas";
  renderAll();
  openSheet("sheet-welcome");
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

if (!state.onboarded) openSheet("sheet-welcome");

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
