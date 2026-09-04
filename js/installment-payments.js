(() => {
  "use strict";

  let busy = false;
  const money = value => new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(value || 0));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };

  function toast(message, type="success") {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function injectStyles() {
    if (document.getElementById("enc-installment-payment-style")) return;
    const style = document.createElement("style");
    style.id = "enc-installment-payment-style";
    style.textContent = `
      .installment-payment-row{display:flex;align-items:center;gap:10px;margin-top:12px}
      .installment-payment-button{min-height:40px;border:1px solid rgba(37,211,164,.36);border-radius:12px;background:rgba(37,211,164,.10);color:var(--green);font-weight:800;padding:0 15px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px}
      .installment-payment-button:hover{background:rgba(37,211,164,.16);border-color:rgba(37,211,164,.55)}
      .installment-payment-button:disabled{opacity:.55;cursor:not-allowed}
      .installment-payment-note{font-size:.72rem;color:var(--muted)}
      .installment-payment-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:8px 0 14px}
      .installment-payment-summary>div{padding:11px 12px;border:1px solid var(--border);border-radius:12px;background:rgba(8,27,42,.58)}
      .installment-payment-summary small,.installment-payment-summary strong{display:block}
      .installment-payment-summary small{color:var(--muted);font-size:.7rem;margin-bottom:4px}
      .installment-payment-preview{padding:11px 12px;border-radius:12px;border:1px solid var(--border);background:rgba(8,27,42,.58);font-size:.76rem;color:var(--muted)}
      .installment-payment-preview strong{color:var(--text)}
      @media(max-width:700px){.installment-payment-row{align-items:stretch;flex-direction:column}.installment-payment-button{width:100%}.installment-payment-summary{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    let backdrop = document.getElementById("installmentPaymentBackdrop");
    if (backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "installmentPaymentBackdrop";
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="installmentPaymentTitle">
        <div class="modal-head">
          <div><p class="eyebrow">Planejamento</p><h3 id="installmentPaymentTitle">Pagar parcela</h3></div>
          <button class="icon-button" type="button" data-close-installment-payment aria-label="Fechar">×</button>
        </div>
        <form id="installmentPaymentForm" class="modal-form">
          <input type="hidden" name="installmentId">
          <div id="installmentPaymentInfo"></div>
          <div class="field"><label for="installmentPaymentAccount">Conta usada no pagamento</label><select id="installmentPaymentAccount" name="accountId" required></select></div>
          <div class="field"><label for="installmentPaymentDate">Data do pagamento</label><input id="installmentPaymentDate" name="paidOn" type="date" required></div>
          <div class="installment-payment-preview" id="installmentPaymentPreview"></div>
          <button class="primary-button" type="submit">Confirmar pagamento</button>
        </form>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector("[data-close-installment-payment]")?.addEventListener("click", closeModal);
    backdrop.addEventListener("click", e => { if (e.target === backdrop) closeModal(); });
    backdrop.querySelector("#installmentPaymentForm")?.addEventListener("submit", submitPayment);
    backdrop.querySelector("#installmentPaymentAccount")?.addEventListener("change", updatePreview);
    return backdrop;
  }

  function closeModal() {
    const backdrop = document.getElementById("installmentPaymentBackdrop");
    if (backdrop) backdrop.hidden = true;
  }

  async function getClientAndUser() {
    const client = window.ENCCloud?.client;
    if (!client) throw new Error("cloud_unavailable");
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) throw new Error("not_authenticated");
    return { client, user:data.user };
  }

  async function openPayment(id) {
    if (busy) return;
    busy = true;
    try {
      const { client } = await getClientAndUser();
      const [instRes, accountRes] = await Promise.all([
        client.from("installments").select("id,name,installment_amount,installments_total,installments_paid,next_due,card_id,payment_method").eq("id", id).single(),
        client.from("accounts").select("id,name,institution,balance,is_primary,type").order("is_primary", {ascending:false}).order("created_at", {ascending:true})
      ]);
      if (instRes.error) throw instRes.error;
      if (accountRes.error) throw accountRes.error;
      const inst = instRes.data;
      if (!inst) throw new Error("installment_not_found");
      if (Number(inst.installments_paid||0) >= Number(inst.installments_total||0)) {
        toast("Este parcelamento já está quitado.", "success");
        return;
      }
      if (inst.card_id && String(inst.payment_method||"").toLowerCase() === "credit_card") {
        toast("Esta parcela está vinculada a um cartão. Pague pela fatura do cartão para não descontar duas vezes.", "error");
        return;
      }
      const accounts = accountRes.data || [];
      if (!accounts.length) {
        toast("Cadastre uma conta antes de pagar a parcela.", "error");
        return;
      }

      const backdrop = ensureModal();
      const form = backdrop.querySelector("#installmentPaymentForm");
      form.elements.installmentId.value = inst.id;
      form.elements.paidOn.value = today();
      form.dataset.amount = Number(inst.installment_amount||0);
      form.dataset.name = inst.name || "Parcela";
      form.dataset.paid = Number(inst.installments_paid||0);
      form.dataset.total = Number(inst.installments_total||0);
      const nextNumber = Number(inst.installments_paid||0) + 1;
      backdrop.querySelector("#installmentPaymentInfo").innerHTML = `
        <div class="installment-payment-summary">
          <div><small>Parcelamento</small><strong>${escapeHtml(inst.name||"Parcela")}</strong></div>
          <div><small>Parcela a pagar</small><strong>${nextNumber}/${Number(inst.installments_total||0)}</strong></div>
          <div><small>Valor</small><strong>${money(inst.installment_amount)}</strong></div>
          <div><small>Vencimento</small><strong>${inst.next_due ? new Intl.DateTimeFormat("pt-BR").format(new Date(inst.next_due+"T12:00:00")) : "Sem data"}</strong></div>
        </div>`;
      const accountSelect = backdrop.querySelector("#installmentPaymentAccount");
      accountSelect.innerHTML = accounts.map(a => `<option value="${a.id}" data-balance="${Number(a.balance||0)}">${escapeHtml(a.name)}${a.institution?` · ${escapeHtml(a.institution)}`:""} — ${money(a.balance)}</option>`).join("");
      backdrop.hidden = false;
      updatePreview();
    } catch (error) {
      console.error("Falha ao abrir pagamento de parcela", error);
      const msg = /not_authenticated/i.test(error?.message||"") ? "Sua sessão expirou. Entre novamente." : "Não foi possível abrir o pagamento agora.";
      toast(msg, "error");
    } finally {
      busy = false;
    }
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  }

  function updatePreview() {
    const backdrop = document.getElementById("installmentPaymentBackdrop");
    const form = backdrop?.querySelector("#installmentPaymentForm");
    if (!form) return;
    const select = form.elements.accountId;
    const option = select?.selectedOptions?.[0];
    const balance = Number(option?.dataset?.balance || 0);
    const amount = Number(form.dataset.amount || 0);
    const after = balance - amount;
    const preview = backdrop.querySelector("#installmentPaymentPreview");
    if (preview) preview.innerHTML = `Saldo da conta após o pagamento: <strong class="${after<0?"expense":""}">${money(after)}</strong>. O pagamento será registrado também em Transações.`;
  }

  async function submitPayment(event) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const button = form.querySelector("button[type=submit]");
    busy = true;
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "Pagando...";
    try {
      const { client } = await getClientAndUser();
      const { data, error } = await client.rpc("pay_installment", {
        p_installment_id: form.elements.installmentId.value,
        p_account_id: form.elements.accountId.value,
        p_paid_on: form.elements.paidOn.value || today()
      });
      if (error) throw error;
      closeModal();
      const finished = Boolean(data?.finished);
      toast(finished ? "Última parcela paga. Parcelamento quitado!" : "Parcela paga e saldo da conta atualizado.", "success");
      setTimeout(() => location.reload(), 650);
    } catch (error) {
      console.error("Falha ao pagar parcela", error);
      const raw = error?.message || "";
      let msg = "Não foi possível pagar a parcela.";
      if (/installment_already_finished/i.test(raw)) msg = "Este parcelamento já está quitado.";
      else if (/installment_already_paid/i.test(raw)) msg = "Esta parcela já foi marcada como paga.";
      else if (/account_not_found/i.test(raw)) msg = "A conta escolhida não foi encontrada.";
      else if (/not_authenticated/i.test(raw)) msg = "Sua sessão expirou. Entre novamente.";
      toast(msg, "error");
    } finally {
      busy = false;
      button.disabled = false;
      button.textContent = old;
    }
  }

  function patchButtons() {
    const page = document.getElementById("page-planning");
    if (!page?.classList.contains("is-active")) return;
    page.querySelectorAll(".installment-feature-card").forEach(card => {
      const actions = card.querySelector('.installment-actions');
      const edit = actions?.querySelector('[data-edit-entity="installment"][data-id]');
      if (!actions || !edit) return;
      const id = edit.dataset.id;
      if (card.querySelector(`[data-pay-installment="${CSS.escape(id)}"]`)) return;
      const topText = card.querySelector(".installment-top small")?.textContent || "";
      const match = topText.match(/(\d+)\s*\/\s*(\d+)/);
      const finished = match && Number(match[1]) >= Number(match[2]);
      const row = document.createElement("div");
      row.className = "installment-payment-row";
      row.innerHTML = finished
        ? `<button class="installment-payment-button" type="button" disabled>✓ Quitado</button>`
        : `<button class="installment-payment-button" type="button" data-pay-installment="${id}">✓ Pagar parcela</button><span class="installment-payment-note">Desconta da conta e registra em Transações</span>`;
      actions.parentNode.insertBefore(row, actions);
    });
  }

  function schedulePatch() {
    [30, 180, 500, 1000].forEach(ms => setTimeout(patchButtons, ms));
  }

  function start() {
    injectStyles();
    ensureModal();
    schedulePatch();
    document.addEventListener("click", event => {
      const pay = event.target.closest("[data-pay-installment]");
      if (pay) {
        event.preventDefault();
        openPayment(pay.dataset.payInstallment);
        return;
      }
      if (event.target.closest('[data-page-target="planning"]')) schedulePatch();
    }, true);
    window.addEventListener("focus", schedulePatch);
    setInterval(() => {
      if (document.getElementById("page-planning")?.classList.contains("is-active")) patchButtons();
    }, 5000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true});
  else start();
})();
