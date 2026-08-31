(() => {
  "use strict";

  const WRAP_FLAG = Symbol.for("enc.ai.complete.wrapped");
  const CACHE_MS = 15000;
  let liveCache = { at: 0, data: null };

  const num = value => Number(value || 0);
  const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num(value));
  const currentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const normalize = text => String(text || "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const shortDate = value => {
    if (!value) return "sem data";
    const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  };

  function parseMoney(text) {
    const source = String(text || "");
    const explicit = source.match(/r\$\s*([\d.]+(?:,\d{1,2})?)/i);
    const loose = source.match(/(?:^|\s)(\d{1,7}(?:[.,]\d{1,2})?)(?:\s|$)/);
    const raw = explicit?.[1] || loose?.[1];
    if (!raw) return null;
    const value = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function daysFromToday(dateValue) {
    const target = new Date(`${String(dateValue || "").slice(0, 10)}T12:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date(`${todayKey()}T12:00:00`);
    return Math.ceil((target - today) / 86400000);
  }

  async function safeQuery(promise, fallback = []) {
    try {
      const result = await promise;
      if (result?.error) throw result.error;
      return result?.data ?? fallback;
    } catch (error) {
      console.warn("ENC AI context query failed", error?.message || error);
      return fallback;
    }
  }

  async function loadLiveContext() {
    if (liveCache.data && Date.now() - liveCache.at < CACHE_MS) return liveCache.data;
    const cloud = window.ENCCloud;
    const client = cloud?.client;
    if (!client || typeof cloud?.getSession !== "function") return {};

    const session = await cloud.getSession().catch(() => null);
    if (!session?.user) return {};

    const month = currentMonth();
    const [
      categories, accounts, transactions, cards, purchases, payments, goals,
      bills, subscriptions, debts, installments, budgets, futureTransactions, recurring
    ] = await Promise.all([
      safeQuery(client.from("categories").select("id,name,kind").limit(200)),
      safeQuery(client.from("accounts").select("id,name,institution,balance,is_primary").limit(100)),
      safeQuery(client.from("transactions").select("id,description,amount,kind,occurred_on,category_id,account_id,notes").order("occurred_on", { ascending: false }).limit(500)),
      safeQuery(client.from("credit_cards").select("id,name,last4,limit_amount,closing_day,due_day").limit(50)),
      safeQuery(client.from("card_purchases").select("id,card_id,description,amount,purchased_on,category,installments_total,current_installment,invoice_month").order("purchased_on", { ascending: false }).limit(800)),
      safeQuery(client.from("invoice_payments").select("card_id,invoice_month,amount,paid_on").order("paid_on", { ascending: false }).limit(800)),
      safeQuery(client.from("goals").select("id,name,target_amount,current_amount,deadline").limit(100)),
      safeQuery(client.from("bills").select("id,name,amount,due_on,category,status,paid_on").order("due_on", { ascending: true }).limit(300)),
      safeQuery(client.from("subscriptions").select("id,name,amount,renewal_day,category,active").eq("active", true).limit(100)),
      safeQuery(client.from("debts").select("id,name,balance,monthly_payment,interest_rate").limit(100)),
      safeQuery(client.from("installments").select("id,name,total_amount,installment_amount,installments_paid,installments_total,next_due,card_id,payment_method").limit(300)),
      safeQuery(client.from("budgets").select("id,category_id,limit_amount,month").eq("month", `${month}-01`).limit(100)),
      safeQuery(client.from("future_transactions").select("id,description,amount,kind,planned_on,category,status").order("planned_on", { ascending: true }).limit(300)),
      safeQuery(client.from("recurring_transactions").select("id,description,amount,kind,due_day,active").eq("active", true).limit(200))
    ]);

    const categoryById = new Map(categories.map(item => [String(item.id), item.name || "Outros"]));
    const accountById = new Map(accounts.map(item => [String(item.id), item.name || item.institution || "Conta"]));
    const currentTransactions = transactions.filter(item => String(item.occurred_on || "").startsWith(month));
    const income = currentTransactions.filter(item => item.kind === "income").reduce((sum, item) => sum + num(item.amount), 0);
    const expense = currentTransactions.filter(item => item.kind === "expense").reduce((sum, item) => sum + num(item.amount), 0);
    const categoryTotals = {};
    currentTransactions.filter(item => item.kind === "expense").forEach(item => {
      const name = categoryById.get(String(item.category_id)) || "Outros";
      categoryTotals[name] = (categoryTotals[name] || 0) + num(item.amount);
    });
    const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }));

    const paymentsByCardMonth = new Map();
    payments.forEach(item => {
      const key = `${item.card_id}|${String(item.invoice_month || "").slice(0, 7)}`;
      paymentsByCardMonth.set(key, (paymentsByCardMonth.get(key) || 0) + num(item.amount));
    });

    const cardSummaries = cards.map(card => {
      const cardPurchases = purchases.filter(item => String(item.card_id) === String(card.id));
      const byMonth = {};
      cardPurchases.forEach(item => {
        const key = String(item.invoice_month || item.purchased_on || "").slice(0, 7);
        if (!key) return;
        byMonth[key] = (byMonth[key] || 0) + num(item.amount);
      });
      const invoices = Object.entries(byMonth).map(([key, total]) => {
        const paid = paymentsByCardMonth.get(`${card.id}|${key}`) || 0;
        return { month: key, total, paid, balance: Math.max(0, total - paid) };
      }).sort((a, b) => a.month.localeCompare(b.month));
      const used = invoices.reduce((sum, item) => sum + item.balance, 0);
      const pending = invoices.find(item => item.balance > 0.005 && item.month <= month)
        || invoices.find(item => item.balance > 0.005 && item.month > month)
        || null;
      return {
        id: card.id,
        name: card.name || "Cartão",
        last4: card.last4 || "",
        limit: num(card.limit_amount),
        used,
        available: Math.max(0, num(card.limit_amount) - used),
        closingDay: card.closing_day,
        dueDay: card.due_day,
        pendingInvoice: pending,
        invoices,
        recentPurchases: cardPurchases.slice(0, 10).map(item => ({
          description: item.description,
          amount: num(item.amount),
          date: item.purchased_on,
          category: item.category || "Outros",
          invoiceMonth: String(item.invoice_month || "").slice(0, 7),
          currentInstallment: item.current_installment || 1,
          installments: item.installments_total || 1
        }))
      };
    });

    const pendingBills = bills.filter(item => item.status !== "paid");
    const upcomingBills = pendingBills
      .map(item => ({ ...item, days: daysFromToday(item.due_on) }))
      .filter(item => item.days !== null && item.days >= -30)
      .sort((a, b) => String(a.due_on).localeCompare(String(b.due_on)));
    const activeInstallments = installments.filter(item => num(item.installments_paid) < num(item.installments_total));
    const debtList = debts.map(item => ({
      name: item.name,
      balance: num(item.balance),
      monthly: num(item.monthly_payment),
      interestRate: num(item.interest_rate)
    })).sort((a, b) => (b.interestRate - a.interestRate) || (b.balance - a.balance));
    const goalList = goals.map(item => {
      const missing = Math.max(0, num(item.target_amount) - num(item.current_amount));
      const months = (() => {
        if (!item.deadline) return null;
        const d = new Date(`${item.deadline}T12:00:00`);
        const now = new Date();
        if (Number.isNaN(d.getTime())) return null;
        return Math.max(1, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + (d.getDate() >= now.getDate() ? 0 : -1));
      })();
      return {
        name: item.name,
        current: num(item.current_amount),
        target: num(item.target_amount),
        missing,
        deadline: item.deadline || null,
        requiredMonthly: months ? missing / months : null
      };
    });
    const subscriptionList = subscriptions.map(item => ({ name: item.name, amount: num(item.amount), day: item.renewal_day, category: item.category || "Assinaturas" }))
      .sort((a, b) => b.amount - a.amount);
    const budgetList = budgets.map(item => {
      const category = categoryById.get(String(item.category_id)) || "Outros";
      return { category, limit: num(item.limit_amount), spent: categoryTotals[category] || 0 };
    });

    const data = {
      month,
      accounts: accounts.map(item => ({ id: item.id, name: item.name || item.institution || "Conta", balance: num(item.balance), primary: Boolean(item.is_primary) })),
      accountTotal: accounts.reduce((sum, item) => sum + num(item.balance), 0),
      monthIncome: income,
      monthExpense: expense,
      topCategories,
      recentTransactions: transactions.slice(0, 30).map(item => ({
        description: item.description,
        amount: num(item.amount),
        kind: item.kind,
        date: item.occurred_on,
        category: categoryById.get(String(item.category_id)) || "Outros",
        account: accountById.get(String(item.account_id)) || "Conta"
      })),
      cards: cardSummaries,
      pendingBills: upcomingBills.slice(0, 30).map(item => ({ name: item.name, amount: num(item.amount), dueDate: item.due_on, status: item.status, category: item.category || "Outros", days: item.days })),
      pendingBillsTotal: pendingBills.reduce((sum, item) => sum + num(item.amount), 0),
      subscriptions: subscriptionList,
      subscriptionsMonthly: subscriptionList.reduce((sum, item) => sum + item.amount, 0),
      debts: debtList,
      debtTotal: debtList.reduce((sum, item) => sum + item.balance, 0),
      debtMonthly: debtList.reduce((sum, item) => sum + item.monthly, 0),
      goals: goalList,
      installments: activeInstallments.map(item => ({ name: item.name, monthly: num(item.installment_amount), paid: num(item.installments_paid), total: num(item.installments_total), nextDue: item.next_due, cardId: item.card_id || null })),
      installmentsMonthly: activeInstallments.reduce((sum, item) => sum + num(item.installment_amount), 0),
      budgets: budgetList,
      futureTransactions: futureTransactions.filter(item => item.status !== "posted").slice(0, 30).map(item => ({ description: item.description, amount: num(item.amount), kind: item.kind, date: item.planned_on, category: item.category || "Outros" })),
      recurring: recurring.map(item => ({ description: item.description, amount: num(item.amount), kind: item.kind, day: item.due_day }))
    };

    liveCache = { at: Date.now(), data };
    return data;
  }

  function inferQuestion(question, history) {
    const q = String(question || "").trim();
    if (!q) return q;
    const normalized = normalize(q);
    if (/^(e\s*)?(r\$\s*)?\d+[\d.,]*\??$/.test(normalized)) {
      const previous = [...(history || [])].reverse().find(item => item?.role === "user" && /compr|gastar|cabe|perfume|celular|tv|roupa|compra/i.test(item?.text || ""));
      if (previous) return `Posso fazer uma compra de ${q.replace(/^e\s*/i, "")} este mês?`;
    }
    return q;
  }

  function purchaseAnswer(question, snapshot, live) {
    const amount = parseMoney(question);
    if (!amount) return "Me diga o valor da compra, por exemplo: “posso comprar um perfume de R$ 250 este mês?”.";
    const projected = num(snapshot?.balances?.projectedEndOfMonth);
    const target = Math.max(0, num(snapshot?.purchaseDecision?.savingsTarget));
    const optional = Math.max(0, num(snapshot?.purchaseDecision?.availableForOptionalSpending ?? (projected - target)));
    const after = projected - amount;

    const q = normalize(question);
    let card = null;
    if (live?.cards?.length) {
      card = live.cards.find(item => q.includes(normalize(item.name))) || (/(cartao|credito|fatura)/.test(q) ? live.cards[0] : null);
    }
    const cardProblem = card && amount > num(card.available) + 0.005;
    const budgetStatus = after < 0 ? "no" : amount > optional ? "goal" : "yes";

    let answer = "";
    if (budgetStatus === "no") {
      answer = `Pelos dados cadastrados, essa compra de ${money(amount)} não cabe com segurança neste mês. Seu saldo projetado é ${money(projected)} e ficaria em ${money(after)} depois da compra.`;
    } else if (budgetStatus === "goal") {
      answer = `A compra de ${money(amount)} cabe no caixa, mas ultrapassa o gasto opcional estimado de ${money(optional)} e reduziria sua meta mensal de economia de ${money(target)}. O saldo projetado depois ficaria em ${money(after)}.`;
    } else {
      answer = `Pelos dados cadastrados, a compra de ${money(amount)} cabe neste mês. Seu saldo projetado passaria de ${money(projected)} para ${money(after)}, preservando a meta mensal de ${money(target)}.`;
    }
    if (card) {
      answer += cardProblem
        ? ` No ${card.name}, porém, o limite disponível é ${money(card.available)}, então essa compra não passaria nesse cartão sem liberar limite.`
        : ` No ${card.name}, o limite disponível estimado é ${money(card.available)}, então o crédito também comporta a compra.`;
    }
    return answer;
  }

  function overallAnswer(snapshot, live) {
    const top = live?.topCategories?.[0];
    const cardDebt = (live?.cards || []).reduce((sum, card) => sum + num(card.used), 0);
    const projected = num(snapshot?.balances?.projectedEndOfMonth);
    const optional = num(snapshot?.purchaseDecision?.availableForOptionalSpending);
    const score = num(snapshot?.health?.score);
    const parts = [
      `Hoje você tem ${money(live?.accountTotal ?? snapshot?.balances?.accountsTotal)} em contas. O saldo projetado para o fim do mês é ${money(projected)} e o gasto opcional estimado é ${money(optional)}.`,
      `Neste mês há ${money(live?.monthIncome ?? snapshot?.month?.income)} em entradas e ${money(live?.monthExpense ?? snapshot?.month?.expense)} em saídas registradas.${top ? ` A categoria que mais pesa é ${top.name}, com ${money(top.value)}.` : ""}`,
      `Cartões têm cerca de ${money(cardDebt)} comprometidos; contas pendentes somam ${money(live?.pendingBillsTotal ?? snapshot?.bills?.pendingTotal)}; dívidas cadastradas somam ${money(live?.debtTotal ?? snapshot?.debts?.total)}.${score ? ` Sua saúde financeira está em ${score}/1000.` : ""}`
    ];
    const goal = live?.goals?.[0] || snapshot?.goals?.[0];
    if (goal) parts.push(`Na meta “${goal.name}”, faltam ${money(goal.missing)}${goal.requiredMonthly ? `, o que pede aproximadamente ${money(goal.requiredMonthly)} por mês até o prazo` : ""}.`);
    return parts.join(" ");
  }

  function localAnswer(rawQuestion, snapshot = {}, live = {}, history = []) {
    const question = inferQuestion(rawQuestion, history);
    const q = normalize(question);
    const top = live?.topCategories?.[0] || snapshot?.month?.topCategories?.[0];

    if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|hey)\b/.test(q)) {
      return "Olá! Posso analisar seu mês inteiro, compras, cartões e limites, faturas, contas a pagar, assinaturas, parcelas, dívidas, metas, orçamento, gastos por categoria, projeções e comparação entre meses. Pergunte do jeito que você falaria normalmente.";
    }
    if (/analisa tudo|analise tudo|resumo completo|situacao financeira|como estao minhas financas|visao geral|diagnostico/.test(q)) return overallAnswer(snapshot, live);
    if (/posso\s+(comprar|gastar)|da\s+pra\s+(comprar|gastar)|cabe\s+no\s+orcamento|consigo\s+(comprar|gastar)|vale a pena comprar/.test(q)) return purchaseAnswer(question, snapshot, live);

    if (/cartao|fatura|limite/.test(q)) {
      const cards = live?.cards || snapshot?.cards || [];
      if (!cards.length) return "Você ainda não cadastrou nenhum cartão.";
      return cards.map(card => {
        const pending = card.pendingInvoice || null;
        const invoice = pending ? pending.balance : num(card.invoice);
        const month = pending?.month ? ` (${pending.month})` : "";
        return `${card.name}: limite ${money(card.limit)}, disponível ${money(card.available)}, valor comprometido ${money(card.used ?? (num(card.limit) - num(card.available)))} e fatura pendente ${money(invoice)}${month}.`;
      }).join(" ");
    }

    if (/conta a pagar|contas a pagar|boleto|venc|proximos?\s+\d+\s+dias|o que falta pagar/.test(q)) {
      const requestedDays = Number(q.match(/(\d+)\s+dias/)?.[1] || 30);
      const list = (live?.pendingBills || []).filter(item => item.days == null || item.days <= requestedDays).slice(0, 8);
      if (!list.length) return `Não encontrei contas pendentes para os próximos ${requestedDays} dias.`;
      const total = list.reduce((sum, item) => sum + num(item.amount), 0);
      return `Nos próximos ${requestedDays} dias encontrei ${list.length} conta${list.length !== 1 ? "s" : ""}, somando ${money(total)}. ` + list.map(item => `${item.name}: ${money(item.amount)} em ${shortDate(item.dueDate)}`).join("; ") + ".";
    }

    if (/assinatura|streaming|mensalidade/.test(q)) {
      const subs = live?.subscriptions || [];
      const total = num(live?.subscriptionsMonthly ?? snapshot?.subscriptions?.monthly);
      if (!subs.length && !total) return "Não há assinaturas ativas cadastradas.";
      const names = subs.slice(0, 6).map(item => `${item.name} (${money(item.amount)})`).join(", ");
      return `Suas assinaturas ativas somam ${money(total)} por mês e aproximadamente ${money(total * 12)} por ano.${names ? ` As maiores são: ${names}.` : ""}`;
    }

    if (/divida|emprestimo|financiamento|juros|qual.*priorizar/.test(q)) {
      const debts = live?.debts || [];
      const total = num(live?.debtTotal ?? snapshot?.debts?.total);
      const monthly = num(live?.debtMonthly ?? snapshot?.debts?.monthlyCommitment);
      if (!debts.length && !total) return "Nenhuma dívida está cadastrada.";
      const first = debts[0];
      let answer = `Você tem ${money(total)} em dívidas cadastradas, com cerca de ${money(monthly)} de compromisso mensal.`;
      if (first) answer += first.interestRate > 0
        ? ` Pela taxa cadastrada, a prioridade financeira é ${first.name}, com ${first.interestRate}% de juros.`
        : ` Como não há taxas de juros suficientes cadastradas, eu não consigo afirmar qual é a mais cara; cadastre os juros para eu ordenar corretamente.`;
      return answer;
    }

    if (/meta|objetivo|quanto.*guardar|guardar.*mes|economizar.*meta/.test(q)) {
      const goals = live?.goals?.length ? live.goals : (snapshot?.goals || []);
      if (/quanto.*guardar|quanto posso guardar/.test(q) && !/meta/.test(q)) {
        const projected = num(snapshot?.balances?.projectedEndOfMonth);
        const target = num(snapshot?.purchaseDecision?.savingsTarget);
        return `Pelos compromissos cadastrados, o saldo projetado no fim do mês é ${money(projected)}. Sua meta mensal atual é ${money(target)}; o valor disponível para gastos opcionais depois dessa meta é ${money(snapshot?.purchaseDecision?.availableForOptionalSpending)}.`;
      }
      if (!goals.length) return "Cadastre uma meta em Planejamento para eu montar um plano de aporte.";
      const goal = goals[0];
      return `Na meta “${goal.name}”, você tem ${money(goal.current)} de ${money(goal.target)} e faltam ${money(goal.missing)}.${goal.requiredMonthly ? ` Para chegar ao prazo, o aporte de referência é cerca de ${money(goal.requiredMonthly)} por mês.` : ""}`;
    }

    if (/economizar|cortar gasto|reduzir gasto|onde cortar|gasto demais/.test(q)) {
      const cats = live?.topCategories || snapshot?.month?.topCategories || [];
      const top3 = cats.slice(0, 3);
      if (!top3.length) return "Ainda não há despesas suficientes cadastradas para indicar onde cortar.";
      const base = top3.reduce((sum, item) => sum + num(item.value), 0);
      const save10 = base * 0.10;
      const subs = num(live?.subscriptionsMonthly ?? snapshot?.subscriptions?.monthly);
      return `Os maiores pontos para revisar são ${top3.map(item => `${item.name} (${money(item.value)})`).join(", ")}. Reduzir 10% só nesses grupos economizaria cerca de ${money(save10)} no mês.${subs ? ` Suas assinaturas ainda representam ${money(subs)} mensais e também merecem revisão.` : ""}`;
    }

    if (/onde.*gasto|gasto.*mais|maior gasto|categoria/.test(q)) {
      if (!top) return "Ainda não há gastos suficientes para comparar categorias.";
      const cats = (live?.topCategories || snapshot?.month?.topCategories || []).slice(0, 5);
      return `Sua maior categoria de saída é ${top.name}, com ${money(top.value)}. Ranking atual: ${cats.map((item, index) => `${index + 1}º ${item.name} ${money(item.value)}`).join("; ")}.`;
    }

    if (/saldo|sobrar|fim do mes|projecao|projetado/.test(q)) {
      return `Seu saldo total em contas é ${money(live?.accountTotal ?? snapshot?.balances?.accountsTotal)}. Considerando contas, assinaturas, lançamentos futuros e parcelas cadastradas, a projeção para o fim do mês é ${money(snapshot?.balances?.projectedEndOfMonth)}.`;
    }

    if (/orcamento|limite de gasto|estou estourando/.test(q)) {
      const budgets = live?.budgets || [];
      if (!budgets.length) return `Seu gasto opcional estimado hoje é ${money(snapshot?.purchaseDecision?.availableForOptionalSpending)}. Cadastre orçamentos por categoria para eu comparar limites específicos.`;
      const rows = budgets.sort((a, b) => (b.spent / Math.max(1, b.limit)) - (a.spent / Math.max(1, a.limit))).slice(0, 6);
      return rows.map(item => `${item.category}: ${money(item.spent)} de ${money(item.limit)} (${Math.round(item.spent / Math.max(1, item.limit) * 100)}%)`).join("; ") + ".";
    }

    if (/parcela|parcelamento/.test(q)) {
      const items = live?.installments || [];
      const monthly = num(live?.installmentsMonthly ?? snapshot?.installments?.monthlyCommitment);
      const outstanding = num(snapshot?.installments?.outstandingBalance);
      return `Você tem ${items.length || num(snapshot?.installments?.activeCount)} parcelamento${(items.length || num(snapshot?.installments?.activeCount)) !== 1 ? "s" : ""} ativo${(items.length || num(snapshot?.installments?.activeCount)) !== 1 ? "s" : ""}, comprometendo cerca de ${money(monthly)} por mês. O saldo restante estimado das parcelas é ${money(outstanding)}.`;
    }

    if (/saude|score|pontuacao/.test(q)) {
      const h = snapshot?.health || {};
      return `Sua Saúde Financeira está em ${num(h.score)}/1000. Componentes: gastos ${num(h.spending)}/200, reserva ${num(h.reserve)}/200, dívidas ${num(h.debt)}/200, organização ${num(h.organization)}/200 e metas ${num(h.goals)}/200.`;
    }

    if (/ano|anual|12 meses|comparar meses|mes passado/.test(q)) {
      const six = snapshot?.sixMonths || [];
      const annual = snapshot?.annual || [];
      const income = annual.reduce((sum, item) => sum + num(item.income), 0);
      const expense = annual.reduce((sum, item) => sum + num(item.expense), 0);
      if (/mes passado|comparar meses/.test(q) && six.length >= 2) {
        const a = six[six.length - 1], b = six[six.length - 2];
        return `Comparando ${b.month} com ${a.month}: as entradas passaram de ${money(b.income)} para ${money(a.income)} e as saídas de ${money(b.expense)} para ${money(a.expense)}.`;
      }
      return `No ano, há ${money(income)} em entradas e ${money(expense)} em saídas registradas, com resultado de ${money(income - expense)}.`;
    }

    if (/renda|entrada|recebimento/.test(q)) {
      return `As entradas deste mês somam ${money(live?.monthIncome ?? snapshot?.month?.income)}. As saídas registradas somam ${money(live?.monthExpense ?? snapshot?.month?.expense)} e o resultado considerando parcelas é ${money(snapshot?.month?.result)}.`;
    }

    return overallAnswer(snapshot, live) + " Você pode perguntar, por exemplo, se uma compra cabe no mês, qual cartão tem limite, o que falta pagar, onde cortar gastos ou como acelerar uma meta.";
  }

  function timeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("A IA online demorou demais para responder.")), ms));
  }

  async function wrapCloudAI() {
    const cloud = window.ENCCloud;
    if (!cloud?.askFinancialAI || cloud.askFinancialAI[WRAP_FLAG]) return false;
    const original = cloud.askFinancialAI.bind(cloud);

    const wrapped = async (question, snapshot, history = []) => {
      const live = await loadLiveContext().catch(() => ({}));
      const enhancedSnapshot = { ...(snapshot || {}), live, assistantVersion: "complete-1" };
      try {
        const result = await Promise.race([
          original(question, enhancedSnapshot, history),
          timeout(18000)
        ]);
        if (result?.answer) return result;
      } catch (error) {
        console.warn("IA online indisponível; usando motor financeiro local", error?.message || error);
      }
      return {
        answer: localAnswer(question, enhancedSnapshot, live, history),
        remaining: Number(snapshot?.aiUsage?.remaining ?? 0),
        limit: 30,
        model: "enc-finance-engine",
        fallback: true
      };
    };
    wrapped[WRAP_FLAG] = true;
    cloud.askFinancialAI = wrapped;
    window.ENCAIComplete = { answer: localAnswer, loadLiveContext, version: "complete-1" };
    return true;
  }

  function enhanceAIUi() {
    const page = document.getElementById("page-ai");
    if (!page?.classList.contains("is-active")) return;
    const header = page.querySelector(".ai-chat-header small");
    if (header && !header.dataset.encComplete) {
      header.textContent = "IA completa · dados reais + motor local + OpenAI quando disponível";
      header.dataset.encComplete = "1";
    }
    const suggestions = page.querySelector(".suggestion-list");
    if (suggestions && !suggestions.querySelector('[data-ai-question="Faça uma análise completa das minhas finanças"]')) {
      const button = document.createElement("button");
      button.className = "suggestion";
      button.dataset.aiQuestion = "Faça uma análise completa das minhas finanças";
      button.innerHTML = '<span class="bot-avatar">✦</span><span><strong>Analisar tudo</strong><small>Resumo completo do mês, cartões, contas, dívidas e metas.</small></span><span>›</span>';
      suggestions.prepend(button);
    }
  }

  function start() {
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      const ok = await wrapCloudAI();
      if (ok || attempts > 120) clearInterval(timer);
    }, 100);

    [300, 900, 1800].forEach(delay => setTimeout(enhanceAIUi, delay));
    document.addEventListener("click", event => {
      if (event.target.closest('[data-page-target="ai"], [data-ai-question], [data-nav-page="ai"]')) {
        setTimeout(enhanceAIUi, 40);
        setTimeout(enhanceAIUi, 250);
      }
    });
    document.addEventListener("submit", event => {
      if (event.target?.id === "aiForm") {
        setTimeout(enhanceAIUi, 50);
        setTimeout(enhanceAIUi, 500);
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();