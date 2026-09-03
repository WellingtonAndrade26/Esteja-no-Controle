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

  async function readData() {
    const cloud = window.ENCCloud;
    const client = cloud?.client;
    if (!client) return null;
    const { data: authData } = await client.auth.getUser();
    const user = authData?.user;
    if (!user) return null;

    const { start, end } = monthRange();
    const [txRes, instRes, accRes] = await Promise.all([
      client.from("transactions")
        .select("description,amount,kind,notes,is_installment,source_type")
        .gte("occurred_on", start)
        .lt("occurred_on", end),
      client.from("installments")
        .select("installment_amount,installments_paid,installments_total"),
      client.from("accounts")
        .select("balance")
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
    const installmentExpenseAlreadyRecorded = txs
      .filter(row => row.kind === "expense" && (row.is_installment || row.source_type === "installment"))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const installmentCommitment = (instRes.data || [])
      .filter(row => Number(row.installments_paid || 0) < Number(row.installments_total || 0))
      .reduce((sum, row) => sum + Number(row.installment_amount || 0), 0);
    const installmentsRemaining = Math.max(0, installmentCommitment - installmentExpenseAlreadyRecorded);
    const accountsTotal = (accRes.data || []).reduce((sum, row) => sum + Number(row.balance || 0), 0);

    // Regra escolhida para o Dashboard:
    // saldo disponível = saldo informado nas contas - gastos do mês - parcelas ainda não lançadas.
    // Vales não entram neste cálculo.
    const availableThisMonth = accountsTotal - cashExpense - installmentsRemaining;
    const monthResult = cashIncome - cashExpense - installmentsRemaining;

    return {
      cashIncome,
      cashExpense,
      installmentsRemaining,
      accountsTotal,
      availableThisMonth,
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
      const availableClass = data.availableThisMonth < 0 ? "expense" : "income";
      const resultClass = data.monthResult < 0 ? "expense" : "income";

      setMetricByLabel(
        page,
        /saldo dispon[ií]vel/i,
        "Saldo disponível do mês",
        data.availableThisMonth,
        `Em contas: ${money(data.accountsTotal)} · gastos do mês: −${money(data.cashExpense)} · parcelas: −${money(data.installmentsRemaining)}`,
        availableClass
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
        `${money(data.cashExpense)} gastos do mês + ${money(data.installmentsRemaining)} parcelas ainda não descontadas`,
        "expense"
      );

      setMetricByLabel(
        page,
        /saldo projetado|dinheiro nas contas|saldo atual nas contas/i,
        "Saldo atual nas contas",
        data.accountsTotal,
        "Banco e carteira; vales ficam somente na aba Vales",
        data.accountsTotal < 0 ? "expense" : ""
      );

      const resultCard = [...page.querySelectorAll(".premium-mini-card")]
        .find(item => /resultado do m[eê]s/i.test(item.querySelector("small")?.textContent || ""));
      if (resultCard) {
        const strong = resultCard.querySelector("strong");
        const span = resultCard.querySelector("span:last-child");
        if (strong) {
          strong.textContent = money(data.monthResult);
          strong.classList.remove("income", "expense");
          strong.classList.add(resultClass);
        }
        if (span) span.textContent = "Entradas do mês − gastos do mês − parcelas ainda não lançadas";
      }
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
      if (["transactionForm", "dashboardBalanceForm", "entityForm"].includes(id)) schedule();
    }, true);
    window.addEventListener("focus", schedule);
    setInterval(() => sync(false), REFRESH_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
