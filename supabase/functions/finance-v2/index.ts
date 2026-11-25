// Generated from server/edge.js by npm run build.

// v2/domain/base.js
var assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
function integer(value, min, max, label2) {
  assert(Number.isSafeInteger(value) && value >= min && value <= max, label2);
  return value;
}
var cents = (v, min = 1) => integer(v, min, 999999999999, "Valor em centavos inv\xE1lido.");
function dateKey(value) {
  assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= "2199-12-31", "Data inv\xE1lida.");
  const date = /* @__PURE__ */ new Date(value + "T12:00:00Z");
  assert(!Number.isNaN(+date) && date.toISOString().slice(0, 10) === value, "Data inv\xE1lida.");
  return value;
}
function dayAt(month, day) {
  const [y, m] = month.split("-").map(Number);
  return month + "-" + String(Math.min(day, new Date(Date.UTC(y, m, 0)).getUTCDate())).padStart(2, "0");
}
function shift(date, months, anchor = Number(date.slice(8))) {
  const d = /* @__PURE__ */ new Date(date.slice(0, 7) + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return dayAt(d.toISOString().slice(0, 7), anchor);
}
function addDays(date, n) {
  const d = /* @__PURE__ */ new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
var sum = (rows, fn = (x) => x.amount) => {
  const n = rows.reduce((n2, x) => n2 + fn(x), 0);
  assert(Number.isSafeInteger(n), "Total fora do limite.");
  return n;
};
function split(total, count) {
  cents(total);
  integer(count, 1, 600, "Quantidade inv\xE1lida.");
  assert(total >= count, "Cada parcela deve ter pelo menos um centavo.");
  return Array.from({ length: count }, (_, i) => Math.floor(total / count) + (i < total % count ? 1 : 0));
}
function label(v) {
  assert(typeof v === "string" && v.trim().length > 0 && v.trim().length <= 140, "Informe um nome de at\xE9 140 caracteres.");
  return v.trim();
}
function one(rows, id) {
  const row = rows.find((x) => x.id === id);
  assert(row, "Registro n\xE3o encontrado.");
  return row;
}
function choose(v, values) {
  assert(values.includes(v), "Op\xE7\xE3o inv\xE1lida.");
  return v;
}
var blank = () => ({ version: 2, accounts: [], entries: [], plans: [], dues: [], rules: [], cards: [], purchases: [], positions: [], benefits: [], connections: [], imports: [], resources: [], logs: [] });

// v2/domain/engine.js
var primary = (s) => s.accounts.find((a) => a.primary);
function movement(entry, id) {
  if (entry.to === id) return entry.amount;
  if (entry.from === id) return -entry.amount;
  return 0;
}
function benefitBalance(s, wallet, asOf = "9999-12-31") {
  return sum(s.benefits.filter((x) => x.wallet === wallet && x.date <= asOf), (x) => x.direction === "credit" ? x.amount : -x.amount);
}
function cardStats(s, id, asOf = "9999-12-31") {
  const card = one(s.cards, id);
  const used = sum(s.dues.filter((x) => x.card === id && x.created <= asOf && (!x.paid || x.paid > asOf)));
  return { used, available: card.limit - used };
}
function upcoming(s, end, asOf, account2 = primary(s)?.id) {
  const rows = s.dues.filter((x) => x.created <= asOf && (!x.paid || x.paid > asOf) && x.date <= end && x.account === account2);
  for (const rule of s.rules.filter((r) => r.account === account2)) {
    for (let d = rule.start; d <= end && (!rule.end || d <= rule.end); d = shift(d, 1, rule.anchor || Number(rule.start.slice(8)))) {
      const id = rule.id + "/" + d;
      if (!s.dues.some((x) => x.id === id)) {
        rows.push({ ...rule, id, date: d, rule: rule.id, group: rule.kind === "income" ? "income" : "subscription" });
      }
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// server/legacy.js
var toCents = (v) => {
  const n = Number(v) * 100;
  assert(Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-5, "Valor legado sem precis\xE3o de centavos.");
  return Math.round(n);
};
var lookup = (list, id) => list.find((x) => x.id === id);
var when = (x) => String(x || "").slice(0, 10);
var walletNames = { food: "Alimenta\xE7\xE3o", meal: "Refei\xE7\xE3o", fuel: "Combust\xEDvel" };
function convertLegacy(raw, now) {
  const s = blank(), issues = [], counts = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.length]));
  const rows = (k) => raw[k] || [];
  const review = (message) => {
    if (!issues.includes(message)) issues.push(message);
  };
  const operational = rows("accounts").filter((a) => a.type !== "investment");
  const main = operational.find((a) => a.is_primary) || operational[0];
  if (operational.filter((a) => a.is_primary).length > 1) review("H\xE1 mais de uma conta principal na origem.");
  for (const a of operational) s.accounts.push({ id: a.id, name: a.name, institution: a.institution || a.name, type: { checking: "Corrente", digital: "Digital", savings: "Poupan\xE7a", salary: "Sal\xE1rio", wallet: "Carteira" }[a.type] || a.type, opened: when(a.created_at) || now, opening: toCents(a.balance), primary: a.id === main?.id, source: "system" });
  for (const a of rows("accounts").filter((a2) => a2.type === "investment")) s.positions.push({ id: a.id, name: a.name, institution: a.institution || a.name, kind: "Outro", source: "system", history: [{ date: now, amount: toCents(a.balance) }] });
  for (const a of rows("assets")) s.positions.push({ id: a.id, name: a.name, institution: "Cadastro anterior", kind: "asset", source: "system", history: [{ date: now, amount: toCents(a.value) }] });
  for (const t of rows("transactions")) {
    if (!lookup(operational, t.account_id)) {
      if (!rows("accounts").some((a) => a.type === "investment" && a.id === t.account_id)) review("H\xE1 lan\xE7amento sem conta identific\xE1vel.");
      continue;
    }
    if (t.occurred_on > now) {
      review("H\xE1 lan\xE7amento futuro j\xE1 inclu\xEDdo no saldo corrente.");
      continue;
    }
    const category = lookup(rows("categories"), t.category_id)?.name || "Outros";
    if (t.kind === "income" && /^(VA|VR|Vale Alimentação|Vale Refeição|Vale Combustível)$/i.test(category)) {
      review("H\xE1 cr\xE9dito de vale no extrato banc\xE1rio antigo. Confira a classifica\xE7\xE3o na origem.");
    }
    const inFlow = t.kind === "income";
    s.entries.push({ id: t.id, name: t.description, amount: toCents(t.amount), date: t.occurred_on, kind: t.kind, from: inFlow ? null : t.account_id, to: inFlow ? t.account_id : null, category, source: t.source_type === "installment_payment" ? "installment" : t.source_type === "recurring" ? "automation" : "manual" });
  }
  for (const t of rows("transfers")) {
    const from = lookup(operational, t.from_account_id)?.id || null, to = lookup(operational, t.to_account_id)?.id || null;
    if (from || to) s.entries.push({ id: t.id, name: t.note || "Transfer\xEAncia", amount: toCents(t.amount), date: t.transferred_on, kind: "transfer", from, to, source: "transfer", category: "Transfer\xEAncia" });
  }
  for (const a of s.accounts) {
    const moves = s.entries.filter((e) => e.from === a.id || e.to === a.id);
    a.opened = [a.opened, ...moves.map((e) => e.date)].sort()[0];
    a.opening -= sum(moves, (e) => movement(e, a.id));
  }
  const account2 = (id) => lookup(s.accounts, id)?.id || (!id ? main?.id : null);
  for (const i of rows("installments").filter((i2) => !i2.card_id && i2.payment_method !== "credit_card")) {
    const n = i.installments_total, paid = i.installments_paid;
    if (!Number.isInteger(n) || n < 1 || n > 600 || paid < 0 || paid > n || !i.next_due && paid < n) {
      review("Parcelamento com cronograma incompleto.");
      continue;
    }
    const total = toCents(i.total_amount), regular = toCents(i.installment_amount);
    const final = total - regular * (n - 1);
    if (final <= 0 || Math.abs(final - regular) > n) {
      review("Total e valor das parcelas divergem na origem.");
      continue;
    }
    s.plans.push({ id: i.id, name: i.name, total, count: n, priorPaid: paid, institution: "Cadastro anterior", method: i.payment_method || "Outro", category: i.category || "Outros", source: "system" });
    for (let part = paid + 1; part <= n; part++) s.dues.push({ id: i.id + "/" + part, plan: i.id, part, count: n, name: i.name, date: shift(i.next_due, part - paid - 1), amount: part === n ? final : regular, account: main?.id, group: "installment", created: now, paid: null, source: "system" });
  }
  for (const c of rows("credit_cards")) s.cards.push({ id: c.id, name: c.name, institution: c.name, brand: c.brand || "Cart\xE3o", last4: c.last4 || "\u2022\u2022\u2022\u2022", closing: c.closing_day, due: c.due_day, limit: toCents(c.limit_amount), account: main?.id, source: "system" });
  for (const p of rows("card_purchases")) {
    const c = lookup(s.cards, p.card_id);
    if (!c) {
      review("Compra sem cart\xE3o correspondente.");
      continue;
    }
    const amount = toCents(p.amount), month = String(p.invoice_month).slice(0, 7);
    let due = dayAt(month, c.due);
    if (c.due <= c.closing) due = shift(due, 1, c.due);
    s.purchases.push({ id: p.id, name: p.description, date: p.purchased_on, amount, card: c.id, count: 1, category: p.category || "Outros", source: "card" });
    s.dues.push({ id: p.id + "/1", purchase: p.id, part: p.current_installment, count: p.installments_total, name: p.description, date: due, created: p.purchased_on, amount, account: main?.id, group: "invoice", card: c.id, legacyMonth: month, paid: null, source: "card" });
  }
  for (const p of rows("invoice_payments").slice().sort((a, b) => a.paid_on.localeCompare(b.paid_on))) {
    const c = lookup(s.cards, p.card_id), m = String(p.invoice_month).slice(0, 7);
    let left = toCents(p.amount);
    const matches = s.entries.filter((e) => e.from === p.account_id && e.kind === "expense" && e.source === "manual" && e.amount === left && e.date === p.paid_on && e.name === "Pagamento fatura " + c?.name);
    if (matches.length !== 1) {
      review("Pagamento de fatura sem um \xFAnico d\xE9bito banc\xE1rio correspondente.");
      continue;
    }
    matches[0].source = "card";
    for (const d of s.dues.filter((d2) => d2.card === p.card_id && d2.legacyMonth === m && !d2.paid)) {
      if (!left) break;
      const used = Math.min(left, d.amount);
      if (used < d.amount) s.dues.push({ ...d, id: d.id + "/" + p.id, amount: d.amount - used });
      d.amount = used;
      d.paid = p.paid_on;
      d.payment = matches[0].id;
      left -= used;
    }
    if (left) review("H\xE1 pagamento maior que as compras identificadas na fatura.");
  }
  for (const c of rows("credit_cards")) {
    const used = sum(s.dues.filter((d) => d.card === c.id && !d.paid));
    if (used !== toCents(c.used_amount)) review("O limite utilizado do cart\xE3o diverge das compras e pagamentos registrados.");
  }
  for (const table of ["subscriptions", "recurring_transactions"]) for (const r of rows(table).filter((r2) => r2.active)) {
    const subscription = table === "subscriptions", day = subscription ? r.renewal_day : r.due_day;
    const start = dayAt(now.slice(0, 7), day), group = subscription ? "subscription" : "recurring";
    const accounted = rows("bills").some((b) => b.source_type === group && b.source_id === r.id && String(b.source_period).startsWith(now.slice(0, 7))) || rows("transactions").some((t) => t.source_type === group && t.source_id === r.id && String(t.source_period).startsWith(now.slice(0, 7)));
    s.rules.push({ id: r.id, name: r.name || r.description, amount: toCents(r.amount), account: account2(r.account_id), kind: r.kind || "expense", start: accounted || start < now ? shift(start, 1, day) : start, anchor: day, end: null, source: "automation" });
  }
  for (const b of rows("bills").filter((b2) => !["paid", "cancelled", "canceled"].includes(b2.status))) {
    s.dues.push({ id: b.id, name: b.name, amount: toCents(b.amount), account: account2(b.account_id), group: b.source_type === "subscription" ? "subscription" : "bill", created: now, date: b.due_on, paid: null, source: "system" });
  }
  for (const f of rows("future_transactions").filter((f2) => f2.status === "planned")) s.dues.push({ id: f.id, name: f.description, amount: toCents(f.amount), account: account2(f.account_id), group: f.kind === "income" ? "income" : "bill", created: now, date: f.planned_on, paid: null, source: "system" });
  for (const w of rows("benefit_wallets")) {
    const wallet = walletNames[w.kind];
    if (!wallet) {
      review("Tipo de vale sem equival\xEAncia.");
      continue;
    }
    for (const t of rows("benefit_transactions").filter((t2) => t2.wallet_id === w.id)) s.benefits.push({ id: t.id, wallet, direction: t.kind === "income" ? "credit" : "debit", name: t.description || "Vale", date: t.occurred_on, amount: toCents(t.amount), source: "system" });
    const adjustment = toCents(w.balance) - benefitBalance(s, wallet);
    if (adjustment) {
      review("O saldo de vale diverge de seu hist\xF3rico.");
    }
  }
  if (s.dues.some((x) => !x.account) || s.rules.some((x) => !x.account)) review("H\xE1 compromisso sem conta operacional definida.");
  return { state: s, issues, counts };
}

// v2/domain/commands.js
var wallets = ["Alimenta\xE7\xE3o", "Refei\xE7\xE3o", "Combust\xEDvel"];
var accountTypes = ["Corrente", "Digital", "Carteira", "Poupan\xE7a", "Sal\xE1rio"];
var posted = (v, now) => {
  const d = dateKey(v);
  assert(d <= now, "Use o planejamento para datas futuras.");
  return d;
};
function account(s, id, date) {
  const a = one(s.accounts, id);
  assert(a.opened <= date, "Data anterior \xE0 abertura da conta.");
  return a.id;
}
function record(s, { id, date, name, amount, kind, from = null, to = null, source = "manual", category = "Outros" }) {
  s.entries.push({ id, date, name, amount, kind, from, to, source, category });
}
function settle(s, d, id, source, date) {
  assert(!d.paid, "Este compromisso j\xE1 foi liquidado.");
  d.paid = date;
  d.payment = id;
  d.source = source;
}
function applyCommand(original, cmd, now) {
  dateKey(now);
  const { id, op, p = {} } = cmd;
  assert(typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id), "Identificador inv\xE1lido.");
  const s = structuredClone(original);
  const name = () => label(p.name), value = () => cents(p.amount), date = () => posted(p.date, now);
  const category = () => label(p.category || "Outros");
  switch (op) {
    case "account": {
      const opened = date();
      s.accounts.push({ id, name: name(), institution: label(p.institution || p.name), type: choose(p.type, accountTypes), opening: cents(p.amount, -999999999999), opened, primary: !s.accounts.length, source: "manual" });
      break;
    }
    case "primary":
      one(s.accounts, p.account);
      for (const a of s.accounts) a.primary = a.id === p.account;
      break;
    case "entry": {
      const kind = choose(p.kind, ["income", "expense"]), d = date(), a = account(s, p.account, d);
      record(s, { id, date: d, name: name(), amount: value(), kind, from: kind === "expense" ? a : null, to: kind === "income" ? a : null, category: category() });
      break;
    }
    case "transfer": {
      const d = date(), from = account(s, p.from, d), to = account(s, p.to, d);
      assert(from !== to, "Selecione duas contas diferentes.");
      record(s, { id, date: d, name: p.name ? name() : "Transfer\xEAncia", amount: value(), kind: "transfer", from, to, source: "transfer" });
      break;
    }
    case "position": {
      const amount = cents(p.amount, 0), d = date();
      s.positions.push({ id, name: name(), kind: choose(p.kind, ["CDB", "Tesouro", "Fundo", "A\xE7\xF5es", "ETF", "Caixinha", "Outro", "asset"]), institution: label(p.institution || p.name), history: [{ date: d, amount }], source: "manual" });
      break;
    }
    case "valuation": {
      const position = one(s.positions, p.position), d = date(), amount = cents(p.amount, 0);
      assert(d >= position.history[0].date, "Data anterior \xE0 primeira posi\xE7\xE3o.");
      position.history.push({ date: d, amount });
      break;
    }
    case "invest":
    case "redeem": {
      const position = one(s.positions, p.position), d = date(), amount = value(), a = account(s, p.account, d);
      assert(position.kind !== "asset", "Selecione um investimento.");
      const latest = [...position.history].sort((a2, b) => a2.date.localeCompare(b.date)).at(-1);
      assert(d >= latest.date, "Movimente a partir da \xFAltima posi\xE7\xE3o.");
      const deposit = op === "invest";
      const updated = latest.amount + (deposit ? amount : -amount);
      cents(updated, 0);
      position.history.push({ date: d, amount: updated });
      record(s, { id, date: d, name: (deposit ? "Aporte em " : "Resgate de ") + position.name, amount, kind: op, from: deposit ? a : null, to: deposit ? null : a, source: "transfer", category: "Investimento" });
      break;
    }
    case "benefit":
    case "benefitEdit":
    case "benefitDelete": {
      const old = op === "benefit" ? null : one(s.benefits, p.benefit);
      if (old) s.benefits = s.benefits.filter((x) => x.id !== old.id);
      if (op !== "benefitDelete") s.benefits.push({ id: old?.id || id, name: name(), wallet: choose(p.wallet, wallets), direction: choose(p.direction, ["credit", "debit"]), date: date(), amount: value(), source: "manual" });
      for (const w of new Set([p.wallet, old?.wallet].filter(Boolean))) {
        const days = [...new Set(s.benefits.filter((x) => x.wallet === w).map((x) => x.date))];
        assert(days.every((d) => benefitBalance(s, w, d) >= 0), "Saldo insuficiente no hist\xF3rico do vale.");
      }
      break;
    }
    case "plan":
    case "bill": {
      const d = dateKey(p.date), a = account(s, p.account, now), n = op === "plan" ? integer(p.count, 1, 600, "Quantidade inv\xE1lida.") : 1;
      const amounts = split(value(), n), title = name();
      const group = op === "plan" ? "installment" : "bill";
      s.plans.push({ id, name: title, total: p.amount, count: n, institution: label(p.institution || "N\xE3o informada"), method: label(p.method || "D\xE9bito em conta"), category: category(), source: "manual" });
      amounts.forEach((amount, i) => s.dues.push({ id: id + "/" + (i + 1), plan: id, part: i + 1, count: n, name: title, date: shift(d, i), amount, account: a, group, created: now, paid: null, source: "manual" }));
      break;
    }
    case "recurring": {
      const start = dateKey(p.date), end = p.end ? dateKey(p.end) : null;
      assert(!end || end >= start, "Fim anterior ao in\xEDcio.");
      s.rules.push({ id, name: name(), amount: value(), account: account(s, p.account, now), kind: choose(p.kind, ["income", "expense"]), start, end, source: "automation" });
      break;
    }
    case "pay": {
      let d = s.dues.find((x) => x.id === p.due);
      const paid = date();
      if (!d) {
        d = upcoming(s, dateKey(p.occurrence), now, p.assigned).find((x) => x.id === p.due && x.rule);
        assert(d, "Compromisso n\xE3o encontrado.");
        d = { ...d, created: now, paid: null };
        s.dues.push(d);
      }
      assert(!d.card && paid >= d.created, "Data ou tipo de pagamento inv\xE1lido.");
      if (d.plan) assert(!s.dues.some((x) => x.plan === d.plan && x.part < d.part && !x.paid), "Pague a parcela anterior primeiro.");
      const a = account(s, p.account, paid), income = d.group === "income";
      settle(s, d, id, d.group === "installment" ? "installment" : d.rule ? "automation" : "manual", paid);
      record(s, { id, name: d.name, date: paid, amount: d.amount, kind: income ? "income" : "expense", to: income ? a : null, from: income ? null : a, source: d.source, category: d.group });
      break;
    }
    case "card": {
      assert(/^\d{4}$/.test(p.last4), "Informe os quatro \xFAltimos d\xEDgitos.");
      s.cards.push({ id, name: name(), institution: label(p.institution || p.name), brand: label(p.brand), last4: p.last4, closing: integer(p.closing, 1, 31, "Fechamento inv\xE1lido."), due: integer(p.due, 1, 31, "Vencimento inv\xE1lido."), limit: value(), account: account(s, p.account, now), source: "manual" });
      break;
    }
    case "purchase": {
      const card = one(s.cards, p.card), d = date(), parts = split(value(), p.count), title = name();
      assert(cardStats(s, card.id).available >= p.amount, "Limite dispon\xEDvel insuficiente.");
      let close = dayAt(d.slice(0, 7), card.closing);
      if (d > close) close = shift(close, 1, card.closing);
      let first = dayAt(close.slice(0, 7), card.due);
      if (first <= close) first = shift(first, 1, card.due);
      s.purchases.push({ id, name: title, date: d, amount: p.amount, card: card.id, count: parts.length, category: category(), source: "card" });
      parts.forEach((amount, i) => s.dues.push({ id: id + "/" + (i + 1), purchase: id, part: i + 1, count: parts.length, name: title, amount, date: shift(first, i, card.due), created: d, account: card.account, group: "invoice", card: card.id, paid: null, source: "card" }));
      break;
    }
    case "invoice": {
      const card = one(s.cards, p.card), due = dateKey(p.due), d = date(), a = account(s, p.account, d);
      const rows = s.dues.filter((x) => x.card === card.id && x.date === due && !x.paid && x.created <= d);
      const amount = value(), outstanding = sum(rows);
      assert(rows.length && outstanding === (p.expected ?? amount) && amount <= outstanding, "Fatura alterada ou j\xE1 paga. Atualize a tela.");
      let remaining = amount;
      for (const row of rows.sort((a2, b) => a2.id.localeCompare(b.id))) {
        if (!remaining) break;
        const paid = Math.min(remaining, row.amount);
        if (paid < row.amount) {
          s.dues.push({ ...row, id: row.id + "/" + id, amount: row.amount - paid });
          row.amount = paid;
        }
        settle(s, row, id, "card", d);
        remaining -= paid;
      }
      record(s, { id, name: "Fatura " + card.name, date: d, amount: p.amount, kind: "expense", from: a, source: "card", category: "Fatura" });
      break;
    }
    default:
      throw new Error("Opera\xE7\xE3o desconhecida.");
  }
  return s;
}

// v2/open-finance/provider.js
var scopes = ["accounts", "transactions", "cards", "invoices", "loans", "investments"];
var OpenFinanceProvider = class {
  unavailable() {
    throw new Error("Recurso indispon\xEDvel neste provedor.");
  }
  createConsent() {
    return this.unavailable();
  }
  getConsent() {
    return this.unavailable();
  }
  revokeConsent() {
    return this.unavailable();
  }
  getInstitutions() {
    return this.unavailable();
  }
  getAccounts() {
    return this.unavailable();
  }
  getBalances() {
    return this.unavailable();
  }
  getTransactions() {
    return this.unavailable();
  }
  getCreditCards() {
    return this.unavailable();
  }
  getCreditCardBills() {
    return this.unavailable();
  }
  getLoans() {
    return this.unavailable();
  }
  getInvestments() {
    return this.unavailable();
  }
  syncConnection() {
    return this.unavailable();
  }
};
var SandboxProvider = class extends OpenFinanceProvider {
  id = "sandbox";
  institution = "Banco Horizonte \xB7 simulado";
  getInstitutions() {
    return [{ id: "horizonte", name: this.institution }];
  }
  createConsent(c) {
    return { id: c.id, status: "pending", scopes: c.scopes, expires: c.expires };
  }
  getConsent(c) {
    return { id: c.id, status: c.status, scopes: c.scopes, expires: c.expires };
  }
  revokeConsent(c) {
    return { ...this.getConsent(c), status: "revoked" };
  }
  getAccounts() {
    return [{ type: "account", id: "horizonte-cc", name: "Conta Horizonte", currency: "BRL" }];
  }
  getBalances(c) {
    return [{ type: "balance", id: "saldo-cc", account: "horizonte-cc", date: c.created, amount: 185e3 }];
  }
  getTransactions(c) {
    return [{ type: "transaction", id: "hx-pix-001", account: "horizonte-cc", direction: "expense", amount: 36100, name: "SUPERMERCADO HORIZONTE", date: c.created }];
  }
  getCreditCards() {
    return [{ type: "card", id: "hx-card", name: "Horizonte final 4012", limit: 25e4 }];
  }
  getCreditCardBills(c) {
    return [{ type: "invoice", id: "hx-bill", card: "hx-card", amount: 18990, date: addDays(c.created, 7) }];
  }
  getLoans() {
    return [{ type: "loan", id: "hx-loan", name: "Cr\xE9dito pessoal", outstanding: 125e3 }];
  }
  getInvestments() {
    return [{ type: "investment", id: "hx-cdb", name: "CDB Horizonte", value: 5e5 }];
  }
  async syncConnection(c, cursor) {
    const catalog = { accounts: ["getAccounts", "getBalances"], transactions: ["getTransactions"], cards: ["getCreditCards"], invoices: ["getCreditCardBills"], loans: ["getLoans"], investments: ["getInvestments"] };
    const rows = [];
    if (cursor !== "snapshot-1") for (const scope of c.scopes) for (const method of catalog[scope]) rows.push(...await this[method](c));
    return { rows, next: "snapshot-1", hasMore: false };
  }
};
function validTransaction(item) {
  assert(item.type === "transaction" && ["income", "expense"].includes(item.direction), "Transa\xE7\xE3o externa inv\xE1lida.");
  return { type: "transaction", id: label(item.id), account: label(item.account), date: dateKey(item.date), name: label(item.name), amount: cents(item.amount), direction: item.direction };
}

// v2/open-finance/reconciliation.js
function active(c, now) {
  return c.status === "active" && c.expires >= now;
}
function candidates(s, t) {
  const taken = new Set(s.imports.filter((i) => i.local === t.local && i.direction === t.direction && (i.status === "matched" || i.status === "posted")).map((i) => i.entry));
  return s.entries.filter((e) => !taken.has(e.id) && e.amount === t.amount && e.date >= addDays(t.date, -3) && e.date <= addDays(t.date, 3) && (t.direction === "expense" ? e.from === t.local : e.to === t.local));
}
var scopeFor = { account: "accounts", balance: "accounts", transaction: "transactions", card: "cards", invoice: "invoices", investment: "investments", loan: "loans" };
function applyBankCommand(original, cmd, now, internal = false) {
  const s = structuredClone(original), { op, p, id } = cmd;
  const log = (event, connection) => {
    s.logs.push({ event, connection, date: now });
  };
  if (op === "consent") {
    one(s.accounts, p.account);
    const permissions = [...new Set(p.scopes)];
    assert(permissions.length && permissions.every((x) => scopes.includes(x)), "Escolha os dados autorizados.");
    const expires = dateKey(p.expires);
    assert(expires > now, "A validade deve ser futura.");
    s.connections.push({ id, provider: "sandbox", institution: "Banco Horizonte \xB7 simulado", account: p.account, status: "pending", created: now, expires, scopes: permissions, cursor: null, lastSync: null });
    log("consent_created", id);
    return s;
  }
  if (op === "reconcile") {
    const t = one(s.imports, p.import);
    assert(t.status === "review", "Item j\xE1 conciliado.");
    if (p.action === "match") {
      assert(candidates(s, t).some((x) => x.id === p.entry), "A correspond\xEAncia mudou.");
      t.status = "matched";
      t.entry = p.entry;
    } else if (p.action === "transfer") {
      const a = one(s.accounts, t.local), other = one(s.accounts, p.other);
      assert(a.id !== other.id && t.date >= a.opened && t.date >= other.opened && t.date <= now, "Contas ou data inv\xE1lidas.");
      s.entries.push({ id, name: t.name, kind: "transfer", amount: t.amount, date: t.date, from: t.direction === "expense" ? a.id : other.id, to: t.direction === "income" ? a.id : other.id, category: "Transfer\xEAncia", source: "open_finance" });
      t.status = "posted";
      t.entry = id;
    } else if (p.action === "post") {
      const a = one(s.accounts, t.local);
      assert(t.date >= a.opened && t.date <= now, "Data fora do per\xEDodo da conta.");
      s.entries.push({ id, name: t.name, kind: t.direction, amount: t.amount, date: t.date, from: t.direction === "expense" ? t.local : null, to: t.direction === "income" ? t.local : null, category: "Importado", source: "open_finance" });
      t.status = "posted";
      t.entry = id;
    } else {
      choose(p.action, ["ignore"]);
      t.status = "ignored";
    }
    log("data_reconciled", t.connection);
    return s;
  }
  const c = one(s.connections, p.connection);
  if (op === "authorize") {
    assert(c.provider === "sandbox" && c.status === "pending" && c.expires >= now, "Consentimento indispon\xEDvel.");
    c.status = "active";
    log("connection_created", c.id);
  } else if (op === "revoke") {
    c.status = "revoked";
    log("consent_revoked", c.id);
  } else if (op === "bankPage") {
    assert(internal && active(c, now), "Sincroniza\xE7\xE3o n\xE3o autorizada.");
    assert(c.cursor === (p.previous ?? null), "Cursor desatualizado.");
    log("sync_started", c.id);
    for (const raw of p.rows) {
      assert(c.scopes.includes(scopeFor[raw.type]), "Recurso fora do consentimento.");
      const key2 = JSON.stringify([c.provider, c.institution, raw.type, raw.account || "", label(raw.id)]);
      if (raw.type !== "transaction") {
        const existing = s.resources.find((r) => r.key === key2);
        const row = { ...raw, key: key2, connection: c.id, provider: c.provider, source: "open_finance" };
        if (existing) Object.assign(existing, row);
        else s.resources.push(row);
        continue;
      }
      const t = validTransaction(raw);
      if (s.imports.some((x) => x.key === key2)) continue;
      const fingerprint = JSON.stringify([c.provider, t.account, t.date, t.amount, t.direction, t.name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()]);
      s.imports.push({ ...t, id: key2, key: key2, external_id: t.id, provider: c.provider, connection: c.id, source: "open_finance", local: c.account, status: "review", fingerprint });
    }
    c.cursor = p.next;
    c.lastSync = now;
    log("sync_completed", c.id);
  } else throw new Error("Opera\xE7\xE3o banc\xE1ria desconhecida.");
  return s;
}

// v2/domain/book.js
var isBank = (op) => ["consent", "authorize", "revoke", "bankPage", "reconcile"].includes(op);
function execute(s, cmd, date, internal = false) {
  assert(typeof cmd.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(cmd.id), "Identificador inv\xE1lido.");
  const next = isBank(cmd.op) ? applyBankCommand(s, cmd, date, internal) : applyCommand(s, cmd, date);
  for (let i = s.logs.length; i < next.logs.length; i++) next.logs[i].id = cmd.id + "-" + i;
  return next;
}
function key(collection, row) {
  return collection === "resources" ? row.key : row.id;
}
function diff(before, after) {
  const changes = [];
  for (const collection of Object.keys(after).filter((k) => Array.isArray(after[k]))) {
    const previous = new Map(before[collection].map((row) => [key(collection, row), JSON.stringify(row)]));
    for (const data of after[collection]) {
      const id = key(collection, data);
      if (previous.get(id) !== JSON.stringify(data)) changes.push({ collection, key: id, data });
      previous.delete(id);
    }
    for (const id of previous.keys()) changes.push({ collection, key: id, data: null });
  }
  return changes;
}

// server/providers.js
var providers = /* @__PURE__ */ new Map([["sandbox", new SandboxProvider()]]);
function providerFor(id) {
  const p = providers.get(id);
  if (!p) throw new Error("Provedor indispon\xEDvel.");
  return p;
}
async function fetchConsentedPage(connection) {
  const p = providerFor(connection.provider), remote = await p.getConsent(connection);
  if (remote.status !== "active") throw new Error("inactive_consent");
  return p.syncConnection({ ...connection, scopes: connection.scopes.filter((s) => remote.scopes.includes(s)) }, connection.cursor);
}

// server/service.js
var uuid = (v) => assert(typeof v === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v), "Identificador inv\xE1lido.");
var financialDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Campo_Grande", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
async function runJob(rpc2, wanted = null) {
  const lease = crypto.randomUUID(), job = (await rpc2("enc_claim", { lease_id: lease, wanted }))[0];
  if (!job) return;
  const date = financialDay();
  try {
    const { revision, records } = await rpc2("enc_snapshot", { who: job.owner_id });
    const s = { ...blank(), ...records }, c = one(s.connections, job.connection_id);
    assert(active(c, date), "inactive_consent");
    const page = await fetchConsentedPage(c);
    const id = crypto.randomUUID(), params = { previous: c.cursor, connection: c.id, rows: page.rows, next: page.next };
    const next = execute(s, { id, op: "bankPage", p: params }, date, true);
    await rpc2("enc_commit", { who: job.owner_id, request_id: id, digest: "sync:" + job.id, expected: revision, changes: diff(s, next), job_id: job.id, job_lease: lease, has_more: page.hasMore });
  } catch (e) {
    await rpc2("enc_fail", { job_id: job.id, job_lease: lease, code: e.message === "inactive_consent" ? "inactive_consent" : "sync_failed" });
    throw e;
  }
}
async function hash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
}
async function legacy(rpc2, who) {
  const raw = await rpc2("enc_legacy_snapshot", { who });
  const converted = convertLegacy(raw, financialDay());
  return { ...converted, stamp: await hash(raw) };
}
async function operate({ who, rpc: rpc2, body }) {
  if (body.action === "erase") {
    assert(body.confirmation === "EXCLUIR", "Confirma\xE7\xE3o obrigat\xF3ria.");
    await rpc2("enc_erase", { who });
    return operate({ who, rpc: rpc2, body: { action: "read" } });
  }
  if (body.action === "read") {
    const { records: records2, revision: revision2 } = await rpc2("enc_snapshot", { who });
    return { state: { ...blank(), ...records2 }, revision: revision2 };
  }
  if (body.action === "legacyReview") {
    const { issues, counts, stamp } = await legacy(rpc2, who);
    return { issues, counts, stamp };
  }
  if (body.action === "legacyExport") return { legacy: await rpc2("enc_legacy_snapshot", { who }) };
  const { id, op, p } = body;
  uuid(id);
  if (op === "sync") {
    const job = await rpc2("enc_enqueue", { who, connection: p.connection, request_id: id });
    await runJob(rpc2, job);
    return operate({ who, rpc: rpc2, body: { action: "read" } });
  }
  assert(op !== "bankPage", "Opera\xE7\xE3o reservada.");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([op, p])))), (n) => n.toString(16).padStart(2, "0")).join("");
  const { records, revision, receipt } = await rpc2("enc_snapshot", { who, request_id: id });
  const state = { ...blank(), ...records };
  if (receipt) {
    assert(receipt === digest, "request_id_conflict");
    return { state, revision };
  }
  assert(body.revision === revision, "stale_revision");
  let next;
  if (op === "legacyImport") {
    assert(!Object.values(records).some((v) => v.length), "O livro 2.0 precisa estar vazio para importar.");
    const info = await legacy(rpc2, who);
    assert(info.stamp === p.stamp && !info.issues.length, "Origem alterada ou diverg\xEAncias na confer\xEAncia.");
    assert(info.state.accounts.length, "Nenhuma conta operacional na origem.");
    next = info.state;
  } else {
    next = execute(state, { id, op, p }, financialDay());
    if (op === "consent") {
      const c = one(next.connections, id), provider = providerFor(c.provider);
      const consent = await provider.createConsent(c);
      c.externalConsent = consent.id;
    }
    if (op === "revoke") {
      const c = one(next.connections, p.connection);
      await providerFor(c.provider).revokeConsent(c);
    }
  }
  await rpc2("enc_commit", { who, request_id: id, digest, expected: revision, changes: diff(state, next) });
  return operate({ who, rpc: rpc2, body: { action: "read" } });
}

// server/edge.js
var allowed = new Set((Deno.env.get("ENC_ALLOWED_ORIGINS") || "").split(",").filter(Boolean));
var base = Deno.env.get("SUPABASE_URL");
var service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
async function rpc(name, params) {
  const res = await fetch(base + "/rest/v1/rpc/" + name, { method: "POST", headers: { apikey: service, Authorization: "Bearer " + service, "Content-Type": "application/json" }, body: JSON.stringify(params) });
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    throw new Error(["stale_revision", "request_id_conflict", "inactive_consent", "lost_lease"].includes(info.message) ? info.message : "Falha no banco de dados.");
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin"), headers = { "Cache-Control": "no-store", "Content-Type": "application/json", "Vary": "Origin" };
  const respond = (value, status) => new Response(JSON.stringify(value), { headers, status });
  if (origin && !allowed.has(origin) && !/^https:\/\/[a-z0-9-]+\.esteja-no-controle-prisma\.pages\.dev$/.test(origin)) return respond({ error: "Origem n\xE3o permitida." }, 403);
  if (origin) Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return respond({ error: "M\xE9todo inv\xE1lido." }, 405);
  try {
    const bearer = req.headers.get("Authorization") || "";
    const token = Deno.env.get("ENC_JOB_TOKEN");
    if (!origin && token && bearer === "Bearer " + token) {
      await runJob(rpc);
      return respond({ ok: true }, 200);
    }
    if (!origin && /^Bearer encw_[0-9a-f]{64}$/.test(bearer)) {
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bearer.slice(7)));
      const fingerprint = Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
      if (!await rpc("enc_worker_valid", { fingerprint })) return respond({ error: "Acesso negado." }, 401);
      await runJob(rpc);
      return respond({ ok: true }, 200);
    }
    if (!bearer.startsWith("Bearer ")) return respond({ error: "Entre novamente." }, 401);
    const auth = await fetch(base + "/auth/v1/user", { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY"), Authorization: bearer } });
    if (!auth.ok) return respond({ error: "Entre novamente." }, 401);
    const { id: who } = await auth.json();
    const reader = req.body?.getReader(), chunks = [];
    let size = 0;
    if (!reader) return respond({ error: "Pedido inv\xE1lido." }, 400);
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32768) {
        await reader.cancel();
        return respond({ error: "Pedido muito grande." }, 413);
      }
      chunks.push(value);
    }
    const body = JSON.parse(await new Blob(chunks).text());
    const result = await operate({ who, rpc, body });
    return respond(result, 200);
  } catch (e) {
    const msg = String(e.message);
    const conflict = ["stale_revision", "request_id_conflict", "lost_lease"].includes(msg);
    const internal = msg === "Falha no banco de dados." || e instanceof TypeError;
    console.warn("finance_v2_error", { code: conflict ? "conflict" : internal ? "backend_error" : "invalid_request" });
    return respond({ error: internal ? "Servi\xE7o indispon\xEDvel. Tente novamente." : msg.slice(0, 160) }, conflict ? 409 : internal ? 503 : 400);
  }
});
