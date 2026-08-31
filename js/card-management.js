(() => {
  "use strict";

  const STORAGE_KEY = "estejaNoControle.app";
  const PENDING_PURCHASE_KEY = "enc.pendingPurchaseView";
  let scheduled = false;
  let applyingPendingView = false;

  function injectStyles() {
    if (document.getElementById("enc-card-management-style")) return;
    const style = document.createElement("style");
    style.id = "enc-card-management-style";
    style.textContent = `
      .card-management-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:10px 0 12px}
      .danger-outline-button{appearance:none;border:1px solid rgba(244,82,99,.58);background:rgba(244,82,99,.08);color:var(--red,#f45263);border-radius:11px;padding:10px 12px;font:inherit;font-size:.72rem;font-weight:700;cursor:pointer;transition:.18s ease}
      .danger-outline-button:hover{background:rgba(244,82,99,.14);transform:translateY(-1px)}
      .danger-outline-button:focus-visible{outline:2px solid var(--red,#f45263);outline-offset:2px}
      .purchase-card-note{display:block;margin:-5px 0 12px;color:var(--muted,#8295a8);font-size:.62rem;line-height:1.45}
      .purchase-card-note strong{color:var(--text,#fff)}
      #entityForm[data-entity="cardPurchase"] select[name="cardId"][data-enc-locked="1"]{pointer-events:none;opacity:.88}
      @media(max-width:700px){.card-management-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function selectedCardInfo() {
    const selected = document.querySelector('#page-cards .card-selector-item.is-active[data-select-card]');
    if (!selected) return null;
    const stats = [...document.querySelectorAll('#page-cards .invoice-grid .invoice-stat')];
    const closingStat = stats.find(item => /fecha dia/i.test(item.querySelector("small")?.textContent || ""));
    const closingDay = Number((closingStat?.querySelector("strong")?.textContent || "").replace(/\D/g, "")) || 25;
    return {
      id: selected.dataset.selectCard,
      name: selected.querySelector("span")?.textContent?.trim() || "Cartão",
      closingDay
    };
  }

  function addMonths(monthKey, offset) {
    const [year, month] = String(monthKey).slice(0, 7).split("-").map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function invoiceMonthFor(dateValue, closingDay) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || ""));
    if (!match) return "";
    const base = `${match[1]}-${match[2]}`;
    return Number(match[3]) > Number(closingDay || 25) ? addMonths(base, 1) : base;
  }

  function monthLabel(monthKey) {
    const [year, month] = String(monthKey).split("-").map(Number);
    if (!year || !month) return monthKey;
    return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
      .format(new Date(year, month - 1, 1))
      .replace(" de ", "/");
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
    state.installments = (state.installments || []).map(item => {
      if (String(item.cardId) !== String(cardId)) return item;
      return {
        ...item,
        cardId: null,
        paymentMethod: item.paymentMethod === "credit_card" ? "other" : item.paymentMethod
      };
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  async function deleteCard(cardId, cardName, button) {
    const confirmed = window.confirm(
      `Excluir o cartão “${cardName}”?\n\n` +
      "As compras e os pagamentos de fatura vinculados a ele também serão excluídos. " +
      "Parcelamentos continuarão cadastrados, mas ficarão sem cartão associado.\n\n" +
      "Esta ação não pode ser desfeita."
    );
    if (!confirmed) return;

    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "Excluindo...";

    try {
      const cloud = window.ENCCloud;
      let session = null;
      if (cloud?.configured && typeof cloud.getSession === "function") {
        try { session = await cloud.getSession(); } catch { session = null; }
      }

      if (session?.user && typeof cloud?.deleteEntity === "function") {
        await cloud.deleteEntity("card", cardId);
      } else {
        deleteCardFromLocalState(cardId);
      }

      sessionStorage.removeItem(PENDING_PURCHASE_KEY);
      location.reload();
    } catch (error) {
      console.error("Falha ao excluir cartão", error);
      button.disabled = false;
      button.textContent = oldText;
      window.alert(error?.message || "Não foi possível excluir o cartão agora.");
    }
  }

  function ensureActions() {
    injectStyles();
    const page = document.getElementById("page-cards");
    if (!page) return;

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
    if (edit && edit.dataset.id !== String(card.id)) edit.dataset.id = card.id;
    if (remove) {
      if (remove.dataset.enhancedDeleteCard !== String(card.id)) remove.dataset.enhancedDeleteCard = card.id;
      if (remove.dataset.cardName !== card.name) remove.dataset.cardName = card.name;
    }
  }

  function updatePurchaseNote(form, card) {
    const dateInput = form.querySelector('input[name="date"]');
    const targetMonth = invoiceMonthFor(dateInput?.value, card?.closingDay);
    let note = form.querySelector(".purchase-card-note");
    if (!note) {
      note = document.createElement("small");
      note.className = "purchase-card-note";
      const cardField = form.querySelector('select[name="cardId"]')?.closest(".field");
      if (!cardField) return;
      cardField.insertAdjacentElement("afterend", note);
    }

    const html = `Compra vinculada a <strong>${card?.name || "cartão selecionado"}</strong>${targetMonth ? ` · fatura <strong>${monthLabel(targetMonth)}</strong>` : ""}.`;
    if (note.innerHTML !== html) note.innerHTML = html;
  }

  function bindPurchaseForm() {
    const form = document.getElementById("entityForm");
    const backdrop = document.getElementById("entityModalBackdrop");
    if (!form || !backdrop || backdrop.hidden || form.dataset.entity !== "cardPurchase" || form.dataset.id) return;

    const card = selectedCardInfo();
    const select = form.querySelector('select[name="cardId"]');
    if (!card?.id || !select) return;

    if (select.value !== String(card.id)) select.value = card.id;
    select.dataset.encLocked = "1";
    select.setAttribute("aria-readonly", "true");
    form.dataset.encBoundCardId = card.id;
    form.dataset.encClosingDay = String(card.closingDay || 25);
    updatePurchaseNote(form, card);
  }

  function rememberPurchaseDestination(form) {
    if (form.dataset.entity !== "cardPurchase" || form.dataset.id) return;
    bindPurchaseForm();

    const card = selectedCardInfo();
    const select = form.querySelector('select[name="cardId"]');
    if (card?.id && select) select.value = card.id;

    const cardId = card?.id || select?.value;
    const dateValue = form.querySelector('input[name="date"]')?.value;
    const targetMonth = invoiceMonthFor(dateValue, Number(form.dataset.encClosingDay || card?.closingDay || 25));
    if (!cardId || !targetMonth) return;

    sessionStorage.setItem(PENDING_PURCHASE_KEY, JSON.stringify({
      cardId,
      invoiceMonth: targetMonth,
      at: Date.now()
    }));
  }

  function restorePendingPurchaseView() {
    if (applyingPendingView) return;

    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_PURCHASE_KEY) || "null"); } catch { pending = null; }
    if (!pending?.cardId || !pending?.invoiceMonth) return;
    if (Date.now() - Number(pending.at || 0) > 120000) {
      sessionStorage.removeItem(PENDING_PURCHASE_KEY);
      return;
    }

    const backdrop = document.getElementById("entityModalBackdrop");
    if (backdrop && !backdrop.hidden) return;
    const page = document.getElementById("page-cards");
    if (!page?.classList.contains("is-active")) return;

    applyingPendingView = true;
    try {
      const active = selectedCardInfo();
      if (!active || String(active.id) !== String(pending.cardId)) {
        const cardButton = [...page.querySelectorAll("[data-select-card]")]
          .find(button => String(button.dataset.selectCard) === String(pending.cardId));
        if (cardButton) cardButton.click();
        else sessionStorage.removeItem(PENDING_PURCHASE_KEY);
        return;
      }

      const invoiceButton = [...page.querySelectorAll("[data-select-invoice]")]
        .find(button => String(button.dataset.selectInvoice) === String(pending.invoiceMonth));
      if (!invoiceButton) return;
      if (!invoiceButton.classList.contains("is-active")) invoiceButton.click();
      sessionStorage.removeItem(PENDING_PURCHASE_KEY);
      setTimeout(() => document.getElementById("invoiceDetail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } finally {
      applyingPendingView = false;
    }
  }

  function syncUi() {
    ensureActions();
    bindPurchaseForm();
    restorePendingPurchaseView();
  }

  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      syncUi();
    });
  }

  function start() {
    syncUi();

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });

    document.addEventListener("click", event => {
      const removeButton = event.target.closest("[data-enhanced-delete-card]");
      if (removeButton) {
        event.preventDefault();
        event.stopPropagation();
        deleteCard(removeButton.dataset.enhancedDeleteCard, removeButton.dataset.cardName || "Cartão", removeButton);
        return;
      }

      if (event.target.closest("[data-create-card-purchase]")) {
        setTimeout(bindPurchaseForm, 0);
      }
    }, true);

    document.addEventListener("input", event => {
      if (event.target.matches('#entityForm[data-entity="cardPurchase"] input[name="date"]')) {
        const form = document.getElementById("entityForm");
        const card = selectedCardInfo();
        if (form && card) updatePurchaseNote(form, card);
      }
    }, true);

    document.addEventListener("submit", event => {
      if (event.target?.id === "entityForm") rememberPurchaseDestination(event.target);
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
