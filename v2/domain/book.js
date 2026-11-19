import {applyCommand} from './commands.js';
import {applyBankCommand} from '../open-finance/reconciliation.js';
import {assert} from './base.js';
export const isBank=op=>['consent','authorize','revoke','bankPage','reconcile'].includes(op);
export function execute(s,cmd,date,internal=false) {
  assert(typeof cmd.id==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(cmd.id),'Identificador inválido.');
  const next=isBank(cmd.op)?applyBankCommand(s,cmd,date,internal):applyCommand(s,cmd,date);
  for(let i=s.logs.length;i<next.logs.length;i++)next.logs[i].id=cmd.id+'-'+i;
  return next;
}
function key(collection,row){return collection==='resources'?row.key:row.id;}
export function diff(before,after){
  const changes=[];
  for(const collection of Object.keys(after).filter(k=>Array.isArray(after[k]))){
    const previous=new Map(before[collection].map(row=>[key(collection,row),JSON.stringify(row)]));
    for(const data of after[collection]){
      const id=key(collection,data);
      if(previous.get(id)!==JSON.stringify(data))changes.push({collection,key:id,data});
      previous.delete(id);
    }
    for(const id of previous.keys())changes.push({collection,key:id,data:null});
  }
  return changes;
}
