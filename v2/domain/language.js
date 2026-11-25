import {answer} from './copilot.js';
// Local language model maps the question to a supported intent. It never receives
// account records and cannot produce monetary amounts or mutate the ledger.
const topics=['saldo','bancos','investimentos','patrimônio','fatura','semana','gastos','mês passado'];
export async function interpret(state,date,question,localModel=globalThis.LanguageModel){
 const direct=answer(state,date,question);
 if(!direct.startsWith('Posso consultar') || !localModel || question.length>300)return direct;
 let session;
 try{
   const options={expectedInputs:[{type:'text',languages:['pt']}],expectedOutputs:[{type:'text',languages:['pt']}]};
   if(await localModel.availability(options)!=='available')return direct;
   session=await localModel.create(options);
   const result=(await session.prompt('Classifique a pergunta entre estes temas: '+topics.join(', ')+'. Responda apenas com o tema ou desconhecido. Pergunta: '+JSON.stringify(question))).trim().toLowerCase();
   return topics.includes(result)?answer(state,date,result):direct;
 }catch{return direct;}finally{session?.destroy();}
}
