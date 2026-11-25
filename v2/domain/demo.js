import {blank,addDays,dayAt} from './base.js';
import {execute} from './book.js';
export function demo(now){
  const start=now.slice(0,7)+'-01';
  const day=n=>dayAt(now.slice(0,7),Math.min(Number(now.slice(8)),n));
  let s=blank();
  function add(id,op,p){s=execute(s,{id,op,p},now);}
  add('daily','account',{name:'Conta do dia a dia',institution:'Conta digital',type:'Digital',amount:120000,date:start});
  add('wallet','account',{name:'Carteira',type:'Carteira',amount:18500,date:start});
  add('salary','entry',{name:'Salário',kind:'income',amount:425000,account:'daily',date:day(5),category:'Trabalho'});
  add('market','entry',{name:'Mercado',kind:'expense',amount:36100,account:'daily',date:now,category:'Alimentação'});
  add('internet','entry',{name:'Internet de casa',kind:'expense',amount:9990,account:'daily',date:day(8),category:'Moradia'});
  add('fuel','entry',{name:'Posto de combustível',kind:'expense',amount:16000,account:'daily',date:day(12),category:'Transporte'});
  add('reserve','position',{name:'Reserva de emergência',kind:'CDB',institution:'Banco digital',amount:500000,date:start});
  add('food','benefit',{name:'Crédito mensal',wallet:'Alimentação',direction:'credit',amount:72000,date:start});
  add('benefit-market','benefit',{name:'Hortifruti',wallet:'Alimentação',direction:'debit',amount:11850,date:now});
  add('equipment','plan',{name:'Notebook',amount:180000,count:6,date:addDays(now,3),account:'daily',institution:'Loja',category:'Tecnologia'});
  add('light','bill',{name:'Energia elétrica',amount:18490,date:addDays(now,2),account:'daily',category:'Moradia'});
  add('stream','recurring',{name:'Streaming',amount:2990,date:addDays(now,6),account:'daily',kind:'expense'});
  add('payday','recurring',{name:'Salário previsto',amount:425000,date:addDays(dayAt(now.slice(0,7),31),5),account:'daily',kind:'income'});
  add('card','card',{name:'Cartão do dia a dia',brand:'Visa',last4:'4026',closing:18,due:26,amount:400000,account:'daily',institution:'Banco digital'});
  add('buy','purchase',{name:'Livraria',amount:24990,date:start,card:'card',count:1,category:'Educação'});
  return s;
}
