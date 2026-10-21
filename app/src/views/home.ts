import { store } from "../store/store";
import { totalsOf, monthTransactions, previousBalance, lastSevenDaysExpenses, topExpenseCategory, goalProgress } from "../domain/calc";
import { money, signedMoney, monthName, shiftMonth, currentMonth, initials, dateLabel, esc } from "../domain/format";
import { categoryColor } from "../domain/categories";
import { setText, setHidden } from "../ui/dom";
import type { Transaction } from "../domain/types";

export function txRow(t: Transaction): string {
  const color = categoryColor(t.type, t.category);
  const sign = t.type === "income" ? "+" : "−";
  return `
    <button class="tx" data-id="${esc(t.id)}">
      <span class="tx-ico" style="--c:${color}">${esc(t.category.charAt(0).toUpperCase())}</span>
      <span class="tx-body">
        <span class="tx-title">${esc(t.note)}</span>
        <span class="tx-sub">${esc(dateLabel(t.date))} · ${esc(t.category)}</span>
      </span>
      <span class="tx-amount ${t.type}">${sign}${money(t.amount)}</span>
    </button>`;
}

function sparkline(days: number[]): void {
  const max = Math.max(...days, 1);
  const pts = days.map((v, i) => ({ x: 4 + (142 * i) / 6, y: 38 - (v / max) * 30 }));
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) return;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    if (!prev || !cur) continue;
    const mid = (prev.x + cur.x) / 2;
    d += ` C ${mid} ${prev.y}, ${mid} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  document.getElementById("spark-path")?.setAttribute("d", d);
  const dot = document.getElementById("spark-dot");
  dot?.setAttribute("cx", String(last.x));
  dot?.setAttribute("cy", String(last.y));
}

export function renderHome(): void {
  const { state } = store;
  const month = currentMonth();
  const list = monthTransactions(state.transactions, month);
  const { balance } = totalsOf(list);

  setText("#hero-label", `Balance de ${monthName(month)}`);
  setText("#balance", signedMoney(balance));

  const prev = previousBalance(state.transactions, shiftMonth(month, -1));
  const trend = document.getElementById("trend");
  const trendSub = document.getElementById("trend-sub");
  if (trend && trendSub) {
    trend.className = "trend";
    if (!prev.list.length || prev.balance === 0) {
      trend.textContent = "—";
      trend.classList.add("neutral");
      trendSub.textContent = prev.list.length ? `vs. ${monthName(shiftMonth(month, -1))}` : "Sin datos del mes anterior";
    } else {
      const pct = ((balance - prev.balance) / Math.abs(prev.balance)) * 100;
      trend.textContent = `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1).replace(".", ",")} %`;
      trend.classList.add(pct >= 0 ? "positive" : "negative");
      trendSub.textContent = `vs. ${monthName(shiftMonth(month, -1))}`;
    }
  }
  sparkline(lastSevenDaysExpenses(state.transactions));

  const recent = list.slice(0, 3);
  const listEl = document.getElementById("home-list");
  if (listEl) listEl.innerHTML = recent.map(txRow).join("");
  setHidden("#home-list", recent.length === 0);
  setHidden("#home-empty", recent.length > 0);

  const goal = state.settings.goal;
  const { saved, pct } = goalProgress(balance, goal);
  setText("#goal-values", `${money(saved)} / ${money(goal)}`);
  const bar = document.getElementById("goal-bar");
  if (bar) bar.style.width = `${pct}%`;
  setText(
    "#goal-caption",
    goal <= 0
      ? "Define tu meta en Perfil"
      : `${Math.round(pct)} % completado · ${pct >= 100 ? "¡meta cumplida!" : "faltan " + money(goal - saved)}`,
  );

  const top = topExpenseCategory(list);
  const icon = document.getElementById("insight-icon");
  if (!top) {
    setText("#insight-title", "Sin gastos este mes");
    setText("#insight-text", "Añade un gasto para ver en qué se va tu dinero.");
    icon?.style.setProperty("--c", "var(--warning)");
  } else {
    setText("#insight-title", `Mayor gasto: ${top.name}`);
    setText("#insight-text", `${money(top.total)} este mes · ${top.count} categoría${top.count === 1 ? "" : "s"}`);
    icon?.style.setProperty("--c", categoryColor("expense", top.name));
  }

  const greet = new Date().getHours();
  setText("#greeting", greet < 12 ? "Buenos días" : greet < 19 ? "Buenas tardes" : "Buenas noches");
  setText("#user-name", state.settings.name || "David");
  setText("#avatar", initials(state.settings.name || "David").charAt(0));
}
