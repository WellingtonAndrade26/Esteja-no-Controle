(() => {
  "use strict";

  const LOCAL_KEY = "enc.benefits.local.v1";
  let txCache = [];
  let walletCache = [];
  let editingId = null;
  let patchBusy = false;

  const money = value => new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(value || 0));
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  const parseAmount = value => {
    let raw=String(value||"").trim().replace(/\s/g,"").replace(/R\$/gi,"");
    if(raw.includes(",")&&raw.includes(".")) raw=raw.replace(/\./g,"").replace(",",".");
    else raw=raw.replace(",",".");
    return Number(raw);
  };

  function toast(message,type="success"){
    const el=document.getElementById("toast");
    if(!el)return;
    el.textContent=message;
    el.className=`toast show ${type}`;
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>el.classList.remove("show"),3000);
  }

  function injectStyles(){
    if(document.getElementById("enc-benefits-manager-style"))return;
    const style=document.createElement("style");
    style.id="enc-benefits-manager-style";
    style.textContent=`
      #page-benefits .benefit-form button{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;width:100%!important;min-height:46px!important;height:46px!important;max-height:46px!important;padding:0 16px!important;line-height:1!important;overflow:hidden!important}
      #page-benefits .benefit-form button svg{width:18px!important;height:18px!important;min-width:18px!important;max-width:18px!important;min-height:18px!important;max-height:18px!important;flex:0 0 18px!important;display:block!important}
      #page-benefits .benefit-history-row.enc-benefit-managed{grid-template-columns:auto minmax(0,1fr) auto auto}
      .benefit-history-actions{display:flex;gap:6px;align-items:center}
      .benefit-history-actions button{width:34px;height:34px;border:1px solid var(--border);border-radius:10px;background:rgba(10,32,49,.7);color:var(--muted);display:grid;place-items:center;cursor:pointer;padding:0}
      .benefit-history-actions button:hover{color:var(--blue);border-color:rgba(44,154,255,.5)}
      .benefit-history-actions button[data-benefit-delete]:hover{color:var(--red);border-color:rgba(255,90,106,.45)}
      .benefit-history-actions svg{width:16px;height:16px;display:block}
      .benefit-edit-kind{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:rgba(9,31,49,.45);margin-bottom:12px}
      .benefit-edit-kind strong{font-size:.84rem}.benefit-edit-kind span{font-size:.72rem;color:var(--muted)}
      @media(max-width:700px){
        #page-benefits .benefit-form-card{padding:14px}
        #page-benefits .benefit-form{gap:10px}
        #page-benefits .benefit-form input,#page-benefits .benefit-form select{min-height:46px}
        #page-benefits .benefit-history-row.enc-benefit-managed{grid-template-columns:auto minmax(0,1fr) auto;gap:9px}
        #page-benefits .benefit-history-actions{grid-column:2 / 4;justify-content:flex-end;margin-top:-3px}
      }
    `;
    document.head.appendChild(style);
  }

  function pencilIcon(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>`;}
  function trashIcon(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6"/></svg>`;}

  function localData(){
    try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||"null")||{wallets:[],transactions:[]};}
    catch{return{wallets:[],transactions:[]};}
  }
  function saveLocal(data){localStorage.setItem(LOCAL_KEY,JSON.stringify(data));}

  async function fetchData(){
    const client=window.ENCCloud?.client;
    if(client){
      try{
        const {data:userData}=await client.auth.getUser();
        if(userData?.user){
          const [wallets,txs]=await Promise.all([
            client.from("benefit_wallets").select("id,kind,name,balance,active").order("created_at"),
            client.from("benefit_transactions").select("id,wallet_id,kind,amount,description,occurred_on,note,created_at").order("occurred_on",{ascending:false}).order("created_at",{ascending:false}).limit(100)
          ]);
          if(!wallets.error&&!txs.error){walletCache=wallets.data||[];txCache=txs.data||[];return;}
        }
      }catch{}
    }
    const local=localData();walletCache=local.wallets||[];txCache=local.transactions||[];
  }

  async function patchHistory(){
    if(patchBusy)return;
    const page=document.getElementById("page-benefits");
    if(!page)return;
    patchBusy=true;
    try{
      await fetchData();
      const rows=[...page.querySelectorAll(".benefit-history-row")];
      rows.forEach((row,index)=>{
        const tx=txCache[index];
        if(!tx)return;
        row.dataset.benefitTxId=tx.id;
        row.classList.add("enc-benefit-managed");
        if(row.querySelector(".benefit-history-actions"))return;
        const actions=document.createElement("div");
        actions.className="benefit-history-actions";
        actions.innerHTML=`<button type="button" data-benefit-edit="${esc(tx.id)}" aria-label="Editar movimentação" title="Editar">${pencilIcon()}</button><button type="button" data-benefit-delete="${esc(tx.id)}" aria-label="Excluir movimentação" title="Excluir">${trashIcon()}</button>`;
        row.appendChild(actions);
      });
    }finally{patchBusy=false;}
  }

  function ensureModal(){
    let backdrop=document.getElementById("benefitEditBackdrop");
    if(backdrop)return backdrop;
    backdrop=document.createElement("div");
    backdrop.className="modal-backdrop";
    backdrop.id="benefitEditBackdrop";
    backdrop.hidden=true;
    backdrop.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="benefitEditTitle"><div class="modal-head"><div><p class="eyebrow">Vales</p><h3 id="benefitEditTitle">Editar movimentação</h3></div><button class="icon-button" type="button" data-close-benefit-edit aria-label="Fechar">×</button></div><form id="benefitEditForm" class="modal-form"><div class="benefit-edit-kind"><div><strong id="benefitEditType">Movimentação</strong><span id="benefitEditWallet"></span></div></div><div class="field"><label for="benefitEditAmount">Valor</label><input id="benefitEditAmount" inputmode="decimal" required></div><div class="field"><label for="benefitEditDescription">Descrição</label><input id="benefitEditDescription" required></div><div class="field"><label for="benefitEditDate">Data</label><input id="benefitEditDate" type="date" required></div><button class="primary-button" type="submit">Salvar alterações</button></form></div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector("[data-close-benefit-edit]")?.addEventListener("click",closeModal);
    backdrop.addEventListener("click",e=>{if(e.target===backdrop)closeModal();});
    backdrop.querySelector("#benefitEditForm")?.addEventListener("submit",saveEdit);
    return backdrop;
  }

  function openEdit(id){
    const tx=txCache.find(t=>String(t.id)===String(id));
    if(!tx)return;
    editingId=tx.id;
    const wallet=walletCache.find(w=>String(w.id)===String(tx.wallet_id));
    const backdrop=ensureModal();
    backdrop.querySelector("#benefitEditType").textContent=tx.kind==="income"?"Crédito recebido":"Gasto no vale";
    backdrop.querySelector("#benefitEditWallet").textContent=wallet?.name||"Vale";
    backdrop.querySelector("#benefitEditAmount").value=Number(tx.amount||0).toFixed(2).replace(".",",");
    backdrop.querySelector("#benefitEditDescription").value=tx.description||"";
    backdrop.querySelector("#benefitEditDate").value=String(tx.occurred_on||"").slice(0,10);
    backdrop.hidden=false;
    setTimeout(()=>backdrop.querySelector("#benefitEditAmount")?.focus(),30);
  }
  function closeModal(){editingId=null;const b=document.getElementById("benefitEditBackdrop");if(b)b.hidden=true;}

  async function saveEdit(event){
    event.preventDefault();
    const tx=txCache.find(t=>String(t.id)===String(editingId));
    if(!tx)return;
    const form=event.currentTarget;
    const amount=parseAmount(form.querySelector("#benefitEditAmount").value);
    const description=form.querySelector("#benefitEditDescription").value.trim();
    const date=form.querySelector("#benefitEditDate").value;
    if(!Number.isFinite(amount)||amount<=0){toast("Informe um valor válido.","error");return;}
    if(!description){toast("Informe uma descrição.","error");return;}
    const button=form.querySelector("button[type=submit]");button.disabled=true;button.textContent="Salvando...";
    try{
      const client=window.ENCCloud?.client;
      const {data:userData}=client?await client.auth.getUser():{data:null};
      if(client&&userData?.user){
        const {error}=await client.rpc("update_benefit_transaction",{p_transaction_id:tx.id,p_wallet_id:tx.wallet_id,p_kind:tx.kind,p_amount:amount,p_description:description,p_occurred_on:date,p_note:tx.note||null});
        if(error)throw error;
      }else{
        const local=localData();const item=(local.transactions||[]).find(t=>String(t.id)===String(tx.id));const wallet=(local.wallets||[]).find(w=>String(w.id)===String(tx.wallet_id));
        if(!item||!wallet)throw new Error("Movimentação não encontrada.");
        const reverted=Number(wallet.balance||0)+(item.kind==="income"?-Number(item.amount||0):Number(item.amount||0));
        if(reverted<0||(item.kind==="expense"&&reverted<amount))throw new Error("insufficient_benefit_balance");
        wallet.balance=reverted+(item.kind==="income"?amount:-amount);item.amount=amount;item.description=description;item.occurred_on=date;saveLocal(local);
      }
      closeModal();await window.ENCBenefits?.reload?.();setTimeout(patchHistory,80);toast("Movimentação atualizada.","success");
    }catch(error){console.error(error);toast(/insufficient_benefit_balance/i.test(error?.message||"")?"Essa alteração deixaria o saldo do vale negativo.":(error?.message||"Não foi possível editar."),"error");}
    finally{button.disabled=false;button.textContent="Salvar alterações";}
  }

  async function deleteTx(id){
    const tx=txCache.find(t=>String(t.id)===String(id));if(!tx)return;
    const label=tx.kind==="income"?"crédito":"gasto";
    if(!confirm(`Excluir este ${label} de ${money(tx.amount)}?`))return;
    try{
      const client=window.ENCCloud?.client;const {data:userData}=client?await client.auth.getUser():{data:null};
      if(client&&userData?.user){const {error}=await client.rpc("delete_benefit_transaction",{p_transaction_id:tx.id});if(error)throw error;}
      else{
        const local=localData();const index=(local.transactions||[]).findIndex(t=>String(t.id)===String(tx.id));if(index<0)throw new Error("Movimentação não encontrada.");
        const item=local.transactions[index],wallet=(local.wallets||[]).find(w=>String(w.id)===String(item.wallet_id));if(!wallet)throw new Error("Vale não encontrado.");
        if(item.kind==="income"&&Number(wallet.balance||0)<Number(item.amount||0))throw new Error("insufficient_benefit_balance");
        wallet.balance=Number(wallet.balance||0)+(item.kind==="income"?-Number(item.amount||0):Number(item.amount||0));local.transactions.splice(index,1);saveLocal(local);
      }
      await window.ENCBenefits?.reload?.();setTimeout(patchHistory,80);toast("Movimentação excluída.","success");
    }catch(error){console.error(error);toast(/insufficient_benefit_balance/i.test(error?.message||"")?"Não dá para excluir esse crédito porque parte dele já foi usada. Ajuste os gastos primeiro.":(error?.message||"Não foi possível excluir."),"error");}
  }

  function schedulePatch(){[20,120,350,700].forEach(ms=>setTimeout(patchHistory,ms));}

  function start(){
    injectStyles();ensureModal();schedulePatch();
    document.addEventListener("click",event=>{
      const edit=event.target.closest("[data-benefit-edit]");if(edit){openEdit(edit.dataset.benefitEdit);return;}
      const del=event.target.closest("[data-benefit-delete]");if(del){deleteTx(del.dataset.benefitDelete);return;}
      if(event.target.closest('[data-page-target="benefits"]'))schedulePatch();
    });
    document.addEventListener("submit",event=>{if(event.target?.id==="benefitCreditForm"||event.target?.id==="benefitExpenseForm")setTimeout(schedulePatch,500);},true);
    window.addEventListener("focus",()=>{if(document.getElementById("page-benefits")?.classList.contains("is-active"))schedulePatch();});
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
