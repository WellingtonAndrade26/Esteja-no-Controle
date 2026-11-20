import {today,brl,dayAt,sum,addDays} from '../domain/base.js';
import {dashboard,forecast,primary,balance,positions,cardStats,benefitBalance,upcoming} from '../domain/engine.js';
import {wallets} from '../domain/commands.js';
import {insights} from '../domain/copilot.js';
import {active,candidates} from '../open-finance/reconciliation.js';
import {esc,icon,head,pages,nav,panel,row,list,btn,dateLabel,metric,chart,sectionTabs} from './html.js';
const groups={income:'Entrada prevista',installment:'Parcela',bill:'Conta ou boleto',subscription:'Assinatura ou recorrência',invoice:'Fatura'};
export const permissions={accounts:'Contas e saldos',transactions:'Extratos',cards:'Cartões e limites',invoices:'Faturas',loans:'Crédito',investments:'Investimentos'};
const names={manual:'Manual',card:'Cartão',installment:'Parcela',transfer:'Transferência',open_finance:'Sincronizado pelo banco',automation:'Recorrência',system:'Sistema'};
const sign=e=>e.kind==='income'?'+ ':e.kind==='expense'?'− ':'';
const monthLabel=d=>{const month=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));return month.charAt(0).toUpperCase()+month.slice(1);};
function entries(s,count,filter=()=>true){
  return list([...s.entries].filter(filter).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,count).map(e=>row(e.name,[dateLabel(e.date),e.category,names[e.source],s.accounts.find(a=>a.id===(e.from||e.to))?.name].filter(Boolean).join(' · '),sign(e)+brl(e.amount))));
}
function nextBills(s, d) {
  const horizon = addDays(d, 90);
  const items = s.accounts.flatMap(a => upcoming(s, horizon, d, a.id));
  items.push(...s.dues.filter(x => x.date > horizon && x.created <= d && (!x.paid || x.paid > d)));
  for (const rule of s.rules.filter(r => r.kind !== 'income' && r.start > horizon && (!r.end || r.start <= r.end))) {
    if (!s.dues.some(x => x.id === rule.id+'/'+rule.start)) items.push({...rule,date:rule.start,group:'subscription'});
  }
  const bills = [], invoices = new Map();
  for (const item of items.filter(x => x.group !== 'income')) {
    if (!item.card) { bills.push(item); continue; }
    const key = item.card+'|'+item.date;
    if (!invoices.has(key)) {
      const invoice = {...item, name:'Fatura · '+(s.cards.find(c => c.id === item.card)?.name || 'Cartão'), amount:0};
      invoices.set(key, invoice); bills.push(invoice);
    }
    invoices.get(key).amount += item.amount;
  }
  return bills.sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name,'pt-BR')).slice(0,4);
}
function billList(s, d) {
  const bills = nextBills(s,d);
  if (!bills.length) return '<p class="empty">Nenhum vencimento em aberto.</p>';
  return '<ul class="bill-list">'+bills.map((x,i)=>{
    const delta = Math.round((Date.parse(x.date)-Date.parse(d))/86400000);
    const when = delta < 0 ? 'Em atraso' : delta === 0 ? 'Vence hoje' : delta === 1 ? 'Amanhã' : 'Em '+delta+' dias';
    const month = new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(new Date(x.date+'T12:00:00Z')).replace('.','');
    return '<li><time datetime="'+esc(x.date)+'" aria-label="'+dateLabel(x.date)+'"><b>'+x.date.slice(-2)+'</b><small>'+month+'</small></time><div class="bill-name"><strong>'+esc(x.name)+'</strong><small>'+esc(groups[x.group]||'Compromisso')+'</small></div><div class="bill-value"><strong>'+brl(x.amount)+'</strong><small class="'+(i===0 || delta<=0?'soon':'')+'">'+when+'</small></div></li>';
  }).join('')+'</ul>';
}
function home(s,d,ui) {
  const k = dashboard(s,d), account = primary(s);
  const days = ui.days === 'month' ? Number(k.end.slice(8))-Number(d.slice(8)) : Number(ui.days);
  const details = [['Saldo inicial',k.opening],['Entradas recebidas',k.incoming],['Saídas realizadas',-k.spent],['Movimentações patrimoniais',k.moved],['Entradas previstas',k.expected],['Compromissos em aberto',-k.pending]];
  const filters = [['7','7 dias'],['15','15 dias'],['30','30 dias'],['month','Fim do mês']].map(([id,label])=>
    '<button data-action="horizon" data-id="'+id+'" aria-pressed="'+(ui.days===id)+'">'+label+'</button>').join('');
  return '<div class="page-head home-head"><div><p class="month">'+icon('planejamento')+esc(monthLabel(d))+'</p><h1>Visão geral</h1></div>'+btn('+ Lançamento','entry','',true)+'</div>'+
    '<div class="home-grid"><section class="projection"><div class="orbit" aria-hidden="true"><img src="./assets/arco-prisma.svg" alt="" width="440" height="240"><span class="light-track"><i></i></span></div>'+
    '<div class="projection-body"><p class="overline">Projeção da conta principal</p><h2>Resultado previsto do mês</h2><strong class="sum amount">'+brl(k.result)+'</strong><small>Fechamento em '+dateLabel(k.end)+'</small></div>'+
    '<details class="memory"><summary>'+icon('extrato')+'Memória de cálculo <span aria-hidden="true">⌄</span></summary>'+list(details.map(([name,amount])=>row(name,"",brl(amount))))+'</details></section>'+
    '<section class="balance"><span class="glass-tile">'+icon('contas')+'</span><h2>Saldo disponível hoje</h2><strong class="amount">'+brl(k.current)+'</strong><a href="#contas">'+esc(account?.name || 'Cadastrar conta')+' '+icon('arrow')+'</a></section>'+
    '<div class="metric-grid home-metrics">'+metric('Entradas do mês',k.incoming,'Recebidas','up','+ ')+metric('Gastos realizados',k.spent,'Pagos','down','− ')+metric('Compromissos',k.pending,'Em aberto no mês','planejamento')+metric('Investimentos',k.invested,'Posição atual','patrimonio')+'</div>'+
    '<section class="panel cash"><header><h2>Previsão de caixa</h2><span class="legend-dot">Conta principal</span></header><div class="filters" role="group" aria-label="Horizonte da previsão">'+filters+'</div>'+chart(forecast(s,d,days))+'</section>'+
    '<section class="panel upcoming"><header><h2>Próximos compromissos</h2><a class="arrow-link" href="#planejamento" aria-label="Ver planejamento">'+icon('arrow')+'</a></header>'+billList(s,d)+'</section>'+
    '<section class="panel activity"><header><h2>Atividade recente</h2><a class="text-link" href="#extrato">Ver movimentações '+icon('arrow')+'</a></header>'+entries(s,4)+'</section>'+
    '<section class="panel health"><header><h2>Saúde financeira</h2><a class="arrow-link" href="#copiloto" aria-label="Consultar IA Financeira">'+icon('arrow')+'</a></header>'+list(insights(s,d).map(x=>row(x,'')))+'</section></div>';
}
function accounts(s,d,ui){
  const tab=ui.tabs.contas||'contas';
  const tabs=sectionTabs('contas',tab,[['contas','Contas'],['transferencias','Transferências']]);
  const header=head('Contas',btn('Transferir','transfer')+btn('+ Conta','account','',true),'Saldos operacionais e movimentações entre suas próprias contas.');
  if(tab==='transferencias'){
    const transfers=[...s.entries].filter(e=>e.kind==='transfer').sort((a,b)=>b.date.localeCompare(a.date));
    return header+tabs+panel('Transferências',list(transfers.map(e=>{
      const from=s.accounts.find(a=>a.id===e.from)?.name||'Conta',to=s.accounts.find(a=>a.id===e.to)?.name||'Conta';
      return row(e.name,dateLabel(e.date)+' · '+from+' → '+to,brl(e.amount));
    })));
  }
  return header+tabs+panel('Saldos por conta',list(s.accounts.map(a=>row(a.name,[a.institution,a.type,a.primary?'Conta principal':''].filter(Boolean).join(' · '),brl(balance(s,a.id,d)),a.primary?'':btn('Tornar principal','primary',a.id)))));
}
function planning(s,d,ui){
  const tab=ui.tabs.planejamento||'resumo';
  const all=s.accounts.flatMap(x=>upcoming(s,addDays(d,90),d,x.id)).sort((a,b)=>a.date.localeCompare(b.date));
  const open=all.filter(x=>x.group!=='income');
  const activePlans=s.plans.filter(p=>{const ds=s.dues.filter(x=>x.plan===p.id),paid=(p.priorPaid||0)+ds.filter(x=>x.paid).length;return paid<p.count;});
  const expenseRules=s.rules.filter(r=>r.kind!=='income');
  const tabs=sectionTabs('planejamento',tab,[['resumo','Resumo'],['parcelas','Parcelas'],['contas','Contas a pagar'],['recorrencias','Recorrências']]);
  const header=head('Planejamento',btn('Boleto','bill')+btn('Recorrência','recurring')+btn('+ Parcelamento','plan','',true),'Organize compromissos futuros sem misturar tudo na mesma lista.');
  if(tab==='parcelas'){
    return header+tabs+panel('Parcelamentos',list(s.plans.map(p=>{
      const ds=s.dues.filter(x=>x.plan===p.id).sort((a,b)=>a.date.localeCompare(b.date)),paid=(p.priorPaid||0)+ds.filter(x=>x.paid).length,remaining=Math.max(0,p.count-paid),next=ds.find(x=>!x.paid);
      const detail=[paid+'/'+p.count+' pagas',remaining?remaining+' restantes':'Quitado',p.institution,p.method,p.category,next?'próxima '+dateLabel(next.date):''].filter(Boolean).join(' · ');
      return row(p.name,detail,brl(p.total),next?(next.card?'<a class="btn ghost" href="#cartoes">Ver fatura</a>':btn('Pagar parcela','pay',next.id)):'' );
    })));
  }
  if(tab==='contas'){
    const bills=open.filter(x=>x.group==='bill');
    return header+tabs+panel('Contas e boletos',list(bills.slice(0,ui.limit).map(x=>row(x.name,dateLabel(x.date)+' · '+(x.date<d?'Em atraso':'Em aberto'),brl(x.amount),btn('Pagar','pay',x.id))))+(bills.length>ui.limit?btn('Mostrar mais','more'):''));
  }
  if(tab==='recorrencias'){
    return header+tabs+panel('Recorrências cadastradas',list(s.rules.map(r=>row(r.name,'Mensal · a partir de '+dateLabel(r.start)+' · '+(r.kind==='income'?'entrada':'saída'),brl(r.amount)))));
  }
  return header+tabs+'<div class="metric-grid section-summary">'+metric('Em aberto',sum(open),'Próximos 90 dias','down')+metric('Vencimentos',open.length,'Contas, parcelas e faturas','planejamento')+metric('Parcelamentos',activePlans.length,'Em andamento','cartoes')+metric('Recorrências',expenseRules.length,'Saídas cadastradas','extrato')+'</div>'+panel('Próximos compromissos',list(open.slice(0,8).map(x=>row(x.name,dateLabel(x.date)+' · '+groups[x.group]+(x.part?' · '+x.part+'/'+x.count:''),brl(x.amount),x.card?'<a class="btn ghost" href="#cartoes">Ver fatura</a>':btn(x.group==='installment'?'Pagar parcela':'Pagar','pay',x.id)))));
}
function cards(s,d,ui){
  const tab=ui.tabs.cartoes||'resumo';
  const tabs=sectionTabs('cartoes',tab,[['resumo','Resumo'],['faturas','Faturas'],['compras','Compras']]);
  const header=head('Cartões',btn('Registrar compra','purchase')+btn('+ Cartão','card','',true),'Acompanhe limite, faturas e compras sem duplicar informações.');
  if(tab==='faturas'){
    const rows=[];
    for(const c of s.cards){const dues=s.dues.filter(x=>x.card===c.id&&!x.paid),dates=[...new Set(dues.map(x=>x.date))].sort();for(const date of dates){const items=dues.filter(x=>x.date===date);rows.push(row(c.name+' · '+dateLabel(date),items.length+' item(ns) · vence em '+dateLabel(date),brl(sum(items)),btn('Pagar fatura','invoice',c.id+'|'+date)));}}
    return header+tabs+panel('Faturas abertas',list(rows));
  }
  if(tab==='compras'){
    const purchases=[...s.purchases].sort((a,b)=>b.date.localeCompare(a.date));
    return header+tabs+panel('Compras registradas',list(purchases.map(x=>{const c=s.cards.find(c=>c.id===x.card);return row(x.name,dateLabel(x.date)+' · '+x.count+'x · '+(c?.name||'Cartão'),brl(x.amount));})));
  }
  return header+tabs+(s.cards.length?s.cards.map(c=>{const k=cardStats(s,c.id,d);const dues=s.dues.filter(x=>x.card===c.id&&!x.paid);return panel(c.name,'<p class="panel-note">'+esc(c.institution)+' · '+esc(c.brand)+' •••• '+esc(c.last4)+' · Fecha dia '+c.closing+' · Vence dia '+c.due+'</p><div class="metric-grid">'+metric('Limite total',c.limit,'Contratado','cartoes')+metric('Utilizado',k.used,'Inclui parcelas futuras','down')+metric('Disponível',k.available,'Para novas compras','up')+'</div><div class="card-footer-line"><span>'+dues.length+' item(ns) em faturas abertas</span><button class="text-button" data-action="section-tab" data-id="cartoes:faturas">Ver faturas</button></div>');}).join(''):panel('Meus cartões',list([])));
}
function assets(s,d,ui){
  const tab=ui.tabs.patrimonio||'resumo',k=dashboard(s,d),pos=positions(s,d),invest=pos.filter(x=>x.kind!=='asset'),assetsOnly=pos.filter(x=>x.kind==='asset');
  const tabs=sectionTabs('patrimonio',tab,[['resumo','Resumo'],['investimentos','Investimentos'],['ativos','Outros ativos']]);
  const header=head('Patrimônio',btn('+ Posição','position','',true),'Acompanhe patrimônio sem confundir investimentos com saldo disponível.');
  const posRows=items=>list(items.map(x=>row(x.name,[x.institution,x.kind==='asset'?'Ativo':x.kind,k.wealth>0?(100*x.value/k.wealth).toLocaleString('pt-BR',{maximumFractionDigits:1})+'% do patrimônio':'',x.history.length>1?'Variação '+brl(x.value-[...x.history].sort((a,b)=>a.date.localeCompare(b.date))[0].amount):'Primeira posição'].filter(Boolean).join(' · '),brl(x.value),btn('Atualizar valor','valuation',x.id)+(x.kind==='asset'?'':btn('Aportar','invest',x.id)+btn('Resgatar','redeem',x.id)))));
  if(tab==='investimentos')return header+tabs+panel('Investimentos',posRows(invest));
  if(tab==='ativos')return header+tabs+panel('Outros ativos',posRows(assetsOnly));
  return header+tabs+'<section class="hero"><div class="hero-main"><p class="eyebrow">Patrimônio bruto</p><strong class="amount">'+brl(k.wealth)+'</strong><small>Contas, investimentos e outros ativos.</small></div></section><div class="metric-grid">'+metric('Contas',k.bank,'Saldo consolidado','contas')+metric('Investimentos',k.invested,'Valor atual','patrimonio')+metric('Outros ativos',k.assets,'Bens registrados','inicio')+'</div>'+panel('Principais posições',posRows(pos.slice(0,6)));
}
function benefits(s,d,ui){
  const tab=ui.tabs.vales||'saldos';
  const tabs=sectionTabs('vales',tab,[['saldos','Saldos'],['movimentacoes','Movimentações']]);
  const header=head('Vales',btn('+ Movimentação','benefit','',true),'Benefícios ficam separados do dinheiro disponível nas contas.');
  if(tab==='movimentacoes')return header+tabs+panel('Movimentações dos vales',list([...s.benefits].sort((a,b)=>b.date.localeCompare(a.date)).map(x=>row(x.name,x.wallet+' · '+dateLabel(x.date),(x.direction==='credit'?'+ ':'− ')+brl(x.amount),btn('Editar','benefitEdit',x.id)+btn('Excluir','benefitDelete',x.id)))));
  return header+tabs+'<div class="metric-grid">'+wallets.map(w=>metric(w,benefitBalance(s,w,d),'Saldo individual','vales')).join('')+'</div>'+panel('Como usar','<p class="panel-note">Créditos e gastos permanecem em uma razão própria e não entram no saldo da conta principal.</p>');
}
function connections(s,d,ui){
  const tab=ui.tabs.conexoes||'instituicoes';
  const tabs=sectionTabs('conexoes',tab,[['instituicoes','Instituições'],['pendencias','Pendências'],['dados','Dados recebidos'],['atividade','Atividade']]);
  const header=head('Open Finance',btn('Conectar instituição','consent','',true),'Conecte instituições, sincronize dados e revise o que entra no seu controle financeiro.');
  if(tab==='pendencias')return header+tabs+panel('Conciliação e pendências',list(s.imports.map(t=>{const matches=candidates(s,t);const status={review:matches.length?'Possível correspondência encontrada':'Aguardando revisão',matched:'Vinculada ao lançamento',posted:'Lançada nas movimentações',ignored:'Ignorada'};return row(t.name,dateLabel(t.date)+' · '+status[t.status],brl(t.amount),t.status==='review'?btn('Revisar','reconcile',t.id):'');})));
  if(tab==='dados')return header+tabs+panel('Dados recebidos',list(s.resources.map(r=>row(r.name||({balance:'Saldo do banco',invoice:'Fatura do banco'}[r.type]||r.id),permissions[{balance:'accounts',account:'accounts',card:'cards',invoice:'invoices',loan:'loans',investment:'investments'}[r.type]],Number.isFinite(r.value??r.limit??r.outstanding??r.amount)?brl(r.value??r.limit??r.outstanding??r.amount):''))));
  if(tab==='atividade')return header+tabs+panel('Atividade da conexão',list(s.logs.slice(-20).reverse().map(x=>row(({connection_created:'Conexão autorizada',consent_created:'Solicitação criada',consent_revoked:'Consentimento revogado',sync_started:'Sincronização iniciada',sync_completed:'Sincronização concluída',data_reconciled:'Conciliação registrada'})[x.event]||x.event,dateLabel(x.date)))));
  return header+tabs+panel('Ambiente Open Finance','<div class="open-finance-intro"><div><p class="eyebrow">Conexões financeiras</p><h2>Centralize instituições com segurança</h2><p>O Banco Horizonte fornece dados fictícios para testar autorização, importação e conciliação. Você escolhe o que compartilhar.</p></div></div>')+panel('Instituições e autorizações',list(s.connections.map(c=>{const status=active(c,d)?'Ativa':c.status==='revoked'?'Revogada':c.expires<d?'Expirada':'Aguardando autorização';return row(c.institution,status+' · Criada em '+dateLabel(c.created)+' · Válida até '+dateLabel(c.expires)+' · Última sincronização '+dateLabel(c.lastSync)+' · '+c.scopes.map(x=>permissions[x]).join(', '),'',active(c,d)?btn('Sincronizar','sync',c.id)+btn('Revogar','revoke',c.id):c.status==='pending'&&c.expires>=d?btn('Autorizar no sandbox','authorize',c.id)+btn('Cancelar','revoke',c.id):btn('Reconectar','consent',c.id));})));
}
function copilot(s,d,ui){
  const tab=ui.tabs.copiloto||'copiloto';
  const tabs=sectionTabs('copiloto',tab,[['copiloto','Copiloto'],['insights','Insights']]);
  const header=head('IA Financeira','', 'Copiloto financeiro da WA Digital Labs para interpretar seus números com cálculos determinísticos.');
  if(tab==='insights'){
    const k=dashboard(s,d);
    return header+tabs+'<div class="metric-grid section-summary">'+metric('Saldo principal',k.current,'Disponível hoje','contas')+metric('Resultado previsto',k.result,'Fim do mês','planejamento')+metric('Investimentos',k.invested,'Patrimônio investido','patrimonio')+'</div>'+panel('Insights e ações sugeridas',list(insights(s,d).map(x=>row(x,''))));
  }
  return header+tabs+panel('Pergunte sobre seus números','<p class="panel-note">Powered by WA Intelligence</p><form id="chat" class="stack"><label class="field">Sua pergunta<input name="question" maxlength="300" required placeholder="Quanto posso gastar esta semana?"></label><button class="btn primary">Consultar</button></form><div class="quick-prompts">'+['Qual meu saldo?','Posso comprar um celular de R$ 2.000?','Quanto tenho investido?','Como fecha meu mês?'].map(q=>btn(q,'ask',q)).join('')+'</div><p class="chat-output" role="status">'+esc(ui.response)+'</p>');
}
function more(){
  return head('Mais','','Acesse recursos complementares sem sobrecarregar a navegação principal.')+
    '<div class="more-grid">'+panel('Finanças','<div class="nav more-nav">'+['cartoes','patrimonio','vales'].map(k=>nav(k)).join('')+'</div>')+
    panel('Inteligência','<div class="nav more-nav">'+['conexoes','copiloto'].map(k=>nav(k)).join('')+'</div>')+
    panel('Sistema','<div class="nav more-nav">'+nav('ajustes')+'</div>')+'</div>';
}
export function renderPage(page,s,ui){
 const d=today();
 switch(page){
 case 'inicio':return home(s,d,ui);
 case 'extrato':return head('Movimentações',btn('+ Lançamento','entry','',true),'Entradas, despesas e movimentações da sua vida financeira em um único histórico.')+panel('Histórico',entries(s,ui.limit)+(s.entries.length>ui.limit?btn('Mostrar mais','more'):''));
 case 'contas':return accounts(s,d,ui);
 case 'planejamento':return planning(s,d,ui);
 case 'cartoes':return cards(s,d,ui);
 case 'patrimonio':return assets(s,d,ui);
 case 'vales':return benefits(s,d,ui);
 case 'conexoes':return connections(s,d,ui);
 case 'copiloto':return copilot(s,d,ui);
 case 'ajustes':return head('Configurações','','Dados, privacidade e manutenção do aplicativo.')+panel('Dados e privacidade','<p>'+esc(ui.cloud?'Acesso autenticado ao livro financeiro 2.0.':'A demonstração guarda os registros de teste neste navegador.')+'</p><div class="actions">'+btn('Exportar meus dados','export')+(ui.cloud?btn('Conferir dados da versão anterior','legacyReview')+btn('Exportar versão anterior','legacyExport')+btn('Excluir meus dados 2.0','erase')+btn('Sair','logout'):btn('Apagar dados de demonstração','erase'))+(ui.enabled&&!ui.cloud?btn('Entrar com e-mail','login'):'')+'</div>')+panel('Aplicativo','<div class="app-sign"><img src="./assets/wa-prisma-160.webp" width="68" height="26" alt="WA"><div><strong>Esteja no Controle 2.0</strong><small>WA Digital Labs</small></div></div>'+btn('Atualizar agora','update'));
 case 'mais':return more();
 default:return head('Página indisponível')+nav('inicio');
 }
}
