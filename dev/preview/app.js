import {today} from './domain/base.js';
import {interpret} from './domain/language.js';
import * as store from './store.js';
import {pages,nav,esc} from './ui/html.js';
import {renderPage} from './ui/views.js';
import {formFor,payload} from './ui/forms.js';
const $=s=>document.querySelector(s);
const content=$('#content'),dialog=$('#dialog'),form=$('#form'),toast=$('#toast');
const ui={days:'30',limit:30,response:'',cloud:false,enabled:false,tabs:{contas:'contas',planejamento:'resumo',cartoes:'resumo',patrimonio:'resumo',vales:'saldos',conexoes:'instituicoes',copiloto:'copiloto'}};
let ctx=null,locked=false,registration,failed=false,loading=false;
let arcObserver;
function trackArc() {
  arcObserver?.disconnect();
  const arc = document.querySelector('.orbit');
  if (!arc || !('IntersectionObserver' in window)) return;
  arcObserver = new IntersectionObserver(([entry]) => {
    arc.classList.toggle('in-view', entry.isIntersecting && !document.hidden);
  });
  arcObserver.observe(arc);
}
document.addEventListener('visibilitychange', trackArc);
const mobileLayout=matchMedia('(max-width:650px)');
function orderHomePanels() {
  const cash=content.querySelector('.cash'), bills=content.querySelector('.upcoming');
  if (!cash || !bills) return;
  if (mobileLayout.matches) cash.before(bills);
  else cash.after(bills);
}
mobileLayout.addEventListener('change', orderHomePanels);
const page=()=>Object.hasOwn(pages,location.hash.slice(1))?location.hash.slice(1):'inicio';
function net(){ $('#network').classList.toggle('warning',!navigator.onLine || failed); $('#network').textContent=!navigator.onLine?'Offline':loading?'Sincronizando…':failed?'Erro de sincronização':'Online';}
function notice(message){toast.hidden=false;toast.textContent=message;clearTimeout(notice.timer);notice.timer=setTimeout(()=>toast.hidden=true,4800);}
function render(){
  const s=store.data();if(!s)return;
  ui.cloud=store.isCloud();ui.enabled=store.enabled();
  $('#mode').textContent=ui.cloud?'Conta sincronizada':'Demonstração';
  const previous=content.contains(document.activeElement)?document.activeElement:null;
  const memoryOpen=content.querySelector('.memory')?.open;
  content.innerHTML=renderPage(page(),s,ui);document.title=(pages[page()]||'Página')+' · Esteja no Controle';
  orderHomePanels();
  const memory=content.querySelector('.memory');
  if (memory && memoryOpen) memory.open=true;
  if (previous && previous!==content) {
    const replacement=[...content.querySelectorAll('button, a, input, summary')].find(el=>
      el.tagName===previous.tagName && el.dataset.action===previous.dataset.action &&
      el.dataset.id===previous.dataset.id && el.getAttribute('href')===previous.getAttribute('href') &&
      el.getAttribute('name')===previous.getAttribute('name') && el.textContent===previous.textContent);
    (replacement||content).focus({preventScroll:true});
  }
  trackArc();
  document.querySelectorAll('nav a, .settings-link').forEach(a=>{
    const current=page();
    const morePages=['cartoes','patrimonio','vales','conexoes','copiloto','ajustes'];
    const selected=a.hash==='#'+current || (a.closest('#bottom') && a.hash==='#mais' && morePages.includes(current));
    a.classList.toggle('active',selected);
    if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  net();
}
function openForm(action,id){ctx=formFor(action,id,store.data());$('#dialog-title').textContent=ctx.title;form.innerHTML=ctx.html;dialog.showModal();form.querySelector('input:not([type="checkbox"]), select,button')?.focus();}
async function reload(){loading=true;net();try{await store.refresh();failed=false;render();}catch(e){failed=true;throw e;}finally{loading=false;net();}}
function exportData(value={version:2,exportedAt:new Date().toISOString(),...store.data()},prefix='esteja-no-controle'){
 const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=prefix+'-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function action(k,id){
 if(k==='refresh'){await reload();notice('Dados atualizados.');return;}
 if(k==='sync'){await store.dispatch('sync',{connection:id});render();notice('Sincronização concluída.');return;}
 if(k==='horizon'){
   ui.days=id;
   render();
   content.querySelector('[data-action="horizon"][aria-pressed="true"]')?.focus({preventScroll:true});
   return;
 }
 if(k==='section-tab'){
   const [section,tab]=String(id||'').split(':');
   if(!section||!tab||!Object.hasOwn(ui.tabs,section))throw new Error('Aba indisponível.');
   ui.tabs[section]=tab;
   ui.limit=30;
   render();
   content.querySelector('[data-action="section-tab"][aria-selected="true"]')?.focus({preventScroll:true});
   return;
 }
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
 locked=true;const button=form.querySelector('[type=submit]');button.disabled=true;let p;
 try{
   p=payload(form,ctx);
   if(ctx.op==='erase'){if(p.confirmation!=='EXCLUIR')throw new Error('Digite EXCLUIR.');
     await store.erase();}
   else if(ctx.op==='login')await store.login(p.email,p.password);
   else await store.dispatch(ctx.op,p,ctx.id);
   failed=false;dialog.close();ui.response='';render();notice('Concluído.');
 }catch(err){form.querySelector('[role=alert]').textContent=err.message;failed=store.isCloud();}
 finally{locked=false;button.disabled=false;net();}
};
document.addEventListener('submit',async e=>{if(e.target.id!=='chat')return;e.preventDefault();const q=new FormData(e.target).get('question');const result=await interpret(store.data(),today(),q);if(page()==='copiloto'){ui.response=result;render();}});
window.addEventListener('hashchange',()=>{ui.limit=30;render();window.scrollTo(0,0);content.focus({preventScroll:true});});
window.addEventListener('storage',e=>{if(e.key===store.DEMO_KEY && !store.isCloud())reload().catch(err=>notice(err.message));});
for(const event of ['online','offline'])window.addEventListener(event,net);
$('#side').innerHTML = [
  ['Principal',['inicio','extrato']],
  ['Organização',['planejamento','contas','cartoes']],
  ['Patrimônio',['patrimonio','vales']],
  ['Inteligência',['conexoes','copiloto']]
].map(([label,keys]) => '<div class="nav-group"><p>'+label+'</p>'+keys.map(k=>nav(k)).join('')+'</div>').join('');
$('#bottom').innerHTML=[
  ['inicio','Início'],['extrato','Movimentos'],['planejamento','Planejar'],['contas','Contas'],['mais','Mais']
].map(([k,label])=>nav(k,label)).join('');
if('serviceWorker' in navigator){
 let controlled=!!navigator.serviceWorker.controller;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(controlled)location.reload();controlled=true;});
 navigator.serviceWorker.register('./sw.js').then(r=>registration=r).catch(()=>notice('Instalação offline indisponível.'));
}
try{await store.init();render();}catch(e){failed=true;net();content.textContent='Falha ao carregar. Use Atualizar dados para tentar novamente.';notice(e.message);}
