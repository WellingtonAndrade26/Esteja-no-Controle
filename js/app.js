(() => {
  "use strict";

  const STORAGE_KEY = "estejaNoControle.app";
  const LEGACY_KEYS = ["estejaNoControle.v19","estejaNoControle.v18","estejaNoControle.v17","estejaNoControle.v16","estejaNoControle.v15","estejaNoControle.v14","estejaNoControle.v13","estejaNoControle.v12","estejaNoControle.v11","estejaNoControle.v10","estejaNoControle.v9","estejaNoControle.v8","estejaNoControle.v7","estejaNoControle.v6","estejaNoControle.v5","estejaNoControle.v3","estejaNoControle.v1"];
  const THEME_KEY = "estejaNoControle.theme";
  const cloud = window.ENCCloud || { configured:false };
  const now = new Date();

  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const uid = () => (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const icon = name => window.ENCIcons?.get?.(name) || "";
  const financeCore = window.ENCFinanceCore || {};

  const categoryNames = {
    income: ["Salário", "VR", "Adiantamento", "Freelance", "Renda extra", "Outros"],
    expense: ["Alimentação", "Moradia", "Transporte", "Lazer", "Saúde", "Casa", "Assinaturas", "Outros"]
  };

  const navItems = [
    {id:"dashboard", label:"Início", icon:"home"},
    {id:"transactions", label:"Transações", icon:"transactions"},
    {id:"planning", label:"Planejamento", icon:"planning"},
    {id:"cards", label:"Cartões", icon:"cards"},
    {id:"ai", label:"IA", icon:"ai"}
  ];

  const pageNames = {
    dashboard:"Início", transactions:"Transações", planning:"Planejamento",
    cards:"Cartões e Patrimônio", ai:"IA Financeira", reports:"Relatórios", settings:"Configurações"
  };

  const entityArrays = {
    goal:"goals", budget:"budgets", installment:"installments", recurring:"recurring",
    card:"cards", debt:"debts", asset:"assets", account:"accounts", cardPurchase:"cardPurchases",
    goalContribution:"goalContributions", transfer:"transfers", invoicePayment:"invoicePayments",
    subscription:"subscriptions", bill:"bills", futureTransaction:"futureTransactions"
  };

  let state = loadLocalState();
  let runtimeMode = "local";
  let currentPage = "dashboard";
  let transactionFilter = "all";
  let transactionSearch = "";
  let transactionLimit = 24;
  let planningBillsLimit = 12;
  let planningFutureLimit = 12;
  let planningCommitmentSearch = "";
  let planningCommitmentFilter = "all";
  let cardPurchaseSearch = "";
  let cardPurchaseFilter = "all";
  let editingTransactionId = null;
  let selectedCardId = null;
  let selectedInvoiceMonth = null;
  let invoicePaymentContext = null;
  let cloudSyncInFlight = false;
  let lastCloudSyncAt = null;
  let authSubscription = null;
  let deferredInstallPrompt = null;
  let accountActionType = null;
  let lastOnlineState = navigator.onLine;
  const APP_VERSION = window.ENC_CONFIG?.appVersion || "1.0.5";
  const APP_BUILD = "2026-08-17";
  let swRegistration = null;
  let appReloading = false;

  function ym(date = now) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
  }
  function ymd(day, date = now) {
    return `${ym(date)}-${String(day).padStart(2,"0")}`;
  }
  function monthStart(date = now) { return `${ym(date)}-01`; }
  function monthLabel(date = now) {
    return new Intl.DateTimeFormat("pt-BR", { month:"long", year:"numeric" }).format(date);
  }
  function money(value) {
    return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(value || 0));
  }
  function shortDate(value) {
    if (!value) return "Sem data";
    return new Intl.DateTimeFormat("pt-BR", {day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(`${value}T12:00:00`));
  }
  function initials(name) {
    return (name || "Usuário").trim().split(/\s+/).slice(0,2).map(n => n[0]?.toUpperCase()).join("") || "U";
  }
  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  }
  function parseMoneyInput(value) {
    let v = String(value ?? "").trim().replace(/\s/g, "").replace(/R\$/gi, "");
    if (v.includes(",") && v.includes(".")) v = v.replace(/\./g, "").replace(",", ".");
    else if (v.includes(",")) v = v.replace(",", ".");
    return Number(v);
  }
  function numberInput(value) { return Number(String(value ?? "").replace(",", ".")); }

  function publicBaseUrl() {
    const configured = String(window.ENC_CONFIG?.publicBaseUrl || "").trim().replace(/\/+$/, "");
    if (configured) return configured;
    if (location.protocol === "http:" || location.protocol === "https:") return new URL("./", location.href).href.replace(/\/+$/, "");
    return "";
  }

  function productionState() {
    const url = publicBaseUrl();
    const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);
    return { url, published: Boolean(url && location.protocol === "https:" && !localHost), secure: Boolean(window.isSecureContext) };
  }

  function ensureUpdateBanner() {
    let banner = $("#appUpdateBanner");
    if (banner) return banner;
    banner = document.createElement("aside");
    banner.id = "appUpdateBanner";
    banner.className = "app-update-banner";
    banner.hidden = true;
    banner.innerHTML = `<div><strong>Nova versão disponível</strong><span>Atualize para usar as correções mais recentes.</span></div><button type="button" data-apply-app-update>Atualizar agora</button>`;
    document.body.appendChild(banner);
    return banner;
  }

  function showUpdateBanner() {
    const banner = ensureUpdateBanner();
    banner.hidden = false;
  }

  function hideUpdateBanner() {
    const banner = $("#appUpdateBanner");
    if (banner) banner.hidden = true;
  }

  function activateWaitingServiceWorker() {
    if (swRegistration?.waiting) {
      swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
      return;
    }
    location.reload();
  }

  async function forceAppRefresh() {
    const button = document.querySelector("[data-force-app-update]");
    if (button) { button.disabled = true; button.textContent = "Atualizando..."; }
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith("esteja-no-controle-")).map(key => caches.delete(key)));
      }
      if (swRegistration) {
        await swRegistration.update();
        if (swRegistration.waiting) {
          swRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
          return;
        }
      }
      const url = new URL(location.href);
      url.searchParams.set("atualizacao", Date.now().toString());
      location.replace(url.toString());
    } catch (err) {
      console.error("Falha ao forçar atualização", err);
      showToast("Não foi possível atualizar agora. Verifique sua conexão.", "error");
      if (button) { button.disabled = false; button.textContent = "Atualizar agora"; }
    }
  }

  async function checkForAppUpdate(showResult = false) {
    if (!("serviceWorker" in navigator) || !swRegistration) {
      if (showResult) showToast("Atualizações automáticas ficam disponíveis quando o app é aberto por HTTP/HTTPS.", "error");
      return false;
    }
    try {
      await swRegistration.update();
      if (swRegistration.waiting) { showUpdateBanner(); return true; }
      const response = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const remote = await response.json();
        if (remote?.version && remote.version !== APP_VERSION) { showUpdateBanner(); return true; }
      }
      if (showResult) showToast("Você já está usando a versão mais recente.", "success");
      return false;
    } catch (err) {
      console.error("Falha ao verificar atualização", err);
      if (showResult) showToast("Não foi possível verificar atualizações agora.", "error");
      return false;
    }
  }

  function bindServiceWorkerRegistration(registration) {
    swRegistration = registration;
    if (registration.waiting) showUpdateBanner();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner();
      });
    });
  }

  function buildDefaultState() {
    const mainAccountId=uid(), walletAccountId=uid();
    const mainCardId=uid(), secondCardId=uid();
    const reserveGoalId=uid(), travelGoalId=uid();
    return {
      version:19,
      mode:"local",
      user:{ name:"Wellington", email:"demo@controle.app", loggedIn:false },
      settings:{ theme:localStorage.getItem(THEME_KEY) || "dark", onboardingCompleted:localStorage.getItem("enc.onboardingCompleted")==="1", browserNotifications:localStorage.getItem("enc.browserNotifications")==="1", monthlySavingsTarget:Number(localStorage.getItem("enc.monthlySavingsTarget")||800), monthlyIncome:0, paydayDay:5, currency:"BRL", profileSetupCompleted:false, aiEnabled:localStorage.getItem("enc.aiEnabled")!=="0", aiUsage:{requests:0,limit:30,inputTokens:0,outputTokens:0} },
      accountBalance:2480.75,
      accounts:[
        {id:mainAccountId,name:"Conta principal",institution:"Banco principal",type:"bank",balance:2480.75,primary:true},
        {id:walletAccountId,name:"Carteira",institution:"Dinheiro",type:"cash",balance:320,primary:false}
      ],
      categories:[],
      transactions:[
        {id:uid(),description:"Salário",value:4000,type:"income",category:"Salário",date:ymd(5),recurring:true,accountId:mainAccountId},
        {id:uid(),description:"VR",value:600,type:"income",category:"VR",date:ymd(5),recurring:true,accountId:mainAccountId},
        {id:uid(),description:"Mercado",value:320.50,type:"expense",category:"Alimentação",date:ymd(6),accountId:mainAccountId},
        {id:uid(),description:"Aluguel",value:1200,type:"expense",category:"Moradia",date:ymd(8),recurring:true,accountId:mainAccountId},
        {id:uid(),description:"Internet",value:99.90,type:"expense",category:"Assinaturas",date:ymd(10),recurring:true,accountId:mainAccountId},
        {id:uid(),description:"Freelance",value:450,type:"income",category:"Freelance",date:ymd(11),accountId:mainAccountId},
        {id:uid(),description:"Combustível",value:150,type:"expense",category:"Transporte",date:ymd(12),accountId:mainAccountId},
        {id:uid(),description:"Farmácia",value:85.30,type:"expense",category:"Saúde",date:ymd(Math.min(now.getDate(), 13)),accountId:walletAccountId},
        {id:uid(),description:"Fatura cartão",value:840,type:"expense",category:"Cartão",date:ymd(5),accountId:mainAccountId},
        {id:uid(),description:"Salário",value:4000,type:"income",category:"Salário",date:`${monthKeyOffset(ym(),-1)}-05`,accountId:mainAccountId},
        {id:uid(),description:"Aluguel",value:1200,type:"expense",category:"Moradia",date:`${monthKeyOffset(ym(),-1)}-08`,accountId:mainAccountId},
        {id:uid(),description:"Mercado",value:510,type:"expense",category:"Alimentação",date:`${monthKeyOffset(ym(),-1)}-12`,accountId:mainAccountId},
        {id:uid(),description:"Salário",value:4000,type:"income",category:"Salário",date:`${monthKeyOffset(ym(),-2)}-05`,accountId:mainAccountId},
        {id:uid(),description:"Aluguel",value:1200,type:"expense",category:"Moradia",date:`${monthKeyOffset(ym(),-2)}-08`,accountId:mainAccountId},
        {id:uid(),description:"Mercado",value:460,type:"expense",category:"Alimentação",date:`${monthKeyOffset(ym(),-2)}-13`,accountId:mainAccountId},
        {id:uid(),description:"Salário",value:3900,type:"income",category:"Salário",date:`${monthKeyOffset(ym(),-3)}-05`,accountId:mainAccountId},
        {id:uid(),description:"Aluguel",value:1200,type:"expense",category:"Moradia",date:`${monthKeyOffset(ym(),-3)}-08`,accountId:mainAccountId},
        {id:uid(),description:"Mercado",value:575,type:"expense",category:"Alimentação",date:`${monthKeyOffset(ym(),-3)}-14`,accountId:mainAccountId}
      ],
      budgets:[
        {id:uid(),category:"Alimentação",limit:1600},
        {id:uid(),category:"Transporte",limit:700},
        {id:uid(),category:"Lazer",limit:400}
      ],
      goals:[
        {id:reserveGoalId,name:"Reserva de emergência",current:8250,target:12000,deadline:futureDate(7),icon:"🛡"},
        {id:travelGoalId,name:"Viagem dos sonhos",current:1250,target:5000,deadline:endOfYear(),icon:"✈"}
      ],
      goalContributions:[
        {id:uid(),goalId:reserveGoalId,amount:500,date:ymd(Math.max(1,now.getDate()-4)),note:"Aporte mensal"},
        {id:uid(),goalId:travelGoalId,amount:250,date:ymd(Math.max(1,now.getDate()-8)),note:"Economia do mês"}
      ],
      installments:[
        {id:uid(),name:"Geladeira",total:3000,installmentValue:300,paid:4,installments:10,nextDue:nextMonthDate(10),cardId:mainCardId,category:"Casa",paymentMethod:"credit_card"}
      ],
      recurring:[
        {id:uid(),name:"Salário",value:4000,type:"income",day:5,category:"Salário"},
        {id:uid(),name:"Aluguel",value:1200,type:"expense",day:8,category:"Moradia"},
        {id:uid(),name:"Internet",value:99.90,type:"expense",day:10,category:"Assinaturas"},
        {id:uid(),name:"Fatura cartão",value:840,type:"expense",day:20,category:"Casa"},
        {id:uid(),name:"Geladeira",value:300,type:"expense",day:25,category:"Casa"}
      ],
      subscriptions:[
        {id:uid(),name:"Netflix",value:44.90,day:18,category:"Assinaturas",active:true,accountId:mainAccountId,icon:"▶"},
        {id:uid(),name:"Spotify",value:21.90,day:23,category:"Assinaturas",active:true,accountId:mainAccountId,icon:"♫"},
        {id:uid(),name:"Armazenamento na nuvem",value:9.90,day:27,category:"Assinaturas",active:true,accountId:mainAccountId,icon:"☁"}
      ],
      bills:[
        {id:uid(),name:"Energia",value:245.80,dueDate:ymd(Math.min(28,now.getDate()+5)),category:"Casa",status:"pending",accountId:mainAccountId,barcode:""},
        {id:uid(),name:"Água",value:86.40,dueDate:nextMonthDate(6),category:"Casa",status:"pending",accountId:mainAccountId,barcode:""}
      ],
      futureTransactions:[
        {id:uid(),description:"Freelance previsto",value:700,type:"income",date:nextMonthDate(3),category:"Freelance",accountId:mainAccountId,status:"planned"},
        {id:uid(),description:"Manutenção do carro",value:450,type:"expense",date:nextMonthDate(12),category:"Transporte",accountId:mainAccountId,status:"planned"}
      ],
      cards:[
        {id:mainCardId,name:"Nubank",last4:"1234",brand:"VISA",limit:5000,used:3136.80,currentInvoice:1236.80,closingDay:25,dueDay:5,theme:"purple"},
        {id:secondCardId,name:"Inter",last4:"9087",brand:"MASTERCARD",limit:3500,used:620,currentInvoice:470,closingDay:20,dueDay:28,theme:"orange"}
      ],
      cardPurchases:[
        {id:uid(),cardId:mainCardId,description:"Mercado",amount:320.50,date:ymd(6),category:"Alimentação",installments:1,currentInstallment:1,invoiceMonth:ym()},
        {id:uid(),cardId:mainCardId,description:"Streaming",amount:49.90,date:ymd(7),category:"Assinaturas",installments:1,currentInstallment:1,invoiceMonth:ym()},
        {id:uid(),cardId:mainCardId,description:"Geladeira",amount:300,date:ymd(10),category:"Casa",installments:10,currentInstallment:4,invoiceMonth:ym(),seriesId:"demo-geladeira"},
        {id:uid(),cardId:mainCardId,description:"Geladeira",amount:300,date:ymd(10),category:"Casa",installments:10,currentInstallment:5,invoiceMonth:monthKeyOffset(ym(),1),seriesId:"demo-geladeira",future:true},
        {id:uid(),cardId:mainCardId,description:"Geladeira",amount:300,date:ymd(10),category:"Casa",installments:10,currentInstallment:6,invoiceMonth:monthKeyOffset(ym(),2),seriesId:"demo-geladeira",future:true},
        {id:uid(),cardId:mainCardId,description:"Farmácia",amount:85.30,date:ymd(13),category:"Saúde",installments:1,currentInstallment:1,invoiceMonth:ym()},
        {id:uid(),cardId:mainCardId,description:"Material de construção",amount:481.10,date:ymd(15),category:"Casa",installments:1,currentInstallment:1,invoiceMonth:ym()},
        {id:uid(),cardId:mainCardId,description:"Fatura anterior - compras",amount:540,date:`${monthKeyOffset(ym(),-1)}-09`,category:"Casa",installments:1,currentInstallment:1,invoiceMonth:monthKeyOffset(ym(),-1)},
        {id:uid(),cardId:mainCardId,description:"Geladeira",amount:300,date:`${monthKeyOffset(ym(),-1)}-10`,category:"Casa",installments:10,currentInstallment:3,invoiceMonth:monthKeyOffset(ym(),-1),seriesId:"demo-geladeira"},
        {id:uid(),cardId:mainCardId,description:"Fatura maio",amount:720,date:`${monthKeyOffset(ym(),-2)}-12`,category:"Casa",installments:1,currentInstallment:1,invoiceMonth:monthKeyOffset(ym(),-2)},
        {id:uid(),cardId:secondCardId,description:"Combustível",amount:150,date:ymd(12),category:"Transporte",installments:1,currentInstallment:1,invoiceMonth:ym()},
        {id:uid(),cardId:secondCardId,description:"Loja online",amount:320,date:ymd(14),category:"Casa",installments:2,currentInstallment:1,invoiceMonth:ym(),seriesId:"demo-loja"},
        {id:uid(),cardId:secondCardId,description:"Loja online",amount:320,date:ymd(14),category:"Casa",installments:2,currentInstallment:2,invoiceMonth:monthKeyOffset(ym(),1),seriesId:"demo-loja",future:true}
      ],
      invoicePayments:[
        {id:uid(),cardId:mainCardId,invoiceMonth:monthKeyOffset(ym(),-1),accountId:mainAccountId,amount:840,paidOn:ymd(5),note:"Fatura paga integralmente"},
        {id:uid(),cardId:mainCardId,invoiceMonth:monthKeyOffset(ym(),-2),accountId:mainAccountId,amount:720,paidOn:`${monthKeyOffset(ym(),-1)}-05`,note:"Fatura paga integralmente"}
      ],
      transfers:[
        {id:uid(),fromAccountId:mainAccountId,toAccountId:walletAccountId,amount:200,date:ymd(Math.max(1,now.getDate()-2)),note:"Dinheiro para despesas do dia"}
      ],
      debts:[{id:uid(),name:"Loja",balance:1750,installment:250,interestRate:0}],
      assets:[
        {id:uid(),name:"Investimentos",value:12450,kind:"investimento"},
        {id:uid(),name:"Veículo",value:32000,kind:"veiculo"}
      ],
      chat:[{role:"bot",text:"Olá! Sou sua IA Financeira local. Posso analisar gastos, contas, cartões, metas, saldo projetado, dívidas e dizer se uma compra cabe no seu mês."}]
    };
  }

  function futureDate(months) {
    const d = new Date(now.getFullYear(), now.getMonth()+months, 28);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function nextMonthDate(day) {
    const d = new Date(now.getFullYear(), now.getMonth()+1, day);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function endOfYear() { return `${now.getFullYear()}-12-31`; }
  function monthKeyOffset(baseMonth=ym(), offset=0) {
    const [y,m]=String(baseMonth).split("-").map(Number);
    const d=new Date(y,m-1+offset,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }
  function monthKeyLabel(key) {
    const [y,m]=String(key).split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR",{month:"short",year:"2-digit"}).format(new Date(y,m-1,1)).replace(" de ","/");
  }
  function invoiceMonthForPurchase(cardId,dateValue) {
    const card=cardById(cardId);
    const date=new Date(`${dateValue}T12:00:00`);
    const base=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
    return date.getDate()>Number(card?.closingDay||25)?monthKeyOffset(base,1):base;
  }

  function normalizeLegacy(parsed) {
    const next = buildDefaultState();
    const merged = {...next, ...parsed, version:19};
    merged.settings = {...next.settings, ...(parsed.settings || {})};
    merged.settings.aiEnabled = parsed.settings?.aiEnabled !== undefined ? Boolean(parsed.settings.aiEnabled) : localStorage.getItem("enc.aiEnabled")!=="0";
    merged.settings.aiUsage = {...next.settings.aiUsage, ...(parsed.settings?.aiUsage || {})};
    merged.user = {...next.user, ...(parsed.user || {})};
    for (const key of ["transactions","budgets","goals","installments","recurring","cards","debts","assets","chat","accounts","cardPurchases","goalContributions","transfers","invoicePayments","subscriptions","bills","futureTransactions"]) {
      if (Array.isArray(parsed[key])) merged[key] = parsed[key].map(item => ({...item, id:item.id || uid()}));
    }
    if(!Array.isArray(parsed.accounts) || !parsed.accounts.length){
      const accountId=uid();
      merged.accounts=[{id:accountId,name:"Conta principal",institution:"Principal",type:"bank",balance:Number(parsed.accountBalance ?? next.accountBalance),primary:true}];
      merged.transactions=merged.transactions.map(tx=>({...tx,accountId:tx.accountId||accountId}));
    }
    merged.accounts=merged.accounts.map((a,i)=>({...a,primary:a.primary ?? i===0,balance:Number(a.balance||0),institution:a.institution||""}));
    merged.accountBalance=Number(merged.accounts.find(a=>a.primary)?.balance ?? merged.accounts[0]?.balance ?? parsed.accountBalance ?? 0);
    merged.cards = merged.cards.map(c => ({...c, used:c.used ?? Math.max(0, Number(c.limit||0)-Number(c.available||0)), closingDay:c.closingDay || Number(String(c.closes||"").split("/")[0]) || 25, dueDay:c.dueDay || Number(String(c.due||"").split("/")[0]) || 5, theme:c.theme||"purple"}));
    const firstCard=merged.cards[0]?.id || null;
    merged.installments=merged.installments.map(i=>({...i,cardId:i.cardId||firstCard,category:i.category||"Casa",paymentMethod:i.paymentMethod||"credit_card"}));
    if(!Array.isArray(parsed.cardPurchases)){
      merged.cardPurchases=firstCard?[{id:uid(),cardId:firstCard,description:"Geladeira",amount:300,date:ymd(10),category:"Casa",installments:10,currentInstallment:4,invoiceMonth:ym()}]:[];
    }
    if(!Array.isArray(parsed.goalContributions))merged.goalContributions=[];
    if(!Array.isArray(parsed.transfers))merged.transfers=[];
    if(!Array.isArray(parsed.invoicePayments))merged.invoicePayments=[];
    if(!Array.isArray(parsed.subscriptions))merged.subscriptions=next.subscriptions;
    if(!Array.isArray(parsed.bills))merged.bills=next.bills;
    if(!Array.isArray(parsed.futureTransactions))merged.futureTransactions=next.futureTransactions;
    return merged;
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalizeLegacy(JSON.parse(raw));
      for(const key of LEGACY_KEYS){
        const legacy=localStorage.getItem(key);
        if(legacy) return normalizeLegacy(JSON.parse(legacy));
      }
    } catch {}
    return buildDefaultState();
  }

  function saveLocalState() {
    if (runtimeMode !== "local") return;
    state.version = 15;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function accountsList(){return Array.isArray(state.accounts)&&state.accounts.length?state.accounts:[];}
  function primaryAccount(){return accountsList().find(a=>a.primary)||accountsList()[0]||null;}
  function totalAccountBalance(){const list=accountsList();return list.length?list.reduce((s,a)=>s+Number(a.balance||0),0):Number(state.accountBalance||0);}
  function accountById(id){return accountsList().find(a=>String(a.id)===String(id))||primaryAccount();}
  function syncLegacyAccountBalance(){const p=primaryAccount();state.accountBalance=Number(p?.balance||0);}
  function applyAccountDelta(accountId,delta){const account=accountById(accountId);if(account){account.balance=Number(account.balance||0)+Number(delta||0);syncLegacyAccountBalance();}else state.accountBalance=Number(state.accountBalance||0)+Number(delta||0);}
  function accountOptions(selected=""){return accountsList().map(a=>option(a.id,`${a.name}${a.institution?` · ${a.institution}`:""}`,selected||primaryAccount()?.id)).join("");}
  function cardOptions(selected="",allowNone=false){const none=allowNone?option("","Sem cartão",selected):"";return none+(state.cards||[]).map(c=>option(c.id,`${c.name} •••• ${c.last4||"0000"}`,selected)).join("");}
  function goalOptions(selected=""){return (state.goals||[]).map(g=>option(g.id,g.name,selected)).join("");}
  function cardById(id){return (state.cards||[]).find(c=>String(c.id)===String(id))||state.cards?.[0]||null;}
  function cardPurchases(cardId,month=ym()){return (state.cardPurchases||[]).filter(p=>String(p.cardId)===String(cardId)&&(!month||String(p.invoiceMonth||ym()).startsWith(month)));}
  function cardInvoiceTotal(cardId,month=ym()){const list=cardPurchases(cardId,month);return list.length?list.reduce((s,p)=>s+Number(p.amount||0),0):(String(month)===String(ym())?Number(cardById(cardId)?.currentInvoice||0):0);}
  function invoicePayments(cardId,month=null){return (state.invoicePayments||[]).filter(p=>String(p.cardId)===String(cardId)&&(!month||String(p.invoiceMonth)===String(month)));}
  function invoicePaidTotal(cardId,month){return invoicePayments(cardId,month).reduce((s,p)=>s+Number(p.amount||0),0);}
  function invoiceBalance(cardId,month){return Math.max(0,cardInvoiceTotal(cardId,month)-invoicePaidTotal(cardId,month));}
  function invoiceStatus(cardId,month){
    const total=cardInvoiceTotal(cardId,month), paid=invoicePaidTotal(cardId,month), card=cardById(cardId);
    if(total>0 && paid>=total-.005)return "paid";
    if(String(month)>String(ym()))return "future";
    if(String(month)<String(ym()))return "closed";
    return now.getDate()>Number(card?.closingDay||25)?"closed":"open";
  }
  function invoiceStatusLabel(status){return {paid:"Paga",closed:"Fechada",future:"Futura",open:"Aberta"}[status]||"Aberta";}
  function invoiceDueDate(cardId,month){
    const card=cardById(cardId), [y,m]=String(month).split("-").map(Number);
    const offset=Number(card?.dueDay||5)<=Number(card?.closingDay||25)?1:0;
    const d=new Date(y,m-1+offset,Math.min(Number(card?.dueDay||5),28));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function invoiceMonthsForCard(cardId){
    const set=new Set();
    for(let i=-3;i<=3;i++)set.add(monthKeyOffset(ym(),i));
    cardPurchases(cardId,null).forEach(p=>p.invoiceMonth&&set.add(String(p.invoiceMonth).slice(0,7)));
    invoicePayments(cardId).forEach(p=>p.invoiceMonth&&set.add(String(p.invoiceMonth).slice(0,7)));
    return [...set].sort();
  }
  function cardUsedAmount(cardId){const c=cardById(cardId);const purchaseOutstanding=(state.installments||[]).filter(i=>String(i.cardId)===String(cardId)).reduce((s,i)=>s+Math.max(0,(Number(i.installments||0)-Number(i.paid||0))*Number(i.installmentValue||0)),0);return Math.max(Number(c?.used||0),invoiceBalance(cardId,ym())+purchaseOutstanding);}
  function accountName(id){return accountById(id)?.name||"Conta principal";}
  function cardName(id){return cardById(id)?.name||"Cartão";}

  function setTheme(theme) {
    state.settings = state.settings || {};
    state.settings.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    document.body.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if ($("#themeToggle")) $("#themeToggle").textContent = theme === "dark" ? "☀" : "☾";
    saveLocalState();
  }

  function showToast(message, type="info") {
    const toast = $("#toast");
    toast.textContent = message;
    toast.dataset.type = type;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function setBusy(button, busy, label="Aguarde...") {
    if (!button) return;
    if (busy) {
      button.dataset.oldText = button.textContent;
      button.textContent = label;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.oldText || button.textContent;
      button.disabled = false;
    }
  }

  function monthTransactions() {
    return (state.transactions || []).filter(tx => String(tx.date || "").startsWith(ym()));
  }
  function totals() {
    const txs = monthTransactions();
    return {
      income: txs.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.value||0),0),
      expense: txs.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.value||0),0)
    };
  }
  function budgetSpent(budget) {
    return monthTransactions().filter(t=>t.type==="expense" && t.category===budget.category).reduce((s,t)=>s+Number(t.value||0),0);
  }

  function activeInstallments(){
    return financeCore.activeInstallments ? financeCore.activeInstallments(state.installments||[]) : (state.installments||[]).filter(i=>Number(i.paid||0)<Number(i.installments||0));
  }
  function monthlyInstallmentCommitment(){
    return financeCore.monthlyInstallmentCommitment ? financeCore.monthlyInstallmentCommitment(state.installments||[]) : activeInstallments().reduce((sum,i)=>sum+Number(i.installmentValue||0),0);
  }
  function outstandingInstallmentBalance(){
    return financeCore.outstandingInstallmentBalance ? financeCore.outstandingInstallmentBalance(state.installments||[]) : activeInstallments().reduce((sum,i)=>{
      const remaining=Math.max(0,Number(i.installments||0)-Number(i.paid||0));
      return sum+(remaining*Number(i.installmentValue||0));
    },0);
  }
  function recordedInstallmentExpenseThisMonth(){
    return monthTransactions().filter(t=>t.type==="expense"&&t.installment).reduce((sum,t)=>sum+Number(t.value||0),0);
  }
  function unrecordedInstallmentCommitment(){
    return Math.max(0,monthlyInstallmentCommitment()-recordedInstallmentExpenseThisMonth());
  }
  function balanceAfterInstallments(){
    return totalAccountBalance()-unrecordedInstallmentCommitment();
  }
  function dashboardExpenseTotal(){
    return totals().expense+unrecordedInstallmentCommitment();
  }

  function projectedBalance() {
    const today = now.getDate(), currentMonth=ym();
    const recurringFuture = (state.recurring || []).filter(r=>Number(r.day)>today).reduce((s,r)=>s+(r.type==="income"?Number(r.value||0):-Number(r.value||0)),0);
    const plannedFuture=(state.futureTransactions||[]).filter(f=>f.status!=="posted"&&String(f.date||"").startsWith(currentMonth)&&Number(String(f.date).slice(-2))>=today).reduce((s,f)=>s+(f.type==="income"?Number(f.value||0):-Number(f.value||0)),0);
    const pendingBills=(state.bills||[]).filter(b=>b.status!=="paid"&&String(b.dueDate||"").startsWith(currentMonth)&&Number(String(b.dueDate).slice(-2))>=today).reduce((s,b)=>s+Number(b.value||0),0);
    const subscriptionFuture=(state.subscriptions||[]).filter(s=>s.active&&Number(s.day)>=today).reduce((sum,s)=>sum+Number(s.value||0),0);
    const installmentCommitment=unrecordedInstallmentCommitment();
    return totalAccountBalance()+recurringFuture+plannedFuture-pendingBills-subscriptionFuture-installmentCommitment;
  }

  function optionalSpendingCapacity(){
    const projected=projectedBalance();
    const savingsTarget=Math.max(0,Number(state.settings?.monthlySavingsTarget||0));
    return Math.max(0,projected-savingsTarget);
  }

  function extractPurchaseAmount(text){
    const raw=String(text||"");
    const matches=[...raw.matchAll(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/gi)];
    if(!matches.length)return null;
    const values=matches.map(m=>{let s=m[1].trim();if(s.includes(","))s=s.replace(/\./g,"").replace(",",".");return Number(s);}).filter(v=>Number.isFinite(v)&&v>0);
    return values.length?values[values.length-1]:null;
  }

  function purchaseDecision(amount){
    const args={amount,projectedBalance:projectedBalance(),savingsTarget:Math.max(0,Number(state.settings?.monthlySavingsTarget||0))};
    return financeCore.purchaseDecision ? financeCore.purchaseDecision(args) : {amount:Number(amount||0),projectedBefore:args.projectedBalance,projectedAfter:args.projectedBalance-Number(amount||0),savingsTarget:args.savingsTarget,availableForOptionalSpending:Math.max(0,args.projectedBalance-args.savingsTarget),remainingAboveSavingsTarget:args.projectedBalance-Number(amount||0)-args.savingsTarget,status:(args.projectedBalance-Number(amount||0)<0?"does_not_fit":args.projectedBalance-Number(amount||0)<args.savingsTarget?"hurts_savings_goal":"fits")};
  }
  function biggestExpenseCategory() {
    const sums = {};
    monthTransactions().filter(t=>t.type==="expense").forEach(t => sums[t.category]=(sums[t.category]||0)+Number(t.value||0));
    return Object.entries(sums).sort((a,b)=>b[1]-a[1])[0] || ["Sem gastos",0];
  }

  function dayDiff(dateValue){
    if(!dateValue)return 999;
    const a=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    const b=new Date(`${dateValue}T12:00:00`);
    return Math.ceil((b-a)/86400000);
  }
  function nextOccurrence(day){
    let d=new Date(now.getFullYear(),now.getMonth(),Number(day)||1);
    const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    if(d<today)d=new Date(now.getFullYear(),now.getMonth()+1,Number(day)||1);
    return d;
  }
  function generatedNotifications(){
    const items=[];
    (state.budgets||[]).forEach(b=>{const spent=budgetSpent(b),pct=Math.round(spent/Math.max(Number(b.limit||1),1)*100);if(pct>=80)items.push({kind:pct>=100?"danger":"warning",icon:pct>=100?"!":"◔",title:`Orçamento de ${b.category}`,text:pct>=100?`Você ultrapassou o limite em ${money(spent-Number(b.limit||0))}.`:`Você já usou ${pct}% do limite de ${money(b.limit)}.`});});
    (state.installments||[]).forEach(i=>{const diff=dayDiff(i.nextDue);if(diff>=0&&diff<=7)items.push({kind:"info",icon:"▣",title:`Parcela de ${i.name}`,text:`${money(i.installmentValue)} vence ${diff===0?"hoje":diff===1?"amanhã":`em ${diff} dias`}.`});});
    (state.cards||[]).forEach(c=>{const due=nextOccurrence(c.dueDay||5),diff=Math.ceil((due-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);if(diff>=0&&diff<=7)items.push({kind:"card",icon:"▭",title:`Fatura ${c.name}`,text:`${money(cardInvoiceTotal(c.id))} vence ${diff===0?"hoje":diff===1?"amanhã":`em ${diff} dias`}.`});});
    (state.recurring||[]).filter(r=>r.type==="expense").forEach(r=>{const d=nextOccurrence(r.day),diff=Math.ceil((d-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);if(diff>=0&&diff<=7)items.push({kind:"info",icon:"⌁",title:r.name,text:`Conta recorrente de ${money(r.value)} ${diff===0?"vence hoje":diff===1?"vence amanhã":`vence em ${diff} dias`}.`});});
    (state.bills||[]).filter(b=>b.status!=="paid").forEach(b=>{const diff=dayDiff(b.dueDate);if(diff<0)items.push({kind:"danger",icon:"!",title:`${b.name} em atraso`,text:`${money(b.value)} venceu há ${Math.abs(diff)} dia${Math.abs(diff)!==1?"s":""}.`});else if(diff<=7)items.push({kind:"warning",icon:"▤",title:`Conta: ${b.name}`,text:`${money(b.value)} ${diff===0?"vence hoje":diff===1?"vence amanhã":`vence em ${diff} dias`}.`});});
    (state.subscriptions||[]).filter(s=>s.active).forEach(s=>{const d=nextOccurrence(s.day),diff=Math.ceil((d-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/86400000);if(diff>=0&&diff<=3)items.push({kind:"info",icon:"◉",title:`Assinatura: ${s.name}`,text:`Renovação de ${money(s.value)} ${diff===0?"hoje":diff===1?"amanhã":`em ${diff} dias`}.`});});
    if(!items.length)items.push({kind:"success",icon:"✓",title:"Tudo sob controle",text:"Nenhum alerta financeiro crítico nos próximos dias."});
    return items.slice(0,12);
  }
  function notificationMarkup(item){return `<div class="notification-item ${item.kind}"><span class="notification-icon">${item.icon}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></div></div>`;}
  function openNotifications(){const list=$("#notificationsList");if(list)list.innerHTML=generatedNotifications().map(notificationMarkup).join("");$("#notificationsBackdrop").hidden=false;}
  function closeNotifications(){$("#notificationsBackdrop").hidden=true;}


  let onboardingStep=0;
  const onboardingSteps=[
    {icon:"✦",title:"Bem-vindo ao Esteja no Controle",text:"Organize seu dinheiro, acompanhe contas, parcelas, metas e cartões em um só lugar.",bullets:["Dashboard inteligente","Planejamento do mês","IA financeira"]},
    {icon:"◎",title:"Planeje antes de gastar",text:"Defina metas, acompanhe parcelas e use o saldo projetado para saber como o mês tende a terminar.",bullets:["Metas com progresso","Parcelas detalhadas","Orçamento por categoria"]},
    {icon:"▭",title:"Cartões e faturas organizados",text:"Visualize faturas mensais, compras parceladas, pagamentos e limite disponível com clareza.",bullets:["Múltiplos cartões","Histórico de faturas","Pagamento por conta"]},
    {icon:"▤",title:"Contas, assinaturas e futuro",text:"Controle boletos, assinaturas mensais e lançamentos que ainda vão acontecer sem perder a visão do seu mês.",bullets:["Contas a pagar","Assinaturas recorrentes","Lançamentos futuros"]},
    {icon:"🔔",title:"Ative alertas importantes",text:"Você pode permitir notificações do navegador para receber avisos quando estiver usando o aplicativo.",bullets:["Vencimentos próximos","Orçamentos no limite","Faturas, contas e parcelas"]}
  ];
  function renderOnboardingStep(){
    const step=onboardingSteps[onboardingStep]||onboardingSteps[0],wrap=$("#onboardingContent");
    if(!wrap)return;
    wrap.innerHTML=`<div class="onboarding-icon">${step.icon}</div><p class="eyebrow">Passo ${onboardingStep+1} de ${onboardingSteps.length}</p><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p><div class="onboarding-points">${step.bullets.map(x=>`<span>✓ ${escapeHtml(x)}</span>`).join("")}</div>`;
    $("#onboardingDots").innerHTML=onboardingSteps.map((_,i)=>`<span class="${i===onboardingStep?"is-active":""}"></span>`).join("");
    $("#onboardingNext").textContent=onboardingStep===onboardingSteps.length-1?"Começar":"Continuar";
  }
  function openOnboarding(force=false){
    if(!force && state.settings?.onboardingCompleted)return;
    onboardingStep=0;renderOnboardingStep();$("#onboardingBackdrop").hidden=false;
  }
  function closeOnboarding(markComplete=true){
    $("#onboardingBackdrop").hidden=true;
    if(markComplete){state.settings=state.settings||{};state.settings.onboardingCompleted=true;localStorage.setItem("enc.onboardingCompleted","1");saveLocalState();}
  }
  async function showBrowserNotification(title,body){
    if(!("Notification" in window)||Notification.permission!=="granted")return;
    try{
      const reg=await navigator.serviceWorker?.ready;
      if(reg?.showNotification)await reg.showNotification(title,{body,icon:"./assets/icon-192.png",badge:"./assets/icon-192.png",tag:"enc-alert"});
      else new Notification(title,{body,icon:"./assets/icon-192.png"});
    }catch(err){console.warn("Notificação indisponível",err);}
  }
  async function requestBrowserNotifications(){
    if(!("Notification" in window)){showToast("Este navegador não oferece notificações.","error");return;}
    const permission=await Notification.requestPermission();
    state.settings=state.settings||{};state.settings.browserNotifications=permission==="granted";localStorage.setItem("enc.browserNotifications",permission==="granted"?"1":"0");saveLocalState();renderSettings();
    if(permission==="granted"){
      await showBrowserNotification("Esteja no Controle","Notificações ativadas. Seus alertas financeiros ficaram mais fáceis de acompanhar.");
      showToast("Notificações ativadas.","success");
    }else showToast("Permissão de notificações não concedida.","error");
  }
  function notifyCriticalAlerts(){
    if(!state.settings?.browserNotifications||!("Notification" in window)||Notification.permission!=="granted")return;
    const alerts=generatedNotifications().filter(x=>x.kind!=="success");
    if(!alerts.length)return;
    const key=`enc.alert.${new Date().toISOString().slice(0,10)}`;
    if(localStorage.getItem(key))return;
    localStorage.setItem(key,"1");
    const first=alerts[0];showBrowserNotification(first.title,first.text);
  }
  function healthBreakdown() {
    const {income,expense}=totals();
    const reserve=(state.goals||[]).find(g=>/reserva/i.test(g.name))?.current || state.goals?.[0]?.current || 0;
    const debt=(state.debts||[]).reduce((s,d)=>s+Number(d.balance||0),0);
    const budgetCount=Math.max(state.budgets?.length||0,1);
    const budgetOk=(state.budgets||[]).filter(b=>budgetSpent(b)<=Number(b.limit||0)).length/budgetCount;
    const spending = income > 0 ? Math.round(Math.max(0, Math.min(200, 200 * (1 - Math.max(0,(expense/income)-.55))))) : (expense === 0 ? 120 : 0);
    const essential=Math.max(expense*.72,1);
    const reservePts=Math.round(Math.min(200,(Number(reserve)/(essential*6))*200));
    const debtPts=income>0?Math.round(Math.max(0,200-(debt/income)*60)):(debt?40:180);
    const organization=Math.round(130+70*budgetOk);
    const goals=state.goals||[];
    const goalsPts=goals.length?Math.round(Math.min(200,goals.reduce((s,g)=>s+Math.min(1,Number(g.current||0)/Math.max(Number(g.target||1),1)),0)/goals.length*200)):80;
    return {spending,reserve:reservePts,debt:debtPts,organization,goals:goalsPts};
  }
  function healthScore() {
    const h=healthBreakdown();
    return Math.max(0,Math.min(1000,h.spending+h.reserve+h.debt+h.organization+h.goals));
  }


  function setupNav() {
    const renderNav = items => items.map(item => `<button class="nav-button ${item.id===currentPage?"is-active":""}" data-page-target="${item.id}" aria-label="${item.label}"><span class="nav-icon">${icon(item.icon)}</span><span>${item.label}</span></button>`).join("");
    const mobileItems = [...navItems, {id:"settings", label:"Config.", icon:"settings"}];
    $("#bottomNav").innerHTML = renderNav(mobileItems);
    $("#desktopNav").innerHTML = renderNav(navItems);
  }

  function showPage(page) {
    currentPage=page;
    $$(".page").forEach(p=>p.classList.toggle("is-active",p.dataset.page===page));
    $$('[data-page-target]').forEach(b=>b.classList.toggle("is-active",b.dataset.pageTarget===page));
    const displayName=(state.user?.name||"Usuário").split(/\s+/)[0];
    const titles={dashboard:`Olá, ${displayName} 👋`,transactions:"Transações",planning:"Meu mês",cards:"Cartões",ai:"IA Financeira",reports:"Relatórios",settings:"Configurações"};
    const actions={dashboard:["bell","notices","Notificações"],transactions:["search","search","Pesquisar"],planning:["settings","settings","Configurações"],cards:["plus","add-card","Novo cartão"],ai:["shield","privacy","Privacidade da IA"],reports:["download","export","Exportar"],settings:[state.settings.theme==="dark"?"sun":"moon","theme","Alternar tema"]};
    $("#pageTitle").textContent=titles[page]||pageNames[page]||"Esteja no Controle";
    const action=$("#pageAction"), cfg=actions[page]||["settings","none",""];
    action.innerHTML=icon(cfg[0]); action.dataset.action=cfg[1]; action.setAttribute("aria-label",cfg[2]);
    $("#transactionFab").hidden=page!=="transactions";
    if(page==="reports") renderReports();
    if(page==="settings") renderSettings();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function renderAll() {
    renderDashboard();
    renderTransactions();
    renderPlanning();
    renderCards();
    renderAI();
    renderReports();
    renderSettings();
  }

  async function addDashboardBalance(e){
    e.preventDefault();
    const form=e.currentTarget;
    const source=form.querySelector("[name=balanceSource]")?.value||"Renda extra";
    const value=parseMoneyInput(form.querySelector("[name=balanceValue]")?.value||"");
    const accountId=form.querySelector("[name=balanceAccount]")?.value||primaryAccount()?.id||null;
    if(!Number.isFinite(value)||value<=0){showToast("Digite um valor válido para adicionar ao saldo.","error");return;}
    const category=source==="Vale / VR"?"VR":source;
    const description=source==="Vale / VR"?"Vale / VR":source;
    const data={description,value,type:"income",category,date:ymd(now.getDate()),accountId,recurring:false,installment:false,notes:"Adicionado pela tela inicial"};
    const button=form.querySelector("button[type=submit]");
    setBusy(button,true,"Adicionando...");
    try{
      if(runtimeMode==="cloud"){
        await cloud.saveTransaction(state.user,data,null);
        await refreshCloudState();
      }else{
        applyAccountDelta(accountId,value);
        state.transactions.push({id:uid(),...data});
        saveLocalState();renderAll();
      }
      showPage("dashboard");
      showToast(`${money(value)} adicionados ao saldo como ${description}.`,"success");
    }catch(err){console.error(err);showToast(err.message||"Não foi possível adicionar o saldo.","error");}
    finally{setBusy(button,false);}
  }

  function renderDashboard() {
    const {income,expense}=totals();
    const installmentMonthly=monthlyInstallmentCommitment();
    const installmentAdjustment=unrecordedInstallmentCommitment();
    const effectiveExpense=dashboardExpenseTotal();
    const availableBalance=balanceAfterInstallments();
    const score=healthScore();
    const pct=Math.round(score/10);
    const [bigCat,bigValue]=biggestExpenseCategory();
    const expenseSums={};
    monthTransactions().filter(t=>t.type==="expense").forEach(t=>expenseSums[t.category]=(expenseSums[t.category]||0)+Number(t.value||0));
    const topCats=Object.entries(expenseSums).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const totalCat=topCats.reduce((s,[,v])=>s+v,0)||1;
    const palette=["var(--green)","var(--blue)","var(--yellow)","var(--purple)","#536175"];
    let cursor=0;
    const donutStops=topCats.map(([,val],i)=>{const a=cursor,b=cursor+(val/totalCat*100);cursor=b;return `${palette[i]} ${a.toFixed(1)}% ${b.toFixed(1)}%`;}).join(",") || "#173049 0 100%";

    $("#page-dashboard").innerHTML = `
      <section class="card hero-health">
        <div class="health-head">
          <div><p class="eyebrow">♥ Saúde Financeira</p><strong>Você está no caminho certo!</strong></div>
          <div class="health-score">${score}<span style="color:var(--muted);font-size:.58rem;font-weight:600">/1000</span></div>
        </div>
        <div class="progress" style="margin-top:8px"><span style="width:${pct}%"></span></div>
      </section>

      <div class="grid summary-grid">
        <article class="card metric-card"><span class="metric-label">Saldo disponível</span><strong class="${availableBalance<0?"expense":""}">${money(availableBalance)}</strong><div class="delta ${availableBalance<0?"expense":""}">Em contas: ${money(totalAccountBalance())} · parcelas: -${money(installmentAdjustment)}</div></article>
        <article class="card metric-card"><span class="metric-label">Entradas</span><strong class="income">${money(income)}</strong><div class="delta income">↗ neste mês</div></article>
        <article class="card metric-card"><span class="metric-label">Saídas + parcelas</span><strong class="expense">${money(effectiveExpense)}</strong><div class="delta expense">${installmentMonthly?`${money(installmentMonthly)} em parcelas ativas`:`Sem parcelas ativas`}</div></article>
        <article class="card metric-card"><span class="metric-label">Saldo projetado<br>no fim do mês</span><strong class="${projectedBalance()<0?"expense":""}">${money(projectedBalance())}</strong></article>
      </div>

      <section class="dashboard-premium-strip">
        <article class="premium-mini-card"><span class="premium-mini-icon income">↗</span><div><small>Resultado do mês</small><strong class="${income-effectiveExpense>=0?"income":"expense"}">${money(income-effectiveExpense)}</strong><span>${income?Math.round((income-effectiveExpense)/income*100):0}% da renda preservada após parcelas</span></div></article>
        <article class="premium-mini-card"><span class="premium-mini-icon warn">▭</span><div><small>Faturas abertas</small><strong>${money((state.cards||[]).reduce((sum,c)=>sum+invoiceBalance(c.id,ym()),0))}</strong><span>${state.cards?.length||0} cartão${(state.cards?.length||0)!==1?"ões":""} acompanhado${(state.cards?.length||0)!==1?"s":""}</span></div></article>
        <article class="premium-mini-card"><span class="premium-mini-icon accent">◎</span><div><small>Meta em destaque</small><strong>${escapeHtml(state.goals?.[0]?.name||"Crie uma meta")}</strong><span>${state.goals?.[0]?`${Math.min(100,Math.round(Number(state.goals[0].current||0)/Math.max(Number(state.goals[0].target||1),1)*100))}% concluída`:"Planeje seu próximo objetivo"}</span></div></article>
        <article class="premium-mini-card"><span class="premium-mini-icon expense">▣</span><div><small>Parcelas mensais</small><strong class="expense">${money(installmentMonthly)}</strong><span>${activeInstallments().length} parcelamento${activeInstallments().length!==1?"s":""} ativo${activeInstallments().length!==1?"s":""} · ${money(outstandingInstallmentBalance())} restante</span></div></article>
      </section>

      <section class="card section-card dashboard-balance-card">
        <div class="section-head"><div><h3 class="section-title">Adicionar saldo</h3><span class="section-subtitle">Salário, vale, renda extra ou outro recebimento</span></div><span class="badge">+ Entrada</span></div>
        <form id="dashboardBalanceForm" class="dashboard-balance-form">
          <label><span>Origem</span><select name="balanceSource"><option>Salário</option><option>Vale / VR</option><option>Adiantamento</option><option>Freelance</option><option>Renda extra</option><option>Reembolso</option><option>Outros</option></select></label>
          <label><span>Valor</span><input name="balanceValue" inputmode="decimal" placeholder="0,00" required></label>
          <label><span>Conta</span><select name="balanceAccount">${accountOptions(primaryAccount()?.id)}</select></label>
          <button class="primary-button dashboard-balance-submit" type="submit">＋ Adicionar saldo</button>
        </form>
      </section>

      <section class="card section-card">
        <div class="section-head"><h3 class="section-title">Gastos por categoria</h3><button class="link-button" data-page-target="transactions">Ver todos</button></div>
        <div class="donut-wrap">
          <div class="donut" style="background:conic-gradient(${donutStops})"></div>
          <div class="legend">
            ${topCats.length?topCats.map(([cat,val],i)=>`<div class="legend-row"><span class="legend-dot" style="background:${palette[i]}"></span><span>${escapeHtml(cat)}</span><strong>${Math.round(val/totalCat*100)}%</strong></div>`).join(""):`<span class="section-subtitle">Sem gastos neste mês</span>`}
          </div>
        </div>
      </section>

      <section class="card section-card">
        <div class="section-head"><h3 class="section-title">Orçamento por categoria</h3><button class="link-button" data-create-entity="budget">+ Novo</button></div>
        ${(state.budgets||[]).slice(0,4).map((b,i)=>{const spent=budgetSpent(b),p=Math.min(100,Math.round(spent/Math.max(Number(b.limit||1),1)*100));return `<div class="budget-row"><div class="budget-top"><span>${escapeHtml(b.category)} <strong style="float:right;color:${p>=90?'var(--red)':p>=75?'var(--yellow)':'var(--green)'}">${p}%</strong></span><span>${money(spent)} / ${money(b.limit)}</span></div><div class="progress ${p>=90?'red':p>=75?'yellow':''}"><span style="width:${p}%"></span></div></div>`;}).join("") || `<div class="empty-state">Crie seu primeiro orçamento.</div>`}
        <div class="insight-card"><div class="bot-avatar">✦</div><div><strong>Insight da IA</strong><p>${bigValue?`Você está acompanhando ${escapeHtml(bigCat)} de perto: ${money(bigValue)} gastos neste mês.`:"Registre seus gastos para receber insights personalizados."}</p></div></div>
      </section>

      <section class="card section-card dashboard-alerts">
        <div class="section-head"><div><h3 class="section-title">Alertas inteligentes</h3><span class="section-subtitle">Vencimentos e limites que pedem atenção</span></div><button class="link-button" data-open-notifications>Ver todos</button></div>
        <div class="notifications-list compact">${generatedNotifications().slice(0,3).map(notificationMarkup).join("")}</div>
      </section>`;
    $("#dashboardBalanceForm")?.addEventListener("submit",addDashboardBalance);
  }

  function txIcon(tx) {
    const map={Salário:"💼",VR:"🎫",Alimentação:"🛒",Moradia:"⌂",Transporte:"⛽",Saúde:"✚",Assinaturas:"⌁",Casa:"▣",Freelance:"◆"};
    return map[tx.category]||(tx.type==="income"?"↗":"↘");
  }

  function renderTransactions() {
    let txs=[...monthTransactions()].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    if(transactionFilter==="income") txs=txs.filter(t=>t.type==="income");
    if(transactionFilter==="expense") txs=txs.filter(t=>t.type==="expense");
    if(transactionFilter==="recurring") txs=txs.filter(t=>t.recurring);
    if(transactionFilter==="installment") txs=txs.filter(t=>t.installment);
    const query=transactionSearch.trim().toLocaleLowerCase("pt-BR");
    if(query) txs=txs.filter(t=>[t.description,t.category,accountName(t.accountId),t.notes].some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(query)));
    const filteredTotal=txs.length;
    const visible=txs.slice(0,transactionLimit);
    const {income,expense}=totals();
    const categoryMap={};
    monthTransactions().filter(t=>t.type==="expense").forEach(t=>categoryMap[t.category]=(categoryMap[t.category]||0)+Number(t.value||0));
    const topCats=Object.entries(categoryMap).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const topMax=Math.max(1,...topCats.map(([,v])=>v));
    const largest=[...monthTransactions()].sort((a,b)=>Number(b.value||0)-Number(a.value||0))[0];
    const dailyAvg=expense/Math.max(1,now.getDate());
    $("#page-transactions").innerHTML=`
      <div class="transaction-toolbar">
        <div class="filter-scroll">${[["all","Todos"],["income","Entradas"],["expense","Saídas"],["recurring","Recorrentes"]].map(([id,label])=>`<button class="filter-chip ${transactionFilter===id?"is-active":""}" data-filter="${id}">${label}</button>`).join("")}</div>
        <div class="transaction-tool-actions"><label class="transaction-search"><span>${icon("search")}</span><input id="transactionSearch" data-transaction-search value="${escapeHtml(transactionSearch)}" placeholder="Buscar por nome, categoria ou conta" aria-label="Pesquisar transações"></label><button class="secondary-button" data-export-transactions>CSV</button></div>
      </div>
      <p class="section-subtitle transaction-month-label">${monthLabel()} · ${filteredTotal} resultado${filteredTotal!==1?"s":""}</p>
      <div class="transactions-desktop-layout">
        <div class="transactions-main-column">
          <div class="transactions-list">${visible.length?visible.map(tx=>`<article class="transaction-row"><div class="tx-icon">${txIcon(tx)}</div><div class="tx-main"><strong>${escapeHtml(tx.description)}</strong><small>${shortDate(tx.date)} · ${escapeHtml(accountName(tx.accountId))}${tx.recurring?` · Recorrente`:""}${tx.installment?` · Parcelado`:""}</small></div><div class="tx-side"><div class="tx-value ${tx.type==="income"?"income":"expense"}">${tx.type==="income"?"+":"-"}${money(tx.value)}</div><div class="row-actions"><button title="Editar" data-edit-transaction="${tx.id}">✎</button><button title="Excluir" data-delete-transaction="${tx.id}">×</button></div></div></article>`).join(""):`<div class="card empty-state">Nenhuma transação encontrada.</div>`}</div>
          ${filteredTotal>visible.length?`<button class="load-more-button" data-load-more-transactions>Carregar mais · ${filteredTotal-visible.length} restantes</button>`:""}
          <div class="month-summary"><div class="card"><small>Entradas</small><strong class="income">${money(income)}</strong></div><div class="card"><small>Saídas</small><strong class="expense">${money(expense)}</strong></div></div>
        </div>
        <aside class="transactions-insights card">
          <div class="section-head"><div><p class="eyebrow">Resumo do mês</p><h3 class="section-title">Leitura rápida</h3></div></div>
          <div class="transaction-insight-metrics"><div><small>Média de saída/dia</small><strong>${money(dailyAvg)}</strong></div><div><small>Maior lançamento</small><strong>${largest?money(largest.value):money(0)}</strong><span>${largest?escapeHtml(largest.description):"Sem dados"}</span></div></div>
          <div class="transaction-category-mini"><small>Principais categorias de saída</small>${topCats.length?topCats.map(([cat,val])=>`<div class="transaction-category-row" title="${escapeHtml(cat)}: ${money(val)}"><div><span>${escapeHtml(cat)}</span><strong>${money(val)}</strong></div><div class="transaction-category-track"><i style="width:${Math.max(4,val/topMax*100)}%"></i></div></div>`).join(""):`<div class="empty-state compact">Cadastre despesas para ver a distribuição.</div>`}</div>
          <button class="secondary-button transaction-report-link" data-page-target="reports">Abrir relatórios completos</button>
        </aside>
      </div>`;
    const searchInput=$("#transactionSearch");
    searchInput?.addEventListener("input",e=>{
      const caret=e.target.selectionStart||e.target.value.length;
      transactionSearch=e.target.value;transactionLimit=24;renderTransactions();
      requestAnimationFrame(()=>{const next=$("#transactionSearch");if(next){next.focus();next.setSelectionRange(Math.min(caret,next.value.length),Math.min(caret,next.value.length));}});
    });
  }


  function buildCalendar() {
    const first=new Date(now.getFullYear(),now.getMonth(),1);
    const days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
    const incomeDays=new Set((state.recurring||[]).filter(r=>r.type==="income").map(r=>Number(r.day)));
    const expenseDays=new Set((state.recurring||[]).filter(r=>r.type==="expense").map(r=>Number(r.day)));
    let html=["D","S","T","Q","Q","S","S"].map(d=>`<div class="dow">${d}</div>`).join("");
    for(let i=0;i<first.getDay();i++) html+="<div></div>";
    for(let d=1;d<=days;d++){
      const cls=[d===now.getDate()?"today":"",incomeDays.has(d)?"has-income":"",expenseDays.has(d)?"has-expense":""].filter(Boolean).join(" ");
      html+=`<div class="day ${cls}">${d}</div>`;
    }
    return html;
  }

  function actionButtons(entity,id){return `<div class="row-actions"><button data-edit-entity="${entity}" data-id="${id}" title="Editar">✎</button><button data-delete-entity="${entity}" data-id="${id}" title="Excluir">×</button></div>`;}
  function actionButtonsCompact(entity,id,className=""){return `<div class="${className}"><button data-edit-entity="${entity}" data-id="${id}" title="Editar">✎</button><button data-delete-entity="${entity}" data-id="${id}" title="Excluir">×</button></div>`;}
  function installmentVisual(name){
    if(/geladeira/i.test(name)) return `<img src="./assets/fridge.svg" alt="Geladeira">`;
    if(/fog[aã]o|cozinha/i.test(name)) return "🍳";
    if(/sof[aá]|m[oó]vel/i.test(name)) return "🛋";
    if(/tv|televis/i.test(name)) return "📺";
    return "📦";
  }

  function renderPlanning() {
    const goals=state.goals||[];
    const reserve=goals.find(g=>/reserva/i.test(g.name))||goals[0];
    const recurrings=(state.recurring||[]).sort((a,b)=>a.day-b.day).slice(0,6);
    const installments=state.installments||[];
    const installmentMonthly=monthlyInstallmentCommitment();
    const installmentOutstanding=outstandingInstallmentBalance();
    const installmentContracted=installments.reduce((sum,i)=>sum+Number(i.total||(Number(i.installments||0)*Number(i.installmentValue||0))),0);
    const reservePct=reserve?Math.min(100,Math.round(Number(reserve.current||0)/Math.max(Number(reserve.target||1),1)*100)):0;
    const planningQuery=planningCommitmentSearch.trim().toLocaleLowerCase("pt-BR");
    const planningMatch=(...values)=>!planningQuery||values.some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(planningQuery));
    const planningBills=(state.bills||[]).slice().sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))).filter(b=>planningMatch(b.name,b.category,b.status,accountName(b.accountId)));
    const planningSubscriptions=(state.subscriptions||[]).filter(sub=>planningMatch(sub.name,sub.category,sub.active?"ativa":"pausada",accountName(sub.accountId)));
    const planningResults=planningCommitmentFilter==="bills"?planningBills.length:planningCommitmentFilter==="subscriptions"?planningSubscriptions.length:planningBills.length+planningSubscriptions.length;
    $("#page-planning").innerHTML=`
      <div class="planning-layout">
        <section class="card planning-wide planning-priority">
          <div class="section-head"><div><h3 class="section-title">Parcelas</h3><span class="section-subtitle">Compras parceladas em andamento</span></div><button class="primary-small" data-create-entity="installment">+ Parcela</button></div>
          <div class="installment-summary-grid">
            <div><small>Parcelas por mês</small><strong class="expense">${money(installmentMonthly)}</strong></div>
            <div><small>Total restante</small><strong>${money(installmentOutstanding)}</strong></div>
            <div><small>Total contratado</small><strong>${money(installmentContracted)}</strong></div>
            <div><small>Parcelamentos ativos</small><strong>${activeInstallments().length}</strong></div>
          </div>
          ${installments.length?installments.map(it=>{const p=Math.min(100,Math.round(Number(it.paid||0)/Math.max(Number(it.installments||1),1)*100));const remaining=Math.max(0,Number(it.installments||0)-Number(it.paid||0));const paidValue=Number(it.paid||0)*Number(it.installmentValue||0);return `<article class="installment-feature-card"><div class="installment-art" aria-hidden="true">${installmentVisual(it.name)}</div><div class="feature-copy"><div class="installment-top"><div><strong>${escapeHtml(it.name)} - ${it.installments}x de ${money(it.installmentValue)}</strong><small>${it.paid}/${it.installments} pagas${it.cardId?` · ${escapeHtml(cardName(it.cardId))}`:""}</small></div><span class="installment-rest">Restam ${remaining}</span></div><div class="progress blue"><span style="width:${p}%"></span></div><div class="installment-meta"><div><small>Valor da parcela</small><strong>${money(it.installmentValue)}</strong></div><div><small>Próxima parcela</small><strong>${it.nextDue?shortDate(it.nextDue):"Sem data"}</strong></div><div><small>Total do parcelamento</small><strong>${money(it.total || (Number(it.installments||0)*Number(it.installmentValue||0)))}</strong></div><div><small>Parcelas pagas</small><strong>${money(paidValue)}</strong></div></div>${actionButtonsCompact("installment",it.id,"installment-actions")}</div></article>`;}).join(""):`<div class="empty-state">Nenhuma compra parcelada cadastrada.</div>`}
        </section>

        <section class="card planning-wide planning-priority">
          <div class="section-head"><div><h3 class="section-title">Metas</h3><span class="section-subtitle">Objetivos financeiros com prazo</span></div><button class="primary-small" data-create-entity="goal">+ Meta</button></div>
          ${goals.length?goals.map(g=>{const p=Math.min(100,Math.round(Number(g.current||0)/Math.max(Number(g.target||1),1)*100));const remaining=Math.max(0,Number(g.target||0)-Number(g.current||0));return `<article class="goal-feature-card"><div class="goal-art" aria-hidden="true">${escapeHtml(g.icon||"◎")}</div><div class="feature-copy"><div class="goal-top"><div><strong>${escapeHtml(g.name)}</strong><small>${money(g.current)} de ${money(g.target)}</small></div><span class="goal-percent">${p}%</span></div><div class="progress"><span style="width:${p}%"></span></div><div class="goal-meta"><div><small>Faltam</small><strong>${money(remaining)}</strong></div><div><small>Meta para</small><strong>${g.deadline?shortDate(g.deadline):"Sem prazo"}</strong></div></div><div class="goal-actions"><button class="goal-contribute" data-goal-contribution="${g.id}" title="Adicionar aporte">＋ Aportar</button><button data-edit-entity="goal" data-id="${g.id}" title="Editar">✎</button><button data-delete-entity="goal" data-id="${g.id}" title="Excluir">×</button></div></div></article>`;}).join(""):`<div class="empty-state">Crie sua primeira meta.</div>`}
        </section>

        <aside class="planning-side-grid">
          <div class="planning-quick">
            <button class="quick-tile" data-create-entity="recurring"><span class="quick-icon">▣</span><strong>Contas recorrentes</strong><small>${state.recurring?.length||0} ativas este mês</small></button>
            <button class="quick-tile" data-create-entity="goal"><span class="quick-icon" style="color:var(--green)">◎</span><strong>Metas</strong><small>${goals.length} ativas</small></button>
          </div>
          ${reserve?`<section class="card"><div class="row-between"><div><p class="eyebrow">Reserva de emergência</p><strong style="font-size:.82rem">${money(reserve.current)} / ${money(reserve.target)}</strong></div><strong class="income">${reservePct}%</strong></div><div class="progress" style="margin-top:10px"><span style="width:${reservePct}%"></span></div><p class="section-subtitle" style="margin-top:10px">Mantenha sua segurança financeira em crescimento contínuo.</p></section>`:""}
          <section class="card">
            <div class="section-head"><div><h3 class="section-title">Orçamentos</h3><span class="section-subtitle">Limites por categoria</span></div><button class="primary-small" data-create-entity="budget">+ Orçamento</button></div>
            ${(state.budgets||[]).map(b=>{const spent=budgetSpent(b),p=Math.min(100,Math.round(spent/Math.max(Number(b.limit||1),1)*100));return `<div class="budget-row entity-row"><div class="entity-main"><div class="row-between"><strong>${escapeHtml(b.category)}</strong><span style="font-size:.6rem">${money(spent)} / ${money(b.limit)}</span></div><div class="progress ${p>=90?"red":p>=75?"yellow":""}" style="margin-top:7px"><span style="width:${p}%"></span></div></div>${actionButtons("budget",b.id)}</div>`;}).join("")||`<div class="empty-state">Nenhum orçamento cadastrado.</div>`}
          </section>
        </aside>

        <section class="card planning-wide v12-financial-commitments">
          <div class="section-head"><div><h3 class="section-title">Contas e assinaturas</h3><span class="section-subtitle">Boletos, serviços mensais e compromissos fixos</span></div><div class="toolbar-actions"><button class="secondary-button" data-create-entity="subscription">+ Assinatura</button><button class="primary-small" data-create-entity="bill">+ Conta</button></div></div>
          <div class="planning-search-tools">
            <label class="transaction-search planning-search"><span>${icon("search")}</span><input id="planningCommitmentSearch" value="${escapeHtml(planningCommitmentSearch)}" placeholder="Buscar conta ou assinatura" aria-label="Pesquisar contas e assinaturas"></label>
            <div class="filter-scroll planning-filter-scroll">${[["all","Todos"],["bills","Contas"],["subscriptions","Assinaturas"]].map(([id,label])=>`<button class="filter-chip ${planningCommitmentFilter===id?"is-active":""}" data-planning-filter="${id}">${label}</button>`).join("")}</div>
          </div>
          <p class="section-subtitle planning-search-result">${planningResults} resultado${planningResults!==1?"s":""}${planningQuery?` para “${escapeHtml(planningCommitmentSearch)}”`:""}</p>
          <div class="commitments-grid ${planningCommitmentFilter!=="all"?"is-single-column":""}">
            ${planningCommitmentFilter!=="subscriptions"?`<div class="commitment-column"><div class="commitment-title"><span>▤ Contas a pagar</span><strong>${money(planningBills.filter(b=>b.status!=="paid").reduce((sum,b)=>sum+Number(b.value||0),0))}</strong></div>${planningBills.length?planningBills.slice(0,planningBillsLimit).map(b=>`<article class="commitment-row ${b.status==="paid"?"is-paid":""}"><span class="commitment-icon">${b.status==="paid"?"✓":"▤"}</span><div><strong>${escapeHtml(b.name)}</strong><small>${b.status==="paid"?"Pago":`Vence ${shortDate(b.dueDate)}`} · ${escapeHtml(b.category||"Outros")}</small></div><strong class="${b.status==="paid"?"income":"expense"}">${money(b.value)}</strong><div class="commitment-actions">${b.status!=="paid"?`<button data-pay-bill="${b.id}" title="Pagar">✓</button>`:""}<button data-edit-entity="bill" data-id="${b.id}" title="Editar">✎</button><button data-delete-entity="bill" data-id="${b.id}" title="Excluir">×</button></div></article>`).join("")+(planningBills.length>planningBillsLimit?`<button class="load-more-button compact-load" data-load-more-bills>Carregar mais contas</button>`:""):`<div class="empty-state">Nenhuma conta encontrada.</div>`}</div>`:""}
            ${planningCommitmentFilter!=="bills"?`<div class="commitment-column"><div class="commitment-title"><span>◉ Assinaturas</span><strong>${money(planningSubscriptions.filter(sub=>sub.active).reduce((sum,sub)=>sum+Number(sub.value||0),0))}/mês</strong></div>${planningSubscriptions.length?planningSubscriptions.map(sub=>`<article class="subscription-card ${sub.active?"":"is-paused"}"><span class="subscription-icon">${escapeHtml(sub.icon||"◉")}</span><div><strong>${escapeHtml(sub.name)}</strong><small>Renova dia ${String(sub.day||1).padStart(2,"0")} · ${sub.active?"Ativa":"Pausada"}</small></div><strong>${money(sub.value)}</strong>${actionButtons("subscription",sub.id)}</article>`).join(""):`<div class="empty-state">Nenhuma assinatura encontrada.</div>`}</div>`:""}
          </div>
        </section>

        <section class="card planning-wide future-launches-card">
          <div class="section-head"><div><h3 class="section-title">Lançamentos futuros</h3><span class="section-subtitle">Entradas e saídas previstas para os próximos dias</span></div><button class="primary-small" data-create-entity="futureTransaction">+ Previsão</button></div>
          <div class="future-launch-grid">${(state.futureTransactions||[]).length?(state.futureTransactions||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,planningFutureLimit).map(f=>`<article class="future-launch"><span class="future-date">${shortDate(f.date)}</span><span class="future-dot ${f.type}"></span><div><strong>${escapeHtml(f.description)}</strong><small>${escapeHtml(f.category||"Outros")} · ${f.status==="posted"?"Lançado":"Previsto"}</small></div><strong class="${f.type==="income"?"income":"expense"}">${f.type==="income"?"+":"-"}${money(f.value)}</strong><div class="future-actions">${f.status!=="posted"?`<button data-post-future="${f.id}" title="Lançar agora">↗</button>`:""}<button data-edit-entity="futureTransaction" data-id="${f.id}" title="Editar">✎</button><button data-delete-entity="futureTransaction" data-id="${f.id}" title="Excluir">×</button></div></article>`).join("")+((state.futureTransactions||[]).length>planningFutureLimit?`<button class="load-more-button compact-load" data-load-more-future>Carregar mais lançamentos</button>`:""):`<div class="empty-state">Nenhum lançamento futuro cadastrado.</div>`}</div>
        </section>

        <section class="card planning-wide contribution-history-card">
          <div class="section-head"><div><h3 class="section-title">Últimos aportes</h3><span class="section-subtitle">Histórico de contribuições para suas metas</span></div></div>
          ${(state.goalContributions||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,6).map(c=>{const g=goals.find(x=>String(x.id)===String(c.goalId));return `<div class="simple-row"><div><strong>${escapeHtml(g?.name||"Meta")}</strong><small>${shortDate(c.date)}${c.note?` · ${escapeHtml(c.note)}`:""}</small></div><strong class="income">+${money(c.amount)}</strong></div>`;}).join("")||`<div class="empty-state">Nenhum aporte registrado.</div>`}
        </section>

        <section class="card timeline-card planning-wide">
          <div class="section-head"><div><h3 class="section-title">Linha do tempo financeira</h3><span class="section-subtitle">Visão rápida do seu mês</span></div><strong class="accent" style="font-size:.72rem">${money(projectedBalance())}</strong></div>
          <div class="timeline">${recurrings.map(r=>`<div class="timeline-item"><span class="timeline-date">${String(r.day).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}</span><span class="timeline-dot" style="background:${r.type==="income"?"var(--green)":"var(--red)"}"></span><div class="timeline-copy"><strong>${escapeHtml(r.name)}</strong><small>${r.type==="income"?"Recorrente":"Vencimento"}</small></div><strong class="${r.type==="income"?"income":"expense"}">${r.type==="income"?"+":"-"}${money(r.value)}</strong></div>`).join("")||`<div class="empty-state">Cadastre recorrências para montar a linha do tempo.</div>`}</div>
        </section>

        <section class="card calendar-card planning-wide planning-calendar-final">
          <div class="section-head"><div><p class="eyebrow">${monthLabel()}</p><h3 class="section-title">Calendário financeiro</h3><span class="section-subtitle">Agora ele fica no final da aba Planejamento</span></div><span class="badge">Hoje ${String(now.getDate()).padStart(2,"0")}</span></div>
          <div class="calendar">${buildCalendar()}</div>
        </section>
      </div>`;
    const planningSearchInput=$("#planningCommitmentSearch");
    planningSearchInput?.addEventListener("input",e=>{
      const caret=e.target.selectionStart||e.target.value.length;
      planningCommitmentSearch=e.target.value;planningBillsLimit=12;renderPlanning();
      requestAnimationFrame(()=>{const next=$("#planningCommitmentSearch");if(next){next.focus();next.setSelectionRange(Math.min(caret,next.value.length),Math.min(caret,next.value.length));}});
    });
  }


  function upcomingInvoiceEstimate(cardId,offset=1){
    return (state.installments||[]).filter(i=>String(i.cardId)===String(cardId)).reduce((sum,i)=>{
      const remaining=Number(i.installments||0)-Number(i.paid||0);
      return sum+(remaining>=offset?Number(i.installmentValue||0):0);
    },0);
  }

  function cardThemeClass(card){
    const t=(card?.theme||card?.name||"").toLowerCase();
    if(/inter|orange/.test(t))return "credit-card--orange";
    if(/blue|azul/.test(t))return "credit-card--blue";
    return "credit-card--purple";
  }

  function renderCards() {
    const cards=state.cards||[];
    if(!selectedCardId || !cards.some(c=>String(c.id)===String(selectedCardId))) selectedCardId=cards[0]?.id||null;
    const card=cardById(selectedCardId);
    const invoiceMonths=card?invoiceMonthsForCard(card.id):[];
    if(!selectedInvoiceMonth || !invoiceMonths.includes(selectedInvoiceMonth)) selectedInvoiceMonth=invoiceMonths.includes(ym())?ym():(invoiceMonths.at(-1)||ym());
    const purchases=card?cardPurchases(card.id,selectedInvoiceMonth):[];
    const cardQuery=cardPurchaseSearch.trim().toLocaleLowerCase("pt-BR");
    const filteredPurchases=purchases.filter(p=>{
      if(cardPurchaseFilter==="installments" && Number(p.installments||1)<=1)return false;
      if(cardPurchaseFilter==="single" && Number(p.installments||1)>1)return false;
      if(!cardQuery)return true;
      return [p.description,p.category,shortDate(p.date)].some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(cardQuery));
    });
    const invoice=card?cardInvoiceTotal(card.id,selectedInvoiceMonth):0;
    const invoicePaid=card?invoicePaidTotal(card.id,selectedInvoiceMonth):0;
    const invoiceRemaining=card?invoiceBalance(card.id,selectedInvoiceMonth):0;
    const invoiceState=card?invoiceStatus(card.id,selectedInvoiceMonth):"open";
    const used=card?cardUsedAmount(card.id):0;
    const available=card?Math.max(0,Number(card.limit||0)-used):0;
    const usedPct=card?Math.min(100,Math.round(used/Math.max(Number(card.limit||1),1)*100)):0;
    const liquidAssets=(state.assets||[]).reduce((s,a)=>s+Number(a.value||0),0)+totalAccountBalance();
    const debts=(state.debts||[]).reduce((s,d)=>s+Number(d.balance||0),0);
    const net=liquidAssets-debts;
    const linkedInstallments=(state.installments||[]).filter(i=>!card||String(i.cardId)===String(card.id));
    const accountTotal=totalAccountBalance();
    const payments=card?invoicePayments(card.id,selectedInvoiceMonth).slice().sort((a,b)=>String(b.paidOn).localeCompare(String(a.paidOn))):[];
    const currentBalance=card?invoiceBalance(card.id,ym()):0;
    const currentState=card?invoiceStatus(card.id,ym()):"open";
    $("#page-cards").innerHTML=`
      <section class="card accounts-hub cards-full-width" style="grid-column:1 / -1">
        <div class="section-head"><div><p class="eyebrow">Contas e carteiras</p><h3 class="section-title">Seu dinheiro disponível</h3><span class="section-subtitle">${accountsList().length} contas · ${money(accountTotal)} no total</span></div><div class="toolbar-actions"><button class="secondary-button" data-create-entity="transfer">⇄ Transferir</button><button class="primary-small" data-create-entity="account">+ Conta</button></div></div>
        <div class="account-cards">${accountsList().map(a=>`<article class="account-mini-card ${a.primary?"is-primary":""}"><div class="account-mini-icon">${a.type==="cash"?"◈":"▣"}</div><div class="account-mini-copy"><small>${escapeHtml(a.institution||a.type||"Conta")}</small><strong>${escapeHtml(a.name)}</strong><span>${money(a.balance)}</span></div>${actionButtons("account",a.id)}</article>`).join("")||`<div class="empty-state">Cadastre uma conta ou carteira.</div>`}</div>
        ${(state.transfers||[]).length?`<div class="transfer-strip"><span class="section-subtitle">Última transferência</span>${(state.transfers||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,1).map(t=>`<strong>${escapeHtml(accountName(t.fromAccountId))} → ${escapeHtml(accountName(t.toAccountId))} · ${money(t.amount)}</strong>`).join("")}</div>`:""}
      </section>

      <section class="cards-overview-strip cards-full-width">
        <div class="cards-overview-item"><small>Limite disponível</small><strong class="income">${card?money(available):money(0)}</strong><span>Somente no cartão selecionado</span></div>
        <div class="cards-overview-item"><small>Fatura atual</small><strong class="${currentBalance?"warn":"income"}">${card?money(currentBalance):money(0)}</strong><span>${card?invoiceStatusLabel(currentState):"Sem cartão"}</span></div>
        <div class="cards-overview-item"><small>Patrimônio líquido</small><strong class="${net>=0?"income":"expense"}">${money(net)}</strong><span>Ativos, contas e dívidas</span></div>
        <div class="cards-overview-item"><small>Dívidas cadastradas</small><strong class="${debts?"expense":"income"}">${money(debts)}</strong><span>${state.debts?.length||0} compromisso${(state.debts?.length||0)!==1?"s":""}</span></div>
      </section>

      <div class="cards-primary">
        <div class="card-selector" role="tablist">${cards.map(c=>`<button class="card-selector-item ${String(c.id)===String(selectedCardId)?"is-active":""}" data-select-card="${c.id}"><span>${escapeHtml(c.name)}</span><small>•••• ${escapeHtml(c.last4||"0000")}</small></button>`).join("")}<button class="card-selector-add" data-create-entity="card">＋</button></div>
        ${card?`<div class="credit-card-stage"><div class="credit-card ${cardThemeClass(card)}"><div class="cc-top"><span class="cc-brand">${escapeHtml(card.name)}</span><span class="cc-brand-mark">${escapeHtml(card.brand||"CARD")}</span></div><div class="cc-chip-row"><span class="cc-chip"></span><span class="cc-contactless">)))</span></div><div class="cc-number">•••• ${escapeHtml(card.last4||"0000")}</div><div class="cc-card-footer"><span>Limite ${money(card.limit)}</span><span>${escapeHtml((state.user?.name||"Titular").toUpperCase())}</span></div></div><span class="card-stage-glow"></span></div>
        <section class="card section-card card-highlight"><div class="premium-kicker">Fatura atual · ${invoiceStatusLabel(currentState)}</div><div class="cc-stats"><div class="cc-stat"><small>Limite disponível</small><strong class="income">${money(available)}</strong></div><div class="cc-stat"><small>Fatura a pagar</small><strong class="${currentBalance?"warn":"income"}">${money(currentBalance)}</strong></div></div><div class="progress blue" style="margin-top:9px"><span style="width:${usedPct}%"></span></div><div class="invoice-grid"><div class="invoice-stat"><small>Limite total</small><strong>${money(card.limit)}</strong></div><div class="invoice-stat"><small>Fecha dia</small><strong>${String(card.closingDay||25).padStart(2,"0")}</strong></div><div class="invoice-stat"><small>Vence dia</small><strong>${String(card.dueDay||5).padStart(2,"0")}</strong></div></div><button class="secondary-button" data-scroll-invoice style="width:100%;margin-top:9px;color:#4c9dff">Gerenciar faturas</button></section>`:`<div class="card empty-state">Cadastre seu primeiro cartão de crédito.</div>`}

        <section class="card section-card invoice-detail" id="invoiceDetail">
          <div class="section-head"><div><p class="eyebrow">Faturas mensais</p><h3 class="section-title">${card?escapeHtml(card.name):"Cartão"}</h3><span class="section-subtitle">Fechamento automático no dia ${card?.closingDay||"—"} · vencimento ${card?.dueDay||"—"}</span></div>${card?`<button class="primary-small" data-create-card-purchase="${card.id}">+ Compra</button>`:""}</div>
          ${card?`<div class="invoice-month-tabs">${invoiceMonths.map(m=>{const st=invoiceStatus(card.id,m), bal=invoiceBalance(card.id,m);return `<button class="invoice-month-tab ${m===selectedInvoiceMonth?"is-active":""}" data-select-invoice="${m}"><span>${monthKeyLabel(m)}</span><small>${invoiceStatusLabel(st)} · ${money(bal)}</small></button>`;}).join("")}</div>`:""}
          ${card?`<div class="invoice-summary-panel"><div><span class="invoice-status invoice-status--${invoiceState}">${invoiceStatusLabel(invoiceState)}</span><h4>${monthKeyLabel(selectedInvoiceMonth)}</h4><small>Vencimento ${shortDate(invoiceDueDate(card.id,selectedInvoiceMonth))}</small></div><div class="invoice-balance"><small>Saldo da fatura</small><strong>${money(invoiceRemaining)}</strong><span>${invoicePaid?`${money(invoicePaid)} já pago de ${money(invoice)}`:`Total ${money(invoice)}`}</span></div></div>`:""}
          ${card?`<div class="invoice-search-tools"><label class="transaction-search invoice-search"><span>${icon("search")}</span><input id="cardPurchaseSearch" value="${escapeHtml(cardPurchaseSearch)}" placeholder="Buscar compra ou categoria" aria-label="Pesquisar compras da fatura"></label><div class="filter-scroll">${[["all","Todas"],["single","À vista"],["installments","Parceladas"]].map(([id,label])=>`<button class="filter-chip ${cardPurchaseFilter===id?"is-active":""}" data-card-purchase-filter="${id}">${label}</button>`).join("")}</div><span class="invoice-search-count">${filteredPurchases.length} de ${purchases.length}</span></div>`:""}
          ${filteredPurchases.length?filteredPurchases.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(p=>`<div class="invoice-purchase"><div class="purchase-icon">${txIcon({category:p.category,type:"expense"})}</div><div class="purchase-copy"><strong>${escapeHtml(p.description)}</strong><small>${shortDate(p.date)} · ${escapeHtml(p.category||"Outros")}${Number(p.installments||1)>1?` · ${p.currentInstallment||1}/${p.installments}`:""}</small></div><strong>${money(p.amount)}</strong>${actionButtons("cardPurchase",p.id)}</div>`).join(""):`<div class="empty-state">${purchases.length?"Nenhuma compra corresponde à busca/filtro.":"Nenhuma compra cadastrada nesta fatura."}</div>`}
          ${card?`<div class="invoice-total-row"><span>Total da fatura</span><strong>${money(invoice)}</strong></div><div class="invoice-payment-actions">${invoiceRemaining>0&&invoiceState!=="future"?`<button class="primary-button" data-pay-invoice data-card-id="${card.id}" data-invoice-month="${selectedInvoiceMonth}">Pagar fatura · ${money(invoiceRemaining)}</button>`:`<span class="invoice-paid-message">${invoiceState==="paid"?"✓ Fatura paga":"Pagamento disponível após o fechamento"}</span>`}</div>`:""}
          ${payments.length?`<div class="invoice-payment-history"><div class="section-head"><h4>Pagamentos</h4><span>${payments.length} registro${payments.length>1?"s":""}</span></div>${payments.map(p=>`<div class="payment-row"><div><strong>${money(p.amount)}</strong><small>${shortDate(p.paidOn)} · ${escapeHtml(accountName(p.accountId))}</small></div><span class="income">✓ Pago</span></div>`).join("")}</div>`:""}
        </section>
      </div>

      <div class="cards-secondary">
        <section class="card section-card"><div class="section-head"><h3 class="section-title">Próximas faturas</h3><span class="section-subtitle">Compras e parcelas já projetadas</span></div>${card?[1,2,3].map(offset=>{const m=monthKeyOffset(ym(),offset),total=cardInvoiceTotal(card.id,m);return `<button class="simple-row invoice-jump" data-select-invoice="${m}" data-scroll-invoice><div><strong>${monthKeyLabel(m)}</strong><small>Vence ${shortDate(invoiceDueDate(card.id,m))}</small></div><strong>${money(total)}</strong></button>`;}).join(""):`<div class="empty-state">Sem faturas.</div>`}</section>

        <section class="card section-card"><div class="section-head"><h3 class="section-title">Histórico de faturas</h3><span class="section-subtitle">Pagamentos e meses anteriores</span></div>${card?[-1,-2,-3].map(offset=>{const m=monthKeyOffset(ym(),offset),total=cardInvoiceTotal(card.id,m),paid=invoicePaidTotal(card.id,m),st=invoiceStatus(card.id,m);return `<button class="simple-row invoice-jump" data-select-invoice="${m}" data-scroll-invoice><div><strong>${monthKeyLabel(m)}</strong><small>${invoiceStatusLabel(st)}${paid?` · pago ${money(paid)}`:""}</small></div><strong class="${st==="paid"?"income":"expense"}">${money(total)}</strong></button>`;}).join(""):`<div class="empty-state">Sem histórico.</div>`}</section>

        <section class="card section-card"><div class="section-head"><div><h3 class="section-title">Parcelas no cartão</h3><span class="section-subtitle">${card?escapeHtml(card.name):"Todos os cartões"}</span></div><button class="link-button" data-create-entity="installment">+ Nova</button></div>${linkedInstallments.slice(0,4).map(it=>{const p=Math.min(100,Math.round(it.paid/Math.max(it.installments,1)*100));return `<div class="entity-row"><div class="entity-main"><div class="row-between"><div><strong>${escapeHtml(it.name)}</strong><small class="income">${it.paid}/${it.installments} pagas · ${escapeHtml(cardName(it.cardId))}</small></div><strong>${money(it.installmentValue)}</strong></div><div class="progress" style="margin-top:6px"><span style="width:${p}%"></span></div></div>${actionButtons("installment",it.id)}</div>`;}).join("")||`<div class="empty-state">Nenhuma parcela vinculada.</div>`}</section>

        <section class="card section-card"><div class="section-head"><div><h3 class="section-title">Central de dívidas</h3><span class="section-subtitle">Em aberto (${state.debts?.length||0})</span></div><button class="link-button" data-create-entity="debt">+ Dívida</button></div><div class="row-between" style="margin-top:10px"><span class="section-subtitle">Total devido</span><strong class="expense">${money(debts)}</strong></div>${(state.debts||[]).map(d=>`<div class="entity-row"><div class="entity-main"><strong>${escapeHtml(d.name)}</strong><small>Parcela ${money(d.installment)}</small></div>${actionButtons("debt",d.id)}</div>`).join("")}</section>

        <section class="card section-card card-highlight"><div class="section-head"><div><p class="eyebrow">Patrimônio</p><h3 class="section-title">Patrimônio líquido</h3></div><strong class="${net>=0?"income":"expense"}">${money(net)}</strong></div><svg class="sparkline" viewBox="0 0 300 62" preserveAspectRatio="none"><polyline points="0,50 35,46 68,47 103,38 138,40 172,28 205,31 238,20 270,22 300,10"></polyline></svg><div class="cc-stats"><div class="cc-stat"><small>Ativos + contas</small><strong>${money(liquidAssets)}</strong></div><div class="cc-stat"><small>Dívidas</small><strong class="expense">${money(debts)}</strong></div></div><div class="section-head" style="margin-top:10px"><span class="section-subtitle">Gerenciar ativos</span><button class="link-button" data-create-entity="asset">+ Ativo</button></div>${(state.assets||[]).slice(0,3).map(a=>`<div class="entity-row"><div class="entity-main"><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.kind||"outro")}</small></div><strong style="font-size:.65rem">${money(a.value)}</strong>${actionButtons("asset",a.id)}</div>`).join("")}</section>
      </div>`;
    const cardSearchInput=$("#cardPurchaseSearch");
    cardSearchInput?.addEventListener("input",e=>{
      const caret=e.target.selectionStart||e.target.value.length;
      cardPurchaseSearch=e.target.value;renderCards();
      requestAnimationFrame(()=>{const next=$("#cardPurchaseSearch");if(next){next.focus();next.setSelectionRange(Math.min(caret,next.value.length),Math.min(caret,next.value.length));}});
    });
  }

  function aiReply(question) {
    const q=question.toLowerCase(), [cat,value]=biggestExpenseCategory(), {income,expense}=totals();
    if(/posso\s+(comprar|gastar)|dá\s+pra\s+(comprar|gastar)|da\s+pra\s+(comprar|gastar)|cabe\s+no\s+orçamento|cabe\s+no\s+orcamento/.test(q)){
      const amount=extractPurchaseAmount(question);
      if(!amount)return "Me diga o valor da compra para eu comparar com suas contas, saldo projetado e meta mensal de economia.";
      const d=purchaseDecision(amount);
      if(d.status==="does_not_fit")return `Pelos dados cadastrados, eu não recomendaria essa compra de ${money(amount)} neste mês. Seu saldo projetado antes da compra é ${money(d.projectedBefore)} e ficaria em ${money(d.projectedAfter)} depois dela.`;
      if(d.status==="hurts_savings_goal")return `A compra de ${money(amount)} cabe no caixa, mas reduziria o valor reservado para sua meta mensal. Seu saldo projetado cairia de ${money(d.projectedBefore)} para ${money(d.projectedAfter)}, enquanto sua meta de guardar é ${money(d.savingsTarget)}. Para manter essa meta, seu limite de gasto opcional hoje é cerca de ${money(d.availableForOptionalSpending)}.`;
      return `Pelos dados cadastrados, a compra de ${money(amount)} cabe neste mês sem comprometer as contas previstas nem sua meta mensal de ${money(d.savingsTarget)}. O saldo projetado passaria de ${money(d.projectedBefore)} para ${money(d.projectedAfter)}.`;
    }
    if(/onde|mais|gastando|gasto/.test(q)) return value?`Seu maior gasto registrado neste mês está em ${cat}, com ${money(value)}.`:"Ainda não há gastos suficientes para comparar categorias.";
    if(/saldo|fim do mês|sobrar/.test(q)) return `Com os compromissos cadastrados, incluindo ${money(monthlyInstallmentCommitment())} em parcelas mensais ativas, seu saldo projetado para o fim do mês é ${money(projectedBalance())}.`;
    if(/meta|guardar|economizar/.test(q)) { const g=state.goals?.[0]; if(!g)return "Cadastre uma meta em Planejamento para eu calcular quanto falta guardar."; const missing=Math.max(0,g.target-g.current); return `Para a meta “${g.name}”, faltam ${money(missing)}. Consulte a IA online para montar um plano considerando sua renda e o prazo real da meta.`; }
    if(/cartão|fatura/.test(q)) { const c=cardById(selectedCardId)||state.cards?.[0]; return c?`A fatura atual do ${c.name} está em ${money(cardInvoiceTotal(c.id))} e o limite disponível estimado é ${money(Math.max(0,Number(c.limit||0)-cardUsedAmount(c.id)))}.`:"Você ainda não cadastrou um cartão."; }
    if(/dívida/.test(q)) { const total=(state.debts||[]).reduce((s,d)=>s+Number(d.balance||0),0); return total?`Você possui ${money(total)} em dívidas cadastradas. O comprometimento mensal informado é ${money((state.debts||[]).reduce((s,d)=>s+Number(d.installment||0),0))}.`:"Nenhuma dívida está cadastrada."; }
    if(/conta|carteira|saldo total/.test(q)) return `Você possui ${accountsList().length} contas ou carteiras cadastradas, com saldo total de ${money(totalAccountBalance())}.`;
    if(/assinatura|streaming|mensalidade/.test(q)){const active=(state.subscriptions||[]).filter(s=>s.active),total=active.reduce((sum,s)=>sum+Number(s.value||0),0);return `Você tem ${active.length} assinaturas ativas, que somam ${money(total)} por mês e aproximadamente ${money(total*12)} por ano.`;}
    if(/conta a pagar|boleto|vencimento/.test(q)){const pending=(state.bills||[]).filter(b=>b.status!=="paid").sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)));return pending.length?`Você tem ${pending.length} contas pendentes, totalizando ${money(pending.reduce((s,b)=>s+Number(b.value||0),0))}. A próxima é ${pending[0].name}, em ${shortDate(pending[0].dueDate)}.`:"Não há contas pendentes cadastradas.";}
    if(/saúde|pontuação|score/.test(q)){const h=healthBreakdown();return `Sua Saúde Financeira está em ${healthScore()}/1000. Pontos: gastos ${h.spending}/200, reserva ${h.reserve}/200, dívidas ${h.debt}/200, organização ${h.organization}/200 e metas ${h.goals}/200.`;}
    if(/ano|anual|12 meses/.test(q)){const annual=annualSeries(),inc=annual.reduce((s,x)=>s+x.income,0),exp=annual.reduce((s,x)=>s+x.expense,0);return `No ano de ${now.getFullYear()}, há ${money(inc)} em entradas registradas e ${money(exp)} em saídas, com resultado de ${money(inc-exp)}.`;}
    if(/renda|entrada/.test(q)) return `As entradas deste mês somam ${money(income)}. As saídas registradas são ${money(expense)} e, considerando parcelas ativas ainda não registradas como pagamento, o compromisso total fica em ${money(dashboardExpenseTotal())}.`;
    return "A IA online pode comparar meses, explicar variações, analisar metas, faturas, dívidas e projetar cenários. No modo local eu continuo respondendo com os cálculos já disponíveis no aplicativo.";
  }

  function monthsUntil(dateValue){
    if(!dateValue)return null;
    const d=new Date(`${dateValue}T12:00:00`);if(Number.isNaN(d.getTime()))return null;
    return Math.max(1,(d.getFullYear()-now.getFullYear())*12+(d.getMonth()-now.getMonth())+(d.getDate()>=now.getDate()?0:-1));
  }

  function financialAISnapshot(){
    const current=totals();
    const previousKey=monthKeyOffset(ym(),-1);
    const previousTx=(state.transactions||[]).filter(t=>String(t.date||"").startsWith(previousKey));
    const previous={
      income:previousTx.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.value||0),0),
      expense:previousTx.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.value||0),0)
    };
    const categories={};
    monthTransactions().filter(t=>t.type==="expense").forEach(t=>categories[t.category||"Outros"]=(categories[t.category||"Outros"]||0)+Number(t.value||0));
    const topCategories=Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([name,value])=>({name,value:Number(value.toFixed(2)),share:current.expense?Math.round(value/current.expense*100):0}));
    const activeSubs=(state.subscriptions||[]).filter(s=>s.active);
    const pendingBills=(state.bills||[]).filter(b=>b.status!=="paid").sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate)));
    const debtTotal=(state.debts||[]).reduce((s,d)=>s+Number(d.balance||0),0);
    const debtMonthly=(state.debts||[]).reduce((s,d)=>s+Number(d.installment||0),0);
    const h=healthBreakdown();
    return {
      period:ym(),
      currency:state.settings?.currency||"BRL",
      month:{income:Number(current.income.toFixed(2)),expense:Number(current.expense.toFixed(2)),expenseWithInstallments:Number(dashboardExpenseTotal().toFixed(2)),result:Number((current.income-dashboardExpenseTotal()).toFixed(2)),previousIncome:Number(previous.income.toFixed(2)),previousExpense:Number(previous.expense.toFixed(2)),expenseChangePct:previous.expense?Math.round((current.expense-previous.expense)/previous.expense*100):null,topCategories},
      balances:{accountsTotal:Number(totalAccountBalance().toFixed(2)),afterInstallments:Number(balanceAfterInstallments().toFixed(2)),projectedEndOfMonth:Number(projectedBalance().toFixed(2))},
      installments:{activeCount:activeInstallments().length,monthlyCommitment:Number(monthlyInstallmentCommitment().toFixed(2)),unrecordedMonthlyCommitment:Number(unrecordedInstallmentCommitment().toFixed(2)),outstandingBalance:Number(outstandingInstallmentBalance().toFixed(2))},
      purchaseDecision:{
        savingsTarget:Number(Math.max(0,Number(state.settings?.monthlySavingsTarget||0)).toFixed(2)),
        availableForOptionalSpending:Number(optionalSpendingCapacity().toFixed(2)),
        rule:"availableForOptionalSpending = projectedEndOfMonth - monthlySavingsTarget; projectedEndOfMonth already considers future recurring items, planned transactions, pending bills, active subscriptions and active installment commitments not already recorded as paid expenses"
      },
      cards:(state.cards||[]).slice(0,6).map(c=>({name:c.name,invoice:Number(invoiceBalance(c.id,ym()).toFixed(2)),limit:Number(c.limit||0),available:Number(Math.max(0,Number(c.limit||0)-cardUsedAmount(c.id)).toFixed(2)),dueDay:c.dueDay||null})),
      subscriptions:{count:activeSubs.length,monthly:Number(activeSubs.reduce((s,x)=>s+Number(x.value||0),0).toFixed(2))},
      bills:{pendingCount:pendingBills.length,pendingTotal:Number(pendingBills.reduce((s,b)=>s+Number(b.value||0),0).toFixed(2)),next:pendingBills.slice(0,5).map(b=>({name:b.name,value:Number(b.value||0),dueDate:b.dueDate,status:b.status}))},
      goals:(state.goals||[]).slice(0,6).map(g=>{const missing=Math.max(0,Number(g.target||0)-Number(g.current||0)),months=monthsUntil(g.deadline);return{name:g.name,current:Number(g.current||0),target:Number(g.target||0),missing:Number(missing.toFixed(2)),deadline:g.deadline||null,monthsRemaining:months,requiredMonthly:months?Number((missing/months).toFixed(2)):null};}),
      debts:{total:Number(debtTotal.toFixed(2)),monthlyCommitment:Number(debtMonthly.toFixed(2))},
      health:{score:healthScore(),spending:h.spending,reserve:h.reserve,debt:h.debt,organization:h.organization,goals:h.goals},
      sixMonths:reportMonthSeries().map(x=>({month:x.key,income:Number(x.income.toFixed(2)),expense:Number(x.expense.toFixed(2)),invoices:Number(x.invoices.toFixed(2))})),
      annual:annualSeries().map(x=>({month:x.key,income:Number(x.income.toFixed(2)),expense:Number(x.expense.toFixed(2))}))
    };
  }

  function renderAI() {
    const [cat,value]=biggestExpenseCategory();
    const {income,expense}=totals();
    const share=Math.round(value/Math.max(expense,1)*100);
    const goal=state.goals?.[0];
    const goalPct=goal?Math.min(100,Math.round(Number(goal.current||0)/Math.max(Number(goal.target||1),1)*100)):0;
    const goalMonthly=goal?Math.max(0,(Number(goal.target||0)-Number(goal.current||0))/4):0;
    const aiCard=cardById(selectedCardId)||state.cards?.[0];
    const invoice=aiCard?invoiceBalance(aiCard.id,ym()):0;
    const projected=projectedBalance();
    const score=healthScore();
    const optional=optionalSpendingCapacity();
    const pendingBillsTotal=(state.bills||[]).filter(b=>b.status!=="paid").reduce((sum,b)=>sum+Number(b.value||0),0);
    const activeSubscriptionsTotal=(state.subscriptions||[]).filter(sub=>sub.active).reduce((sum,sub)=>sum+Number(sub.value||0),0);
    const chatCount=(state.chat||[]).length;
    $("#page-ai").innerHTML=`
      <div class="ai-layout">
        <aside class="ai-side-panel">
          <section class="card ai-profile-card">
            <div class="ai-profile-head"><div class="ai-orb">✦</div><div><p class="eyebrow">IA Financeira</p><h3>Seu copiloto financeiro</h3><span>Análises com base nos dados cadastrados no app.</span></div></div>
            <div class="ai-score-ring" style="--score:${Math.round(score/10)*3.6}deg"><div><strong>${score}</strong><small>/1000</small></div></div>
            <p class="ai-score-caption">Saúde financeira atual</p>
          </section>

          <section class="ai-insight-grid">
            <article class="ai-kpi"><small>Saldo projetado</small><strong class="${projected>=0?"income":"expense"}">${money(projected)}</strong><span>fim do mês</span></article>
            <article class="ai-kpi"><small>Faturas abertas</small><strong class="warn">${money(invoice)}</strong><span>${aiCard?escapeHtml(aiCard.name):"sem cartão"}</span></article>
            <article class="ai-kpi"><small>Maior gasto</small><strong>${value?escapeHtml(cat):"—"}</strong><span>${value?`${share}% das saídas`:"sem dados"}</span></article>
            <article class="ai-kpi"><small>Meta principal</small><strong>${goal?`${goalPct}%`:"—"}</strong><span>${goal?escapeHtml(goal.name):"crie uma meta"}</span></article>
          </section>

          <section class="card ai-suggestions-card"><div class="section-head"><div><h3 class="section-title">Sugestões rápidas</h3><span class="section-subtitle">Perguntas que a IA já consegue analisar</span></div></div><div class="suggestion-list">
            <button class="suggestion" data-ai-question="Como posso economizar este mês?"><span class="bot-avatar" style="color:var(--green)">♢</span><span><strong>Economizar este mês</strong><small>Analise os gastos variáveis.</small></span><span>›</span></button>
            <button class="suggestion" data-ai-question="Posso fazer uma compra de R$ 250 este mês?"><span class="bot-avatar" style="color:var(--cyan)">◆</span><span><strong>Posso comprar?</strong><small>Compare uma compra com o que ainda sobra no mês.</small></span><span>›</span></button>
            <button class="suggestion" data-ai-question="Como está minha fatura?"><span class="bot-avatar" style="color:var(--purple)">▭</span><span><strong>Analisar minha fatura</strong><small>${money(invoice)} em aberto.</small></span><span>›</span></button>
            <button class="suggestion" data-ai-question="Como está minha meta?"><span class="bot-avatar">◎</span><span><strong>Plano para minha meta</strong><small>${goal?`Cerca de ${money(goalMonthly)}/mês.`:"Cadastre uma meta."}</small></span><span>›</span></button>
            <button class="suggestion" data-ai-question="Quanto gasto por ano com assinaturas?"><span class="bot-avatar" style="color:var(--cyan)">◉</span><span><strong>Minhas assinaturas</strong><small>${money((state.subscriptions||[]).filter(s=>s.active).reduce((sum,s)=>sum+Number(s.value||0),0))}/mês.</small></span><span>›</span></button>
            <button class="suggestion" data-ai-question="Como está minha saúde financeira?"><span class="bot-avatar" style="color:var(--green)">♥</span><span><strong>Entender meu score</strong><small>${healthScore()}/1000 pontos.</small></span><span>›</span></button>
          </div></section>
        </aside>

        <section class="card ai-chat-panel">
          <div class="ai-chat-header"><div class="bot-avatar ai-chat-avatar">🤖</div><div><strong>Assistente financeiro</strong><small>${state.settings?.aiEnabled===false?"IA online desativada · cálculos locais ativos":"IA híbrida · cálculos precisos + interpretação inteligente"}</small></div><div class="ai-chat-status"><span class="ai-usage-chip">${runtimeMode==="cloud"?`${Number(state.settings?.aiUsage?.requests||0)}/${Number(state.settings?.aiUsage?.limit||30)} hoje`:"local"}</span><span class="ai-live-dot ${state.settings?.aiEnabled===false?"is-off":""}"></span></div></div>
          <div class="chat ai-chat-scroll" id="chatMessages">
            <div class="bubble bot ai-welcome">Olá, ${escapeHtml((state.user?.name||"Usuário").split(/\s+/)[0])}! Posso analisar seu mês, gastos, metas, cartões, dívidas, contas a pagar e também avaliar se uma compra cabe no seu orçamento.</div>
            ${(state.chat||[]).slice(-10).map(m=>`<div class="bubble ${m.role}">${escapeHtml(m.text)}</div>`).join("")}
            ${chatCount<=2?`<section class="ai-chat-context-board">
              <div class="ai-context-head"><div><small>Visão rápida</small><strong>Antes de perguntar, veja como está seu mês</strong></div><span>${chatCount?"Continue a conversa":"Escolha uma análise"}</span></div>
              <div class="ai-context-metrics">
                <article><small>Gasto opcional estimado</small><strong class="${optional>=0?"income":"expense"}">${money(optional)}</strong><span>após compromissos e meta</span></article>
                <article><small>Contas + assinaturas</small><strong>${money(pendingBillsTotal+activeSubscriptionsTotal)}</strong><span>compromissos cadastrados</span></article>
                <article><small>Parcelas mensais</small><strong>${money(monthlyInstallmentCommitment())}</strong><span>ativas neste mês</span></article>
              </div>
              <div class="ai-context-prompts">
                <button data-ai-question="Posso fazer uma compra de R$ 250 este mês?"><span>◆</span><div><strong>Posso comprar?</strong><small>Simule uma compra sem comprometer o mês.</small></div></button>
                <button data-ai-question="O que mais está pesando no meu orçamento este mês?"><span>↘</span><div><strong>O que está pesando?</strong><small>Encontre gastos e compromissos mais fortes.</small></div></button>
                <button data-ai-question="Quanto posso guardar este mês sem faltar dinheiro?"><span>◎</span><div><strong>Quanto posso guardar?</strong><small>Compare saldo projetado, contas e meta.</small></div></button>
                <button data-ai-question="Quais contas e parcelas ainda faltam pagar este mês?"><span>▤</span><div><strong>O que falta pagar?</strong><small>Veja compromissos antes do fim do mês.</small></div></button>
              </div>
            </section>`:""}
          </div>
          ${value?`<div class="ai-inline-insight"><div><small>Categoria que mais pesa no mês</small><strong>${escapeHtml(cat)}</strong></div><div><strong class="expense">${money(value)}</strong><span>${share}% das saídas</span></div></div>`:""}
          <form class="chat-form ai-chat-form" id="aiForm"><input id="aiInput" placeholder="Pergunte algo sobre suas finanças..." autocomplete="off" maxlength="1400"><button class="send-button" type="submit">➤</button></form>
          <p class="ai-disclaimer">As análises usam os dados cadastrados no aplicativo e não substituem orientação financeira profissional.</p>
        </section>
      </div>`;
    $("#aiForm")?.addEventListener("submit",e=>{e.preventDefault();const q=$("#aiInput").value.trim();if(!q)return;sendAIQuestion(q);});
  }


  async function sendAIQuestion(q) {
    state.chat=state.chat||[];
    state.chat.push({role:"user",text:q});
    saveLocalState();renderAI();
    const input=$("#aiInput"),button=$("#aiForm .send-button");if(input)input.disabled=true;if(button){button.disabled=true;button.textContent="…";}
    let answer="";
    try{
      if(runtimeMode==="cloud" && state.settings?.aiEnabled!==false && cloud.askFinancialAI){
        const history=state.chat.slice(-6).map(m=>({role:m.role==="bot"?"assistant":"user",text:String(m.text||"").slice(0,900)}));
        const result=await cloud.askFinancialAI(String(q).slice(0,1400),financialAISnapshot(),history);
        answer=result?.answer||"";
        if(result?.limit){state.settings.aiUsage={...(state.settings.aiUsage||{}),requests:Math.max(0,Number(result.limit)-Number(result.remaining||0)),limit:Number(result.limit)};}
      }
    }catch(err){console.error("IA online indisponível:",err);showToast(err.message||"IA online indisponível. Usando análise local.","error");}
    if(!answer)answer=aiReply(q);
    state.chat.push({role:"bot",text:answer});
    saveLocalState();renderAI();setTimeout(()=>{const box=$("#chatMessages");if(box)box.scrollTop=box.scrollHeight;},30);
  }

  function reportMonthSeries() {
    return Array.from({length:6},(_,idx)=>{
      const key=monthKeyOffset(ym(),idx-5);
      const txs=(state.transactions||[]).filter(t=>String(t.date||"").startsWith(key));
      const income=txs.filter(t=>t.type==="income").reduce((sum,t)=>sum+Number(t.value||0),0);
      const expense=txs.filter(t=>t.type==="expense").reduce((sum,t)=>sum+Number(t.value||0),0);
      const invoices=(state.cards||[]).reduce((sum,c)=>sum+cardInvoiceTotal(c.id,key),0);
      const paid=(state.cards||[]).reduce((sum,c)=>sum+invoicePaidTotal(c.id,key),0);
      return {key,label:monthKeyLabel(key),income,expense,invoices,paid};
    });
  }

  function annualSeries(){
    const year=now.getFullYear();
    return Array.from({length:12},(_,idx)=>{const key=`${year}-${String(idx+1).padStart(2,"0")}`;const txs=(state.transactions||[]).filter(t=>String(t.date||"").startsWith(key));return{key,label:new Intl.DateTimeFormat("pt-BR",{month:"short"}).format(new Date(year,idx,1)).replace(".",""),income:txs.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.value||0),0),expense:txs.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.value||0),0)};});
  }

  function renderReports() {
    const {income,expense}=totals();
    const assets=(state.assets||[]).reduce((s,a)=>s+Number(a.value||0),0)+totalAccountBalance(), debts=(state.debts||[]).reduce((s,d)=>s+Number(d.balance||0),0);
    const invoices=(state.cards||[]).reduce((sum,c)=>sum+invoiceBalance(c.id,ym()),0);
    const series=reportMonthSeries(), maxFlow=Math.max(1,...series.flatMap(x=>[x.income,x.expense])), maxInv=Math.max(1,...series.map(x=>x.invoices));
    const categoryMap={};monthTransactions().filter(t=>t.type==="expense").forEach(t=>categoryMap[t.category]=(categoryMap[t.category]||0)+Number(t.value||0));
    const categories=Object.entries(categoryMap).sort((a,b)=>b[1]-a[1]);const categoryMax=Math.max(1,...categories.map(([,v])=>v));
    const savings=income-expense,savingsRate=income>0?Math.round((savings/income)*100):0;
    $("#page-reports").innerHTML=`
      <section class="card report-hero"><div class="section-head"><div><p class="eyebrow">Resumo mensal</p><h3 class="section-title">Relatório de ${monthLabel()}</h3><span class="section-subtitle">Fluxo de caixa, faturas, categorias e patrimônio em um só lugar.</span></div><div class="toolbar-actions"><button class="secondary-button" data-report-csv>CSV</button><button class="secondary-button" data-report-print>Imprimir / PDF</button><button class="primary-small" data-export>Backup JSON</button></div></div><div class="grid summary-grid" style="margin-top:14px"><div class="metric-card card"><span class="metric-label">Entradas</span><strong class="income">${money(income)}</strong></div><div class="metric-card card"><span class="metric-label">Saídas</span><strong class="expense">${money(expense)}</strong></div><div class="metric-card card"><span class="metric-label">Faturas abertas</span><strong class="warn">${money(invoices)}</strong></div><div class="metric-card card"><span class="metric-label">Economia do mês</span><strong class="${savings>=0?"income":"expense"}">${money(savings)} <small>${savingsRate}%</small></strong></div></div></section>

      <div class="reports-grid">
        <section class="card report-chart-card"><div class="section-head"><div><h3 class="section-title">Fluxo de caixa · 6 meses</h3><span class="section-subtitle">Entradas x saídas registradas</span></div><div class="chart-legend"><span><i class="income-dot"></i>Entradas</span><span><i class="expense-dot"></i>Saídas</span></div></div><div class="bar-chart">${series.map(x=>`<div class="bar-month"><div class="bar-pair"><span class="bar income-bar" style="height:${Math.max(3,x.income/maxFlow*100)}%" title="${money(x.income)}"></span><span class="bar expense-bar" style="height:${Math.max(3,x.expense/maxFlow*100)}%" title="${money(x.expense)}"></span></div><small>${escapeHtml(x.label)}</small></div>`).join("")}</div></section>

        <section class="card report-chart-card"><div class="section-head"><div><h3 class="section-title">Evolução das faturas</h3><span class="section-subtitle">Total lançado em todos os cartões</span></div></div><div class="invoice-chart">${series.map(x=>`<div class="invoice-chart-row"><span>${escapeHtml(x.label)}</span><div class="invoice-chart-track" title="${escapeHtml(x.label)}: ${money(x.invoices)}"><i style="width:${Math.max(2,x.invoices/maxInv*100)}%"></i></div><strong>${money(x.invoices)}</strong></div>`).join("")}</div></section>

        <section class="card report-chart-card"><div class="section-head"><div><h3 class="section-title">Gastos por categoria</h3><span class="section-subtitle">Onde o dinheiro saiu neste mês</span></div></div><div class="category-report">${categories.length?categories.map(([cat,val])=>`<div class="category-report-row"><div><span>${escapeHtml(cat)}</span><strong>${money(val)}</strong></div><div class="category-report-track" title="${escapeHtml(cat)}: ${money(val)}"><i style="width:${Math.max(3,val/categoryMax*100)}%"></i></div></div>`).join(""):`<div class="empty-state">Sem despesas para analisar.</div>`}</div></section>

        <section class="card report-chart-card"><div class="section-head"><div><h3 class="section-title">Patrimônio</h3><span class="section-subtitle">Visão consolidada</span></div><strong class="${assets-debts>=0?"income":"expense"}">${money(assets-debts)}</strong></div><div class="report-patrimony"><div><small>Contas + ativos</small><strong>${money(assets)}</strong></div><div><small>Dívidas</small><strong class="expense">${money(debts)}</strong></div><div><small>Saúde financeira</small><strong>${healthScore()}/1000</strong></div></div></section>
      </div>

      <section class="card section-card annual-report-card"><div class="section-head"><div><p class="eyebrow">Visão anual</p><h3 class="section-title">${now.getFullYear()} em 12 meses</h3><span class="section-subtitle">Acompanhe a evolução do ano inteiro.</span></div><strong class="${annualSeries().reduce((s,x)=>s+x.income-x.expense,0)>=0?"income":"expense"}">${money(annualSeries().reduce((s,x)=>s+x.income-x.expense,0))}</strong></div><div class="annual-bars">${(()=>{const a=annualSeries(),max=Math.max(1,...a.flatMap(x=>[x.income,x.expense]));return a.map(x=>`<div class="annual-month"><div class="annual-pair" title="${escapeHtml(x.label)} · Entradas ${money(x.income)} · Saídas ${money(x.expense)}"><i class="annual-income" style="height:${Math.max(2,x.income/max*100)}%"></i><i class="annual-expense" style="height:${Math.max(2,x.expense/max*100)}%"></i></div><small>${escapeHtml(x.label)}</small></div>`).join("")})()}</div></section>

      <section class="card section-card health-breakdown-card"><div class="section-head"><div><p class="eyebrow">Saúde Financeira</p><h3 class="section-title">Como sua nota é formada</h3><span class="section-subtitle">Cada dimensão vale até 200 pontos.</span></div><strong class="income">${healthScore()}/1000</strong></div><div class="health-dimensions">${(()=>{const h=healthBreakdown(),rows=[["Gastos x renda",h.spending],["Reserva",h.reserve],["Dívidas",h.debt],["Organização",h.organization],["Metas",h.goals]];return rows.map(([label,val])=>`<div class="health-dimension"><div><span>${label}</span><strong>${val}/200</strong></div><div class="progress ${val<100?"red":val<150?"yellow":""}"><span style="width:${Math.round(val/2)}%"></span></div></div>`).join("")})()}</div></section>

      <section class="card section-card"><div class="section-head"><div><h3 class="section-title">Contas e cartões</h3><span class="section-subtitle">Visão consolidada da sua estrutura financeira</span></div></div>${accountsList().map(a=>`<div class="simple-row"><div><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.institution||a.type||"Conta")}</small></div><strong>${money(a.balance)}</strong></div>`).join("")}${(state.cards||[]).map(c=>`<div class="simple-row"><div><strong>Fatura ${escapeHtml(c.name)}</strong><small>•••• ${escapeHtml(c.last4||"0000")} · ${invoiceStatusLabel(invoiceStatus(c.id,ym()))}</small></div><strong class="expense">${money(invoiceBalance(c.id,ym()))}</strong></div>`).join("")}</section>`;
  }

  function exportTransactionsCsv(){
    let txs=[...monthTransactions()].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    if(transactionFilter==="income")txs=txs.filter(t=>t.type==="income");
    if(transactionFilter==="expense")txs=txs.filter(t=>t.type==="expense");
    if(transactionFilter==="recurring")txs=txs.filter(t=>t.recurring);
    const q=transactionSearch.trim().toLocaleLowerCase("pt-BR");
    if(q)txs=txs.filter(t=>[t.description,t.category,accountName(t.accountId),t.notes].some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(q)));
    const rows=[["Data","Descrição","Tipo","Categoria","Conta","Valor","Recorrente","Parcelado"],...txs.map(x=>[x.date,x.description,x.type==="income"?"Entrada":"Saída",x.category||"",accountName(x.accountId),Number(x.value||0).toFixed(2),x.recurring?"Sim":"Não",x.installment?"Sim":"Não"])];
    const csv=rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`esteja-no-controle-transacoes-${ym()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast("Transações exportadas em CSV.","success");
  }

  function exportReportCsv(){
    const rows=[["Mês","Entradas","Saídas","Faturas","Faturas pagas"],...reportMonthSeries().map(x=>[x.key,x.income.toFixed(2),x.expense.toFixed(2),x.invoices.toFixed(2),x.paid.toFixed(2)])];
    const csv=rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`esteja-no-controle-relatorio-${ym()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast("Relatório CSV exportado.","success");
  }

  function isStandalonePwa(){
    return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
  }

  function renderSettings() {
    const cloudStatus=cloud.configured?runtimeMode==="cloud"?"Conectado e sincronizando":"Configurado — modo demonstração ativo":"Ainda não configurado";
    const notificationStatus=("Notification" in window)?Notification.permission:"indisponível";
    const aiUsage=state.settings?.aiUsage||{requests:0,limit:30};
    const aiEnabled=state.settings?.aiEnabled!==false;
    const installLabel=isStandalonePwa()?"Instalado":deferredInstallPrompt?"Instalar":"Disponível pelo navegador";
    const online=navigator.onLine;
    const releaseState=productionState();
    const supportEmail=String(window.ENC_CONFIG?.supportEmail||"").trim();
    $("#page-settings").innerHTML=`
      <section class="card settings-profile-card">
        <div class="section-head"><div><p class="eyebrow">Perfil e preferências</p><h3 class="section-title">Sua conta</h3><span class="section-subtitle">Informações usadas nas projeções e no planejamento.</span></div><div class="profile-avatar">${initials(state.user?.name)}</div></div>
        <form id="profileSettingsForm" class="profile-settings-form">
          <div class="field"><label for="profileName">Nome</label><input id="profileName" value="${escapeHtml(state.user?.name||"")}" required></div>
          <div class="field"><label for="profileEmail">E-mail de acesso</label><input id="profileEmail" type="email" value="${escapeHtml(state.user?.email||"")}" required readonly><small class="field-help">Para trocar o e-mail, use a área Segurança da conta abaixo.</small></div>
          <div class="form-grid"><div class="field"><label for="profileIncome">Renda mensal</label><input id="profileIncome" inputmode="decimal" value="${String(Number(state.settings?.monthlyIncome||0).toFixed(2)).replace(".",",")}"></div><div class="field"><label for="profilePayday">Dia principal de recebimento</label><input id="profilePayday" type="number" min="1" max="31" value="${state.settings?.paydayDay||""}"></div></div>
          <div class="field"><label for="profileMonthlyGoal">Meta mensal para guardar</label><input id="profileMonthlyGoal" inputmode="decimal" value="${String(Number(state.settings?.monthlySavingsTarget||0).toFixed(2)).replace(".",",")}"></div>
          <button class="primary-small" type="submit">Salvar perfil</button>
        </form>
      </section>

      <section class="settings-section">
        <div class="settings-section-title"><div><p class="eyebrow">Segurança</p><h3>Segurança da conta</h3></div><span class="status-pill ${runtimeMode}">${runtimeMode==="cloud"?"Protegida na nuvem":"Modo local"}</span></div>
        <div class="settings-group">
          <div class="setting-row"><div><strong>Alterar e-mail</strong><span>${runtimeMode==="cloud"?"O novo endereço poderá exigir confirmação por e-mail.":"Disponível quando entrar pela nuvem."}</span></div><button class="secondary-button" data-account-action="email" ${runtimeMode!=="cloud"?"disabled":""}>Alterar</button></div>
          <div class="setting-row"><div><strong>Alterar senha</strong><span>Use pelo menos 8 caracteres com letras e números.</span></div><button class="secondary-button" data-account-action="password" ${runtimeMode!=="cloud"?"disabled":""}>Nova senha</button></div>
          <div class="setting-row"><div><strong>Sair de todos os dispositivos</strong><span>Revoga as sessões da sua conta, inclusive a atual.</span></div><button class="secondary-button" data-signout-everywhere ${runtimeMode!=="cloud"?"disabled":""}>Encerrar sessões</button></div>
          <div class="setting-row"><div><strong>Exportar meus dados</strong><span>Baixe uma cópia JSON dos dados atualmente carregados.</span></div><button class="secondary-button" data-export>Exportar</button></div>
          ${runtimeMode==="cloud"?`<div class="setting-row danger-setting"><div><strong>Excluir conta e dados</strong><span>A exclusão é permanente. O banco financeiro vinculado ao usuário é removido junto com a conta.</span></div><button class="danger-button" data-account-action="delete">Excluir conta</button></div>`:""}
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-section-title"><div><p class="eyebrow">Aplicativo</p><h3>Experiência e sincronização</h3></div><span class="network-chip ${online?"online":"offline"}">${online?"● Online":"● Offline"}</span></div>
        <div class="settings-group">
          <div class="setting-row"><div><strong>Modo de dados</strong><span>${runtimeMode==="cloud"?"Supabase / nuvem":"Demonstração / localStorage"}</span></div><span class="status-pill ${runtimeMode}">${runtimeMode==="cloud"?"☁ Nuvem":"◈ Local"}</span></div>
          <div class="setting-row"><div><strong>Aparência</strong><span>Tema atual: ${state.settings?.theme==="dark"?"Escuro":"Claro"}</span></div><button class="secondary-button" data-toggle-theme>Alternar</button></div>
          <div class="setting-row"><div><strong>Instalar aplicativo</strong><span>${isStandalonePwa()?"O Esteja no Controle está aberto como PWA.":"Instale para abrir como um aplicativo no celular ou computador."}</span></div><button class="secondary-button" data-install-pwa ${(!deferredInstallPrompt||isStandalonePwa())?"disabled":""}>${installLabel}</button></div>
          <div class="setting-row"><div><strong>Versão instalada</strong><span>Esteja no Controle ${APP_VERSION}</span></div><span class="status-pill cloud">Atual</span></div>
          <div class="setting-row"><div><strong>Verificar atualizações</strong><span>Consulta a versão publicada sem usar o cache do navegador.</span></div><button class="secondary-button" data-check-update>Verificar</button></div>
          <div class="setting-row"><div><strong>Atualizar aplicativo agora</strong><span>Limpa somente o cache do Esteja no Controle, busca os arquivos novos e recarrega o app.</span></div><button class="primary-small" data-force-app-update>Atualizar agora</button></div>
          <div class="setting-row"><div><strong>Notificações do navegador</strong><span>Status: ${notificationStatus==="granted"?"Ativadas":notificationStatus==="denied"?"Bloqueadas":notificationStatus==="default"?"Ainda não autorizadas":"Indisponíveis"}</span></div><button class="secondary-button" data-enable-browser-notifications>${notificationStatus==="granted"?"Ativadas":"Ativar"}</button></div>
          <div class="setting-row"><div><strong>Tour inicial</strong><span>Reveja as principais áreas do aplicativo.</span></div><button class="secondary-button" data-open-onboarding>Ver tour</button></div>
          ${runtimeMode==="cloud"?`<div class="setting-row"><div><strong>Sincronização</strong><span>${lastCloudSyncAt?`Última: ${lastCloudSyncAt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`:"Aguardando primeira sincronização."}</span></div><div class="setting-actions"><button class="secondary-button" data-run-automations>Automações</button><button class="secondary-button" data-sync-cloud>Sincronizar</button></div></div>`:""}
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-section-title"><div><p class="eyebrow">Inteligência</p><h3>IA Financeira</h3></div><span class="status-pill ${aiEnabled?"cloud":"local"}">${aiEnabled?"Ativa":"Desativada"}</span></div>
        <div class="settings-group">
          <div class="setting-row"><div><strong>IA online</strong><span>${runtimeMode==="cloud"?`Uso de hoje: ${Number(aiUsage.requests||0)}/${Number(aiUsage.limit||30)} consultas.`:"No modo local, apenas os cálculos internos ficam disponíveis."}</span></div><button class="secondary-button" data-toggle-ai>${aiEnabled?"Desativar":"Ativar"}</button></div>
          <div class="setting-row"><div><strong>Como a IA usa meus dados?</strong><span>Veja quais dados financeiros são resumidos e enviados quando você faz uma pergunta.</span></div><button class="secondary-button" data-info-modal="ai">Entender</button></div>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-section-title"><div><p class="eyebrow">Privacidade</p><h3>Privacidade, termos e suporte</h3></div></div>
        <div class="settings-group">
          <div class="setting-row"><div><strong>Aviso de Privacidade</strong><span>Dados tratados, armazenamento, IA e direitos do usuário.</span></div><div class="setting-actions"><button class="secondary-button" data-info-modal="privacy">No app</button><a class="secondary-button" href="./privacidade.html" target="_blank" rel="noopener">Página</a></div></div>
          <div class="setting-row"><div><strong>Termos de Uso</strong><span>Regras de utilização e limitações das análises financeiras.</span></div><div class="setting-actions"><button class="secondary-button" data-info-modal="terms">No app</button><a class="secondary-button" href="./termos.html" target="_blank" rel="noopener">Página</a></div></div>
          <div class="setting-row"><div><strong>Suporte e diagnóstico</strong><span>${supportEmail?`Contato: ${escapeHtml(supportEmail)}`:"Informações técnicas e ajuda do aplicativo."}</span></div><div class="setting-actions"><button class="secondary-button" data-info-modal="support">Diagnóstico</button><a class="secondary-button" href="./suporte.html" target="_blank" rel="noopener">Página</a></div></div>
          ${runtimeMode==="local"?`<div class="setting-row"><div><strong>Restaurar demonstração</strong><span>Volta aos dados de exemplo do aplicativo.</span></div><button class="danger-button" data-reset-demo>Restaurar</button></div>`:""}
          <div class="setting-row"><div><strong>Sair</strong><span>Encerrar apenas esta sessão neste dispositivo.</span></div><button class="danger-button" data-logout>Sair</button></div>
        </div>
      </section>

      <section class="card section-card production-status-card"><div class="section-head"><div><p class="eyebrow">Aplicativo</p><h3 class="section-title">Status do aplicativo</h3><span class="section-subtitle">${cloudStatus}.</span></div><span class="cloud-dot ${runtimeMode==="cloud"?"online":"local"}"></span></div><div class="production-status-grid"><div><small>Internet</small><strong>${online?"Online":"Offline"}</strong></div><div><small>Dados</small><strong>${runtimeMode==="cloud"?"Nuvem":"Local"}</strong></div><div><small>IA online</small><strong>${runtimeMode==="cloud"&&aiEnabled?"Disponível":"Fallback local"}</strong></div></div></section>`;
    $("#profileSettingsForm")?.addEventListener("submit",saveProfileSettings);
  }

  async function saveProfileSettings(e){
    e.preventDefault();
    const name=$("#profileName").value.trim(),email=$("#profileEmail").value.trim(),monthly=parseMoneyInput($("#profileMonthlyGoal").value),monthlyIncome=parseMoneyInput($("#profileIncome").value),payday=Number($("#profilePayday").value||0);
    if(!name||!email){showToast("Preencha nome e e-mail.","error");return;}
    try{
      if(runtimeMode==="cloud"){
        const user=await cloud.getUser();
        if(user)await cloud.updateProfile(user,{name,monthlyIncome:Number.isFinite(monthlyIncome)?Math.max(0,monthlyIncome):0,paydayDay:payday>=1&&payday<=31?payday:null,monthlySavingsTarget:Number.isFinite(monthly)?Math.max(0,monthly):0,currency:state.settings?.currency||"BRL"});
        state.user={...state.user,name};
      }else state.user={...state.user,name,email};
      state.settings={...state.settings,monthlySavingsTarget:Number.isFinite(monthly)?Math.max(0,monthly):0,monthlyIncome:Number.isFinite(monthlyIncome)?Math.max(0,monthlyIncome):0,paydayDay:payday>=1&&payday<=31?payday:null};
      localStorage.setItem("enc.monthlySavingsTarget",String(state.settings.monthlySavingsTarget));
      saveLocalState();$("#avatarInitials").textContent=initials(name);renderSettings();showToast("Perfil atualizado.","success");
    }catch(err){console.error(err);showToast(err.message||"Não foi possível atualizar o perfil.","error");}
  }

  function openAccountAction(type){
    if(runtimeMode!=="cloud"){showToast("Entre pela nuvem para gerenciar a conta.","error");return;}
    accountActionType=type;
    const title=$("#accountActionTitle"),copy=$("#accountActionCopy"),fields=$("#accountActionFields"),submit=$("#accountActionSubmit");
    if(type==="email"){
      title.textContent="Alterar e-mail";copy.textContent="Digite o novo e-mail. Dependendo da configuração de segurança, você receberá uma confirmação antes da troca.";
      fields.innerHTML=`<div class="field"><label for="accountNewEmail">Novo e-mail</label><input id="accountNewEmail" type="email" required placeholder="novo@email.com"></div>`;submit.textContent="Solicitar alteração";submit.className="primary-button";
    }else if(type==="password"){
      title.textContent="Alterar senha";copy.textContent="Crie uma senha diferente da atual, com pelo menos 8 caracteres, letras e números.";
      fields.innerHTML=`<div class="field"><label for="accountNewPassword">Nova senha</label><input id="accountNewPassword" type="password" minlength="8" required autocomplete="new-password"></div><div class="field"><label for="accountConfirmPassword">Confirmar nova senha</label><input id="accountConfirmPassword" type="password" minlength="8" required autocomplete="new-password"></div>`;submit.textContent="Atualizar senha";submit.className="primary-button";
    }else if(type==="delete"){
      title.textContent="Excluir conta permanentemente";copy.textContent="Esta ação remove sua conta de autenticação e os dados financeiros associados. Para confirmar, informe sua senha atual e digite EXCLUIR.";
      fields.innerHTML=`<div class="danger-callout">Essa operação não pode ser desfeita. Exporte seus dados antes se quiser guardar uma cópia.</div><div class="field"><label for="deleteCurrentPassword">Senha atual</label><input id="deleteCurrentPassword" type="password" required autocomplete="current-password"></div><div class="field"><label for="deleteConfirmText">Digite EXCLUIR</label><input id="deleteConfirmText" required autocomplete="off" placeholder="EXCLUIR"></div>`;submit.textContent="Excluir minha conta";submit.className="danger-submit";
    }else return;
    $("#accountActionBackdrop").hidden=false;
    setTimeout(()=>fields.querySelector("input")?.focus(),30);
  }

  function closeAccountAction(){accountActionType=null;$("#accountActionBackdrop").hidden=true;$("#accountActionForm")?.reset();}

  async function handleAccountAction(e){
    e.preventDefault();
    const submit=$("#accountActionSubmit");
    try{
      if(accountActionType==="email"){
        const email=$("#accountNewEmail").value.trim();
        if(!email||email===state.user?.email){showToast("Informe um e-mail diferente do atual.","error");return;}
        setBusy(submit,true,"Enviando...");await cloud.updateEmail(email);closeAccountAction();showToast("Solicitação enviada. Confira seu e-mail para concluir a alteração.","success");return;
      }
      if(accountActionType==="password"){
        const password=$("#accountNewPassword").value,confirmPassword=$("#accountConfirmPassword").value;
        if(password.length<8||!/[A-Za-zÀ-ÿ]/.test(password)||!/\d/.test(password)){showToast("Use pelo menos 8 caracteres, incluindo letras e números.","error");return;}
        if(password!==confirmPassword){showToast("As senhas não coincidem.","error");return;}
        setBusy(submit,true,"Atualizando...");await cloud.updatePassword(password);closeAccountAction();showToast("Senha atualizada com sucesso.","success");return;
      }
      if(accountActionType==="delete"){
        const password=$("#deleteCurrentPassword").value,phrase=$("#deleteConfirmText").value.trim();
        if(phrase!=="EXCLUIR"){showToast("Digite EXCLUIR exatamente como mostrado.","error");return;}
        if(!password){showToast("Informe sua senha atual.","error");return;}
        setBusy(submit,true,"Excluindo...");await cloud.reauthenticate(state.user?.email||"",password);await cloud.deleteAccount();
        closeAccountAction();localStorage.removeItem(STORAGE_KEY);state=buildDefaultState();runtimeMode="local";showAuthScreen();showToast("Conta excluída.","success");return;
      }
    }catch(err){console.error(err);showToast(translateAuthError(err.message)||"Não foi possível concluir a ação.","error");}
    finally{setBusy(submit,false);}
  }

  async function signOutEverywhere(){
    if(runtimeMode!=="cloud")return;
    if(!confirm("Encerrar sua conta em todos os dispositivos?"))return;
    try{await cloud.signOutEverywhere();runtimeMode="local";showAuthScreen();showToast("Todas as sessões foram encerradas.","success");}catch(err){console.error(err);showToast(err.message||"Não foi possível encerrar as sessões.","error");}
  }

  async function toggleAIOnline(){
    const next=state.settings?.aiEnabled===false;
    try{
      if(runtimeMode==="cloud"){
        const user=await cloud.getUser();if(user)await cloud.updateProfile(user,{aiEnabled:next});
      }
      state.settings={...state.settings,aiEnabled:next};localStorage.setItem("enc.aiEnabled",next?"1":"0");saveLocalState();renderSettings();renderAI();showToast(next?"IA online ativada.":"IA online desativada. Os cálculos locais continuam disponíveis.","success");
    }catch(err){console.error(err);showToast(err.message||"Não foi possível alterar a IA.","error");}
  }

  async function installPwa(){
    if(isStandalonePwa()){showToast("O aplicativo já está instalado.","success");return;}
    if(!deferredInstallPrompt){showToast("Use a opção ‘Instalar aplicativo’ ou ‘Adicionar à tela inicial’ do navegador.");return;}
    try{deferredInstallPrompt.prompt();const choice=await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;renderSettings();showToast(choice?.outcome==="accepted"?"Instalação iniciada.":"Instalação cancelada.",choice?.outcome==="accepted"?"success":"");}catch(err){console.error(err);showToast("Não foi possível iniciar a instalação.","error");}
  }

  function openInfoModal(kind){
    const title=$("#infoModalTitle"),eyebrow=$("#infoModalEyebrow"),content=$("#infoModalContent");
    const privacy=`<div class="legal-badge">Esteja no Controle</div><h4>Como seus dados são usados</h4><p>O Esteja no Controle trata os dados que você cadastra para oferecer controle financeiro, sincronização e análises. Isso pode incluir nome, e-mail, renda, saldos, transações, categorias, contas, metas, parcelas, cartões, faturas, dívidas, assinaturas e preferências.</p><h4>Armazenamento e segurança</h4><p>Quando você usa a conta na nuvem, os dados ficam armazenados no Supabase e protegidos por regras de acesso por usuário (RLS). Preferências técnicas também podem ser mantidas no armazenamento local do navegador.</p><h4>IA Financeira</h4><p>Apenas quando você envia uma pergunta à IA online, o aplicativo prepara um resumo financeiro estruturado e o envia ao serviço de IA pelo backend. O resumo não inclui sua senha, e-mail ou números completos de cartão. A solicitação é feita com armazenamento da resposta desativado no endpoint utilizado.</p><h4>Seus controles</h4><p>Nas Configurações você pode exportar uma cópia dos dados, corrigir informações do perfil e solicitar a exclusão da conta. Alguns dados podem ter regras de conservação aplicáveis conforme obrigações legais ou operacionais do serviço.</p><p class="legal-note">Você pode exportar seus dados e solicitar a exclusão da conta nas Configurações.</p>`;
    const terms=`<div class="legal-badge">Esteja no Controle</div><h4>Uso do aplicativo</h4><p>O Esteja no Controle é uma ferramenta de organização financeira pessoal. O usuário é responsável pela exatidão das informações cadastradas e por revisar lançamentos, projeções e alertas antes de tomar decisões.</p><h4>Análises e projeções</h4><p>Projeções são estimativas baseadas nos dados cadastrados e não representam garantia de saldo, economia, retorno ou resultado futuro. A IA Financeira fornece apoio informativo e não substitui orientação profissional individualizada para decisões financeiras relevantes.</p><h4>Disponibilidade</h4><p>Recursos de nuvem, notificações e IA dependem de internet e de serviços de terceiros. O aplicativo possui fallback local para parte das análises, mas algumas funções podem ficar temporariamente indisponíveis.</p><h4>Conta</h4><p>O usuário pode encerrar sessões, exportar os dados e excluir a conta pelas Configurações. A exclusão é permanente e deve ser confirmada de forma explícita.</p>`;
    const ai=`<h4>O que vai para a IA</h4><p>O aplicativo calcula primeiro os números e envia somente um resumo necessário para responder à sua pergunta: totais do mês, comparação com meses anteriores, categorias, saldo projetado, faturas, assinaturas, contas pendentes, metas, dívidas e indicadores de saúde financeira.</p><h4>O que não deve ser enviado</h4><p>Senha, códigos de autenticação, CPF, documentos, e-mail e números completos de cartão não fazem parte do resumo financeiro da IA.</p><h4>Controle de custo e abuso</h4><p>A IA online é limitada a 30 consultas por usuário por dia. Perguntas e histórico também têm tamanho máximo no servidor. Quando a IA online não estiver disponível, o app pode responder usando os cálculos locais.</p><p class="legal-note">As análises são baseadas nos dados cadastrados no aplicativo e não substituem orientação financeira profissional.</p>`;
    const supportEmail=String(window.ENC_CONFIG?.supportEmail||"").trim(),legalOwner=String(window.ENC_CONFIG?.legalOwner||"").trim();
    const support=`<h4>Diagnóstico do aplicativo</h4><div class="diagnostic-box"><div><span>Modo</span><strong>${runtimeMode==="cloud"?"Nuvem":"Local"}</strong></div><div><span>Internet</span><strong>${navigator.onLine?"Online":"Offline"}</strong></div><div><span>PWA</span><strong>${isStandalonePwa()?"Instalado":"Navegador"}</strong></div></div><p>O diagnóstico não inclui seus lançamentos, saldos, senha ou dados de cartão.</p><button class="secondary-button" data-copy-diagnostic>Copiar diagnóstico</button>${supportEmail?`<p class="legal-note">Suporte: ${escapeHtml(supportEmail)}</p>`:""}${legalOwner?`<p class="legal-note">Responsável: ${escapeHtml(legalOwner)}</p>`:""}`;
    const map={privacy:["Privacidade","Aviso de Privacidade",privacy],terms:["Uso responsável","Termos de Uso",terms],ai:["IA Financeira","Privacidade e IA",ai],support:["Ajuda","Suporte e diagnóstico",support]};
    const selected=map[kind]||map.support;eyebrow.textContent=selected[0];title.textContent=selected[1];content.innerHTML=selected[2];$("#infoBackdrop").hidden=false;
  }

  function closeInfoModal(){$("#infoBackdrop").hidden=true;}

  async function copyDiagnostic(){
    const text=[`Esteja no Controle`,`Modo: ${runtimeMode}`,`Internet: ${navigator.onLine?"online":"offline"}`,`PWA: ${isStandalonePwa()?"sim":"não"}`,`Navegador: ${navigator.userAgent}`].join("\n");
    try{await navigator.clipboard.writeText(text);showToast("Diagnóstico copiado.","success");}catch{showToast("Não foi possível copiar automaticamente.","error");}
  }

  function updateNetworkStatus(initial=false){
    const online=navigator.onLine,banner=$("#networkStatus");
    if(banner)banner.hidden=online;
    document.body.classList.toggle("is-offline",!online);
    if(!initial&&online!==lastOnlineState){showToast(online?"Internet restaurada. Sincronizando dados...":"Você está offline. O app continuará com os dados disponíveis.",online?"success":"error");}
    if(online&&!initial&&runtimeMode==="cloud")syncCloudNow(false);
    lastOnlineState=online;
    if(currentPage==="settings"&&!$("#page-settings")?.hidden)renderSettings();
  }

  function exportData() {
    const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString(),runtimeMode},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob), a=document.createElement("a");a.href=url;a.download=`esteja-no-controle-backup-${ymd(now.getDate())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast("Backup exportado.","success");
  }

  function categoryOptions(kind, selected="") {
    let list;
    if(runtimeMode==="cloud" && Array.isArray(state.categories) && state.categories.length) list=state.categories.filter(c=>c.kind===kind).map(c=>c.name);
    else list=categoryNames[kind];
    return [...new Set(list)].map(name=>`<option ${name===selected?"selected":""}>${escapeHtml(name)}</option>`).join("");
  }

  function populateTxCategories(selected="") {
    const type=$("#txType").value;
    $("#txCategory").innerHTML=categoryOptions(type,selected);
  }
  function populateTxAccounts(selected="") {
    const select=$("#txAccount");
    if(select) select.innerHTML=accountOptions(selected||primaryAccount()?.id);
  }

  function openTransactionModal(id=null) {
    editingTransactionId=id;
    const existing=id?(state.transactions||[]).find(t=>String(t.id)===String(id)):null;
    $("#modalTitle").textContent=existing?"Editar transação":"Nova transação";
    $("#transactionSubmit").textContent=existing?"Salvar alterações":"Salvar transação";
    $("#modalBackdrop").hidden=false;
    $("#txDescription").value=existing?.description||"";
    $("#txValue").value=existing?String(existing.value).replace(".",","):"";
    $("#txType").value=existing?.type||"expense";
    populateTxCategories(existing?.category||"");
    $("#txDate").value=existing?.date||ymd(now.getDate());
    populateTxAccounts(existing?.accountId||primaryAccount()?.id||"");
    $("#txRecurring").checked=Boolean(existing?.recurring);
    $("#txInstallment").checked=Boolean(existing?.installment);
    $("#txNotes").value=existing?.notes||"";
    setTimeout(()=>$("#txDescription").focus(),50);
  }
  function closeTransactionModal(){editingTransactionId=null;$("#modalBackdrop").hidden=true;$("#transactionForm").reset();}

  async function saveTransaction(e) {
    e.preventDefault();
    const submit=$("#transactionSubmit"), value=parseMoneyInput($("#txValue").value);
    if(!Number.isFinite(value)||value<=0){showToast("Digite um valor válido.","error");return;}
    const data={description:$("#txDescription").value.trim(),value,type:$("#txType").value,category:$("#txCategory").value,date:$("#txDate").value,accountId:$("#txAccount")?.value||primaryAccount()?.id||null,recurring:$("#txRecurring").checked,installment:$("#txInstallment").checked,notes:$("#txNotes").value.trim()};
    if(!data.description){showToast("Informe uma descrição.","error");return;}
    const existing=editingTransactionId?(state.transactions||[]).find(t=>String(t.id)===String(editingTransactionId)):null;
    setBusy(submit,true,"Salvando...");
    try{
      if(runtimeMode==="cloud"){
        await cloud.saveTransaction(state.user,data,existing||null);
        await refreshCloudState();
      }else{
        if(existing){
          const previousDelta=existing.type==="income"?Number(existing.value||0):-Number(existing.value||0);
          applyAccountDelta(existing.accountId||primaryAccount()?.id,-previousDelta);
        }
        const nextDelta=data.type==="income"?data.value:-data.value;
        applyAccountDelta(data.accountId,nextDelta);
        if(existing) Object.assign(existing,data); else state.transactions.push({id:uid(),...data});
        saveLocalState();renderAll();
      }
      closeTransactionModal();showPage("transactions");showToast(existing?"Transação atualizada.":"Transação adicionada.","success");
    }catch(err){console.error(err);showToast(err.message||"Não foi possível salvar.","error");}
    finally{setBusy(submit,false);}
  }

  async function deleteTransaction(id) {
    const existing=(state.transactions||[]).find(t=>String(t.id)===String(id));
    if(!existing||!confirm(`Excluir a transação “${existing.description}”?`)) return;
    try{
      if(runtimeMode==="cloud"){
        await cloud.deleteTransaction(state.user,existing);await refreshCloudState();
      }else{
        state.transactions=state.transactions.filter(t=>String(t.id)!==String(id));
        const reverse=existing.type==="income"?-Number(existing.value):Number(existing.value);
        applyAccountDelta(existing.accountId||primaryAccount()?.id,reverse);
        saveLocalState();renderAll();
      }
      showToast("Transação excluída.","success");
    }catch(err){console.error(err);showToast(err.message||"Não foi possível excluir.","error");}
  }

  function entityTitle(entity){return {goal:"Meta",budget:"Orçamento",installment:"Compra parcelada",recurring:"Recorrência",card:"Cartão",debt:"Dívida",asset:"Ativo",account:"Conta",cardPurchase:"Compra no cartão",goalContribution:"Aporte",transfer:"Transferência",invoicePayment:"Pagamento de fatura",subscription:"Assinatura",bill:"Conta a pagar",futureTransaction:"Lançamento futuro"}[entity]||"Cadastro";}
  function getEntity(entity,id){const arr=state[entityArrays[entity]]||[];return arr.find(x=>String(x.id)===String(id));}

  function openEntityModal(entity,id=null) {
    const existing=id?getEntity(entity,id):null;
    $("#entityModalBackdrop").hidden=false;
    $("#entityModalTitle").textContent=`${existing?"Editar":"Novo"} ${entityTitle(entity).toLowerCase()}`;
    $("#entityForm").dataset.entity=entity;
    $("#entityForm").dataset.id=id||"";
    $("#entitySubmit").textContent=existing?"Salvar alterações":"Cadastrar";
    $("#entityFormFields").innerHTML=entityFields(entity,existing||{});
    setTimeout(()=>$("#entityFormFields input, #entityFormFields select")?.focus(),40);
  }
  function closeEntityModal(){ $("#entityModalBackdrop").hidden=true;$("#entityForm").reset();$("#entityForm").dataset.entity="";$("#entityForm").dataset.id="";invoicePaymentContext=null; }

  function inputField(label,name,value="",type="text",extra="") {return `<div class="field"><label for="ef-${name}">${label}</label><input id="ef-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}></div>`;}
  function selectField(label,name,options){return `<div class="field"><label for="ef-${name}">${label}</label><select id="ef-${name}" name="${name}">${options}</select></div>`;}
  function option(value,label,selected){return `<option value="${escapeHtml(value)}" ${String(value)===String(selected)?"selected":""}>${escapeHtml(label)}</option>`;}

  function entityFields(entity,v) {
    switch(entity){
      case"goal":return `${inputField("Nome da meta","name",v.name,"text","required")}${inputField("Ícone (emoji)","icon",v.icon||"◎") }<div class="form-grid">${inputField("Valor atual","current",v.current||0,"text","inputmode=decimal required")}${inputField("Valor alvo","target",v.target||"","text","inputmode=decimal required")}</div>${inputField("Prazo","deadline",v.deadline||"","date")}`;
      case"goalContribution":return `${selectField("Meta","goalId",goalOptions(v.goalId))}<div class="form-grid">${inputField("Valor do aporte","amount",v.amount||"","text","inputmode=decimal required")}${inputField("Data","date",v.date||ymd(now.getDate()),"date","required")}</div>${inputField("Observação","note",v.note||"","text","placeholder='Ex.: aporte mensal'")}`;
      case"budget":return `${selectField("Categoria","category",categoryOptions("expense",v.category))}${inputField("Limite mensal","limit",v.limit||"","text","inputmode=decimal required")}`;
      case"installment":return `${inputField("Compra","name",v.name,"text","required")}<div class="form-grid">${inputField("Valor total","total",v.total||"","text","inputmode=decimal required")}${inputField("Valor da parcela","installmentValue",v.installmentValue||"","text","inputmode=decimal required")}</div><div class="form-grid">${inputField("Total de parcelas","installments",v.installments||"","number","min=1 required")}${inputField("Parcelas pagas","paid",v.paid||0,"number","min=0 required")}</div><div class="form-grid">${inputField("Próximo vencimento","nextDue",v.nextDue||"","date")}${selectField("Cartão", "cardId", cardOptions(v.cardId,true))}</div>${selectField("Categoria","category",categoryOptions("expense",v.category||"Casa"))}`;
      case"recurring":return `${inputField("Descrição","name",v.name,"text","required")}<div class="form-grid">${inputField("Valor","value",v.value||"","text","inputmode=decimal required")}${inputField("Dia do mês","day",v.day||1,"number","min=1 max=31 required")}</div>${selectField("Tipo","type",option("expense","Saída",v.type||"expense")+option("income","Entrada",v.type))}<div class="field"><label>Categoria</label><select name="category" id="recCategory"></select></div>${selectField("Conta vinculada","accountId",accountOptions(v.accountId||primaryAccount()?.id))}${selectField("Automação mensal","automationMode",option("manual","Só lembrar / manual",v.automationMode||"manual")+option("auto_post","Lançar automaticamente no vencimento",v.automationMode)+option("bill","Criar conta a pagar automaticamente",v.automationMode))}<small class="field-help">Para salário, use “Lançar automaticamente”. Para aluguel, internet e contas fixas, use “Criar conta a pagar”.</small>`;
      case"card":return `${inputField("Nome do cartão","name",v.name,"text","required")}<div class="form-grid">${inputField("Final (4 dígitos)","last4",v.last4||"","text","maxlength=4 inputmode=numeric")}${inputField("Bandeira","brand",v.brand||"VISA")}</div><div class="form-grid">${inputField("Limite total","limit",v.limit||"","text","inputmode=decimal required")}${inputField("Limite usado estimado","used",v.used||0,"text","inputmode=decimal required")}</div><div class="form-grid">${inputField("Dia de fechamento","closingDay",v.closingDay||25,"number","min=1 max=31")}${inputField("Dia de vencimento","dueDay",v.dueDay||5,"number","min=1 max=31")}</div>${selectField("Visual","theme",option("purple","Roxo",v.theme||"purple")+option("orange","Laranja",v.theme)+option("blue","Azul",v.theme))}`;
      case"cardPurchase":return `${selectField("Cartão","cardId",cardOptions(v.cardId||selectedCardId))}${inputField("Descrição","description",v.description||"","text","required")}<div class="form-grid">${inputField("Valor da parcela / compra à vista","amount",v.amount||"","text","inputmode=decimal required")}${inputField("Data da compra","date",v.date||ymd(now.getDate()),"date","required")}</div>${selectField("Categoria","category",categoryOptions("expense",v.category||"Casa"))}<div class="form-grid">${inputField("Total de parcelas","installments",v.installments||1,"number","min=1 required")}${inputField("Parcela atual","currentInstallment",v.currentInstallment||1,"number","min=1 required")}</div>`;
      case"account":return `${inputField("Nome da conta","name",v.name||"","text","required")}${inputField("Banco / instituição","institution",v.institution||"","text","placeholder='Ex.: Nubank, Caixa, Dinheiro'")}<div class="form-grid">${selectField("Tipo","type",option("bank","Conta bancária",v.type||"bank")+option("cash","Carteira / dinheiro",v.type)+option("investment","Investimentos",v.type))}${inputField("Saldo atual","balance",v.balance||0,"text","inputmode=decimal required")}</div>`;
      case"transfer":return `${selectField("Conta de origem","fromAccountId",accountOptions(v.fromAccountId||primaryAccount()?.id))}${selectField("Conta de destino","toAccountId",accountOptions(v.toAccountId||accountsList().find(a=>String(a.id)!==String(v.fromAccountId||primaryAccount()?.id))?.id))}<div class="form-grid">${inputField("Valor","amount",v.amount||"","text","inputmode=decimal required")}${inputField("Data","date",v.date||ymd(now.getDate()),"date","required")}</div>${inputField("Observação","note",v.note||"","text","placeholder='Opcional'")}`;
      case"invoicePayment":{const ctx=invoicePaymentContext||{}, card=cardById(ctx.cardId), remaining=invoiceBalance(ctx.cardId,ctx.invoiceMonth);return `<input type="hidden" name="cardId" value="${escapeHtml(ctx.cardId||"")}"><input type="hidden" name="invoiceMonth" value="${escapeHtml(ctx.invoiceMonth||ym())}"><div class="invoice-payment-modal-summary"><span>${escapeHtml(card?.name||"Cartão")} · ${monthKeyLabel(ctx.invoiceMonth||ym())}</span><strong>Saldo ${money(remaining)}</strong></div>${selectField("Pagar com","accountId",accountOptions(v.accountId||primaryAccount()?.id))}<div class="form-grid">${inputField("Valor do pagamento","amount",v.amount||remaining,"text","inputmode=decimal required")}${inputField("Data do pagamento","paidOn",v.paidOn||ymd(now.getDate()),"date","required")}</div>${inputField("Observação","note",v.note||"Pagamento da fatura","text")}`;}
      case"subscription":return `${inputField("Nome da assinatura","name",v.name||"","text","required")}<div class="form-grid">${inputField("Valor mensal","value",v.value||"","text","inputmode=decimal required")}${inputField("Dia da renovação","day",v.day||1,"number","min=1 max=31 required")}</div>${selectField("Categoria","category",categoryOptions("expense",v.category||"Assinaturas"))}<div class="form-grid">${selectField("Conta usada","accountId",accountOptions(v.accountId||primaryAccount()?.id))}${inputField("Ícone","icon",v.icon||"◉")}</div>${selectField("Status","active",option("true","Ativa",String(v.active??true))+option("false","Pausada",String(v.active??true)))}${selectField("Automação","autoCreateBill",option("true","Criar conta a pagar todo mês",String(v.autoCreateBill??true))+option("false","Somente acompanhar",String(v.autoCreateBill??true)))}`;
      case"bill":return `${inputField("Nome da conta","name",v.name||"","text","required")}<div class="form-grid">${inputField("Valor","value",v.value||"","text","inputmode=decimal required")}${inputField("Vencimento","dueDate",v.dueDate||ymd(now.getDate()),"date","required")}</div>${selectField("Categoria","category",categoryOptions("expense",v.category||"Casa"))}${selectField("Conta para pagamento","accountId",accountOptions(v.accountId||primaryAccount()?.id))}${inputField("Código / observação","barcode",v.barcode||"","text","placeholder='Opcional'")}`;
      case"futureTransaction":return `${inputField("Descrição","description",v.description||"","text","required")}<div class="form-grid">${inputField("Valor previsto","value",v.value||"","text","inputmode=decimal required")}${inputField("Data prevista","date",v.date||nextMonthDate(1),"date","required")}</div>${selectField("Tipo","type",option("expense","Saída",v.type||"expense")+option("income","Entrada",v.type))}${selectField("Categoria","category",categoryOptions(v.type||"expense",v.category))}${selectField("Conta","accountId",accountOptions(v.accountId||primaryAccount()?.id))}`;
      case"debt":return `${inputField("Nome da dívida","name",v.name,"text","required")}<div class="form-grid">${inputField("Saldo devedor","balance",v.balance||"","text","inputmode=decimal required")}${inputField("Parcela mensal","installment",v.installment||0,"text","inputmode=decimal required")}</div>${inputField("Juros ao mês (%)","interestRate",v.interestRate||0,"text","inputmode=decimal")}`;
      case"asset":return `${inputField("Nome do ativo","name",v.name,"text","required")}${inputField("Valor","value",v.value||"","text","inputmode=decimal required")}${selectField("Tipo","kind",["dinheiro","investimento","imovel","veiculo","outro"].map(k=>option(k,k[0].toUpperCase()+k.slice(1),v.kind||"outro")).join(""))}`;
      default:return "";
    }
  }

  function existingStatus(id,entity,fallback="pending"){const item=id?getEntity(entity,id):null;return item?.status||fallback;}

  function readEntityForm(entity,form) {
    const fd=new FormData(form), g=name=>fd.get(name)?.toString().trim()||"";
    switch(entity){
      case"goal":return{name:g("name"),icon:g("icon")||"◎",current:parseMoneyInput(g("current")),target:parseMoneyInput(g("target")),deadline:g("deadline")};
      case"goalContribution":return{goalId:g("goalId"),amount:parseMoneyInput(g("amount")),date:g("date"),note:g("note")};
      case"budget":return{category:g("category"),limit:parseMoneyInput(g("limit"))};
      case"installment":return{name:g("name"),total:parseMoneyInput(g("total")),installmentValue:parseMoneyInput(g("installmentValue")),installments:Number(g("installments")),paid:Number(g("paid")),nextDue:g("nextDue"),cardId:g("cardId")||null,category:g("category")||"Casa",paymentMethod:g("cardId")?"credit_card":"other"};
      case"recurring":return{name:g("name"),value:parseMoneyInput(g("value")),day:Number(g("day")),type:g("type"),category:g("category"),accountId:g("accountId")||primaryAccount()?.id,automationMode:g("automationMode")||"manual"};
      case"card":return{name:g("name"),last4:g("last4"),brand:g("brand"),limit:parseMoneyInput(g("limit")),used:parseMoneyInput(g("used")),currentInvoice:0,closingDay:Number(g("closingDay")),dueDay:Number(g("dueDay")),theme:g("theme")||"purple"};
      case"cardPurchase":{const cardId=g("cardId"),date=g("date")||ymd(now.getDate());return{cardId,description:g("description"),amount:parseMoneyInput(g("amount")),date,category:g("category"),installments:Number(g("installments")||1),currentInstallment:Number(g("currentInstallment")||1),invoiceMonth:invoiceMonthForPurchase(cardId,date)};}
      case"account":return{name:g("name"),institution:g("institution"),type:g("type")||"bank",balance:parseMoneyInput(g("balance")),primary:false};
      case"transfer":return{fromAccountId:g("fromAccountId"),toAccountId:g("toAccountId"),amount:parseMoneyInput(g("amount")),date:g("date"),note:g("note")};
      case"invoicePayment":return{cardId:g("cardId"),invoiceMonth:g("invoiceMonth"),accountId:g("accountId"),amount:parseMoneyInput(g("amount")),paidOn:g("paidOn"),note:g("note")};
      case"subscription":return{name:g("name"),value:parseMoneyInput(g("value")),day:Number(g("day")),category:g("category")||"Assinaturas",accountId:g("accountId")||primaryAccount()?.id,icon:g("icon")||"◉",active:g("active")!=="false",autoCreateBill:g("autoCreateBill")!=="false"};
      case"bill":return{name:g("name"),value:parseMoneyInput(g("value")),dueDate:g("dueDate"),category:g("category")||"Casa",accountId:g("accountId")||primaryAccount()?.id,barcode:g("barcode"),status:existingStatus(form.dataset.id,"bill")};
      case"futureTransaction":return{description:g("description"),value:parseMoneyInput(g("value")),date:g("date"),type:g("type")||"expense",category:g("category")||"Outros",accountId:g("accountId")||primaryAccount()?.id,status:existingStatus(form.dataset.id,"futureTransaction","planned")};
      case"debt":return{name:g("name"),balance:parseMoneyInput(g("balance")),installment:parseMoneyInput(g("installment")),interestRate:numberInput(g("interestRate"))};
      case"asset":return{name:g("name"),value:parseMoneyInput(g("value")),kind:g("kind")};
    }
  }

  function validateEntity(entity,data) {
    if(["goal","installment","recurring","card","debt","asset","account"].includes(entity)&&!data?.name) return "Informe um nome.";
    if(entity==="goal" && (!(data.target>0)||data.current<0)) return "Informe valores válidos para a meta.";
    if(entity==="goalContribution" && (!(data.amount>0)||!data.goalId)) return "Informe a meta e um valor de aporte válido.";
    if(entity==="budget" && (!(data.limit>0)||!data.category)) return "Informe categoria e limite válidos.";
    if(entity==="installment" && (!(data.total>0)||!(data.installmentValue>0)||!(data.installments>0)||data.paid<0||data.paid>data.installments)) return "Confira os dados do parcelamento.";
    if(entity==="recurring" && (!(data.value>0)||data.day<1||data.day>31)) return "Confira valor e dia da recorrência.";
    if(entity==="card" && (!(data.limit>=0)||data.used<0)) return "Confira os valores do cartão.";
    if(entity==="cardPurchase" && (!data.cardId||!data.description||!(data.amount>0)||data.installments<1||data.currentInstallment<1||data.currentInstallment>data.installments)) return "Confira os dados da compra no cartão.";
    if(entity==="account" && !Number.isFinite(data.balance)) return "Informe um saldo válido.";
    if(entity==="transfer" && (!data.fromAccountId||!data.toAccountId||data.fromAccountId===data.toAccountId||!(data.amount>0))) return "Escolha contas diferentes e informe um valor válido.";
    if(entity==="invoicePayment" && (!data.cardId||!data.invoiceMonth||!data.accountId||!(data.amount>0)||data.amount>invoiceBalance(data.cardId,data.invoiceMonth)+.005)) return "Confira o valor e a conta do pagamento.";
    if(entity==="subscription" && (!data.name||!(data.value>0)||data.day<1||data.day>31)) return "Confira nome, valor e dia da assinatura.";
    if(entity==="bill" && (!data.name||!(data.value>0)||!data.dueDate)) return "Confira nome, valor e vencimento da conta.";
    if(entity==="futureTransaction" && (!data.description||!(data.value>0)||!data.date)) return "Confira descrição, valor e data prevista.";
    if(entity==="debt" && (data.balance<0||data.installment<0)) return "Confira os valores da dívida.";
    if(entity==="asset" && data.value<0) return "Informe um valor válido.";
    return "";
  }

  async function saveEntityForm(e) {
    e.preventDefault();
    const form=e.currentTarget, entity=form.dataset.entity, id=form.dataset.id||null, existing=id?getEntity(entity,id):null, data=readEntityForm(entity,form), validation=validateEntity(entity,data), submit=$("#entitySubmit");
    if(validation){showToast(validation,"error");return;}
    setBusy(submit,true,"Salvando...");
    try{
      if(runtimeMode==="cloud"){
        await cloud.saveEntity(entity,state.user,data,existing||null);await refreshCloudState();
      }else{
        if(entity==="transfer"){
          applyAccountDelta(data.fromAccountId,-data.amount);applyAccountDelta(data.toAccountId,data.amount);
          state.transfers=state.transfers||[];state.transfers.push({id:uid(),...data});
        }else if(entity==="goalContribution"){
          const goal=(state.goals||[]).find(g=>String(g.id)===String(data.goalId));
          if(!goal)throw new Error("Meta não encontrada.");
          goal.current=Math.min(Number(goal.target||Infinity),Number(goal.current||0)+Number(data.amount||0));
          state.goalContributions=state.goalContributions||[];state.goalContributions.push({id:uid(),...data});
        }else if(entity==="account"){
          state.accounts=state.accounts||[];
          if(existing){const wasPrimary=Boolean(existing.primary);Object.assign(existing,data,{primary:wasPrimary});}
          else state.accounts.push({id:uid(),...data,primary:state.accounts.length===0});
          syncLegacyAccountBalance();
        }else if(entity==="cardPurchase"){
          state.cardPurchases=state.cardPurchases||[];
          if(existing){
            Object.assign(existing,data);
          }else{
            const seriesId=uid();
            for(let part=data.currentInstallment;part<=data.installments;part++){
              state.cardPurchases.push({id:uid(),...data,currentInstallment:part,invoiceMonth:monthKeyOffset(data.invoiceMonth,part-data.currentInstallment),seriesId,future:part>data.currentInstallment});
            }
            if(data.installments>1){
              state.installments=state.installments||[];
              state.installments.push({id:uid(),name:data.description,total:data.amount*data.installments,installmentValue:data.amount,paid:Math.max(0,data.currentInstallment-1),installments:data.installments,nextDue:invoiceDueDate(data.cardId,monthKeyOffset(data.invoiceMonth,1)),cardId:data.cardId,category:data.category,paymentMethod:"credit_card"});
            }
          }
          selectedCardId=data.cardId;selectedInvoiceMonth=data.invoiceMonth;
          const c=cardById(data.cardId);if(c)c.currentInvoice=cardInvoiceTotal(data.cardId,ym());
        }else if(entity==="invoicePayment"){
          const remaining=invoiceBalance(data.cardId,data.invoiceMonth);
          if(data.amount>remaining+.005)throw new Error("O pagamento não pode ser maior que o saldo da fatura.");
          applyAccountDelta(data.accountId,-data.amount);
          state.invoicePayments=state.invoicePayments||[];
          const paymentId=uid();
          state.invoicePayments.push({id:paymentId,...data});
          state.transactions=state.transactions||[];
          state.transactions.push({id:uid(),description:`Pagamento fatura ${cardName(data.cardId)}`,value:data.amount,type:"expense",category:"Cartão",date:data.paidOn,accountId:data.accountId,recurring:false,installment:false,notes:`Fatura ${monthKeyLabel(data.invoiceMonth)}`,invoicePaymentId:paymentId});
          if(invoiceBalance(data.cardId,data.invoiceMonth)<=.005){
            cardPurchases(data.cardId,data.invoiceMonth).filter(p=>Number(p.installments||1)>1).forEach(p=>{
              const inst=(state.installments||[]).find(i=>String(i.cardId)===String(data.cardId)&&String(i.name)===String(p.description));
              if(inst){inst.paid=Math.max(Number(inst.paid||0),Number(p.currentInstallment||0));if(inst.paid<inst.installments)inst.nextDue=invoiceDueDate(data.cardId,monthKeyOffset(data.invoiceMonth,1));}
            });
          }
          selectedCardId=data.cardId;selectedInvoiceMonth=data.invoiceMonth;
        }else{
          const key=entityArrays[entity], arr=state[key]||[];
          if(existing) Object.assign(existing,data); else arr.push({id:uid(),...data});
          state[key]=arr;
        }
        saveLocalState();renderAll();
      }
      closeEntityModal();showToast(`${entityTitle(entity)} ${existing?"atualizado":"cadastrado"}.`,"success");
    }catch(err){console.error(err);showToast(err.message||"Não foi possível salvar.","error");}
    finally{setBusy(submit,false);}
  }

  async function payBillNow(id){
    const bill=getEntity("bill",id);if(!bill||bill.status==="paid")return;
    const account=accountById(bill.accountId||primaryAccount()?.id);
    if(!account){showToast("Cadastre uma conta para realizar o pagamento.","error");return;}
    if(!confirm(`Pagar ${bill.name} no valor de ${money(bill.value)} usando ${account.name}?`))return;
    if(runtimeMode==="cloud"){try{await cloud.payBill(state.user,bill);await refreshCloudState();showToast("Conta paga e lançada nas transações.","success");}catch(err){console.error(err);showToast(err.message||"Não foi possível pagar a conta.","error");}return;}
    applyAccountDelta(account.id,-Number(bill.value||0));bill.status="paid";bill.paidOn=ymd(now.getDate());
    state.transactions.push({id:uid(),description:bill.name,value:Number(bill.value||0),type:"expense",category:bill.category||"Casa",date:bill.paidOn,accountId:account.id,recurring:false,installment:false,notes:"Pagamento de conta"});
    saveLocalState();renderAll();showToast("Conta paga e lançada nas transações.","success");
  }
  async function postFutureTransaction(id){
    const item=getEntity("futureTransaction",id);if(!item||item.status==="posted")return;
    const account=accountById(item.accountId||primaryAccount()?.id);if(!account)return showToast("Cadastre uma conta primeiro.","error");
    if(runtimeMode==="cloud"){try{await cloud.postFutureTransaction(state.user,item);await refreshCloudState();showToast("Previsão lançada nas transações.","success");}catch(err){console.error(err);showToast(err.message||"Não foi possível lançar a previsão.","error");}return;}
    const occurred=ymd(now.getDate());state.transactions.push({id:uid(),description:item.description,value:Number(item.value||0),type:item.type,category:item.category||"Outros",date:occurred,accountId:account.id,recurring:false,installment:false,notes:`Previsto para ${shortDate(item.date)}`});
    applyAccountDelta(account.id,item.type==="income"?Number(item.value||0):-Number(item.value||0));item.status="posted";item.postedOn=occurred;saveLocalState();renderAll();showToast("Previsão lançada nas transações.","success");
  }

  async function deleteEntity(entity,id) {
    const existing=getEntity(entity,id);if(!existing)return;
    const label=existing.name||existing.description||existing.category||entityTitle(entity);
    if(entity==="account"){
      if(existing.primary){showToast("A conta principal não pode ser excluída.","error");return;}
      if((state.transactions||[]).some(t=>String(t.accountId)===String(id))){showToast("Existem transações vinculadas a esta conta.","error");return;}
    }
    if(!confirm(`Excluir “${label}”?`))return;
    try{
      if(runtimeMode==="cloud"){await cloud.deleteEntity(entity,existing.id);await refreshCloudState();}
      else{
        if(entity==="goalContribution"){
          const goal=(state.goals||[]).find(g=>String(g.id)===String(existing.goalId));if(goal)goal.current=Math.max(0,Number(goal.current||0)-Number(existing.amount||0));
        }
        const key=entityArrays[entity];state[key]=(state[key]||[]).filter(x=>String(x.id)!==String(id));
        if(entity==="cardPurchase"){const c=cardById(existing.cardId);if(c)c.currentInvoice=cardInvoiceTotal(existing.cardId);}
        syncLegacyAccountBalance();saveLocalState();renderAll();
      }
      showToast(`${entityTitle(entity)} excluído.`,"success");
    }catch(err){console.error(err);showToast(err.message||"Não foi possível excluir.","error");}
  }

  async function setAccountBalance() {
    const account=primaryAccount();
    const raw=prompt("Informe o saldo atual da conta principal:",String(account?.balance||state.accountBalance||0).replace(".",","));if(raw===null)return;
    const value=parseMoneyInput(raw);if(!Number.isFinite(value)){showToast("Saldo inválido.","error");return;}
    try{
      if(runtimeMode==="cloud"){await cloud.setAccountBalance(state.user,value,account?.id);await refreshCloudState();}
      else{if(account)account.balance=value;state.accountBalance=value;saveLocalState();renderAll();}
      showToast("Saldo atualizado.","success");
    }catch(err){showToast(err.message||"Não foi possível atualizar o saldo.","error");}
  }

  async function refreshCloudState() {
    if(cloudSyncInFlight)return;
    cloudSyncInFlight=true;
    try{const user=await cloud.getUser();if(!user)throw new Error("Sessão expirada.");const theme=state.settings?.theme||localStorage.getItem(THEME_KEY)||"dark";state=await cloud.loadUserState(user);state.settings.theme=theme;runtimeMode="cloud";lastCloudSyncAt=new Date();setTheme(theme);renderAll();setupNav();showPage(currentPage);}finally{cloudSyncInFlight=false;}
  }

  async function syncCloudNow(showFeedback=true){if(runtimeMode!=="cloud"||!cloud.configured)return;try{await refreshCloudState();if(showFeedback)showToast("Dados sincronizados com a nuvem.","success");}catch(err){console.error(err);if(showFeedback)showToast(err.message||"Não foi possível sincronizar.","error");}}

  async function requestPasswordReset(){if(!cloud.configured){showToast("Configure o Supabase para recuperar a senha.","error");return;}const email=$("#authEmail").value.trim();if(!email){showToast("Digite seu e-mail primeiro.","error");$("#authEmail").focus();return;}const button=$("#forgotPassword");setBusy(button,true,"Enviando...");try{await cloud.sendPasswordReset(email);showToast("Enviamos um link de recuperação para seu e-mail.","success");}catch(err){console.error(err);showToast(translateAuthError(err.message),"error");}finally{setBusy(button,false);}}
  function openPasswordResetModal(){$("#passwordResetForm").reset();$("#passwordResetBackdrop").hidden=false;setTimeout(()=>$("#newPassword")?.focus(),30);}
  function closePasswordResetModal(){$("#passwordResetBackdrop").hidden=true;$("#passwordResetForm").reset();}
  async function handlePasswordReset(e){e.preventDefault();const password=$("#newPassword").value,confirmPassword=$("#confirmNewPassword").value,button=$("#passwordResetSubmit");if(password.length<8||!/[A-Za-zÀ-ÿ]/.test(password)||!/\d/.test(password)){showToast("Use pelo menos 8 caracteres, incluindo letras e números.","error");return;}if(password!==confirmPassword){showToast("As senhas não coincidem.","error");return;}setBusy(button,true,"Atualizando...");try{await cloud.updatePassword(password);closePasswordResetModal();showToast("Senha atualizada com sucesso.","success");}catch(err){console.error(err);showToast(translateAuthError(err.message),"error");}finally{setBusy(button,false);}}

  function openFinancialSetup(){if(runtimeMode!=="cloud"||state.settings?.profileSetupCompleted)return;$("#setupName").value=state.user?.name||"";$("#setupIncome").value=Number(state.settings?.monthlyIncome||0)?String(Number(state.settings.monthlyIncome).toFixed(2)).replace(".",","):"";$("#setupPayday").value=state.settings?.paydayDay||"";$("#setupSavingsTarget").value=Number(state.settings?.monthlySavingsTarget||0)?String(Number(state.settings.monthlySavingsTarget).toFixed(2)).replace(".",","):"";$("#setupBalance").value=Number(primaryAccount()?.balance||0)?String(Number(primaryAccount().balance).toFixed(2)).replace(".",","):"";$("#setupCurrency").value=state.settings?.currency||"BRL";$("#financialSetupBackdrop").hidden=false;}
  function closeFinancialSetup(){$("#financialSetupBackdrop").hidden=true;}
  async function saveFinancialSetup(e){e.preventDefault();if(runtimeMode!=="cloud")return closeFinancialSetup();const name=$("#setupName").value.trim(),income=parseMoneyInput($("#setupIncome").value),payday=Number($("#setupPayday").value||0),target=parseMoneyInput($("#setupSavingsTarget").value),balance=parseMoneyInput($("#setupBalance").value),currency=$("#setupCurrency").value||"BRL",button=$("#financialSetupSubmit");if(!name){showToast("Informe seu nome.","error");return;}if(payday&&(payday<1||payday>31)){showToast("O dia de recebimento deve ficar entre 1 e 31.","error");return;}setBusy(button,true,"Salvando...");try{const user=await cloud.getUser();if(!user)throw new Error("Sessão expirada.");await cloud.updateProfile(user,{name,monthlyIncome:Number.isFinite(income)?income:0,paydayDay:payday||null,monthlySavingsTarget:Number.isFinite(target)?target:0,currency,profileSetupCompleted:true});if(Number.isFinite(balance))await cloud.setAccountBalance(user,balance,primaryAccount()?.id);closeFinancialSetup();await refreshCloudState();showToast("Planejamento inicial configurado.","success");setTimeout(()=>openOnboarding(false),180);}catch(err){console.error(err);showToast(err.message||"Não foi possível salvar a configuração.","error");}finally{setBusy(button,false);}}

  function showAuthScreen(){$("#appShell").hidden=true;$("#authScreen").hidden=false;$("#transactionFab").hidden=true;}

  async function runMonthlyAutomations(showFeedback=false){
    if(runtimeMode!=="cloud"||!cloud.processAutomations)return;
    try{
      const user=await cloud.getUser();if(!user)return;
      const result=await cloud.processAutomations(user);
      if((result.createdTransactions||result.createdBills)>0){await refreshCloudState();}
      if(showFeedback)showToast(`Automações verificadas: ${result.createdTransactions||0} lançamento(s) e ${result.createdBills||0} conta(s) criados.`,"success");
    }catch(err){console.error("Falha nas automações",err);if(showFeedback)showToast(err.message||"Não foi possível executar as automações.","error");}
  }

  function enterApp() {
    $("#authScreen").hidden=true;$("#appShell").hidden=false;
    $("#avatarInitials").textContent=initials(state.user?.name);
    $("#todayLabel").textContent=new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long"}).format(now);
    setTheme(state.settings?.theme||"dark");setupNav();renderAll();showPage("dashboard");
    if(runtimeMode==="cloud"){lastCloudSyncAt=new Date();setTimeout(()=>runMonthlyAutomations(false),60);}
    setTimeout(()=>{notifyCriticalAlerts();if(runtimeMode==="cloud"&&!state.settings?.profileSetupCompleted)openFinancialSetup();else openOnboarding(false);},180);
  }

  async function handleAuth(e) {
    e.preventDefault();
    const mode=$(".auth-tab.is-active").dataset.authMode,email=$("#authEmail").value.trim(),password=$("#authPassword").value,confirmPassword=$("#authConfirmPassword")?.value||"",name=$("#authName").value.trim(),submit=$("#authSubmit");
    if(mode==="signup"&&!name){showToast("Informe seu nome.","error");return;}
    if(mode==="signup" && (password.length<8||!/[A-Za-zÀ-ÿ]/.test(password)||!/\d/.test(password))){showToast("Crie uma senha com pelo menos 8 caracteres, incluindo letras e números.","error");return;}
    if(mode==="signup" && password!==confirmPassword){showToast("As duas senhas precisam ser exatamente iguais.","error");return;}
    if(mode==="login" && password.length<6&&cloud.configured){showToast("Confira a senha digitada.","error");return;}
    setBusy(submit,true,mode==="signup"?"Criando...":"Entrando...");
    try{
      if(cloud.configured){
        if(mode==="signup"){
          const data=await cloud.signUp(email,password,name);
          if(!data.session){showToast("Conta criada. Confira seu e-mail para confirmar o cadastro.","success");return;}
        }else await cloud.signIn(email,password);
        const user=await cloud.getUser();state=await cloud.loadUserState(user);runtimeMode="cloud";lastCloudSyncAt=new Date();enterApp();showToast("Dados sincronizados com a nuvem.","success");
      }else{
        runtimeMode="local";state=loadLocalState();state.user={...state.user,name:mode==="signup"?name:(state.user.name||"Usuário"),email,loggedIn:true};saveLocalState();enterApp();showToast("Entrou no modo local. Configure o Supabase para usar login real.");
      }
    }catch(err){console.error(err);showToast(translateAuthError(err.message),"error");}
    finally{setBusy(submit,false);}
  }

  function translateAuthError(message="") {
    if(/invalid login credentials/i.test(message))return "E-mail ou senha incorretos.";
    if(/email not confirmed/i.test(message))return "Confirme seu e-mail antes de entrar.";
    if(/user already registered/i.test(message))return "Este e-mail já está cadastrado.";
    if(/password/i.test(message)&&/characters/i.test(message))return "A senha não atende aos requisitos do Supabase.";
    return message||"Não foi possível autenticar.";
  }

  function switchAuthMode(mode) {
    $$(".auth-tab").forEach(b=>{const active=b.dataset.authMode===mode;b.classList.toggle("is-active",active);b.setAttribute("aria-selected",String(active));b.tabIndex=active?0:-1;});
    $("#nameField").hidden=mode!=="signup";$("#authName").required=mode==="signup";$("#confirmPasswordField").hidden=mode!=="signup";$("#authConfirmPassword").required=mode==="signup";$("#authPassword").minLength=mode==="signup"?8:6;$("#authSubmit").textContent=mode==="signup"?"Criar conta":"Entrar";
    if(mode!=="signup"){$("#authConfirmPassword").value="";$("#passwordMatchHint").textContent="";}
    if($("#forgotPassword")?.closest(".auth-help-row")) $("#forgotPassword").closest(".auth-help-row").hidden=mode==="signup";
    if($("#authModeSwitch")) $("#authModeSwitch").textContent=mode==="signup"?"Já tenho uma conta":"Criar conta";
  }

  function updatePasswordMatchHint(){
    const field=$("#confirmPasswordField");if(!field||field.hidden)return;
    const password=$("#authPassword").value,confirmPassword=$("#authConfirmPassword").value,hint=$("#passwordMatchHint");
    if(!confirmPassword){hint.textContent="Digite novamente para confirmar.";hint.className="field-help password-match-hint";return;}
    const matches=password===confirmPassword;hint.textContent=matches?"✓ As senhas coincidem.":"As senhas estão diferentes.";hint.className=`field-help password-match-hint ${matches?"is-valid":"is-invalid"}`;
  }

  function demoLogin() {
    runtimeMode="local";state=loadLocalState();state.user={...state.user,name:state.user.name||"Wellington",email:state.user.email||"demo@controle.app",loggedIn:true};saveLocalState();enterApp();showToast("Modo demonstração ativado.");
  }

  async function logout() {
    try{if(runtimeMode==="cloud")await cloud.signOut();}catch(err){console.error(err);}
    if(runtimeMode==="local"){state.user.loggedIn=false;saveLocalState();}
    showAuthScreen();showToast("Sessão encerrada.");
  }

  function resetDemo() {
    if(!confirm("Restaurar todos os dados de demonstração?"))return;
    const theme=state.settings?.theme||"dark";state=buildDefaultState();state.user.loggedIn=true;state.settings.theme=theme;runtimeMode="local";saveLocalState();renderAll();showPage("dashboard");showToast("Demonstração restaurada.","success");
  }

  function handleDelegatedClick(e) {
    const pageAction=e.target.closest("#pageAction");
    if(pageAction){
      const action=pageAction.dataset.action;
      if(action==="add-card") openEntityModal("card");
      else if(action==="settings") showPage("settings");
      else if(action==="theme"){setTheme(state.settings.theme==="dark"?"light":"dark");renderSettings();}
      else if(action==="export") exportData();
      else if(action==="notices") openNotifications();
      else if(action==="search"){showPage("transactions");setTimeout(()=>$("#transactionSearch")?.focus(),30);}
      else if(action==="privacy") openInfoModal("privacy");
      return;
    }
    const page=e.target.closest("[data-page-target]");if(page){showPage(page.dataset.pageTarget);return;}
    const planningFilterButton=e.target.closest("[data-planning-filter]");if(planningFilterButton){planningCommitmentFilter=planningFilterButton.dataset.planningFilter||"all";planningBillsLimit=12;renderPlanning();return;}
    const cardPurchaseFilterButton=e.target.closest("[data-card-purchase-filter]");if(cardPurchaseFilterButton){cardPurchaseFilter=cardPurchaseFilterButton.dataset.cardPurchaseFilter||"all";renderCards();return;}
    const cardSelect=e.target.closest("[data-select-card]");if(cardSelect){selectedCardId=cardSelect.dataset.selectCard;selectedInvoiceMonth=ym();cardPurchaseSearch="";cardPurchaseFilter="all";renderCards();return;}
    const invoiceSelect=e.target.closest("[data-select-invoice]");if(invoiceSelect){selectedInvoiceMonth=invoiceSelect.dataset.selectInvoice;cardPurchaseSearch="";cardPurchaseFilter="all";renderCards();if(invoiceSelect.hasAttribute("data-scroll-invoice"))setTimeout(()=>document.querySelector("#invoiceDetail")?.scrollIntoView({behavior:"smooth",block:"start"}),20);return;}
    const addPurchase=e.target.closest("[data-create-card-purchase]");if(addPurchase){selectedCardId=addPurchase.dataset.createCardPurchase;openEntityModal("cardPurchase");const sel=$("#entityFormFields select[name=cardId]");if(sel)sel.value=selectedCardId;return;}
    const payInvoice=e.target.closest("[data-pay-invoice]");if(payInvoice){invoicePaymentContext={cardId:payInvoice.dataset.cardId,invoiceMonth:payInvoice.dataset.invoiceMonth};openEntityModal("invoicePayment");return;}
    const contribute=e.target.closest("[data-goal-contribution]");if(contribute){openEntityModal("goalContribution");const sel=$("#entityFormFields select[name=goalId]");if(sel)sel.value=contribute.dataset.goalContribution;return;}
    if(e.target.closest("[data-scroll-invoice]")){document.querySelector("#invoiceDetail")?.scrollIntoView({behavior:"smooth",block:"start"});return;}
    if(e.target.closest("[data-open-notifications]")){openNotifications();return;}
    const payBill=e.target.closest("[data-pay-bill]");if(payBill){payBillNow(payBill.dataset.payBill);return;}
    const postFuture=e.target.closest("[data-post-future]");if(postFuture){postFutureTransaction(postFuture.dataset.postFuture);return;}
    const create=e.target.closest("[data-create-entity]");if(create){openEntityModal(create.dataset.createEntity);if(create.dataset.createEntity==="recurring") syncRecurringCategory();return;}
    const editEntity=e.target.closest("[data-edit-entity]");if(editEntity){openEntityModal(editEntity.dataset.editEntity,editEntity.dataset.id);if(editEntity.dataset.editEntity==="recurring") syncRecurringCategory(getEntity("recurring",editEntity.dataset.id));return;}
    const deleteE=e.target.closest("[data-delete-entity]");if(deleteE){deleteEntity(deleteE.dataset.deleteEntity,deleteE.dataset.id);return;}
    const editTx=e.target.closest("[data-edit-transaction]");if(editTx){openTransactionModal(editTx.dataset.editTransaction);return;}
    const deleteTx=e.target.closest("[data-delete-transaction]");if(deleteTx){deleteTransaction(deleteTx.dataset.deleteTransaction);return;}
    const filter=e.target.closest("[data-filter]");if(filter){transactionFilter=filter.dataset.filter;transactionLimit=24;renderTransactions();return;}
    if(e.target.closest("[data-load-more-transactions]")){transactionLimit+=24;renderTransactions();return;}
    if(e.target.closest("[data-load-more-bills]")){planningBillsLimit+=12;renderPlanning();return;}
    if(e.target.closest("[data-load-more-future]")){planningFutureLimit+=12;renderPlanning();return;}
    if(e.target.closest("[data-export-transactions]")){exportTransactionsCsv();return;}
    const ai=e.target.closest("[data-ai-question]");if(ai){sendAIQuestion(ai.dataset.aiQuestion);return;}
    if(e.target.closest("[data-open-settings]")){showPage("settings");return;}
    if(e.target.closest("[data-toggle-theme]")){setTheme(state.settings.theme==="dark"?"light":"dark");renderSettings();return;}
    if(e.target.closest("[data-report-csv]")){exportReportCsv();return;}
    if(e.target.closest("[data-report-print]")){window.print();return;}
    if(e.target.closest("[data-export]")){exportData();return;}
    if(e.target.closest("[data-enable-browser-notifications]")){requestBrowserNotifications();return;}
    if(e.target.closest("[data-sync-cloud]")){syncCloudNow(true);return;}
    if(e.target.closest("[data-run-automations]")){runMonthlyAutomations(true);return;}
    if(e.target.closest("[data-open-onboarding]")){openOnboarding(true);return;}
    const accountAction=e.target.closest("[data-account-action]");if(accountAction){openAccountAction(accountAction.dataset.accountAction);return;}
    if(e.target.closest("[data-signout-everywhere]")){signOutEverywhere();return;}
    if(e.target.closest("[data-toggle-ai]")){toggleAIOnline();return;}
    if(e.target.closest("[data-install-pwa]")){installPwa();return;}
    if(e.target.closest("[data-check-update]")){checkForAppUpdate(true);return;}
    if(e.target.closest("[data-force-app-update]")){forceAppRefresh();return;}
    if(e.target.closest("[data-apply-app-update]")){activateWaitingServiceWorker();return;}
    const info=e.target.closest("[data-info-modal]");if(info){openInfoModal(info.dataset.infoModal);return;}
    if(e.target.closest("[data-copy-diagnostic]")){copyDiagnostic();return;}
    if(e.target.closest("[data-reset-demo]")){resetDemo();return;}
    if(e.target.closest("[data-logout]")){logout();return;}
    if(e.target.closest("[data-set-balance]")){setAccountBalance();return;}
  }

  function syncRecurringCategory(existing=null) {
    const type=$("#entityFormFields select[name=type]");const cat=$("#recCategory");if(!type||!cat)return;
    const update=()=>cat.innerHTML=categoryOptions(type.value,existing?.category||"");update();type.addEventListener("change",()=>{existing=null;update();});
  }

  function bindStaticEvents() {
    $("#authForm").addEventListener("submit",handleAuth);
    $("#forgotPassword")?.addEventListener("click",requestPasswordReset);
    $("#passwordResetForm")?.addEventListener("submit",handlePasswordReset);
    $("#closePasswordReset")?.addEventListener("click",closePasswordResetModal);
    $("#passwordResetBackdrop")?.addEventListener("click",e=>{if(e.target===$("#passwordResetBackdrop"))closePasswordResetModal();});
    $("#financialSetupForm")?.addEventListener("submit",saveFinancialSetup);
    $("#skipFinancialSetup")?.addEventListener("click",()=>{closeFinancialSetup();setTimeout(()=>openOnboarding(false),120);});
    $("#financialSetupLater")?.addEventListener("click",()=>{closeFinancialSetup();setTimeout(()=>openOnboarding(false),120);});
    $("#financialSetupBackdrop")?.addEventListener("click",e=>{if(e.target===$("#financialSetupBackdrop"))closeFinancialSetup();});
    $$(".auth-tab").forEach(b=>{
      b.addEventListener("click",()=>switchAuthMode(b.dataset.authMode));
      b.addEventListener("keydown",e=>{if(!["ArrowLeft","ArrowRight"].includes(e.key))return;e.preventDefault();const next=b.dataset.authMode==="login"?"signup":"login";switchAuthMode(next);document.querySelector(`.auth-tab[data-auth-mode="${next}"]`)?.focus();});
    });
    $("#demoLogin").addEventListener("click",demoLogin);
    $("#authModeSwitch")?.addEventListener("click",()=>switchAuthMode($(".auth-tab.is-active").dataset.authMode==="login"?"signup":"login"));
    $("#togglePassword").addEventListener("click",()=>{const input=$("#authPassword");input.type=input.type==="password"?"text":"password";});
    $("#toggleConfirmPassword")?.addEventListener("click",()=>{const input=$("#authConfirmPassword");input.type=input.type==="password"?"text":"password";});
    $("#authPassword")?.addEventListener("input",updatePasswordMatchHint);
    $("#authConfirmPassword")?.addEventListener("input",updatePasswordMatchHint);
    $("#accountActionForm")?.addEventListener("submit",handleAccountAction);
    $("#closeAccountAction")?.addEventListener("click",closeAccountAction);
    $("#accountActionBackdrop")?.addEventListener("click",e=>{if(e.target===$("#accountActionBackdrop"))closeAccountAction();});
    $("#closeInfoModal")?.addEventListener("click",closeInfoModal);
    $("#infoBackdrop")?.addEventListener("click",e=>{if(e.target===$("#infoBackdrop"))closeInfoModal();});
    $("#themeToggle").addEventListener("click",()=>setTheme(state.settings.theme==="dark"?"light":"dark"));
    $("#logoutDesktop").addEventListener("click",logout);
    $("#transactionFab").addEventListener("click",()=>openTransactionModal());
    $("#closeModal").addEventListener("click",closeTransactionModal);
    $("#modalBackdrop").addEventListener("click",e=>{if(e.target===$("#modalBackdrop"))closeTransactionModal();});
    $("#txType").addEventListener("change",()=>populateTxCategories());
    $("#transactionForm").addEventListener("submit",saveTransaction);
    $("#closeEntityModal").addEventListener("click",closeEntityModal);
    $("#entityModalBackdrop").addEventListener("click",e=>{if(e.target===$("#entityModalBackdrop"))closeEntityModal();});
    $("#entityForm").addEventListener("submit",saveEntityForm);
    $("#closeNotifications")?.addEventListener("click",closeNotifications);
    $("#notificationsBackdrop")?.addEventListener("click",e=>{if(e.target===$("#notificationsBackdrop"))closeNotifications();});
    $("#onboardingSkip")?.addEventListener("click",()=>closeOnboarding(true));
    $("#onboardingNext")?.addEventListener("click",async()=>{
      if(onboardingStep<onboardingSteps.length-1){onboardingStep++;renderOnboardingStep();return;}
      if("Notification" in window && Notification.permission==="default")await requestBrowserNotifications();
      closeOnboarding(true);
    });
    $("#onboardingBackdrop")?.addEventListener("click",e=>{if(e.target===$("#onboardingBackdrop"))closeOnboarding(true);});
    document.addEventListener("click",handleDelegatedClick);
    document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!$("#modalBackdrop").hidden)closeTransactionModal();if(!$("#entityModalBackdrop").hidden)closeEntityModal();if(!$("#notificationsBackdrop").hidden)closeNotifications();if(!$("#onboardingBackdrop").hidden)closeOnboarding(true);if(!$("#passwordResetBackdrop").hidden)closePasswordResetModal();if(!$("#financialSetupBackdrop").hidden)closeFinancialSetup();if(!$("#accountActionBackdrop").hidden)closeAccountAction();if(!$("#infoBackdrop").hidden)closeInfoModal();}});
  }

  async function bootstrap() {
    bindStaticEvents();setTheme(localStorage.getItem(THEME_KEY)||state.settings?.theme||"dark");updateNetworkStatus(true);
    if(cloud.configured){
      authSubscription=cloud.onAuthStateChange((event,session)=>{setTimeout(()=>{if(event==="PASSWORD_RECOVERY"){openPasswordResetModal();return;}if(event==="SIGNED_OUT"&&runtimeMode==="cloud"){runtimeMode="local";showAuthScreen();}},0);});
      try{const session=await cloud.getSession();if(session?.user){state=await cloud.loadUserState(session.user);runtimeMode="cloud";lastCloudSyncAt=new Date();enterApp();return;}}catch(err){console.error("Falha ao restaurar sessão Supabase",err);showToast("Não foi possível restaurar a sessão na nuvem.","error");}
    }
    if(state.user?.loggedIn){runtimeMode="local";enterApp();}
  }

  window.addEventListener("focus",()=>{if(runtimeMode==="cloud"&&navigator.onLine)syncCloudNow(false);});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){if(runtimeMode==="cloud"&&navigator.onLine)syncCloudNow(false);checkForAppUpdate(false);}});
  window.addEventListener("online",()=>updateNetworkStatus(false));
  window.addEventListener("offline",()=>updateNetworkStatus(false));
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;if(currentPage==="settings")renderSettings();});
  window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;if(currentPage==="settings")renderSettings();showToast("Esteja no Controle instalado com sucesso.","success");});

  bootstrap();

  if("serviceWorker" in navigator && location.protocol.startsWith("http")) window.addEventListener("load",async()=>{
    try{
      ensureUpdateBanner();
      const reg=await navigator.serviceWorker.register("./service-worker.js",{updateViaCache:"none"});
      bindServiceWorkerRegistration(reg);
      navigator.serviceWorker.addEventListener("controllerchange",()=>{if(appReloading)return;appReloading=true;location.reload();});
      reg.update().catch(()=>{});
    }catch(err){console.error("Service Worker",err);}
  });
})();
