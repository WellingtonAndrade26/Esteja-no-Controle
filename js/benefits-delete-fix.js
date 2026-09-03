(() => {
  "use strict";

  let deleting = false;

  const money = value => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value || 0));

  function toast(message, type = "success") {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 3000);
  }

  async function deleteBenefit(id, button) {
    if (deleting || !id) return;
    const client = window.ENCCloud?.client;
    if (!client) return;

    deleting = true;
    const oldHtml = button?.innerHTML || "";
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    try {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) throw authError;
      if (!authData?.user) throw new Error("Sessão expirada.");

      const { data: tx, error: txError } = await client
        .from("benefit_transactions")
        .select("id,kind,amount,description,wallet_id")
        .eq("id", id)
        .maybeSingle();
      if (txError) throw txError;
      if (!tx) {
        await window.ENCBenefits?.reload?.();
        toast("Essa movimentação já não existe.", "success");
        return;
      }

      const label = tx.kind === "income" ? "crédito" : "gasto";
      if (!window.confirm(`Excluir ${label} de ${money(tx.amount)} — ${tx.description}?`)) return;

      const { error } = await client.rpc("delete_benefit_transaction", {
        p_transaction_id: tx.id
      });
      if (error) throw error;

      await window.ENCBenefits?.reload?.();
      setTimeout(() => window.ENCBenefits?.reload?.(), 180);
      toast("Movimentação do vale excluída.", "success");
    } catch (error) {
      console.error("Falha ao excluir movimentação do vale", error);
      const message = String(error?.message || "");
      if (/insufficient_benefit_balance/i.test(message)) {
        toast("Esse crédito não pode ser excluído porque parte do saldo já foi usada. Exclua ou edite os gastos vinculados primeiro.", "error");
      } else if (/transaction_not_found/i.test(message)) {
        await window.ENCBenefits?.reload?.();
        toast("Essa movimentação já foi excluída.", "success");
      } else {
        toast(message || "Não foi possível excluir o vale agora.", "error");
      }
    } finally {
      deleting = false;
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        if (oldHtml) button.innerHTML = oldHtml;
      }
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-benefit-delete]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    deleteBenefit(button.dataset.benefitDelete, button);
  }, true);
})();
