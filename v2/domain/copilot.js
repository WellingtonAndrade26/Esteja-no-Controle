import {dashboard,forecast,balance,primary} from './engine.js';
import {brl,addDays,parseMoney,sum} from './base.js';
export function insights(s,date){
  const k=dashboard(s,date),week=forecast(s,date,7),out=[];
  if(!primary(s))return ['Cadastre a conta que você usa para receber e pagar.'];
  const first=week.find(p=>p.value<0);
  if(first)out.push('A previsão fica negativa em '+first.date.split('-').reverse().join('/')+'. Revise os vencimentos antes dessa data.');
  const due=k.due.filter(x=>x.group!=='income' && x.date<=addDays(date,7));
  if(due.length)out.push(brl(sum(due))+' em compromissos vencidos ou a vencer nos próximos 7 dias.');
  if(k.due.some(x=>x.group==='invoice'))out.push('As faturas em aberto somam '+brl(sum(k.due.filter(x=>x.group==='invoice')))+' até o fim do mês.');
  if(!out.length)out.push('Nenhum compromisso registrado para esta semana. Confira se os lançamentos estão em dia.');
  return out;
}
export function answer(s,date,question) {
  const q=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const k=dashboard(s,date),prior=dashboard(s,addDays(date.slice(0,7)+'-01',-1));
  if(/compra|celular|posso gastar/.test(q)){
    const raw=q.match(/(?:r\$\s*)?(\d[\d.]*(?:,\d{1,2})?)/);
    const room=Math.max(0,Math.min(k.result,...forecast(s,date,7).map(x=>x.value),k.current));
    if(raw){const price=parseMoney(raw[1]);return 'Com os registros atuais, a margem é '+brl(room)+'. Após uma compra de '+brl(price)+', a margem seria '+brl(room-price)+'.';}
    return 'A margem projetada é '+brl(room)+', considerando o saldo de hoje, os próximos 7 dias e o fechamento do mês.';
  }
  if(/invest/.test(q))return 'Seus investimentos registrados somam '+brl(k.invested)+'.';
  if(/patrimonio/.test(q))return 'O patrimônio bruto é '+brl(k.wealth)+', incluindo contas, investimentos e outros ativos.';
  if(/todos|bancos|por conta/.test(q))return s.accounts.map(a=>a.name+' · '+brl(balance(s,a.id,date))).join('\n')+'\nTotal nas contas: '+brl(k.bank)+'.';
  if(/mes passado|aument|compar/.test(q))return 'Saídas da conta principal: '+brl(k.spent)+' neste mês até hoje e '+brl(prior.spent)+' no mês passado completo. Diferença de '+brl(k.spent-prior.spent)+'.';
  if(/fatura/.test(q))return 'O total de faturas em aberto com vencimento até o fim do mês é '+brl(sum(k.due.filter(x=>x.group==='invoice')))+'.';
  if(/semana|previs|sobr|fim do mes/.test(q))return 'A projeção de fechamento é '+brl(k.result)+'. Em 7 dias, o saldo estimado é '+brl(forecast(s,date,7).at(-1)?.value||0)+'.';
  if(/saldo|dinheiro/.test(q))return 'Hoje sua conta principal tem '+brl(k.current)+'.';
  if(/gast|despes/.test(q))return 'Saíram '+brl(k.spent)+' da conta principal neste mês.';
  return 'Posso consultar os registros de saldo, gastos, faturas e investimentos ou simular uma compra. Experimente “Posso comprar um celular de R$ 2.000?”.';
}
