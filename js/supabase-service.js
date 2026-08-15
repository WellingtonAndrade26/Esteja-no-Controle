(() => {
  "use strict";

  const cfg = window.ENC_CONFIG || {};
  const hasConfig = Boolean(
    cfg.supabaseUrl &&
    cfg.supabasePublishableKey &&
    /^https:\/\//i.test(cfg.supabaseUrl)
  );

  const client = hasConfig && window.supabase?.createClient
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

  const num = value => Number(value || 0);
  const currentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const currentDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const addMonthsKey = (monthKey, offset=0) => {
    const [y,m]=String(monthKey).slice(0,7).split("-").map(Number);
    const d=new Date(y,m-1+offset,1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
  };

  async function requireClient() {
    if (!client) throw new Error("Supabase não configurado.");
    return client;
  }

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  function onAuthStateChange(callback) {
    if (!client) return { unsubscribe() {} };
    const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session));
    return data.subscription;
  }

  async function signIn(email, password) {
    await requireClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signUp(email, password, fullName) {
    await requireClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`
      }
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
  }

  async function signOutEverywhere() {
    await requireClient();
    const { error } = await client.auth.signOut({ scope: "global" });
    if (error) throw error;
  }

  async function reauthenticate(email, password) {
    await requireClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function updateEmail(email) {
    await requireClient();
    const { data, error } = await client.auth.updateUser({ email });
    if (error) throw error;
    return data;
  }

  async function deleteAccount() {
    await requireClient();
    const { data, error } = await client.functions.invoke("delete-account", { body: { confirm: true } });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "Não foi possível excluir a conta.");
    try { await client.auth.signOut({ scope: "local" }); } catch {}
    return true;
  }

  async function sendPasswordReset(email, redirectTo = null) {
    await requireClient();
    const target = redirectTo || `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await client.auth.resetPasswordForEmail(email, { redirectTo: target });
    if (error) throw error;
    return data;
  }

  async function updatePassword(password) {
    await requireClient();
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;
    return data;
  }

  async function resendSignup(email, redirectTo = null) {
    await requireClient();
    const target = redirectTo || `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: target } });
    if (error) throw error;
    return data;
  }

  async function getUser() {
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    return data.user || null;
  }

  async function ensureUserScaffold(user) {
    await requireClient();
    const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário";

    const { error: profileError } = await client.from("profiles").upsert({
      id: user.id,
      full_name: fullName,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const { count: catCount, error: catCountError } = await client
      .from("categories")
      .select("id", { count: "exact", head: true });
    if (catCountError) throw catCountError;

    if (!catCount) {
      const income = ["Salário", "VR", "Adiantamento", "Freelance", "Renda extra", "Outros"];
      const expense = ["Alimentação", "Moradia", "Transporte", "Lazer", "Saúde", "Casa", "Assinaturas", "Outros"];
      const rows = [
        ...income.map(name => ({ user_id: user.id, name, kind: "income" })),
        ...expense.map(name => ({ user_id: user.id, name, kind: "expense" }))
      ];
      const { error } = await client.from("categories").insert(rows);
      if (error) throw error;
    }

    const { count: accountCount, error: accountCountError } = await client
      .from("accounts")
      .select("id", { count: "exact", head: true });
    if (accountCountError) throw accountCountError;
    if (!accountCount) {
      const { error } = await client.from("accounts").insert({
        user_id: user.id,
        name: "Conta principal",
        institution: "Principal",
        type: "wallet",
        balance: 0,
        is_primary: true
      });
      if (error) throw error;
    }
  }

  async function loadUserState(user) {
    await requireClient();
    await ensureUserScaffold(user);

    const [
      profileRes,categoriesRes,accountsRes,transactionsRes,budgetsRes,goalsRes,goalContribRes,
      installmentsRes,recurringRes,cardsRes,cardPurchasesRes,transfersRes,invoicePaymentsRes,debtsRes,assetsRes,
      subscriptionsRes,billsRes,futureTransactionsRes,aiUsageRes
    ] = await Promise.all([
      client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      client.from("categories").select("*").order("name"),
      client.from("accounts").select("*").order("created_at").limit(50),
      client.from("transactions").select("*").order("occurred_on", { ascending: false }).limit(1000),
      client.from("budgets").select("*").eq("month", currentMonth()).limit(100),
      client.from("goals").select("*").order("created_at"),
      client.from("goal_contributions").select("*").order("contributed_on", {ascending:false}).limit(500),
      client.from("installments").select("*").order("created_at"),
      client.from("recurring_transactions").select("*").eq("active", true).order("due_day"),
      client.from("credit_cards").select("*").order("created_at"),
      client.from("card_purchases").select("*").order("purchased_on", {ascending:false}).limit(1000),
      client.from("transfers").select("*").order("transferred_on", {ascending:false}).limit(500),
      client.from("invoice_payments").select("*").order("paid_on", {ascending:false}).limit(1000),
      client.from("debts").select("*").order("created_at"),
      client.from("assets").select("*").order("created_at"),
      client.from("subscriptions").select("*").order("renewal_day"),
      client.from("bills").select("*").order("due_on"),
      client.from("future_transactions").select("*").order("planned_on"),
      client.from("ai_usage_daily").select("request_count,input_tokens,output_tokens,usage_date").eq("usage_date", currentDate()).maybeSingle()
    ]);

    const results=[profileRes,categoriesRes,accountsRes,transactionsRes,budgetsRes,goalsRes,goalContribRes,installmentsRes,recurringRes,cardsRes,cardPurchasesRes,transfersRes,invoicePaymentsRes,debtsRes,assetsRes,subscriptionsRes,billsRes,futureTransactionsRes,aiUsageRes];
    const failed=results.find(r=>r.error);if(failed?.error)throw failed.error;

    const categories=categoriesRes.data||[];
    const categoryById=new Map(categories.map(c=>[c.id,c]));
    const accounts=(accountsRes.data||[]).map((a,i)=>({id:a.id,name:a.name,type:a.type||"wallet",balance:num(a.balance),institution:a.institution||"",primary:Boolean(a.is_primary ?? (i===0))}));
    const account=accounts.find(a=>a.primary)||accounts[0]||null;
    const transactions=(transactionsRes.data||[]).map(t=>({
      id:t.id,description:t.description,value:num(t.amount),type:t.kind,
      category:categoryById.get(t.category_id)?.name||"Outros",categoryId:t.category_id,
      accountId:t.account_id,date:t.occurred_on,recurring:Boolean(t.is_recurring),installment:Boolean(t.is_installment),notes:t.notes||""
    }));
    const spendByCategoryId=new Map();const monthPrefix=currentMonth().slice(0,7);
    transactions.filter(t=>t.type==="expense"&&t.date.startsWith(monthPrefix)).forEach(t=>spendByCategoryId.set(t.categoryId,(spendByCategoryId.get(t.categoryId)||0)+t.value));

    return {
      version:19,mode:"cloud",
      user:{id:user.id,name:profileRes.data?.full_name||user.user_metadata?.full_name||user.email?.split("@")[0]||"Usuário",email:user.email||"",loggedIn:true},
      settings:{theme:localStorage.getItem("estejaNoControle.theme")||"dark",onboardingCompleted:localStorage.getItem("enc.onboardingCompleted")==="1",browserNotifications:localStorage.getItem("enc.browserNotifications")==="1",monthlySavingsTarget:num(profileRes.data?.monthly_savings_target),monthlyIncome:num(profileRes.data?.monthly_income),paydayDay:profileRes.data?.payday_day||null,currency:profileRes.data?.currency||"BRL",profileSetupCompleted:Boolean(profileRes.data?.onboarding_complete),aiEnabled:profileRes.data?.ai_enabled!==false,aiUsage:{requests:num(aiUsageRes.data?.request_count),limit:30,inputTokens:num(aiUsageRes.data?.input_tokens),outputTokens:num(aiUsageRes.data?.output_tokens)}},
      accountId:account?.id||null,accountBalance:num(account?.balance),accounts,categories,transactions,
      budgets:(budgetsRes.data||[]).map(b=>({id:b.id,categoryId:b.category_id,category:categoryById.get(b.category_id)?.name||"Outros",limit:num(b.limit_amount),spent:num(spendByCategoryId.get(b.category_id))})),
      goals:(goalsRes.data||[]).map(g=>({id:g.id,name:g.name,target:num(g.target_amount),current:num(g.current_amount),deadline:g.deadline,icon:g.icon||"◎"})),
      goalContributions:(goalContribRes.data||[]).map(c=>({id:c.id,goalId:c.goal_id,amount:num(c.amount),date:c.contributed_on,note:c.note||""})),
      installments:(installmentsRes.data||[]).map(i=>({id:i.id,name:i.name,total:num(i.total_amount),installmentValue:num(i.installment_amount),paid:i.installments_paid,installments:i.installments_total,nextDue:i.next_due,cardId:i.card_id||null,category:i.category||"Casa",paymentMethod:i.payment_method||"other"})),
      recurring:(recurringRes.data||[]).map(r=>({id:r.id,name:r.description,value:num(r.amount),type:r.kind,day:r.due_day,categoryId:r.category_id,category:categoryById.get(r.category_id)?.name||"Outros",accountId:r.account_id||account?.id||null,automationMode:r.automation_mode||"manual"})),
      cards:(cardsRes.data||[]).map(c=>({id:c.id,name:c.name,last4:c.last4||"0000",brand:c.brand||"CARD",limit:num(c.limit_amount),used:num(c.used_amount),available:Math.max(0,num(c.limit_amount)-num(c.used_amount)),currentInvoice:num(c.current_invoice),closingDay:c.closing_day,dueDay:c.due_day,theme:c.theme||"purple"})),
      cardPurchases:(cardPurchasesRes.data||[]).map(p=>({id:p.id,cardId:p.card_id,description:p.description,amount:num(p.amount),date:p.purchased_on,category:p.category||"Outros",installments:p.installments_total||1,currentInstallment:p.current_installment||1,invoiceMonth:String(p.invoice_month||p.purchased_on).slice(0,7)})),
      transfers:(transfersRes.data||[]).map(t=>({id:t.id,fromAccountId:t.from_account_id,toAccountId:t.to_account_id,amount:num(t.amount),date:t.transferred_on,note:t.note||""})),
      invoicePayments:(invoicePaymentsRes.data||[]).map(p=>({id:p.id,cardId:p.card_id,accountId:p.account_id,invoiceMonth:String(p.invoice_month).slice(0,7),amount:num(p.amount),paidOn:p.paid_on,note:p.note||""})),
      debts:(debtsRes.data||[]).map(d=>({id:d.id,name:d.name,balance:num(d.balance),installment:num(d.monthly_payment),interestRate:num(d.interest_rate)})),
      assets:(assetsRes.data||[]).map(a=>({id:a.id,name:a.name,value:num(a.value),kind:a.kind||"outro"})),
      subscriptions:(subscriptionsRes.data||[]).map(s=>({id:s.id,name:s.name,value:num(s.amount),day:s.renewal_day,category:s.category||"Assinaturas",active:Boolean(s.active),accountId:s.account_id||null,icon:s.icon||"◉",autoCreateBill:Boolean(s.auto_create_bill??true)})),
      bills:(billsRes.data||[]).map(b=>({id:b.id,name:b.name,value:num(b.amount),dueDate:b.due_on,category:b.category||"Casa",status:b.status||"pending",accountId:b.account_id||null,barcode:b.reference||"",paidOn:b.paid_on||null})),
      futureTransactions:(futureTransactionsRes.data||[]).map(f=>({id:f.id,description:f.description,value:num(f.amount),type:f.kind,date:f.planned_on,category:f.category||"Outros",accountId:f.account_id||null,status:f.status||"planned",postedOn:f.posted_on||null})),
      chat:[{role:"bot",text:"Olá! Seus dados estão sincronizados com o Supabase. Posso analisar contas, cartões, metas, assinaturas e gastos."}]
    };
  }

  async function findCategoryId(userId, name, kind) {
    if (!client || !name) return null;
    let { data, error } = await client.from("categories").select("id").eq("name", name).eq("kind", kind).limit(1).maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
    const inserted = await client.from("categories").insert({ user_id:userId, name, kind }).select("id").single();
    if (inserted.error) throw inserted.error;
    return inserted.data.id;
  }

  async function firstAccount(userId) {
    const { data, error } = await client.from("accounts").select("id,balance").eq("user_id", userId).order("created_at").limit(1).maybeSingle();
    if (error) throw error;
    if (data) return data;
    const created = await client.from("accounts").insert({user_id:userId,name:"Conta principal",type:"wallet",balance:0}).select("id,balance").single();
    if (created.error) throw created.error;
    return created.data;
  }

  async function accountById(userId, accountId) {
    if(accountId){
      const {data,error}=await client.from("accounts").select("id,balance").eq("user_id",userId).eq("id",accountId).maybeSingle();
      if(error)throw error;if(data)return data;
    }
    return firstAccount(userId);
  }

  async function adjustAccountBalance(userId, delta, accountId = null) {
    const account = await accountById(userId, accountId);
    const next = num(account.balance) + num(delta);
    const { error } = await client.from("accounts").update({ balance: next, updated_at: new Date().toISOString() }).eq("id", account.id);
    if (error) throw error;
  }

  async function saveTransaction(user, data, existing = null) {
    await requireClient();
    const categoryId=await findCategoryId(user.id,data.category,data.type);
    const account=await accountById(user.id,data.accountId);
    const row={user_id:user.id,account_id:account.id,category_id:categoryId,description:data.description,amount:num(data.value),kind:data.type,occurred_on:data.date,is_recurring:Boolean(data.recurring),is_installment:Boolean(data.installment),notes:data.notes||null,updated_at:new Date().toISOString()};
    if(existing?.id){
      const {error}=await client.from("transactions").update(row).eq("id",existing.id);if(error)throw error;
      const previousDelta=existing.type==="income"?num(existing.value):-num(existing.value);
      const nextDelta=data.type==="income"?num(data.value):-num(data.value);
      await adjustAccountBalance(user.id,-previousDelta,existing.accountId);
      await adjustAccountBalance(user.id,nextDelta,account.id);
      return existing.id;
    }
    const {data:inserted,error}=await client.from("transactions").insert(row).select("id").single();if(error)throw error;
    await adjustAccountBalance(user.id,data.type==="income"?num(data.value):-num(data.value),account.id);
    return inserted.id;
  }

  async function deleteTransaction(user, existing) {
    await requireClient();
    const { error } = await client.from("transactions").delete().eq("id", existing.id);
    if (error) throw error;
    const reverse = existing.type === "income" ? -num(existing.value) : num(existing.value);
    await adjustAccountBalance(user.id, reverse, existing.accountId);
  }

  async function saveEntity(entity, user, data, existing = null) {
    await requireClient();
    let table,row;
    switch(entity){
      case"goal":
        table="goals";row={user_id:user.id,name:data.name,target_amount:num(data.target),current_amount:num(data.current),deadline:data.deadline||null,icon:data.icon||"◎",updated_at:new Date().toISOString()};break;
      case"goalContribution":{
        const contribution={user_id:user.id,goal_id:data.goalId,amount:num(data.amount),contributed_on:data.date,note:data.note||null};
        const {data:goal,error:gerr}=await client.from("goals").select("current_amount,target_amount").eq("id",data.goalId).single();if(gerr)throw gerr;
        const next=Math.min(num(goal.target_amount),num(goal.current_amount)+num(data.amount));
        const {error:uerr}=await client.from("goals").update({current_amount:next,updated_at:new Date().toISOString()}).eq("id",data.goalId);if(uerr)throw uerr;
        const {data:ins,error}=await client.from("goal_contributions").insert(contribution).select("id").single();if(error)throw error;return ins.id;
      }
      case"budget":{
        table="budgets";const categoryId=await findCategoryId(user.id,data.category,"expense");row={user_id:user.id,category_id:categoryId,month:currentMonth(),limit_amount:num(data.limit),updated_at:new Date().toISOString()};break;
      }
      case"installment":
        table="installments";row={user_id:user.id,name:data.name,total_amount:num(data.total),installment_amount:num(data.installmentValue),installments_total:Number(data.installments),installments_paid:Number(data.paid),next_due:data.nextDue||null,card_id:data.cardId||null,category:data.category||"Casa",payment_method:data.paymentMethod||"other",updated_at:new Date().toISOString()};break;
      case"recurring":{
        table="recurring_transactions";const categoryId=await findCategoryId(user.id,data.category||"Outros",data.type);row={user_id:user.id,description:data.name,amount:num(data.value),kind:data.type,due_day:Number(data.day),category_id:categoryId,account_id:data.accountId||null,automation_mode:data.automationMode||"manual",active:true,updated_at:new Date().toISOString()};break;
      }
      case"card":
        table="credit_cards";row={user_id:user.id,name:data.name,last4:data.last4||null,brand:data.brand||null,limit_amount:num(data.limit),used_amount:num(data.used),current_invoice:num(data.currentInvoice||0),closing_day:Number(data.closingDay)||null,due_day:Number(data.dueDay)||null,theme:data.theme||"purple",updated_at:new Date().toISOString()};break;
      case"cardPurchase":{
        table="card_purchases";
        const baseMonth=`${String(data.invoiceMonth||data.date).slice(0,7)}-01`;
        row={user_id:user.id,card_id:data.cardId,description:data.description,amount:num(data.amount),purchased_on:data.date,category:data.category||"Outros",installments_total:Number(data.installments||1),current_installment:Number(data.currentInstallment||1),invoice_month:baseMonth,updated_at:new Date().toISOString()};
        if(existing?.id){const {error}=await client.from(table).update(row).eq("id",existing.id);if(error)throw error;return existing.id;}
        const rows=[];
        for(let part=Number(data.currentInstallment||1);part<=Number(data.installments||1);part++)rows.push({...row,current_installment:part,invoice_month:addMonthsKey(baseMonth,part-Number(data.currentInstallment||1))});
        const {data:insertedRows,error}=await client.from(table).insert(rows).select("id");if(error)throw error;
        if(Number(data.installments||1)>1){
          const cardRes=await client.from("credit_cards").select("due_day").eq("id",data.cardId).maybeSingle();if(cardRes.error)throw cardRes.error;
          const d=new Date();d.setMonth(d.getMonth()+1);d.setDate(cardRes.data?.due_day||10);
          const nextDue=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
          const inst={user_id:user.id,name:data.description,total_amount:num(data.amount)*Number(data.installments),installment_amount:num(data.amount),installments_total:Number(data.installments),installments_paid:Math.max(0,Number(data.currentInstallment||1)-1),next_due:nextDue,card_id:data.cardId,category:data.category||"Casa",payment_method:"credit_card"};
          const ir=await client.from("installments").insert(inst);if(ir.error)throw ir.error;
        }
        return insertedRows?.[0]?.id;
      }
      case"invoicePayment":{
        const account=await accountById(user.id,data.accountId);
        await adjustAccountBalance(user.id,-num(data.amount),account.id);
        const payment={user_id:user.id,card_id:data.cardId,account_id:account.id,invoice_month:`${String(data.invoiceMonth).slice(0,7)}-01`,amount:num(data.amount),paid_on:data.paidOn,note:data.note||null};
        const {data:ins,error}=await client.from("invoice_payments").insert(payment).select("id").single();if(error)throw error;
        const categoryId=await findCategoryId(user.id,"Casa","expense");
        const cardRes=await client.from("credit_cards").select("name").eq("id",data.cardId).maybeSingle();if(cardRes.error)throw cardRes.error;
        const tx={user_id:user.id,account_id:account.id,category_id:categoryId,description:`Pagamento fatura ${cardRes.data?.name||"cartão"}`,amount:num(data.amount),kind:"expense",occurred_on:data.paidOn,is_recurring:false,is_installment:false,notes:`Fatura ${String(data.invoiceMonth).slice(0,7)}`};
        const tr=await client.from("transactions").insert(tx);if(tr.error)throw tr.error;
        return ins.id;
      }
      case"account":
        table="accounts";row={user_id:user.id,name:data.name,institution:data.institution||null,type:data.type||"wallet",balance:num(data.balance),is_primary:existing?.is_primary??existing?.primary??false,updated_at:new Date().toISOString()};break;
      case"transfer":{
        const from=await accountById(user.id,data.fromAccountId),to=await accountById(user.id,data.toAccountId);
        if(from.id===to.id)throw new Error("As contas da transferência devem ser diferentes.");
        await adjustAccountBalance(user.id,-num(data.amount),from.id);await adjustAccountBalance(user.id,num(data.amount),to.id);
        const {data:ins,error}=await client.from("transfers").insert({user_id:user.id,from_account_id:from.id,to_account_id:to.id,amount:num(data.amount),transferred_on:data.date,note:data.note||null}).select("id").single();if(error)throw error;return ins.id;
      }
      case"subscription":
        table="subscriptions";row={user_id:user.id,account_id:data.accountId||null,name:data.name,amount:num(data.value),renewal_day:Number(data.day),category:data.category||"Assinaturas",active:Boolean(data.active),auto_create_bill:Boolean(data.autoCreateBill??true),icon:data.icon||"◉",updated_at:new Date().toISOString()};break;
      case"bill":
        table="bills";row={user_id:user.id,account_id:data.accountId||null,name:data.name,amount:num(data.value),due_on:data.dueDate,category:data.category||"Casa",status:data.status||"pending",reference:data.barcode||null,updated_at:new Date().toISOString()};break;
      case"futureTransaction":
        table="future_transactions";row={user_id:user.id,account_id:data.accountId||null,description:data.description,amount:num(data.value),kind:data.type,planned_on:data.date,category:data.category||"Outros",status:data.status||"planned",updated_at:new Date().toISOString()};break;
      case"debt":
        table="debts";row={user_id:user.id,name:data.name,balance:num(data.balance),monthly_payment:num(data.installment),interest_rate:data.interestRate===""?null:num(data.interestRate),updated_at:new Date().toISOString()};break;
      case"asset":
        table="assets";row={user_id:user.id,name:data.name,value:num(data.value),kind:data.kind||"outro",updated_at:new Date().toISOString()};break;
      default:throw new Error("Tipo de cadastro não suportado.");
    }
    if(existing?.id){const {error}=await client.from(table).update(row).eq("id",existing.id);if(error)throw error;return existing.id;}
    const {data:inserted,error}=await client.from(table).insert(row).select("id").single();if(error)throw error;return inserted.id;
  }

  async function payBill(user,bill){
    await requireClient();
    const account=await accountById(user.id,bill.accountId);
    await adjustAccountBalance(user.id,-num(bill.value),account.id);
    const paidOn=new Date().toISOString().slice(0,10);
    const {error:uerr}=await client.from("bills").update({status:"paid",paid_on:paidOn,updated_at:new Date().toISOString()}).eq("id",bill.id);if(uerr)throw uerr;
    const categoryId=await findCategoryId(user.id,bill.category||"Casa","expense");
    const {error:terr}=await client.from("transactions").insert({user_id:user.id,account_id:account.id,category_id:categoryId,description:bill.name,amount:num(bill.value),kind:"expense",occurred_on:paidOn,is_recurring:false,is_installment:false,notes:"Pagamento de conta"});if(terr)throw terr;
  }

  async function postFutureTransaction(user,item){
    await requireClient();
    const occurredOn=new Date().toISOString().slice(0,10);
    await saveTransaction(user,{description:item.description,value:num(item.value),type:item.type,category:item.category||"Outros",date:occurredOn,recurring:false,installment:false,notes:`Previsto para ${item.date}`,accountId:item.accountId},null);
    const {error}=await client.from("future_transactions").update({status:"posted",posted_on:occurredOn,updated_at:new Date().toISOString()}).eq("id",item.id);if(error)throw error;
  }

  async function deleteEntity(entity,id){
    await requireClient();
    const tables={goal:"goals",goalContribution:"goal_contributions",budget:"budgets",installment:"installments",recurring:"recurring_transactions",card:"credit_cards",cardPurchase:"card_purchases",account:"accounts",transfer:"transfers",invoicePayment:"invoice_payments",debt:"debts",asset:"assets",subscription:"subscriptions",bill:"bills",futureTransaction:"future_transactions"};
    const table=tables[entity];if(!table)throw new Error("Tipo de cadastro não suportado.");
    if(entity==="goalContribution"){
      const {data:c,error:cerr}=await client.from("goal_contributions").select("goal_id,amount").eq("id",id).single();if(cerr)throw cerr;
      const {data:g,error:gerr}=await client.from("goals").select("current_amount").eq("id",c.goal_id).single();if(gerr)throw gerr;
      const ur=await client.from("goals").update({current_amount:Math.max(0,num(g.current_amount)-num(c.amount))}).eq("id",c.goal_id);if(ur.error)throw ur.error;
    }
    const {error}=await client.from(table).delete().eq("id",id);if(error)throw error;
  }

  function safeDateForDay(year, monthIndex, day) {
    const last = new Date(year, monthIndex + 1, 0).getDate();
    const d = Math.min(Math.max(1, Number(day) || 1), last);
    return `${year}-${String(monthIndex + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }

  async function processAutomations(user) {
    await requireClient();
    const today = new Date();
    const period = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;
    const todayDate = `${period}-${String(today.getDate()).padStart(2,"0")}`;
    let createdTransactions = 0, createdBills = 0;

    const [recRes, subRes] = await Promise.all([
      client.from("recurring_transactions").select("*").eq("active", true),
      client.from("subscriptions").select("*").eq("active", true)
    ]);
    if (recRes.error) throw recRes.error;
    if (subRes.error) throw subRes.error;

    for (const r of recRes.data || []) {
      const mode = r.automation_mode || "manual";
      if (mode === "manual") continue;
      const dueOn = safeDateForDay(today.getFullYear(), today.getMonth(), r.due_day);
      if (mode === "bill") {
        const row = {user_id:user.id,account_id:r.account_id||null,name:r.description,amount:num(r.amount),due_on:dueOn,category:"Recorrente",status:dueOn<todayDate?"overdue":"pending",source_type:"recurring",source_id:r.id,source_period:period,updated_at:new Date().toISOString()};
        const exists=await client.from("bills").select("id").eq("user_id",user.id).eq("source_type","recurring").eq("source_id",r.id).eq("source_period",period).maybeSingle();
        if(exists.error)throw exists.error;
        if(!exists.data){const {error}=await client.from("bills").insert(row);if(error)throw error;createdBills++;}
      } else if (mode === "auto_post" && dueOn <= todayDate) {
        const category = await client.from("categories").select("id").eq("id",r.category_id).maybeSingle();
        if(category.error) throw category.error;
        const account = await accountById(user.id,r.account_id);
        const tx = {user_id:user.id,account_id:account.id,category_id:r.category_id||null,description:r.description,amount:num(r.amount),kind:r.kind,occurred_on:dueOn,is_recurring:true,is_installment:false,notes:"Lançamento automático",source_type:"recurring",source_id:r.id,source_period:period,updated_at:new Date().toISOString()};
        const exists=await client.from("transactions").select("id").eq("user_id",user.id).eq("source_type","recurring").eq("source_id",r.id).eq("source_period",period).maybeSingle();
        if(exists.error)throw exists.error;
        if(!exists.data){const {error}=await client.from("transactions").insert(tx);if(error)throw error;createdTransactions++;await adjustAccountBalance(user.id,r.kind==="income"?num(r.amount):-num(r.amount),account.id);}
      }
    }

    for (const s of subRes.data || []) {
      if (s.auto_create_bill === false) continue;
      const dueOn = safeDateForDay(today.getFullYear(), today.getMonth(), s.renewal_day);
      const row={user_id:user.id,account_id:s.account_id||null,name:s.name,amount:num(s.amount),due_on:dueOn,category:s.category||"Assinaturas",status:dueOn<todayDate?"overdue":"pending",source_type:"subscription",source_id:s.id,source_period:period,updated_at:new Date().toISOString()};
      const exists=await client.from("bills").select("id").eq("user_id",user.id).eq("source_type","subscription").eq("source_id",s.id).eq("source_period",period).maybeSingle();
      if(exists.error)throw exists.error;
      if(!exists.data){const {error}=await client.from("bills").insert(row);if(error)throw error;createdBills++;}
    }
    return {createdTransactions,createdBills,period};
  }

  async function updateProfile(user, values) {
    await requireClient();
    const patch = { updated_at:new Date().toISOString() };
    if (values.name !== undefined) patch.full_name = values.name;
    if (values.currency !== undefined) patch.currency = values.currency || "BRL";
    if (values.monthlyIncome !== undefined) patch.monthly_income = Math.max(0, num(values.monthlyIncome));
    if (values.paydayDay !== undefined) patch.payday_day = values.paydayDay ? Number(values.paydayDay) : null;
    if (values.monthlySavingsTarget !== undefined) patch.monthly_savings_target = Math.max(0, num(values.monthlySavingsTarget));
    if (values.profileSetupCompleted !== undefined) patch.onboarding_complete = Boolean(values.profileSetupCompleted);
    if (values.aiEnabled !== undefined) patch.ai_enabled = Boolean(values.aiEnabled);
    const { error } = await client.from("profiles").update(patch).eq("id", user.id);
    if (error) throw error;
  }

  async function setAccountBalance(user, balance, accountId = null) {
    await requireClient();
    const account = await accountById(user.id, accountId);
    const { error } = await client.from("accounts").update({ balance:num(balance), updated_at:new Date().toISOString() }).eq("id", account.id);
    if (error) throw error;
  }


  async function askFinancialAI(question, snapshot, history = []) {
    await requireClient();
    const { data, error } = await client.functions.invoke("financial-ai", { body: { question, snapshot, history } });
    if (error) {
      let detail = error?.message || "Não foi possível consultar a IA.";
      try {
        if (error?.context && typeof error.context.json === "function") {
          const payload = await error.context.json();
          if (payload?.error) detail = String(payload.error);
        }
      } catch {}
      throw new Error(detail);
    }
    if (!data?.answer) throw new Error(data?.error || "A IA não retornou uma resposta.");
    return { answer:String(data.answer), remaining:Number(data.remaining ?? 0), limit:Number(data.limit ?? 30), model:data.model || "gpt-5.6" };
  }

  window.ENCCloud = {
    configured: Boolean(client),
    client,
    getSession,
    getUser,
    onAuthStateChange,
    signIn,
    signUp,
    signOut,
    signOutEverywhere,
    reauthenticate,
    updateEmail,
    deleteAccount,
    sendPasswordReset,
    updatePassword,
    resendSignup,
    loadUserState,
    saveTransaction,
    deleteTransaction,
    saveEntity,
    deleteEntity,
    payBill,
    postFutureTransaction,
    processAutomations,
    updateProfile,
    setAccountBalance,
    askFinancialAI
  };
})();
