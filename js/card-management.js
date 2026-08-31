(() => {
  "use strict";

  const STORAGE_KEY = "estejaNoControle.app";

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
    const selected = document.querySelector('#page-cards .card-selector-item.is-active[data-select-card]');
    if (!selected) return null;
    return {
      id: selected.dataset.selectCard,
      name: selected.querySelector("span")?.textContent?.trim() || "Cartão"
    };
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

    const existing = page.querySelector(".card-management-actions");
    if (existing) {
      const edit = existing.querySelector('[data-edit-entity="card"]');
      const remove = existing.querySelector("[data-enhanced-delete-card]");
      if (edit) edit.dataset.id = card.id;
      if (remove) {
        remove.dataset.enhancedDeleteCard = card.id;
        remove.dataset.cardName = card.name;
      }
      return;
    }

    const actions = document.createElement("div");
    actions.className = "card-management-actions";
    actions.innerHTML = `
      <button class="secondary-button" data-edit-entity="card" data-id="${card.id}">Editar cartão</button>
      <button class="danger-outline-button" data-enhanced-delete-card="${card.id}" data-card-name="${card.name.replace(/&/g,"&amp;").replace(/"/g,"&quot;")}">Excluir cartão</button>
    `;
    stage.insertAdjacentElement("afterend", actions);
  }

  function start() {
    ensureActions();
    const observer = new MutationObserver(() => queueMicrotask(ensureActions));
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("click", event => {
      const button = event.target.closest("[data-enhanced-delete-card]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      deleteCard(button.dataset.enhancedDeleteCard, button.dataset.cardName || "Cartão", button);
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
