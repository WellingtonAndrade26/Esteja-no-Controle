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
        .select("description,amount,kind,notes,is_installment,source_type,source_id")
        .gte("occurred_on", start)
        .lt("occurred_on", end),
      client.from("installments")
        .select("id,installment_amount,installments_paid,installments_total"),
      client.from("accounts").select("balance")
    ]);

    const firstError = [txRes, instRes, accRes].find(r => r?.error)?.error;
    if (firstError) throw firstError;

    const txs = txRes.data || [];
    const cashIncome = txs
      .filter(row => row.kind === "income" && !isBenefitIncome(row))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const cashExpense = txs
      .filter(row => row.kind === "expense")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    // Pagamentos feitos pelo botão do Planejamento têm source_id da parcela.
    // Dessa forma cada parcelamento é retirado do compromisso mensal individualmente,
    // sem abater o pagamento de uma parcela do valor de outra.
    const paidInstallmentIds = new Set(
      txs
        .filter(row => row.kind === "expense" && row.source_type === "installment_payment" && row.source_id)
        .map(row => String(row.source_id))
    );

    const legacyInstallmentExpenseAlreadyRecorded = txs
      .filter(row => row.kind === "expense" && !row.source_id && (row.is_installment || row.source_type === "installment"))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const installmentCommitment = (instRes.data || [])
      .filter(row => Number(row.installments_paid || 0) < Number(row.installments_total || 0))
      .filter(row => !paidInstallmentIds.has(String(row.id)))
      .reduce((sum, row) => sum + Number(row.installment_amount || 0), 0);

    const installmentsRemaining = Math.max(0, installmentCommitment - legacyInstallmentExpenseAlreadyRecorded);
    const currentBalance = (accRes.data || []).reduce((sum, row) => sum + Number(row.balance || 0), 0);

    // O saldo atual já recebeu entradas e já perdeu gastos realizados.
    // Reconstruímos o saldo do início do mês para apresentar o resultado completo.
    const openingBalance = currentBalance - cashIncome + cashExpense;
    const monthResult = openingBalance + cashIncome - cashExpense - installmentsRemaining;

    return {
      cashIncome,
      cashExpense,
      installmentsRemaining,
      currentBalance,
      openingBalance,
      monthResult
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

      setMetricByLabel(
        page,
        /saldo dispon[ií]vel|resultado do m[eê]s/i,
        "Resultado do mês",
        data.monthResult,
        `${money(data.openingBalance)} saldo inicial + ${money(data.cashIncome)} entradas − ${money(data.cashExpense)} gastos − ${money(data.installmentsRemaining)} parcelas`,
        resultClass
      );

      setMetricByLabel(
        page,
        /^entradas(?: em dinheiro)?$/i,
        "Entradas em dinheiro",
        data.cashIncome,
        "Somente dinheiro livre para contas e gastos",
        "income"
      );

      setMetricByLabel(
        page,
        /sa[ií]das\s*\+\s*parcelas|gastos\s*\+\s*parcelas/i,
        "Gastos + parcelas",
        data.cashExpense + data.installmentsRemaining,
        `${money(data.cashExpense)} gastos já realizados + ${money(data.installmentsRemaining)} parcelas ainda a pagar`,
        "expense"
      );

      setMetricByLabel(
        page,
        /saldo projetado|dinheiro nas contas|saldo atual nas contas|saldo atual da conta/i,
        "Saldo atual da conta",
        data.currentBalance,
        `${money(data.openingBalance)} início + ${money(data.cashIncome)} entradas − ${money(data.cashExpense)} gastos`,
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
