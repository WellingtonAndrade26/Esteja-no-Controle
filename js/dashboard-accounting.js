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

  function injectStyles() {
    if (document.getElementById("enc-dashboard-accounting-style")) return;
    const style = document.createElement("style");
    style.id = "enc-dashboard-accounting-style";
    style.textContent = `
      #page-dashboard .summary-grid{display:none!important}
      .enc-accounting-breakdown{grid-column:1/-1;margin-top:0}
      .enc-accounting-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .enc-accounting-head small{display:block;color:var(--muted);margin-top:4px}
      .enc-accounting-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
      .enc-accounting-cell{padding:12px;border:1px solid var(--border);border-radius:12px;background:rgba(8,24,39,.42);min-width:0}
      .enc-accounting-cell small{display:block;color:var(--muted);font-size:.64rem;margin-bottom:5px}
      .enc-accounting-cell strong{display:block;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .enc-accounting-cell span{display:block;color:var(--muted);font-size:.58rem;margin-top:4px;line-height:1.35}
      .enc-accounting-formula{margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(35,134,255,.08);border:1px solid rgba(35,134,255,.2);font-size:.66rem;color:var(--muted)}
      .enc-accounting-formula strong{color:var(--text)}
      @media(max-width:1100px){.enc-accounting-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:650px){.enc-accounting-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.enc-accounting-head{display:block}.enc-accounting-head .badge{margin-top:8px;display:inline-flex}}
    `;
    document.head.appendChild(style);
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

  function renderBreakdown(page, data) {
    let block = page.querySelector("#encAccountingBreakdown");
    if (!block) {
      block = document.createElement("section");
      block.id = "encAccountingBreakdown";
      block.className = "card section-card enc-accounting-breakdown";
      const summary = page.querySelector(".summary-grid");
      summary?.insertAdjacentElement("afterend", block);
    }
    if (!block) return;

    const combinedTotal = data.monthResult + data.benefitsTotal;
    block.innerHTML = `
      <div class="enc-accounting-head">
        <div><strong>Conferência do saldo</strong><small>Resultado do mês e vales continuam separados; o total somado serve como visão geral.</small></div>
        <span class="badge">Mês atual</span>
      </div>
      <div class="enc-accounting-grid">
        <div class="enc-accounting-cell"><small>Resultado disponível</small><strong class="${data.monthResult < 0 ? "expense" : "income"}">${money(data.monthResult)}</strong><span>Entradas − gastos − parcelas.</span></div>
        <div class="enc-accounting-cell"><small>Entradas em dinheiro</small><strong class="income">${money(data.cashIncome)}</strong><span>Não inclui vales.</span></div>
        <div class="enc-accounting-cell"><small>Gastos realizados</small><strong class="expense">${money(data.cashExpense)}</strong><span>Saídas já registradas no mês.</span></div>
        <div class="enc-accounting-cell"><small>Parcelas ainda consideradas</small><strong class="expense">${money(data.installmentsRemaining)}</strong><span>Compromisso mensal não lançado como gasto.</span></div>
        <div class="enc-accounting-cell"><small>Total somado</small><strong class="${combinedTotal < 0 ? "expense" : "income"}">${money(combinedTotal)}</strong><span>Resultado disponível + vales.</span></div>
        <div class="enc-accounting-cell"><small>Vales separados</small><strong>${money(data.benefitsTotal)}</strong><span>Uso restrito; não paga contas comuns.</span></div>
      </div>
      <div class="enc-accounting-formula">
        <strong>${money(data.cashIncome)}</strong> entradas − <strong>${money(data.cashExpense)}</strong> gastos − <strong>${money(data.installmentsRemaining)}</strong> parcelas = <strong class="${data.monthResult < 0 ? "expense" : "income"}">${money(data.monthResult)}</strong> disponíveis. Somando <strong>${money(data.benefitsTotal)}</strong> em vales, o total geral é <strong class="${combinedTotal < 0 ? "expense" : "income"}">${money(combinedTotal)}</strong>.
      </div>`;
  }

  async function readData() {
    const cloud = window.ENCCloud;
    const client = cloud?.client;
    if (!client) return null;
    const { data: authData } = await client.auth.getUser();
    const user = authData?.user;
    if (!user) return null;

    const { start, end } = monthRange();
    const [txRes, instRes, accRes, benefitRes] = await Promise.all([
      client.from("transactions")
        .select("description,amount,kind,notes,is_installment,source_type")
        .gte("occurred_on", start)
        .lt("occurred_on", end),
      client.from("installments")
        .select("installment_amount,installments_paid,installments_total"),
      client.from("accounts")
        .select("balance"),
      client.from("benefit_wallets")
        .select("balance")
    ]);

    const firstError = [txRes, instRes, accRes, benefitRes].find(r => r?.error)?.error;
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
    const benefitsTotal = (benefitRes.data || []).reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const monthResult = cashIncome - cashExpense - installmentsRemaining;

    return { cashIncome, cashExpense, installmentsRemaining, accountsTotal, benefitsTotal, monthResult };
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
      injectStyles();
      const resultClass = data.monthResult < 0 ? "expense" : "income";
      setMetricByLabel(page, /saldo dispon[ií]vel/i, "Saldo disponível do mês", data.monthResult,
        `${money(data.cashIncome)} entradas − ${money(data.cashExpense)} gastos − ${money(data.installmentsRemaining)} parcelas`, resultClass);
      setMetricByLabel(page, /^entradas$/i, "Entradas em dinheiro", data.cashIncome, "Vales ficam fora deste total", "income");
      setMetricByLabel(page, /sa[ií]das\s*\+\s*parcelas/i, "Gastos + parcelas", data.cashExpense + data.installmentsRemaining,
        `${money(data.cashExpense)} gastos + ${money(data.installmentsRemaining)} parcelas`, "expense");
      setMetricByLabel(page, /saldo projetado/i, "Dinheiro nas contas", data.accountsTotal,
        `Vales separados: ${money(data.benefitsTotal)}`, data.accountsTotal < 0 ? "expense" : "");

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
        if (span) span.textContent = "Entradas em dinheiro − gastos realizados − parcelas";
      }
      renderBreakdown(page, data);
    } catch (error) {
      console.error("Falha ao conferir saldo do dashboard", error);
    } finally {
      running = false;
    }
  }

  function schedule() {
    [80, 350, 900, 1800].forEach(delay => setTimeout(() => sync(true), delay));
  }

  function start() {
    injectStyles();
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
