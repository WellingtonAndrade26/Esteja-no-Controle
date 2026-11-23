import {today,blank} from './domain/base.js';
import {interpret} from './domain/language.js';
import * as store from './store.js';
import {pages,nav,esc} from './ui/html.js';
import {renderPage} from './ui/views.js';
import {formFor,payload} from './ui/forms.js';
const $=s=>document.querySelector(s);
const content=$('#content'),dialog=$('#dialog'),form=$('#form'),toast=$('#toast');
const ui={days:'30',limit:30,response:'',cloud:false,enabled:false};
let ctx=null,locked=false,registration,failed=false,loading=false;
const page=()=>Object.hasOwn(pages,location.hash.slice(1))?location.hash.slice(1):'inicio';
function net(){ $('#network').textContent=!navigator.onLine?'Offline':loading?'Sincronizando…':failed?'Erro de sincronização':'Online';}
function notice(message){toast.hidden=false;toast.textContent=message;clearTimeout(notice.timer);notice.timer=setTimeout(()=>toast.hidden=true,4800);}
function render(){
  const s=store.data();if(!s)return;
  ui.cloud=store.isCloud();ui.enabled=store.enabled();
  $('#mode').textContent=ui.cloud?'Conta sincronizada':'Demonstração · dados neste dispositivo';
  content.innerHTML=renderPage(page(),s,ui);document.title=(pages[page()]||'Página')+' · Esteja no Controle';
  document.querySelectorAll('nav a').forEach(a=>{const selected=a.hash==='#'+page();a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  net();
}
function openForm(action,id){ctx=formFor(action,id,store.data());$('#dialog-title').textContent=ctx.title;form.innerHTML=ctx.html;if(!dialog.open)dialog.showModal();form.querySelector('input:not([type="checkbox"]), select,button')?.focus();}
async function reload(){loading=true;net();try{await store.refresh();failed=false;render();}catch(e){failed=true;throw e;}finally{loading=false;net();}}
function exportData(value={version:2,exportedAt:new Date().toISOString(),...store.data()},prefix='esteja-no-controle'){
 const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=prefix+'-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function action(k,id){
 if(k==='refresh'){await reload();notice('Dados atualizados.');return;}
 if(k==='sync'){await store.dispatch('sync',{connection:id});render();notice('Sincronização concluída.');return;}
 if(k==='horizon'){ui.days=id;render();return;}
 if(k==='ask'){ui.response=await interpret(store.data(),today(),id);render();return;}
 if(k==='more'){ui.limit+=30;render();return;}
 if(k==='export'){exportData();return;}
 if(k==='legacyExport'){exportData(await store.legacyExport(),'esteja-no-controle-legado');return;}
 if(k==='legacyReview'){
   const report=await store.legacyReview();ctx={op:'legacyImport',id:crypto.randomUUID(),fixed:{stamp:report.stamp}};
   const issues=report.issues,can=!issues.length && report.counts.accounts>0 && !store.data().accounts.length;
   $('#dialog-title').textContent='Conferência da versão anterior';
   form.innerHTML='<p class="full">'+Number(report.counts.accounts)+' conta(s), '+Number(report.counts.transactions)+' lançamento(s). A cópia é pontual. Alterações futuras em cada versão são independentes. Metas e orçamentos anteriores ficam disponíveis na exportação da versão anterior.</p>'+issues.map(issue=>'<p class="full">'+esc(issue)+'</p>').join('')+'<p class="form-error full" role="alert"></p>'+(can?'<button type="submit" class="btn primary">Copiar para a versão 2.0</button>':'<p class="full">A cópia exige livro 2.0 vazio e conferência sem divergências.</p>');
   dialog.showModal();return;
 }
 if(k==='logout'){await store.logout();ui.response='';render();return;}
 if(k==='update'){
   if(!registration)throw new Error('Atualização indisponível neste navegador.');
   await registration.update();
   if(registration.waiting){registration.waiting.postMessage({type:'ACTIVATE'});return;}
   if(registration.installing){const w=registration.installing;w.addEventListener('statechange',()=>{if(w.state==='installed')registration.waiting?.postMessage({type:'ACTIVATE'});});notice('Baixando atualização.');return;}
   notice('Você está na versão atual.');return;
 }
 openForm(k,id);
}
document.querySelector('.skip').onclick=e=>{e.preventDefault();content.focus();};
document.addEventListener('click',async e=>{
 const target=e.target.closest('[data-action],[data-view]');if(!target||locked)return;
 if(target.dataset.view){location.hash=target.dataset.view;return;}
 locked=true;
 try{await action(target.dataset.action,target.dataset.id);}catch(err){notice(err.message);if(['refresh','sync'].includes(target.dataset.action))failed=true;}finally{locked=false;net();}
});
$('#close').onclick=()=>dialog.close();
form.onsubmit=async e=>{
 e.preventDefault();if(locked||!ctx)return;
 locked=true;const button=form.querySelector('[type=submit]');button.disabled=true;let p,message='Concluído.';
 try{
   p=payload(form,ctx);
   if(ctx.op==='erase'){if(p.confirmation!=='EXCLUIR')throw new Error('Digite EXCLUIR.');
     await store.erase();}
   else if(ctx.op==='login'){await store.login(p.email,p.password);message='Conta conectada.';}
   else if(ctx.op==='signup'){
     const result=await store.signup(p.email,p.password,p.confirmation);
     message=result.signedIn?'Conta criada e conectada.':'Cadastro solicitado. Confira seu e-mail para confirmar a conta.';
   }else if(ctx.op==='resetRequest')message=await store.requestReset(p.email);
   else if(ctx.op==='newPassword')message=await store.savePassword(p.password,p.confirmation);
   else await store.dispatch(ctx.op,p,ctx.id);
   failed=false;dialog.close();ui.response='';render();notice(message);
 }catch(err){form.querySelector('[role=alert]').textContent=err.message;failed=store.isCloud();}
 finally{locked=false;button.disabled=false;net();}
};
document.addEventListener('submit',async e=>{if(e.target.id!=='chat')return;e.preventDefault();const q=new FormData(e.target).get('question');const result=await interpret(store.data(),today(),q);if(page()==='copiloto'){ui.response=result;render();}});
window.addEventListener('hashchange',()=>{ui.limit=30;render();window.scrollTo(0,0);content.focus({preventScroll:true});});
window.addEventListener('storage',e=>{if(e.key===store.DEMO_KEY && !store.isCloud())reload().catch(err=>notice(err.message));});
for(const event of ['online','offline'])window.addEventListener(event,net);
$('#side').innerHTML=Object.keys(pages).filter(k=>!['mais','ajustes'].includes(k)).map(k=>nav(k)).join('');
$('#bottom').innerHTML=['inicio','extrato','planejamento','mais'].map(k=>nav(k,k==='inicio'?'Início':pages[k])).join('');
if('serviceWorker' in navigator){
 let controlled=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(controlled)location.reload();controlled=true;});
 navigator.serviceWorker.register('./sw.js').then(r=>registration=r).catch(()=>notice('Instalação offline indisponível.'));
}
window.addEventListener('enc-password-recovery',()=>{
  if(store.data() && ctx?.op!=='newPassword')openForm('newPassword');
});
window.addEventListener('enc-session-ready',()=>{failed=false;render();});
window.addEventListener('enc-session-error',()=>{failed=true;net();notice('Não foi possível sincronizar a nova sessão. Atualize os dados.');});
try{
  await store.init();render();
  if(store.passwordRecovery() && ctx?.op!=='newPassword')openForm('newPassword');
}catch(e){failed=true;net();content.textContent='Falha ao carregar. Use Atualizar dados para tentar novamente.';notice(e.message);}
