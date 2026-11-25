import {assert,dateKey,cents,label,addDays} from '../domain/base.js';
// Providers return normalized, read-only snapshots. Secrets belong in the backend adapter.
export const scopes=['accounts','transactions','cards','invoices','loans','investments'];
export class OpenFinanceProvider {
  unavailable(){throw new Error('Recurso indisponível neste provedor.');}
  createConsent(){return this.unavailable();} getConsent(){return this.unavailable();} revokeConsent(){return this.unavailable();}
  getInstitutions(){return this.unavailable();} getAccounts(){return this.unavailable();} getBalances(){return this.unavailable();}
  getTransactions(){return this.unavailable();} getCreditCards(){return this.unavailable();} getCreditCardBills(){return this.unavailable();}
  getLoans(){return this.unavailable();} getInvestments(){return this.unavailable();} syncConnection(){return this.unavailable();}
}
export class SandboxProvider extends OpenFinanceProvider {
  id='sandbox'; institution='Banco Horizonte · simulado';
  getInstitutions(){return [{id:'horizonte',name:this.institution}];}
  createConsent(c){return {id:c.id,status:'pending',scopes:c.scopes,expires:c.expires};}
  getConsent(c){return {id:c.id,status:c.status,scopes:c.scopes,expires:c.expires};}
  revokeConsent(c){return {...this.getConsent(c),status:'revoked'};}
  getAccounts(){return [{type:'account',id:'horizonte-cc',name:'Conta Horizonte',currency:'BRL'}];}
  getBalances(c){return [{type:'balance',id:'saldo-cc',account:'horizonte-cc',date:c.created,amount:185000}];}
  getTransactions(c){return [{type:'transaction',id:'hx-pix-001',account:'horizonte-cc',direction:'expense',amount:36100,name:'SUPERMERCADO HORIZONTE',date:c.created}];}
  getCreditCards(){return [{type:'card',id:'hx-card',name:'Horizonte final 4012',limit:250000}];}
  getCreditCardBills(c){return [{type:'invoice',id:'hx-bill',card:'hx-card',amount:18990,date:addDays(c.created,7)}];}
  getLoans(){return [{type:'loan',id:'hx-loan',name:'Crédito pessoal',outstanding:125000}];}
  getInvestments(){return [{type:'investment',id:'hx-cdb',name:'CDB Horizonte',value:500000}];}
  async syncConnection(c,cursor) {
    const catalog={accounts:['getAccounts','getBalances'],transactions:['getTransactions'],cards:['getCreditCards'],invoices:['getCreditCardBills'],loans:['getLoans'],investments:['getInvestments']};
    const rows=[];
    if(cursor!=='snapshot-1')for(const scope of c.scopes)for(const method of catalog[scope])rows.push(...await this[method](c));
    return {rows,next:'snapshot-1',hasMore:false};
  }
}
export function validTransaction(item) {
  assert(item.type==='transaction' && ['income','expense'].includes(item.direction),'Transação externa inválida.');
  return {type:'transaction',id:label(item.id),account:label(item.account),date:dateKey(item.date),name:label(item.name),amount:cents(item.amount),direction:item.direction};
}
