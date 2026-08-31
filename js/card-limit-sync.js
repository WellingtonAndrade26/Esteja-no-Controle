(() => {
  "use strict";

  function parseBrl(text) {
    const match = String(text || "").match(/R\$\s*([\d.]+,\d{2})/i);
    if (!match) return 0;
    return Number(match[1].replace(/\./g, "").replace(",", ".")) || 0;
  }

  function formatBrl(value) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(Number(value || 0));
  }

  function currentMonthKey() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(key) {
    const [year, month] = String(key || "").split("-").map(Number);
    if (!year || !month) return "";
    return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
      .format(new Date(year, month - 1, 1))
      .replace(" de ", "/");
  }

  function invoiceTabs(page) {
    return [...page.querySelectorAll('.invoice-month-tab[data-select-invoice]')]
      .map(button => {
        const key = String(button.dataset.selectInvoice || "").slice(0, 7);
        const text = button.querySelector("small")?.textContent?.trim() || "";
        const status = text.split("·")[0]?.trim() || "Fatura";
        return {
          key,
          status,
          balance: parseBrl(text),
          button
        };
      })
      .filter(item => item.key)
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  function nearestPending(tabs) {
    const current = currentMonthKey();
    const unpaid = tabs.filter(item => item.balance > 0.005 && !/paga/i.test(item.status));
    if (!unpaid.length) {
      return tabs.find(item => item.key === current) || tabs.find(item => item.button.classList.contains("is-active")) || tabs[0] || null;
    }
    return unpaid.find(item => item.key <= current) || unpaid.find(item => item.key > current) || unpaid[0];
  }

  function setMoneyValue(element, value, warning = false) {
    if (!element) return;
    const formatted = formatBrl(value);
    if (element.textContent !== formatted) element.textContent = formatted;
    element.classList.toggle("warn", warning);
    element.classList.toggle("income", !warning);
  }

  function syncCardCredit() {
    const page = document.getElementById("page-cards");
    if (!page?.classList.contains("is-active")) return;

    const selectedCard = page.querySelector('.card-selector-item.is-active[data-select-card]');
    if (!selectedCard) return;

    const tabs = invoiceTabs(page);
    if (!tabs.length) return;

    const invoiceStats = [...page.querySelectorAll(".cards-primary .card-highlight .invoice-stat")];
    const limitStat = invoiceStats.find(item => /limite total/i.test(item.querySelector("small")?.textContent || ""));
    const totalLimit = parseBrl(limitStat?.querySelector("strong")?.textContent);
    if (!(totalLimit >= 0)) return;

    // O limite de um cartão fica comprometido por todas as faturas ainda não pagas,
    // inclusive compras que já caíram em meses futuros e parcelas futuras.
    const outstanding = tabs.reduce((sum, item) => sum + Math.max(0, Number(item.balance || 0)), 0);
    const available = Math.max(0, totalLimit - outstanding);

    const overviewItems = page.querySelectorAll(".cards-overview-item");
    const overviewLimit = overviewItems[0];
    if (overviewLimit) {
      setMoneyValue(overviewLimit.querySelector("strong"), available, available <= 0.005 && outstanding > 0.005);
      const detail = overviewLimit.querySelector("span");
      if (detail) detail.textContent = outstanding > 0.005
        ? `${formatBrl(outstanding)} comprometidos neste cartão`
        : "Nenhum valor comprometido";
    }

    const highlight = page.querySelector(".cards-primary .card-highlight");
    if (highlight) {
      const stats = [...highlight.querySelectorAll(".cc-stat")];
      const availableStat = stats.find(item => /limite disponível/i.test(item.querySelector("small")?.textContent || ""));
      setMoneyValue(availableStat?.querySelector("strong"), available, available <= 0.005 && outstanding > 0.005);

      const progress = highlight.querySelector(".progress.blue > span");
      if (progress) {
        const pct = totalLimit > 0 ? Math.min(100, Math.max(0, outstanding / totalLimit * 100)) : 0;
        progress.style.width = `${pct}%`;
      }
    }

    const pending = nearestPending(tabs);
    if (!pending) return;

    const current = currentMonthKey();
    const invoiceLabel = pending.key < current
      ? "Fatura em aberto"
      : pending.key > current
        ? "Próxima fatura"
        : "Fatura atual";

    const overviewInvoice = overviewItems[1];
    if (overviewInvoice) {
      const label = overviewInvoice.querySelector("small");
      const detail = overviewInvoice.querySelector("span");
      if (label) label.textContent = invoiceLabel;
      setMoneyValue(overviewInvoice.querySelector("strong"), pending.balance, pending.balance > 0.005);
      if (detail) detail.textContent = `${pending.status} · ${monthLabel(pending.key)}`;
    }

    if (highlight) {
      const kicker = highlight.querySelector(".premium-kicker");
      if (kicker) kicker.textContent = `${invoiceLabel} · ${pending.status} · ${monthLabel(pending.key)}`;
      const stats = [...highlight.querySelectorAll(".cc-stat")];
      const invoiceStat = stats.find(item => /fatura a pagar/i.test(item.querySelector("small")?.textContent || ""));
      setMoneyValue(invoiceStat?.querySelector("strong"), pending.balance, pending.balance > 0.005);
    }
  }

  function scheduleSync() {
    [0, 80, 250, 700, 1500, 2600].forEach(delay => setTimeout(syncCardCredit, delay));
  }

  function start() {
    scheduleSync();

    document.addEventListener("click", event => {
      if (event.target.closest('[data-page-target="cards"], [data-select-card], [data-select-invoice], [data-scroll-invoice], [data-create-card-purchase]')) {
        scheduleSync();
      }
    });

    document.addEventListener("submit", event => {
      if (event.target?.id === "entityForm") scheduleSync();
    }, true);

    window.addEventListener("focus", scheduleSync);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) scheduleSync();
    });

    // Leve e restrito apenas à aba Cartões. Garante atualização após a sincronização
    // assíncrona com a nuvem sem usar MutationObserver global.
    setInterval(syncCardCredit, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
