import {today,uid,one,brl,addDays,sum,parseMoney} from '../domain/base.js';
import {accountTypes,wallets} from '../domain/commands.js';
import {primary,upcoming} from '../domain/engine.js';
import {candidates} from '../open-finance/reconciliation.js';
import {esc} from './html.js';
import {permissions} from './views.js';
const field=(title,control)=>'<label class="field">'+esc(title)+control+'</label>';
const input=(k,title,type='text',value='',props='')=>field(title,'<input required name="'+k+'" type="'+type+'" value="'+esc(value)+'" '+props+'>');
const text=(k,title,v='')=>input(k,title,'text',v,'maxlength="140"');
const money=(title='Valor (R$)',v='')=>input('amount',title,'text',v,'inputmode="decimal" placeholder="0,00" maxlength="20"');
const count=(k,title,v,min,max)=>input(k,title,'number',v,'min="'+min+'" max="'+max+'" step="1"');
const date=(title='Data',d=today())=>input('date',title,'date',d);
function select(k,title,options,selected){
  return field(title,'<select name="'+k+'" required>'+options.map(item=>{
    const [v,label]=Array.isArray(item)?item:[item,item];return '<option value="'+esc(v)+'"'+(v===selected?' selected':'')+'>'+esc(label)+'</option>';
  }).join('')+'</select>');
}
const directions=[['expense','Despesa'],['income','Entrada']];
export function formFor(op,id,s){
  const now=today(),primaryId=primary(s)?.id;
  const accounts=s.accounts.map(a=>[a.id,a.name]);
  const acc=(k='account',title='Conta',v=primaryId)=>select(k,title,accounts,v);
  const cat=()=>text('category','Categoria','Outros');
  let title,html='',fixed={},submit='Salvar';
  switch(op){
  case 'account':title='Nova conta';html=text('name','Nome da conta')+text('institution','Instituição')+select('type','Tipo de conta',accountTypes)+money('Saldo de abertura (R$)','0,00')+date('Data de abertura');break;
  case 'primary':title='Definir conta principal';html='<p>'+esc(one(s.accounts,id).name)+' passará a orientar as projeções do painel.</p>';fixed={account:id};break;
  case 'transfer':title='Transferir entre contas';if(accounts.length<2)throw new Error('Cadastre duas contas para transferir entre elas.');html=acc('from','Origem')+acc('to','Destino',accounts.find(x=>x[0]!==primaryId)[0])+money()+date();break;
  case 'entry':title='Novo lançamento';html=select('kind','Movimentação',directions)+text('name','Descrição')+money()+acc()+date()+cat();break;
  case 'plan':case 'bill':title=op==='plan'?'Novo parcelamento':'Novo boleto';html=text('name','Descrição')+money(op==='plan'?'Valor total (R$)':'Valor (R$)')+(op==='plan'?count('count','Quantidade de parcelas',2,1,600):'')+date('Primeiro vencimento')+acc()+text('institution','Instituição','Não informada')+select('method','Forma de pagamento',['Débito em conta','Boleto','Pix','Dinheiro'])+cat();break;
  case 'recurring':title='Nova recorrência mensal';html=text('name','Descrição')+select('kind','Tipo',directions)+money()+acc()+date('Primeira ocorrência')+field('Última ocorrência (opcional)','<input type="date" name="end">');break;
  case 'pay':{const r=s.accounts.flatMap(a=>upcoming(s,addDays(now,90),now,a.id)).find(x=>x.id===id);if(!r)throw new Error('Compromisso indisponível.');title=r.group==='income'?'Registrar recebimento':'Registrar pagamento';html='<p class="full">'+esc(r.name)+' · <b>'+brl(r.amount)+'</b></p>'+acc('account','Conta utilizada',r.account)+date('Data da liquidação');fixed={due:id,occurrence:r.date,assigned:r.account};submit='Confirmar';break;}
  case 'card':title='Novo cartão';html=text('name','Apelido')+text('institution','Instituição')+text('brand','Bandeira')+input('last4','Quatro últimos dígitos','text','','pattern="[0-9]{4}" inputmode="numeric" maxlength="4"')+count('closing','Dia do fechamento',18,1,31)+count('due','Dia do vencimento',26,1,31)+money('Limite (R$)')+acc('account','Conta prevista para pagamento');break;
  case 'purchase':title='Compra no cartão';if(!s.cards.length)throw new Error('Cadastre um cartão antes da compra.');html=select('card','Cartão',s.cards.map(c=>[c.id,c.name]))+text('name','Descrição')+money('Valor total (R$)')+count('count','Número de parcelas',1,1,600)+date()+cat();break;
  case 'invoice':{const [card,due]=id.split('|'),amount=sum(s.dues.filter(x=>x.card===card && x.date===due && !x.paid));title='Pagar fatura';html='<p class="full">'+esc(one(s.cards,card).name)+' · <b>'+brl(amount)+'</b></p>'+money('Valor a pagar (R$)',(amount/100).toFixed(2).replace('.',','))+acc()+date('Data do pagamento');fixed={card,due,expected:amount};submit='Confirmar pagamento';break;}
  case 'position':title='Registrar posição';html=text('name','Nome do investimento ou bem')+select('kind','Tipo',['CDB','Tesouro','Fundo','Ações','ETF','Caixinha','Outro',['asset','Outro ativo']])+text('institution','Instituição ou custódia')+money('Valor atual (R$)')+date('Data da posição');break;
  case 'invest':case 'redeem':title=op==='invest'?'Registrar aporte':'Registrar resgate';fixed={position:id};html=acc()+money()+date();break;
  case 'valuation':title='Atualizar posição';fixed={position:id};html=money('Novo valor (R$)')+date('Data da posição');break;
  case 'benefit':case 'benefitEdit':{const b=op==='benefitEdit'?one(s.benefits,id):{};title=op==='benefitEdit'?'Editar movimento do vale':'Movimentar vale';fixed=op==='benefitEdit'?{benefit:id}:{};html=select('wallet','Vale',wallets,b.wallet)+select('direction','Movimento',[['credit','Crédito'],['debit','Gasto']],b.direction)+text('name','Descrição',b.name)+money('Valor (R$)',b.amount?(b.amount/100).toFixed(2).replace('.',','):'')+date('Data',b.date||now);break;}
  case 'benefitDelete':title='Excluir movimentação';fixed={benefit:id};html='<p>Excluir '+esc(one(s.benefits,id).name)+' e recalcular o saldo deste vale?</p>';submit='Excluir';break;
  case 'consent':title='Conectar banco de teste';html='<p class="full">Banco Horizonte · Sandbox. Finalidade: consolidar os dados selecionados para seu controle financeiro. Você poderá revogar a autorização.</p>'+acc('account','Conta correspondente ao extrato')+input('expires','Autorizar até','date',addDays(now,30))+'<fieldset class="full"><legend>Dados autorizados</legend>'+Object.entries(permissions).map(([k,v])=>'<label><input type="checkbox" name="scopes" value="'+k+'" '+(['transactions','accounts'].includes(k)?'checked':'')+'> '+v+'</label> ').join('')+'</fieldset>';submit='Solicitar autorização';break;
  case 'authorize':case 'revoke':title=op==='authorize'?'Autorizar compartilhamento simulado':'Revogar consentimento';{const c=one(s.connections,id);html='<p>'+esc(c.institution)+' · '+esc(c.scopes.map(k=>permissions[k]).join(', '))+'. '+(op==='authorize'?'Autorizar até '+esc(c.expires)+'?':'Novas sincronizações cessam. O histórico pode ser consultado ou excluído em Configurações.')+'</p>';fixed={connection:id};submit=op==='authorize'?'Autorizar':'Revogar';}break;
  case 'reconcile':{const t=one(s.imports,id),matches=candidates(s,t);title='Revisar transação do banco';html='<p class="full">'+esc(t.name)+' · '+brl(t.amount)+'</p>'+select('choice','Ação',[...matches.map(m=>['match:'+m.id,'Vincular a '+m.name+' · '+m.date]),...s.accounts.filter(a=>a.id!==t.local).map(a=>['transfer:'+a.id,'Transferência própria · '+a.name]),['post','Adicionar como novo lançamento'],['ignore','Ignorar']]);fixed={import:id};break;}
  case 'login':title='Entrar na conta 2.0';html=input('email','E-mail','email','','autocomplete="username"')+input('password','Senha','password','','autocomplete="current-password"');submit='Entrar';break;
  case 'erase':title='Excluir dados desta versão';html='<p class="full">A exclusão remove os registros desta versão. Exporte seus dados antes de continuar. Digite EXCLUIR para confirmar.</p>'+input('confirmation','Confirmação','text','','pattern="EXCLUIR" autocomplete="off"');submit='Excluir dados';break;
  default:throw new Error('Ação indisponível.');
  }
  if(html.includes('name="account"')&&!accounts.length)throw new Error('Cadastre uma conta em Minhas contas para continuar.');
  return {op,fixed,id:uid(),title,html:html+'<p class="form-error full" role="alert"></p><button class="btn primary full" type="submit">'+submit+'</button>'};
}
export function payload(form,ctx){
 const f=new FormData(form),p={...Object.fromEntries(f),...ctx.fixed};
 if(f.has('amount'))p.amount=parseMoney(f.get('amount'));
 for(const key of ['count','closing','due'])if(f.has(key))p[key]=Number(f.get(key));
 if(ctx.op==='consent')p.scopes=f.getAll('scopes');
 if(ctx.op==='reconcile'){const [action,entry]=p.choice.split(':');p.action=action;if(action==='transfer')p.other=entry;else if(entry)p.entry=entry;delete p.choice;}
 return p;
}
