(() => {
  "use strict";

  const LOCAL_KEY = "enc.benefits.local.v1";
  const kinds = {
    food: { name: "Vale Alimentação", short: "Alimentação", accent: "#26d7a5" },
    meal: { name: "Vale Refeição", short: "Refeição", accent: "#8d6bff" },
    fuel: { name: "Vale Combustível", short: "Combustível", accent: "#ffb84d" }
  };

  const walletIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 8h14"/><path d="M16 12h4v3h-4a1.5 1.5 0 0 1 0-3Z"/></svg>`;
  const plusIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
  const minusIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>`;

  let data = { wallets: [], transactions: [], cloud: false };
  let loading = false;
  let currentUser = null;

  const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  };
  const shortDate = value => {
    if (!value) return "";
    const d = new Date(`${String(value).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat("pt-BR", {day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
  };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  const normalize = value => String(value || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function injectStyles() {
    if (document.getElementById("enc-benefits-style")) return;
    const style = document.createElement("style");
    style.id = "enc-benefits-style";
    style.textContent = `
      .benefit-nav-icon svg{width:20px;height:20px;display:block}
      .benefit-hero{padding:18px;overflow:hidden;position:relative}
      .benefit-hero:after{content:"";position:absolute;width:260px;height:260px;border-radius:50%;right:-120px;top:-150px;background:radial-gradient(circle,rgba(39,157,255,.16),transparent 68%);pointer-events:none}
      .benefit-summary{display:grid;grid-template-columns:1.25fr .75fr;gap:14px;align-items:stretch}
      .benefit-summary-main{display:flex;flex-direction:column;justify-content:center;min-height:116px}
      .benefit-summary-main small,.benefit-wallet small,.benefit-form-card small{color:var(--muted)}
      .benefit-summary-main strong{font-size:1.7rem;margin-top:5px}
      .benefit-summary-note{border:1px solid var(--border);border-radius:14px;padding:14px;background:rgba(9,31,49,.45);display:flex;gap:10px;align-items:flex-start}
      .benefit-summary-note svg{width:24px;height:24px;color:var(--blue);flex:0 0 auto}
      .benefit-summary-note strong{display:block;margin-bottom:5px}
      .benefit-summary-note span{font-size:.72rem;color:var(--muted);line-height:1.45}
      .benefit-wallet-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}
      .benefit-wallet{position:relative;overflow:hidden;padding:16px;border:1px solid var(--border);border-radius:16px;background:linear-gradient(145deg,rgba(15,42,62,.94),rgba(5,23,37,.98))}
      .benefit-wallet:after{content:"";position:absolute;inset:auto -35px -55px auto;width:120px;height:120px;border-radius:50%;background:var(--wallet-accent);opacity:.08}
      .benefit-wallet-head{display:flex;justify-content:space-between;align-items:center;gap:10px}
      .benefit-wallet-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--wallet-accent) 16%,transparent);color:var(--wallet-accent)}
      .benefit-wallet-icon svg{width:21px;height:21px}
      .benefit-wallet strong{display:block;font-size:1.15rem;margin-top:16px}
      .benefit-wallet span{display:block;font-size:.73rem;color:var(--muted);margin-top:3px}
      .benefit-actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
      .benefit-form-card{padding:16px}
      .benefit-form-card .section-head{margin-bottom:12px}
      .benefit-form{display:grid;grid-template-columns:1.2fr .8fr 1fr;gap:10px;align-items:end}
      .benefit-form .field{margin:0}
      .benefit-form .benefit-description{grid-column:1 / 3}
      .benefit-form button{min-height:46px}
      .benefit-history{margin-top:14px;padding:16px}
      .benefit-history-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)}
      .benefit-history-row:last-child{border-bottom:0}
      .benefit-history-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(44,154,255,.1);color:var(--blue)}
      .benefit-history-icon svg{width:18px;height:18px}
      .benefit-history-copy strong,.benefit-history-copy small{display:block}
      .benefit-history-copy small{color:var(--muted);margin-top:3px}
      .benefit-value.income{color:var(--green)}
      .benefit-value.expense{color:var(--red)}
      .benefit-empty{padding:24px;text-align:center;color:var(--muted);border:1px dashed var(--border);border-radius:14px}
      .dashboard-balance-form select[name="balanceSource"] option[data-benefit-hidden]{display:none}
      @media(max-width:900px){.benefit-summary,.benefit-actions-grid{grid-template-columns:1fr}.benefit-wallet-grid{grid-template-columns:1fr}.benefit-form{grid-template-columns:1fr 1fr}.benefit-form .benefit-description{grid-column:1 / -1}.benefit-form button{grid-column:1 / -1}}
      @media(max-width:700px){
        #bottomNav.enc-has-benefits{grid-template-columns:repeat(7,minmax(0,1fr))!important}
        #bottomNav.enc-has-benefits .nav-button{min-width:0;padding-left:2px;padding-right:2px}
        #bottomNav.enc-has-benefits .nav-button span:last-child{font-size:.58rem}
        #bottomNav.enc-has-benefits .nav-icon svg{width:19px;height:19px}
        .benefit-form{grid-template-columns:1fr}
        .benefit-form .benefit-description,.benefit-form button{grid-column:1}
      }
    `;
    document.head.appendChild(style);
  }

  function navButton() {
    const button = document.createElement("button");
    button.className = "nav-button enc-benefits-nav";
    button.dataset.pageTarget = "benefits";
    button.setAttribute("aria-label", "Vales");
    button.innerHTML = `<span class="nav-icon benefit-nav-icon">${walletIcon}</span><span>Vales</span>`;
    return button;
  }

  function ensureNav() {
    const desktop = document.getElementById("desktopNav");
    if (desktop && !desktop.querySelector('[data-page-target="benefits"]')) {
      const btn = navButton();
      const cards = desktop.querySelector('[data-page-target="cards"]');
      desktop.insertBefore(btn, cards || null);
    }
    const bottom = document.getElementById("bottomNav");
    if (bottom && !bottom.querySelector('[data-page-target="benefits"]')) {
      const btn = navButton();
      const cards = bottom.querySelector('[data-page-target="cards"]');
      bottom.insertBefore(btn, cards || bottom.lastElementChild);
      bottom.classList.add("enc-has-benefits");
    }
  }

  function ensurePage() {
    let page = document.getElementById("page-benefits");
    if (page) return page;
    const main = document.getElementById("mainContent");
    if (!main) return null;
    page = document.createElement("section");
    page.className = "page";
    page.id = "page-benefits";
    page.dataset.page = "benefits";
    const cards = document.getElementById("page-cards");
    main.insertBefore(page, cards || null);
    return page;
  }

  function localData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null");
      if (parsed?.wallets?.length) return parsed;
    } catch {}
    return {
      wallets: Object.entries(kinds).map(([kind,meta]) => ({ id:`local-${kind}`, kind, name:meta.name, balance:0, active:true })),
      transactions: []
    };
  }

  function saveLocal() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({wallets:data.wallets,transactions:data.transactions}));
  }

  async function getCloudUser() {
    const cloud = window.ENCCloud;
    if (!cloud?.client) return null;
    try {
      const { data: authData, error } = await cloud.client.auth.getUser();
      if (error) return null;
      return authData?.user || null;
    } catch { return null; }
  }

  async function ensureCloudWallets(user) {
    const client = window.ENCCloud?.client;
    if (!client || !user) return;
    const { data: existing, error } = await client.from("benefit_wallets").select("id,kind,name,balance,active").order("created_at");
    if (error) throw error;
    const have = new Set((existing || []).map(w => w.kind));
    const missing = Object.entries(kinds).filter(([kind]) => !have.has(kind)).map(([kind,meta]) => ({user_id:user.id,kind,name:meta.name,balance:0,active:true}));
    if (missing.length) {
      const { error: insertError } = await client.from("benefit_wallets").insert(missing);
      if (insertError) throw insertError;
    }
  }

  async function loadData(render = true) {
    if (loading) return data;
    loading = true;
    try {
      currentUser = await getCloudUser();
      const client = window.ENCCloud?.client;
      if (client && currentUser) {
        await ensureCloudWallets(currentUser);
        const [walletRes,txRes] = await Promise.all([
          client.from("benefit_wallets").select("id,kind,name,balance,active").order("created_at"),
          client.from("benefit_transactions").select("id,wallet_id,kind,amount,description,occurred_on,note,created_at").order("occurred_on",{ascending:false}).order("created_at",{ascending:false}).limit(100)
        ]);
        if (walletRes.error) throw walletRes.error;
        if (txRes.error) throw txRes.error;
        data = { wallets:walletRes.data || [], transactions:txRes.data || [], cloud:true };
      } else {
        const local = localData();
        data = { wallets:local.wallets, transactions:local.transactions, cloud:false };
      }
    } catch (error) {
      console.error("Falha ao carregar vales", error);
      const local = localData();
      data = { wallets:local.wallets, transactions:local.transactions, cloud:false };
    } finally {
      loading = false;
    }
    if (render) renderPage();
    return data;
  }

  function walletById(id) { return data.wallets.find(w => String(w.id) === String(id)); }
  function walletOptions() {
    return data.wallets.map(w => `<option value="${esc(w.id)}">${esc(w.name)} · ${money(w.balance)}</option>`).join("");
  }

  function renderPage() {
    const page = ensurePage();
    if (!page) return;
    const total = data.wallets.reduce((sum,w) => sum + Number(w.balance || 0), 0);
    const txs = data.transactions.slice(0,30);
    page.innerHTML = `
      <section class="card benefit-hero">
        <div class="benefit-summary">
          <div class="benefit-summary-main">
            <p class="eyebrow">Benefícios separados do dinheiro</p>
            <small>Saldo total disponível em vales</small>
            <strong>${money(total)}</strong>
          </div>
          <div class="benefit-summary-note">${walletIcon}<div><strong>Não entra no saldo bancário</strong><span>Alimentação, refeição e combustível ficam separados porque não podem ser usados para aluguel, boletos, faturas ou outras contas comuns.</span></div></div>
        </div>
        <div class="benefit-wallet-grid">
          ${data.wallets.map(w => { const meta=kinds[w.kind]||{name:w.name,short:w.name,accent:"#2c9aff"}; return `<article class="benefit-wallet" style="--wallet-accent:${meta.accent}"><div class="benefit-wallet-head"><div><small>${esc(meta.short)}</small><span>${esc(w.name)}</span></div><div class="benefit-wallet-icon">${walletIcon}</div></div><strong>${money(w.balance)}</strong><span>Uso restrito ao benefício</span></article>`; }).join("")}
        </div>
      </section>

      <div class="benefit-actions-grid">
        <section class="card benefit-form-card">
          <div class="section-head"><div><p class="eyebrow">Entrada</p><h3 class="section-title">Adicionar crédito</h3><small>Crédito recebido no cartão/vale.</small></div></div>
          <form class="benefit-form" id="benefitCreditForm">
            <div class="field"><label>Vale</label><select name="walletId" required>${walletOptions()}</select></div>
            <div class="field"><label>Valor</label><input name="amount" inputmode="decimal" placeholder="0,00" required></div>
            <div class="field"><label>Data</label><input name="date" type="date" value="${today()}" required></div>
            <div class="field benefit-description"><label>Descrição</label><input name="description" placeholder="Ex.: Crédito mensal"></div>
            <button class="primary-button" type="submit">${plusIcon} Adicionar crédito</button>
          </form>
        </section>

        <section class="card benefit-form-card">
          <div class="section-head"><div><p class="eyebrow">Uso</p><h3 class="section-title">Registrar gasto</h3><small>Desconta somente do vale escolhido.</small></div></div>
          <form class="benefit-form" id="benefitExpenseForm">
            <div class="field"><label>Vale</label><select name="walletId" required>${walletOptions()}</select></div>
            <div class="field"><label>Valor</label><input name="amount" inputmode="decimal" placeholder="0,00" required></div>
            <div class="field"><label>Data</label><input name="date" type="date" value="${today()}" required></div>
            <div class="field benefit-description"><label>Onde usou?</label><input name="description" placeholder="Ex.: Mercado, restaurante, posto" required></div>
            <button class="secondary-button" type="submit">${minusIcon} Registrar uso</button>
          </form>
        </section>
      </div>

      <section class="card benefit-history">
        <div class="section-head"><div><p class="eyebrow">Movimentações</p><h3 class="section-title">Histórico dos vales</h3><span class="section-subtitle">Entradas e usos não aparecem como dinheiro da Conta principal.</span></div><span class="badge">${data.cloud?"Nuvem":"Local"}</span></div>
        ${txs.length ? txs.map(tx => { const wallet=walletById(tx.wallet_id); const incoming=tx.kind==="income"; return `<div class="benefit-history-row"><div class="benefit-history-icon">${incoming?plusIcon:minusIcon}</div><div class="benefit-history-copy"><strong>${esc(tx.description)}</strong><small>${esc(wallet?.name||"Vale")} · ${shortDate(tx.occurred_on)}</small></div><strong class="benefit-value ${incoming?"income":"expense"}">${incoming?"+":"-"}${money(tx.amount)}</strong></div>`; }).join("") : `<div class="benefit-empty">Nenhuma movimentação de vale ainda.</div>`}
      </section>`;

    page.querySelector("#benefitCreditForm")?.addEventListener("submit", event => submitBenefit(event,"income"));
    page.querySelector("#benefitExpenseForm")?.addEventListener("submit", event => submitBenefit(event,"expense"));
  }

  function parseAmount(value) {
    let raw = String(value || "").trim().replace(/\s/g,"").replace(/R\$/gi,"");
    if (raw.includes(",") && raw.includes(".")) raw=raw.replace(/\./g,"").replace(",",".");
    else raw=raw.replace(",",".");
    return Number(raw);
  }

  async function submitBenefit(event, kind) {
    event.preventDefault();
    const form = event.currentTarget;
    const walletId = form.elements.walletId.value;
    const amount = parseAmount(form.elements.amount.value);
    const date = form.elements.date.value || today();
    const description = form.elements.description.value.trim() || (kind==="income"?"Crédito de vale":"Uso do vale");
    if (!Number.isFinite(amount) || amount <= 0) { showToast("Informe um valor válido.","error"); return; }
    const wallet = walletById(walletId);
    if (!wallet) { showToast("Escolha um vale.","error"); return; }
    if (kind === "expense" && amount > Number(wallet.balance || 0)) { showToast(`Saldo insuficiente em ${wallet.name}.`,"error"); return; }
    const button = form.querySelector("button[type=submit]");
    const old = button.innerHTML;
    button.disabled = true;
    button.textContent = "Salvando...";
    try {
      if (data.cloud && window.ENCCloud?.client) {
        const { error } = await window.ENCCloud.client.rpc("apply_benefit_transaction", {
          p_wallet_id: walletId,
          p_kind: kind,
          p_amount: amount,
          p_description: description,
          p_occurred_on: date,
          p_note: null
        });
        if (error) throw error;
        await loadData(false);
      } else {
        wallet.balance = Number(wallet.balance || 0) + (kind==="income"?amount:-amount);
        data.transactions.unshift({id:`local-${Date.now()}`,wallet_id:walletId,kind,amount,description,occurred_on:date,created_at:new Date().toISOString()});
        saveLocal();
      }
      renderPage();
      showToast(kind==="income"?"Crédito adicionado ao vale.":"Uso do vale registrado.","success");
    } catch (error) {
      console.error("Falha ao salvar vale",error);
      const msg = /insufficient_benefit_balance/i.test(error?.message||"") ? "Saldo insuficiente neste vale." : (error?.message || "Não foi possível salvar agora.");
      showToast(msg,"error");
    } finally {
      button.disabled = false;
      button.innerHTML = old;
    }
  }

  function patchDashboard() {
    const form = document.getElementById("dashboardBalanceForm");
    const select = form?.querySelector('select[name="balanceSource"]');
    if (select) {
      [...select.options].forEach(option => {
        if (/vale|\bvr\b/i.test(option.textContent || "")) option.remove();
      });
    }
    const card = document.querySelector("#page-dashboard .dashboard-balance-card .section-subtitle");
    if (card && /vale/i.test(card.textContent || "")) card.textContent = "Salário, adiantamento, renda extra ou outro dinheiro disponível";
  }

  function setBenefitsTitle() {
    const page = document.getElementById("page-benefits");
    if (!page?.classList.contains("is-active")) return;
    const title = document.getElementById("pageTitle");
    if (title) title.textContent = "Vales";
    const action = document.getElementById("pageAction");
    if (action) {
      action.innerHTML = walletIcon;
      action.dataset.action = "none";
      action.setAttribute("aria-label","Vales separados");
    }
  }

  async function benefitSnapshot() {
    await loadData(false);
    return {
      total: Number(data.wallets.reduce((s,w)=>s+Number(w.balance||0),0).toFixed(2)),
      wallets: data.wallets.map(w=>({kind:w.kind,name:w.name,balance:Number(w.balance||0)})),
      recent: data.transactions.slice(0,10).map(t=>({wallet:walletById(t.wallet_id)?.name||"Vale",kind:t.kind,amount:Number(t.amount||0),description:t.description,date:t.occurred_on}))
    };
  }

  function installAIHook() {
    const cloud = window.ENCCloud;
    if (!cloud?.askFinancialAI || cloud.askFinancialAI.__benefitsWrapped) return false;
    const previous = cloud.askFinancialAI.bind(cloud);
    const wrapped = async (question,snapshot,history=[]) => {
      const benefits = await benefitSnapshot();
      const q = normalize(question);
      if (/\b(vale|vales|vr|va|beneficio|beneficios)\b/.test(q)) {
        const details = benefits.wallets.map(w=>`${w.name}: ${money(w.balance)}`).join("; ");
        return { answer:`Seus vales ficam separados do dinheiro da conta. Saldo total em benefícios: ${money(benefits.total)}. ${details}. Esses valores não entram no saldo disponível para pagar contas, faturas ou boletos.`, remaining:Number(snapshot?.aiUsage?.remaining||0), limit:30, model:"financial-core+benefits" };
      }
      return previous(question,{...(snapshot||{}),benefits},history);
    };
    wrapped.__benefitsWrapped = true;
    cloud.askFinancialAI = wrapped;
    return true;
  }

  function scheduleSetup() {
    [0,120,500,1200].forEach(ms=>setTimeout(()=>{
      ensureNav();
      ensurePage();
      patchDashboard();
      installAIHook();
    },ms));
  }

  function start() {
    injectStyles();
    scheduleSetup();
    loadData();
    let attempts=0;
    const aiTimer=setInterval(()=>{attempts++;if(installAIHook()||attempts>30)clearInterval(aiTimer);},250);

    document.addEventListener("click", event => {
      const nav = event.target.closest('[data-page-target="benefits"]');
      if (nav) {
        setTimeout(async()=>{ensureNav();setBenefitsTitle();await loadData();},30);
        return;
      }
      if (event.target.closest('[data-page-target="dashboard"]')) setTimeout(patchDashboard,40);
      if (event.target.closest('[data-page-target]') && !nav) setTimeout(()=>{ensureNav();patchDashboard();},80);
    });

    window.addEventListener("focus",()=>{
      if(document.getElementById("page-benefits")?.classList.contains("is-active")) loadData();
    });

    window.ENCBenefits = { reload:loadData, snapshot:benefitSnapshot };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();
