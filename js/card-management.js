(() => {
  "use strict";

  const STORAGE_KEY = "estejaNoControle.app";
  const PENDING_KEY = "enc.pendingPurchaseView";

  function injectStyles() {
    if (document.getElementById("enc-card-management-style")) return;
    const style = document.createElement("style");
    style.id = "enc-card-management-style";
    style.textContent = `
      .card-management-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:10px 0 12px}
      .danger-outline-button{appearance:none;border:1px solid rgba(244,82,99,.58);background:rgba(244,82,99,.08);color:var(--red,#f45263);border-radius:11px;padding:10px 12px;font:inherit;font-size:.72rem;font-weight:700;cursor:pointer;transition:.18s ease}
      .danger-outline-button:hover{background:rgba(244,82,99,.14);transform:translateY(-1px)}
      .danger-outline-button:focus-visible{outline:2px solid var(--red,#f45263);outline-offset:2px}
      @media(max-width:700px){.card-management-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function selectedCardInfo() {
    const page = document.getElementById("page-cards");
    const selected = page?.querySelector('.card-selector-item.is-active[data-select-card]');
    if (!selected) return null;
    const stats = [...page.querySelectorAll(".invoice-grid .invoice-stat")];
    const closingStat = stats.find(item => /fecha dia/i.test(item.querySelector("small")?.textContent || ""));
    const closingDay = Number((closingStat?.querySelector("strong")?.textContent || "").replace(/\D/g, "")) || 25;
    return {
      id: selected.dataset.selectCard,
      name: selected.querySelector("span")?.textContent?.trim() || "Cartão",
      closingDay
    };
  }

  function ensureActions() {
    injectStyles();
    const page = document.getElementById("page-cards");
    if (!page?.classList.contains("is-active")) return;
    const stage = page.querySelector(".cards-primary .credit-card-stage");
    const card = selectedCardInfo();
    if (!stage || !card?.id) return;

    let actions = page.querySelector(".card-management-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "card-management-actions";
      actions.innerHTML = `
        <button class="secondary-button" data-edit-entity="card">Editar cartão</button>
        <button class="danger-outline-button" data-enhanced-delete-card>Excluir cartão</button>
      `;
      stage.insertAdjacentElement("afterend", actions);
    }

    const edit = actions.querySelector('[data-edit-entity="card"]');
    const remove = actions.querySelector("[data-enhanced-delete-card]");
    if (edit) edit.dataset.id = card.id;
    if (remove) {
      remove.dataset.enhancedDeleteCard = card.id;
      remove.dataset.cardName = card.name;
    }
  }

  function readLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function deleteCardFromLocalState(cardId) {
    const state = readLocalState();
    if (!state) throw new Error("Não foi possível localizar os dados locais do aplicativo.");
    state.cards = (state.cards || []).filter(card => String(card.id) !== String(cardId));
    state.cardPurchases = (state.cardPurchases || []).filter(item => String(item.cardId) !== String(cardId));
    state.invoicePayments = (state.invoicePayments || []).filter(item => String(item.cardId) !== String(cardId));
    state.installments = (state.installments || []).map(item => String(item.cardId) === String(cardId)
      ? {...item, cardId:null, paymentMethod:item.paymentMethod === "credit_card" ? "other" : item.paymentMethod}
      : item);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  async function deleteCard(cardId, cardName, button) {
    if (!window.confirm(`Excluir o cartão “${cardName}”?\n\nCompras e pagamentos de fatura vinculados a ele também serão excluídos. Parcelamentos continuarão cadastrados, mas sem cartão associado.\n\nEsta ação não pode ser desfeita.`)) return;

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Excluindo...";
    try {
      const cloud = window.ENCCloud;
      let session = null;
      if (cloud?.configured && typeof cloud.getSession === "function") {
        try { session = await cloud.getSession(); } catch {}
      }
      if (session?.user && typeof cloud?.deleteEntity === "function") await cloud.deleteEntity("card", cardId);
      else deleteCardFromLocalState(cardId);
      sessionStorage.removeItem(PENDING_KEY);
      location.reload();
    } catch (error) {
      console.error("Falha ao excluir cartão", error);
      button.disabled = false;
      button.textContent = oldText;
      window.alert(error?.message || "Não foi possível excluir o cartão agora.");
    }
  }

  function addMonths(monthKey, offset) {
    const [year, month] = String(monthKey).slice(0,7).split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
  }

  function invoiceMonthFor(dateValue, closingDay) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ""));
    if (!match) return "";
    const base = `${match[1]}-${match[2]}`;
    return Number(match[3]) > Number(closingDay || 25) ? addMonths(base, 1) : base;
  }

  function rememberPurchaseDestination(form) {
    if (form.dataset.entity !== "cardPurchase" || form.dataset.id) return;
    const card = selectedCardInfo();
    const cardId = form.querySelector('select[name="cardId"]')?.value || card?.id;
    const dateValue = form.querySelector('input[name="date"]')?.value;
    const month = invoiceMonthFor(dateValue, card?.closingDay || 25);
    if (!cardId || !month) return;
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({cardId, invoiceMonth:month, at:Date.now()}));
    [350, 800, 1500, 2600].forEach(delay => setTimeout(openPendingPurchaseView, delay));
  }

  function openPendingPurchaseView() {
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"); } catch {}
    if (!pending?.cardId || !pending?.invoiceMonth) return;
    if (Date.now() - Number(pending.at || 0) > 120000) {
      sessionStorage.removeItem(PENDING_KEY);
      return;
    }

    const backdrop = document.getElementById("entityModalBackdrop");
    if (backdrop && !backdrop.hidden) return;
    const page = document.getElementById("page-cards");
    if (!page?.classList.contains("is-active")) return;

    const active = selectedCardInfo();
    if (!active || String(active.id) !== String(pending.cardId)) {
      const cardButton = [...page.querySelectorAll("[data-select-card]")].find(btn => String(btn.dataset.selectCard) === String(pending.cardId));
      if (cardButton) {
        cardButton.click();
        setTimeout(openPendingPurchaseView, 80);
      }
      return;
    }

    const invoiceButton = [...page.querySelectorAll("[data-select-invoice]")].find(btn => String(btn.dataset.selectInvoice) === String(pending.invoiceMonth));
    if (!invoiceButton) return;
    if (!invoiceButton.classList.contains("is-active")) invoiceButton.click();
    sessionStorage.removeItem(PENDING_KEY);
    setTimeout(() => document.getElementById("invoiceDetail")?.scrollIntoView({behavior:"smooth",block:"start"}), 80);
  }

  function start() {
    injectStyles();
    setTimeout(ensureActions, 0);

    document.addEventListener("click", event => {
      const remove = event.target.closest("[data-enhanced-delete-card]");
      if (remove) {
        event.preventDefault();
        event.stopPropagation();
        deleteCard(remove.dataset.enhancedDeleteCard, remove.dataset.cardName || "Cartão", remove);
        return;
      }

      if (event.target.closest('[data-page-target="cards"], [data-select-card]')) {
        setTimeout(ensureActions, 30);
        setTimeout(ensureActions, 150);
      }
    });

    document.addEventListener("submit", event => {
      if (event.target?.id === "entityForm") rememberPurchaseDestination(event.target);
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true});
  else start();
})();
