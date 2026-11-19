import {today,brl,dayAt,sum,addDays} from '../domain/base.js';
import {dashboard,forecast,primary,balance,positions,cardStats,benefitBalance,upcoming} from '../domain/engine.js';
import {wallets} from '../domain/commands.js';
import {insights} from '../domain/copilot.js';
import {active,candidates} from '../open-finance/reconciliation.js';
import {esc,head,pages,nav,panel,row,list,btn,dateLabel,metric,chart} from './html.js';
const groups={income:'Entrada prevista',installment:'Parcela',bill:'Boleto',subscription:'Assinatura ou recorrência',invoice:'Fatura'};
export const permissions={accounts:'Contas e saldos',transactions:'Extratos',cards:'Cartões e limites',invoices:'Faturas',loans:'Crédito',investments:'Investimentos'};
const names={manual:'Manual',card:'Cartão',installment:'Parcela',transfer:'Transferência',open_finance:'Sincronizado pelo banco',automation:'Recorrência',system:'Sistema'};
const sign=e=>e.kind==='income'?'+ ':e.kind==='expense'?'− ':'';
const monthLabel=d=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
function entries(s,count){
  return list([...s.entries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,count).map(e=>row(e.name,[dateLabel(e.date),e.category,names[e.source],s.accounts.find(a=>a.id===(e.from||e.to))?.name].filter(Boolean).join(' · '),sign(e)+brl(e.amount))));
}
function home(s,d,ui){
  const k=dashboard(s,d),primaryName=primary(s)?.name||'Cadastre sua conta';
  const days=ui.days==='month'?Number(k.end.slice(8))-Number(d.slice(8)):Number(ui.days);
  const details=[['Saldo inicial',k.opening],['Entradas recebidas',k.incoming],['Saídas realizadas',-k.spent],['Movimentações patrimoniais',k.moved],['Entradas previstas',k.expected],['Compromissos em aberto',-k.pending]];
  return head('Visão geral',btn('+ Lançamento','entry','',true))+
    '<section class="hero"><div class="hero-main"><p class="eyebrow">'+esc(monthLabel(d))+'</p><h2>Resultado previsto do mês</h2><strong class="amount">'+brl(k.result)+'</strong><small>Projeção da conta principal até '+dateLabel(k.end)+'.</small></div><div class="hero-side"><small>Saldo disponível hoje</small><strong class="amount">'+brl(k.current)+'</strong><small>'+esc(primaryName)+'</small></div></section>'+
    '<div class="metric-grid">'+metric('Entradas do mês',k.incoming,'Recebidas na conta principal','up')+metric('Gastos realizados',k.spent,'Pagos pela conta principal','down')+metric('Compromissos',k.pending,'A vencer no mês e atrasados','planejamento')+metric('Investimentos',k.invested,'Posição registrada','patrimonio')+'</div>'+
    '<div class="panel-grid">'+panel('Previsão de caixa','<div class="actions">'+[['7','7 dias'],['15','15 dias'],['30','30 dias'],['month','Fim do mês']].map(([key,label])=>btn(label,'horizon',key,ui.days===key)).join('')+'</div>'+chart(forecast(s,d,days)))+
    panel('Próximos compromissos',list(k.due.filter(x=>x.group!=='income').slice(0,4).map(x=>row(x.name,dateLabel(x.date)+' · '+groups[x.group],brl(x.amount))))+nav('planejamento','Ver planejamento'))+'</div>'+
    panel('Memória de cálculo','<details><summary>Como chegamos a '+brl(k.result)+'</summary>'+list(details.map(([name,amount])=>row(name,'',brl(amount))))+'</details>')+
    '<div class="panel-grid">'+panel('Atividade recente',entries(s,4)+nav('extrato','Abrir extrato'))+panel('Saúde financeira',list(insights(s,d).map(x=>row(x,'')))+nav('copiloto','Consultar copiloto'))+'</div>';
}
function accounts(s,d){return head('Minhas contas',btn('Transferir','transfer')+btn('+ Conta','account','',true))+panel('Saldos por conta',list(s.accounts.map(a=>row(a.name,[a.institution,a.type,a.primary?'Principal':''].filter(Boolean).join(' · '),brl(balance(s,a.id,d)),a.primary?'':btn('Tornar principal','primary',a.id)))));}
function planning(s,d,ui){
  const a=primary(s);
  const all=s.accounts.flatMap(x=>upcoming(s,addDays(d,90),d,x.id)).sort((a,b)=>a.date.localeCompare(b.date));
  return head('Planejamento',btn('Boleto','bill')+btn('Recorrência','recurring')+btn('+ Parcelamento','plan','',true))+
    panel('Vencimentos até '+dateLabel(addDays(d,90)),list(all.slice(0,ui.limit).map(x=>row(x.name,dateLabel(x.date)+' · '+groups[x.group]+(x.part?' · '+x.part+'/'+x.count:''),brl(x.amount),x.card?'<a class="btn ghost" href="#cartoes">Ver fatura</a>':btn(x.group==='income'?'Receber':x.group==='installment'?'Pagar parcela':'Pagar','pay',x.id))))+(all.length>ui.limit?btn('Mostrar mais','more'):''))
    +panel('Parcelamentos e boletos',list(s.plans.map(p=>{const ds=s.dues.filter(x=>x.plan===p.id),paid=(p.priorPaid||0)+ds.filter(x=>x.paid).length;return row(p.name,[paid+'/'+p.count+' pagos',p.institution,p.method,p.category,paid===p.count?'Quitado':'Em andamento'].join(' · '),brl(p.total));})))+
    panel('Recorrências cadastradas',list(s.rules.map(r=>row(r.name,'Mensal · a partir de '+dateLabel(r.start)+' · '+(r.kind==='income'?'entrada':'saída'),brl(r.amount)))));
}
function cards(s,d){
  return head('Cartões',btn('Registrar compra','purchase')+btn('+ Cartão','card','',true))+(!s.cards.length?panel('Meus cartões',list([])):'')+
  s.cards.map(c=>{const k=cardStats(s,c.id,d);const dues=s.dues.filter(x=>x.card===c.id && !x.paid);
    const dates=[...new Set(dues.map(x=>x.date))].sort();
    return panel(c.name,'<p>'+esc(c.institution)+' · '+esc(c.brand)+' •••• '+esc(c.last4)+' · Fecha dia '+c.closing+' · Vence dia '+c.due+'</p><div class="metric-grid">'+metric('Limite total',c.limit,'Contratado','cartoes')+metric('Utilizado',k.used,'Inclui parcelas futuras','down')+metric('Disponível',k.available,'Para novas compras','up')+'</div><h3>Faturas abertas</h3>'+list(dates.map(date=>row('Fatura de '+dateLabel(date),dues.filter(x=>x.date===date).length+' item(ns)',brl(sum(dues.filter(x=>x.date===date))),btn('Pagar fatura','invoice',c.id+'|'+date))))+'<h3>Compras registradas</h3>'+list(s.purchases.filter(x=>x.card===c.id).map(x=>row(x.name,dateLabel(x.date)+' · '+x.count+'x',brl(x.amount)))));}).join('');
}
function assets(s,d){
  const k=dashboard(s,d),pos=positions(s,d);
  return head('Patrimônio',btn('+ Posição','position','',true))+'<section class="hero"><div class="hero-main"><p class="eyebrow">Patrimônio bruto</p><strong class="amount">'+brl(k.wealth)+'</strong><small>Contas, investimentos e outros ativos.</small></div></section><div class="metric-grid">'+metric('Contas',k.bank,'Saldo consolidado','contas')+metric('Investimentos',k.invested,'Valor atual','patrimonio')+metric('Outros ativos',k.assets,'Bens registrados','inicio')+'</div>'+panel('Posições',list(pos.map(x=>row(x.name,[x.institution,x.kind==='asset'?'Ativo':x.kind,k.wealth>0?(100*x.value/k.wealth).toLocaleString('pt-BR',{maximumFractionDigits:1})+'% do patrimônio':'',x.history.length>1?'Variação '+brl(x.value-[...x.history].sort((a,b)=>a.date.localeCompare(b.date))[0].amount):'Primeira posição'].filter(Boolean).join(' · '),brl(x.value),btn('Atualizar valor','valuation',x.id)+(x.kind==='asset'?'':btn('Aportar','invest',x.id)+btn('Resgatar','redeem',x.id))))));
}
function benefits(s,d){return head('Vales',btn('+ Movimentação','benefit','',true))+'<div class="metric-grid">'+wallets.map(w=>metric(w,benefitBalance(s,w,d),'Saldo individual','vales')).join('')+'</div>'+panel('Histórico dos vales',list([...s.benefits].sort((a,b)=>b.date.localeCompare(a.date)).map(x=>row(x.name,x.wallet+' · '+dateLabel(x.date),(x.direction==='credit'?'+ ':'− ')+brl(x.amount),btn('Editar','benefitEdit',x.id)+btn('Excluir','benefitDelete',x.id)))));}
function connections(s,d){
  return head('Conexões financeiras',btn('Conectar banco de teste','consent','',true))+panel('Sandbox Open Finance','<p>O Banco Horizonte fornece dados fictícios para testar autorização, importação e conciliação. Você escolhe o que compartilhar.</p>')+
    panel('Autorizações',list(s.connections.map(c=>{
      const status=active(c,d)?'Ativa':c.status==='revoked'?'Revogada':c.expires<d?'Expirada':'Aguardando autorização';
      return row(c.institution,status+' · Criada em '+dateLabel(c.created)+' · Válida até '+dateLabel(c.expires)+' · Última sincronização '+dateLabel(c.lastSync)+' · '+c.scopes.map(x=>permissions[x]).join(', '),'',active(c,d)?btn('Sincronizar','sync',c.id)+btn('Revogar','revoke',c.id):c.status==='pending'&&c.expires>=d?btn('Autorizar no sandbox','authorize',c.id)+btn('Cancelar','revoke',c.id):btn('Reconectar','consent',c.id));
    })))+panel('Conciliação',list(s.imports.map(t=>{
      const matches=candidates(s,t);const status={review:matches.length?'Possível correspondência encontrada':'Aguardando revisão',matched:'Vinculada ao lançamento',posted:'Lançada no extrato',ignored:'Ignorada'};
      return row(t.name,dateLabel(t.date)+' · '+status[t.status],brl(t.amount),t.status==='review'?btn('Revisar','reconcile',t.id):'');})))+
    panel('Dados recebidos',list(s.resources.map(r=>row(r.name||({balance:'Saldo do banco',invoice:'Fatura do banco'}[r.type]||r.id),permissions[{balance:'accounts',account:'accounts',card:'cards',invoice:'invoices',loan:'loans',investment:'investments'}[r.type]],Number.isFinite(r.value??r.limit??r.outstanding??r.amount)?brl(r.value??r.limit??r.outstanding??r.amount):''))))+
    panel('Atividade da conexão',list(s.logs.slice(-12).reverse().map(x=>row(({connection_created:'Conexão autorizada',consent_created:'Solicitação criada',consent_revoked:'Consentimento revogado',sync_started:'Sincronização iniciada',sync_completed:'Sincronização concluída',data_reconciled:'Conciliação registrada'})[x.event]||x.event,dateLabel(x.date)))));
}
export function renderPage(page,s,ui){
 const d=today();
 switch(page){
 case 'inicio':return home(s,d,ui);
 case 'extrato':return head('Extrato',btn('+ Lançamento','entry','',true))+panel('Movimentações',entries(s,ui.limit)+(s.entries.length>ui.limit?btn('Mostrar mais','more'):''));
 case 'contas':return accounts(s,d);
 case 'planejamento':return planning(s,d,ui);
 case 'cartoes':return cards(s,d);
 case 'patrimonio':return assets(s,d);
 case 'vales':return benefits(s,d);
 case 'conexoes':return connections(s,d);
 case 'copiloto':return head('Copiloto financeiro')+panel('Pergunte sobre seus números','<form id="chat" class="stack"><label class="field">Sua pergunta<input name="question" maxlength="300" required placeholder="Quanto posso gastar esta semana?"></label><button class="btn primary">Consultar</button></form><div class="actions">'+['Qual meu saldo?','Posso comprar um celular de R$ 2.000?','Quanto tenho investido?'].map(q=>btn(q,'ask',q)).join('')+'</div><p class="chat-output" role="status">'+esc(ui.response)+'</p>')+panel('Insights e ações sugeridas',list(insights(s,d).map(x=>row(x,''))));
 case 'ajustes':return head('Configurações')+panel('Dados e privacidade','<p>'+esc(ui.cloud?'Acesso autenticado ao livro financeiro 2.0.':'A demonstração guarda os registros de teste neste navegador.')+'</p><div class="actions">'+btn('Exportar meus dados','export')+(ui.cloud?btn('Conferir dados da versão anterior','legacyReview')+btn('Exportar versão anterior','legacyExport')+btn('Excluir meus dados 2.0','erase')+btn('Sair','logout'):btn('Apagar dados de demonstração','erase'))+(ui.enabled&&!ui.cloud?btn('Entrar com e-mail','login'):'')+'</div>')+panel('Aplicativo','<p>Esteja no Controle 2.0 · WA Digital Labs</p>'+btn('Atualizar agora','update'));
 case 'mais':return head('Mais')+panel('Navegação','<div class="nav">'+Object.keys(pages).filter(k=>!['mais','inicio','extrato','planejamento'].includes(k)).map(k=>nav(k)).join('')+'</div>');
 default:return head('Página indisponível')+nav('inicio');
 }
}
