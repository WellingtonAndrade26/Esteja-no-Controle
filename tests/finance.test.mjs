import test from 'node:test';
import assert from 'node:assert/strict';
import {blank,shift,split,parseMoney,brl} from '../v2/domain/base.js';
import {execute} from '../v2/domain/book.js';
import {dashboard,balance,cardStats,forecast,benefitBalance,upcoming} from '../v2/domain/engine.js';
import {SandboxProvider} from '../v2/open-finance/provider.js';
import {candidates} from '../v2/open-finance/reconciliation.js';
import {answer} from '../v2/domain/copilot.js';
const date='2026-11-19';
function book(){
 let state=blank();let i=0;
 const add=(op,p,id='op'+ ++i,internal=false)=>{state=execute(state,{id,op,p},date,internal);return id;};
 add('account',{name:'Principal',type:'Digital',amount:100000,date:'2026-10-01'},'main');
 return {add,get s(){return state;},get k(){return dashboard(state,date);}};
}
test('R$ 1.000 + 500 − 200 − 300 = 1.000, com investimento de R$ 5.000',()=>{
 const b=book();for(const [kind,amount] of [['income',50000],['expense',20000]])b.add('entry',{kind,name:kind,date,account:'main',amount});
 b.add('position',{kind:'CDB',name:'Reserva',amount:500000,date});
 b.add('plan',{name:'Material',amount:30000,count:1,date,account:'main'},'plan');
 assert.equal(b.k.result,100000);assert.equal(b.k.current,130000);assert.equal(b.k.wealth,630000);
 b.add('pay',{due:'plan/1',date,account:'main'});
 assert.equal(b.k.current,100000);assert.equal(b.k.pending,0);assert.equal(b.k.result,100000);
 assert.throws(()=>b.add('pay',{due:'plan/1',date,account:'main'}));assert.equal(b.k.spent,50000);
});
test('transferência conserva patrimônio e não altera renda ou despesa',()=>{
 const b=book();b.add('account',{name:'Carteira',type:'Carteira',amount:0,date},'other');
 b.add('transfer',{from:'main',to:'other',amount:40000,date});assert.equal(b.k.incoming,0);assert.equal(b.k.spent,0);assert.equal(b.k.moved,-40000);assert.equal(b.k.wealth,100000);
 b.add('primary',{account:'other'});assert.equal(b.k.current,40000);assert.throws(()=>b.add('transfer',{from:'main',to:'main',amount:500,date}));
});
test('despesa em outra conta e parcela futura não contaminam Resultado',()=>{
 const b=book();b.add('account',{name:'Outra',type:'Carteira',amount:10000,date},'other');
 b.add('entry',{kind:'expense',name:'Mercado',amount:5000,date,account:'other'});b.add('plan',{name:'Pendente',amount:50000,date:'2026-12-01',count:1,account:'main'});assert.equal(b.k.result,100000);assert.equal(b.k.wealth,105000);
});
test('parcelas em centavos e datas no fim do mês',()=>{
 assert.deepEqual(split(10000,3),[3334,3333,3333]);assert.equal(shift('2028-01-31',1),'2028-02-29');assert.equal(shift('2026-01-31',2),'2026-03-31');assert.throws(()=>split(2,3));
 assert.equal(parseMoney('2.000,01'),200001);assert.throws(()=>parseMoney('2,123'));assert.throws(()=>parseMoney('1e9'));
});
test('lançamento futuro e alteração de saldo inválida falham sem modificar o livro',()=>{
 const b=book();assert.throws(()=>b.add('entry',{amount:500,date:'2026-12-19',account:'main',name:'Depois',kind:'expense'}));assert.equal(b.s.entries.length,0);
});
test('compra parcelada compromete o total e a fatura libera só o valor pago',()=>{
 const b=book();b.add('card',{name:'Cartão',brand:'Visa',last4:'1234',closing:10,due:20,amount:100000,account:'main'},'card');
 b.add('purchase',{name:'Mercado',card:'card',amount:10000,count:3,date:'2026-11-08'},'buy');
 assert.deepEqual(cardStats(b.s,'card'),{used:10000,available:90000});assert.equal(b.k.spent,0);assert.equal(b.k.pending,3334);
 assert.throws(()=>b.add('pay',{due:'buy/1',account:'main',date}));b.add('invoice',{card:'card',due:'2026-11-20',account:'main',amount:3334,date});
 assert.equal(b.k.spent,3334);assert.equal(b.k.current,96666);assert.equal(b.k.pending,0);assert.equal(cardStats(b.s,'card').used,6666);
 assert.throws(()=>b.add('invoice',{card:'card',due:'2026-11-20',account:'main',amount:3334,date}));
});
test('vale permite crédito, gasto, edição e exclusão sem alterar banco',()=>{
 const b=book();const p={wallet:'Alimentação',date,name:'Teste'};const id=b.add('benefit',{...p,amount:12000,direction:'credit'});const expense=b.add('benefit',{...p,amount:4100,direction:'debit'});
 assert.throws(()=>b.add('benefitDelete',{benefit:id}));b.add('benefitEdit',{...p,benefit:expense,direction:'debit',amount:2000});assert.equal(benefitBalance(b.s,p.wallet),10000);b.add('benefitDelete',{benefit:expense});
 assert.deepEqual([b.k.result,b.k.wealth,b.k.incoming],[100000,100000,0]);assert.equal(benefitBalance(b.s,p.wallet),12000);
});
test('recorrência é baixada apenas uma vez, projeção inclui atrasos e receita prevista',()=>{
 const b=book();b.add('recurring',{kind:'expense',date:'2026-11-10',name:'Internet',amount:1000,account:'main'},'net');
 b.add('recurring',{kind:'income',date:'2026-11-20',name:'Salário',amount:30000,account:'main'},'payday');
 assert.equal(forecast(b.s,date,7).at(-1).value,129000);b.add('pay',{due:'net/2026-11-10',assigned:'main',occurrence:'2026-11-10',account:'main',date});assert.equal(b.k.result,129000);assert.equal(upcoming(b.s,'2026-11-30',date,'main').length,1);
});
test('consentimento, escopos, deduplicação, correspondência e revogação',async()=>{
 const b=book();const id=b.add('entry',{kind:'expense',name:'Mercado',amount:36100,date,account:'main'});
 b.add('consent',{scopes:['transactions'],account:'main',expires:'2027-01-01'},'bank');b.add('authorize',{connection:'bank'});
 const c=b.s.connections[0],page=await new SandboxProvider().syncConnection(c,null);
 const send=(rows,previous,next)=>b.add('bankPage',{connection:'bank',rows,previous,next},undefined,true);
 assert.throws(()=>b.add('bankPage',{connection:'bank',rows:[],previous:null,next:'x'}));assert.throws(()=>send([{type:'investment',id:'other'}],null,'x'));
 send(page.rows,null,'1');send(page.rows,'1','2');assert.equal(b.s.imports.length,1);assert.equal(b.s.entries.length,1);
 const t=b.s.imports[0];assert.equal(candidates(b.s,t)[0].id,id);b.add('reconcile',{import:t.id,action:'match',entry:id});assert.equal(b.k.spent,36100);
 b.add('revoke',{connection:'bank'});assert.throws(()=>send([],'2','3'));assert.equal(b.s.imports[0].status,'matched');
});
test('transações legítimas idênticas com IDs distintos permanecem revisáveis',async()=>{
 const b=book();b.add('consent',{account:'main',scopes:['transactions'],expires:'2027-01-01'},'bank');b.add('authorize',{connection:'bank'});
 const [t]=new SandboxProvider().getTransactions(b.s.connections[0]);b.add('bankPage',{connection:'bank',previous:null,next:'1',rows:[t,{...t,id:'other'}]},undefined,true);
 assert.equal(b.s.imports.length,2);assert.equal(b.s.entries.length,0);
});
test('copiloto usa os valores do motor e mostra a margem após a compra',()=>{const b=book();assert.ok(answer(b.s,date,'Posso comprar algo de R$ 2.000?').includes(brl(-100000)));});
test('aporte e resgate movem caixa e posição sem virar gasto ou entrada',()=>{const b=book(),position=b.add('position',{name:'CDB',kind:'CDB',amount:0,date});b.add('invest',{position,account:'main',amount:50000,date});assert.deepEqual([b.k.current,b.k.wealth,b.k.spent,b.k.invested],[50000,100000,0,50000]);b.add('redeem',{position,account:'main',amount:20000,date});assert.deepEqual([b.k.current,b.k.wealth,b.k.incoming,b.k.invested],[70000,100000,0,30000]);assert.throws(()=>b.add('redeem',{position,account:'main',amount:40000,date}));});
test('modelo local roteia intenção e não pode fornecer quantias ao usuário',async()=>{const {interpret}=await import('../v2/domain/language.js');const b=book();const mock=reply=>({availability:async()=>'available',create:async()=>({prompt:async()=>reply,destroy(){}})});assert.ok((await interpret(b.s,date,'Qual é a minha liquidez?',mock('saldo'))).includes(brl(100000)));assert.ok(!(await interpret(b.s,date,'Qual é a minha liquidez?',mock('R$ 999999'))).includes('999999'));});
test('pagamento parcial libera exatamente o valor pago e rejeita saldo de fatura desatualizado',()=>{const b=book();const card=b.add('card',{name:'Teste',brand:'Visa',last4:'1234',closing:10,due:20,amount:30000,account:'main'});b.add('purchase',{name:'Compra',card,amount:10000,count:1,date:'2026-11-09'});const p={card,due:'2026-11-20',account:'main',date,amount:4000,expected:10000};b.add('invoice',p);assert.equal(cardStats(b.s,card).used,6000);assert.equal(b.k.spent,4000);assert.throws(()=>b.add('invoice',p));});
test('importação de duas pontas da transferência gera um único movimento',()=>{const b=book();b.add('account',{name:'Outra',type:'Digital',amount:0,date},'other');for(const [id,account,dir] of [['c1','main','expense'],['c2','other','income']]){b.add('consent',{account,expires:'2027-01-01',scopes:['transactions']},id);b.add('authorize',{connection:id});b.add('bankPage',{connection:id,previous:null,next:'1',rows:[{type:'transaction',id:'r'+id,account,amount:5000,direction:dir,name:'Pix',date}]},undefined,true);}const [out,inc]=b.s.imports;b.add('reconcile',{import:out.id,action:'transfer',other:'other'});b.add('reconcile',{import:inc.id,action:'match',entry:b.s.entries[0].id});assert.equal(b.s.entries.length,1);assert.deepEqual([b.k.incoming,b.k.spent,b.k.wealth],[0,0,100000]);});
