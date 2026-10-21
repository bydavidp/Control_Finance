// Control Finance · widget de saldo para Scriptable
// Guarda el token en el Llavero de iOS. Solo lee totales; no puede modificar datos.

const SUPABASE_URL = "https://apzdfcgitjysucknyocc.supabase.co";
const ANON_KEY = "sb_publishable_gAMCW-Sk8UvMzaoXWkY9Vw_-T9fKizB";
const TOKEN_KEY = "cf_widget_token";

const GREEN = new Color("#2BD98A");
const RED = new Color("#FF6B81");
const MUTED = new Color("#8B98AA");
const CARD = new Color("#121821");

async function askToken() {
  const alert = new Alert();
  alert.title = "Token de Control Finance";
  alert.message = "Pega el token que copiaste en Perfil → Atajo de iOS.";
  alert.addTextField("Token");
  alert.addCancelAction("Cancelar");
  alert.addAction("Guardar");
  const choice = await alert.presentAlert();
  if (choice === -1) return null;
  const token = alert.textFieldValue(0).trim();
  if (!token) return null;
  Keychain.set(TOKEN_KEY, token);
  return token;
}

async function getToken() {
  if (Keychain.contains(TOKEN_KEY)) return Keychain.get(TOKEN_KEY);
  return askToken();
}

async function fetchSummary(token) {
  const req = new Request(`${SUPABASE_URL}/rest/v1/rpc/cf_quick_balance`);
  req.method = "POST";
  req.headers = { apikey: ANON_KEY, "Content-Type": "application/json" };
  req.body = JSON.stringify({ p_token: token });
  return await req.loadJSON();
}

function money(value) {
  const sign = value < 0 ? "-" : "";
  const digits = Math.round(Math.abs(value)).toString();
  return sign + "$ " + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function buildWidget(data) {
  const widget = new ListWidget();
  widget.backgroundColor = CARD;
  widget.setPadding(14, 16, 14, 16);
  widget.url = "https://bydavidp.github.io/Control_Finance/";

  const title = widget.addText(`Balance · ${data.name || "Control Finance"}`);
  title.font = Font.mediumSystemFont(12);
  title.textColor = MUTED;
  title.lineLimit = 1;

  widget.addSpacer(6);

  const amount = widget.addText(money(data.balance));
  amount.font = Font.boldSystemFont(28);
  amount.minimumScaleFactor = 0.6;
  amount.lineLimit = 1;
  amount.textColor = data.balance >= 0 ? GREEN : RED;

  widget.addSpacer(8);

  const row = widget.addStack();
  const income = row.addText(`↑ ${money(data.income)}`);
  income.font = Font.mediumSystemFont(11);
  income.textColor = GREEN;
  income.minimumScaleFactor = 0.7;
  row.addSpacer();
  const expense = row.addText(`↓ ${money(data.expense)}`);
  expense.font = Font.mediumSystemFont(11);
  expense.textColor = RED;
  expense.minimumScaleFactor = 0.7;

  widget.addSpacer(4);

  const footer = widget.addText(`Total guardado: ${money(data.total)}`);
  footer.font = Font.systemFont(10);
  footer.textColor = MUTED;
  footer.minimumScaleFactor = 0.7;
  footer.lineLimit = 1;

  return widget;
}

function errorWidget(message) {
  const widget = new ListWidget();
  widget.backgroundColor = CARD;
  widget.setPadding(14, 16, 14, 16);
  const text = widget.addText(message);
  text.font = Font.mediumSystemFont(12);
  text.textColor = RED;
  return widget;
}

async function main() {
  const token = await getToken();
  if (!token) return;

  let widget;
  try {
    const data = await fetchSummary(token);
    if (data.code || data.message) {
      if (!config.runsInWidget) Keychain.remove(TOKEN_KEY);
      widget = errorWidget("Token inválido. Ejecuta la app Scriptable para pegar uno nuevo.");
    } else {
      widget = buildWidget(data);
    }
  } catch (error) {
    widget = errorWidget("Sin conexión. Se actualizará más tarde.");
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentMedium();
  }
  Script.complete();
}

await main();
