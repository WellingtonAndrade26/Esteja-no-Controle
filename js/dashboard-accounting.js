(() => {
  "use strict";

  const REFRESH_MS = 12000;
  let running = false;
  let lastRun = 0;

  const money = value => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));

  function monthRange() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const next = new Date(y, m + 1, 1);
    const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    return { start, end };
  }

  function isBenefitIncome(row) {
    if (row?.kind !== "income") return false;
    const text = `${row?.description || ""} ${row?.notes || ""}`
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return /(^|\b)(vale|vr|va|refeicao|alimentacao)(\b|$)/i.test(text);
  }

  function cleanupDashboard(page) {
    page.querySelector("#encAccountingBreakdown")?.remove();
    document.getElementById("enc-dashboard-accounting-style")?.remove();
  }

  function setMetricByLabel(page, matcher, labelText, value, detail, className = "") {
    const cards = [...page.querySelectorAll(".summary-grid .metric-card")];
    const card = cards.find(item => matcher.test(item.querySelector(".metric-label")?.textContent || ""));
    if (!card) return;
    const label = card.querySelector(".metric-label");
    const strong = card.querySelector("strong");
    const delta = card.querySelector(".delta");
    if (label) label.textContent = labelText;
    if (strong) {
      strong.textContent = money(value);
      strong.classList.remove("income", "expense", "warn");
      if (className) strong.classList.add(className);
    }
    if (delta) {
      delta.textContent = detail || "";
      delta.classList.remove("income", "expense", "warn");
      if (className) delta.classList.add(className);
    } else if (detail) {
      const d = document.createElement("div");
      d.className = `delta ${className}`.trim();
      d.textContent = detail;
      card.appendChild(d);
    }
  }

  function removeDuplicateResultCard(page) {
    const card = [...page.querySelectorAll(".premium-mini-card")]
      .find(item => /resultado do m[eê]s/i.test(item.querySelector("small")?.textContent || ""));
    if (card) card.remove();
  }

  async function readData() {
    const client = window.ENCCloud?.client;
    if (!client) return null;
    const { data: authData } = await client.auth.getUser();
    if (!authData?.user) return null;

    const { start, end } = monthRange();
    const [txRes, instRes, accRes] = await Promise.all([
      client.from("transactions")
        .select("account_id,description,amount,kind,notes,is_installment,source_type,source_id")
        .gte("occurred_on", start)
        .lt("occurred_on", end),
      client.from("installments")
        .select("id,installment_amount,installments_paid,installments_total"),
      client.from("accounts")
        .select("id,name,institution,type,balance,is_primary,created_at")
        .order("created_at", { ascending: true })
    ]);

    const firstError = [txRes, instRes, accRes].find(r => r?.error)?.error;
    if (firstError) throw firstError;

    const accounts = accRes.data || [];
    const primaryAccount =
      accounts.find(row => row.is_primary && row.type !== "investment") ||
      accounts.find(row => row.is_primary) ||
      accounts.find(row => row.type !== "investment") ||
      accounts[0] || null;

    if (!primaryAccount) return null;

    const allTxs = txRes.data || [];
    const primaryTxs = allTxs.filter(row => String(row.account_id || "") === String(primaryAccount.id));

    const cashIncome = primaryTxs
      .filter(row => row.kind === "income" && !isBenefitIncome(row))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const cashExpense = primaryTxs
      .filter(row => row.kind === "expense")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    // Um pagamento feito por qualquer conta já quita a parcela daquele mês.
    // Porém só movimentações da Conta principal entram nos cards de resultado mensal.
    const paidInstallmentIds = new Set(
      allTxs
        .filter(row => row.kind === "expense" && row.source_type === "installment_payment" && row.source_id)
        .map(row => String(row.source_id))
    );

    const legacyInstallmentExpenseAlreadyRecorded = primaryTxs
      .filter(row => row.kind === "expense" && !row.source_id && (row.is_installment || row.source_type === "installment"))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const installmentCommitment = (instRes.data || [])
      .filter(row => Number(row.installments_paid || 0) < Number(row.installments_total || 0))
      .filter(row => !paidInstallmentIds.has(String(row.id)))
      .reduce((sum, row) => sum + Number(row.installment_amount || 0), 0);

    const installmentsRemaining = Math.max(0, installmentCommitment - legacyInstallmentExpenseAlreadyRecorded);
    const currentBalance = Number(primaryAccount.balance || 0);

    // O resultado mensal pertence somente à Conta principal.
    // Investimentos e contas secundárias ficam fora deste cálculo.
    const openingBalance = currentBalance - cashIncome + cashExpense;
    const monthResult = openingBalance + cashIncome - cashExpense - installmentsRemaining;

    return {
      cashIncome,
      cashExpense,
      installmentsRemaining,
      currentBalance,
      openingBalance,
      monthResult,
      primaryAccountName: primaryAccount.name || "Conta principal",
      primaryInstitution: primaryAccount.institution || ""
    };
  }

  async function sync(force = false) {
    const page = document.getElementById("page-dashboard");
    if (!page?.classList.contains("is-active") || running) return;
    if (!force && Date.now() - lastRun < 1500) return;
    running = true;
    lastRun = Date.now();
    try {
      const data = await readData();
      if (!data || !page.classList.contains("is-active")) return;

      cleanupDashboard(page);
      const resultClass = data.monthResult < 0 ? "expense" : "income";
      const accountLabel = data.primaryInstitution
        ? `${data.primaryAccountName} · ${data.primaryInstitution}`
        : data.primaryAccountName;

      setMetricByLabel(
        page,
        /saldo dispon[ií]vel|resultado do m[eê]s/i,
        "Resultado do mês",
        data.monthResult,
        `${money(data.openingBalance)} saldo inicial + ${money(data.cashIncome)} entradas − ${money(data.cashExpense)} gastos − ${money(data.installmentsRemaining)} parcelas · somente ${accountLabel}`,
        resultClass
      );

      setMetricByLabel(
        page,
        /^entradas(?: em dinheiro)?$/i,
        "Entradas em dinheiro",
        data.cashIncome,
        `Somente movimentações da ${accountLabel}`,
        "income"
      );

      setMetricByLabel(
        page,
        /sa[ií]das\s*\+\s*parcelas|gastos\s*\+\s*parcelas/i,
        "Gastos + parcelas",
        data.cashExpense + data.installmentsRemaining,
        `${money(data.cashExpense)} gastos da Conta principal + ${money(data.installmentsRemaining)} parcelas ainda a pagar`,
        "expense"
      );

      setMetricByLabel(
        page,
        /saldo projetado|dinheiro nas contas|saldo atual nas contas|saldo atual da conta/i,
        "Saldo atual da conta principal",
        data.currentBalance,
        `${accountLabel} · investimentos e contas secundárias não entram neste saldo`,
        data.currentBalance < 0 ? "expense" : ""
      );

      removeDuplicateResultCard(page);
    } catch (error) {
      console.error("Falha ao atualizar resumo financeiro do dashboard", error);
    } finally {
      running = false;
    }
  }

  function schedule() {
    [80, 350, 900, 1800].forEach(delay => setTimeout(() => sync(true), delay));
  }

  function start() {
    schedule();
    document.addEventListener("click", event => {
      if (event.target.closest('[data-page-target="dashboard"], [data-sync-cloud], [data-force-app-update]')) schedule();
    }, true);
    document.addEventListener("submit", event => {
      const id = event.target?.id || "";
      if (["transactionForm", "dashboardBalanceForm", "entityForm", "installmentPaymentForm"].includes(id)) schedule();
    }, true);
    window.addEventListener("focus", schedule);
    setInterval(() => sync(false), REFRESH_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
