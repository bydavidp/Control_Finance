import { store } from "../store/store";
import type { Transaction } from "../domain/types";
import { monthTransactions, totalsOf, weeklyExpenses, groupByDay } from "../domain/calc";
import { money, monthName, capitalize, currentMonth, dateLabel, shortAmount } from "../domain/format";
import { setText, setHidden } from "../ui/dom";
import { txRow } from "./home";

export function renderMovements(): void {
  const { state, ui } = store;
  const list = monthTransactions(state.transactions, ui.month);
  const { income, expense } = totalsOf(list);

  setText("#month-label", capitalize(monthName(ui.month, true)));
  const next = document.getElementById("next-month") as HTMLButtonElement | null;
  if (next) next.disabled = ui.month >= currentMonth();
  setText("#sum-in", money(income));
  setText("#sum-out", money(expense));

  renderChart(list, ui.month);
  renderList(list);

  document.querySelectorAll<HTMLElement>(".seg-btn[data-filter]").forEach((b) => {
    const on = b.dataset.filter === ui.filter;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
}

function renderChart(list: Transaction[], month: string): void {
  const { weeks, total, peak, expenseCount } = weeklyExpenses(list, month);
  const max = Math.max(...weeks, 0);

  setText("#chart-total", money(total));
  setText("#chart-sub", total
    ? `${monthName(month)} · ${expenseCount} gasto${expenseCount === 1 ? "" : "s"}`
    : "Sin gastos este mes");

  const bars = document.getElementById("bars");
  if (bars) {
    bars.innerHTML = weeks.map((value, i) => {
      const height = max > 0 ? Math.max(value > 0 ? 6 : 2, (value / max) * 100) : 2;
      const label = i === peak ? `<span class="bar-label">${shortAmount(value)}</span>` : "";
      return `<div class="bar${i === peak ? " is-peak" : ""}" style="--h:${height}%">${label}</div>`;
    }).join("");
  }
  const days = document.getElementById("days");
  if (days) days.innerHTML = weeks.map((_, i) => `<span>S${i + 1}</span>`).join("");
}

function renderList(list: Transaction[]): void {
  const { ui } = store;
  const rows = ui.filter === "Todas"
    ? list
    : list.filter((t) => t.type === (ui.filter === "Ingresos" ? "income" : "expense"));

  const container = document.getElementById("activity-list");
  if (container) {
    container.innerHTML = groupByDay(rows).map((group) => `
      <div class="day-group">
        <p class="day-label">${dateLabel(group.date)}</p>
        <div class="card list">${group.items.map(txRow).join("")}</div>
      </div>`).join("");
  }
  setHidden("#activity-empty", rows.length > 0);
  setText("#count", `${rows.length} registro${rows.length === 1 ? "" : "s"}`);
}
