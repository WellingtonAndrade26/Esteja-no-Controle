import {createClient} from './vendor/auth.js';

const DEMO_SESSION='enc-v2-demo-session';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let client,root,current='welcome',recovery=false;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function markup(mode='welcome',message=''){
 const brand='<div class="access-brand"><img class="access-logo" src="./assets/ec-logo.webp" width="432" height="156" alt="Esteja no Controle"><span class="access-kicker">FINANÇAS PESSOAIS · WA DIGITAL LABS</span><h1>Sua vida financeira,<br><em>sob controle.</em></h1><p>Organize contas, planejamento, cartões, patrimônio e benefícios em um só lugar.</p><div class="access-trust"><span>✓ Dados separados por usuário</span><span>✓ Sincronização em nuvem</span><span>✓ PWA instalável</span></div></div>';
 const back=mode==='welcome'?'':'<button class="access-back" type="button" data-access="welcome">← Voltar</button>';
 let body='';
 if(mode==='welcome') body='<div class="access-card-head"><span class="access-mini">ESTEJA NO CONTROLE 2.0</span><h2>Comece do seu jeito</h2><p>Entre na sua conta, crie uma nova ou conheça o aplicativo com dados fictícios.</p></div><div class="access-actions"><button class="access-btn primary" data-access="login">Entrar</button><button class="access-btn secondary" data-access="signup">Criar conta</button><button class="access-btn ghost" data-access="demo">Experimentar demonstração</button></div><small class="access-note">A demonstração não altera nem sincroniza dados da sua conta.</small>';
 if(mode==='login') body='<div class="access-card-head"><span class="access-mini">ACESSO SEGURO</span><h2>Entrar</h2><p>Use o e-mail e a senha da sua conta.</p></div><form class="access-form" data-access-form="login"><label>E-mail<input name="email" type="email" autocomplete="username" required placeholder="voce@exemplo.com"></label><label>Senha<input name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="Sua senha"></label><button class="access-btn primary" type="submit">Entrar</button><button class="access-link" type="button" data-access="reset">Esqueci minha senha</button><p class="access-error" role="alert"></p></form>';
 if(mode==='signup') body='<div class="access-card-head"><span class="access-mini">NOVA CONTA</span><h2>Criar conta</h2><p>Crie seu acesso para manter seus dados sincronizados.</p></div><form class="access-form" data-access-form="signup"><label>E-mail<input name="email" type="email" autocomplete="email" required placeholder="voce@exemplo.com"></label><label>Senha<input name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="Mínimo de 8 caracteres"></label><label>Confirmar senha<input name="confirm" type="password" autocomplete="new-password" minlength="8" required placeholder="Repita a senha"></label><button class="access-btn primary" type="submit">Criar minha conta</button><p class="access-error" role="alert"></p></form>';
 if(mode==='newPassword') body='<div class="access-card-head"><span class="access-mini">NOVA SENHA</span><h2>Definir nova senha</h2><p>Crie uma senha segura para concluir a recuperação de acesso.</p></div><form class="access-form" data-access-form="newPassword"><label>Nova senha<input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="Mínimo de 8 caracteres"></label><label>Confirmar nova senha<input name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required placeholder="Repita a nova senha"></label><button class="access-btn primary" type="submit">Salvar nova senha</button><p class="access-error" role="alert"></p></form>';
 if(mode==='reset') body='<div class="access-card-head"><span class="access-mini">RECUPERAÇÃO</span><h2>Recuperar senha</h2><p>Enviaremos as instruções de recuperação para seu e-mail.</p></div><form class="access-form" data-access-form="reset"><label>E-mail<input name="email" type="email" autocomplete="email" required placeholder="voce@exemplo.com"></label><button class="access-btn primary" type="submit">Enviar instruções</button><p class="access-error" role="alert"></p></form>';
 return '<section class="access-gate" aria-label="Acesso ao Esteja no Controle"><div class="access-shell">'+brand+'<div class="access-panel">'+back+body+(message?'<p class="access-success" role="status">'+esc(message)+'</p>':'')+'<div class="access-wa"><img src="./assets/wa-prisma-160.webp" width="74" height="29" alt="WA Digital Labs"><span>Produto WA Digital Labs</span></div></div></div></section>';
}
function removeDemoExit(){document.getElementById('demo-exit')?.remove();}
function mountDemoExit(){
 if(sessionStorage.getItem(DEMO_SESSION)!=='1')return;
 removeDemoExit();
 const btn=document.createElement('button');
 btn.id='demo-exit';
 btn.type='button';
 btn.className='demo-exit';
 btn.setAttribute('aria-label','Sair da demonstração e voltar para a tela de acesso');
 btn.innerHTML='<span class="demo-exit-dot" aria-hidden="true"></span><span class="demo-exit-full">Sair da demonstração</span><span class="demo-exit-short">Sair demo</span>';
 const target=document.querySelector('.top-actions')||document.querySelector('.topbar')||document.body;
 target.prepend(btn);
}
function show(mode='welcome',message=''){
 current=mode;removeDemoExit();
 if(!root){root=document.createElement('div');root.id='access-root';document.body.appendChild(root);}
 root.innerHTML=markup(mode,message);
 document.body.classList.remove('access-pending');
 document.body.classList.add('access-open');
 root.querySelector('input')?.focus();
}
function hide(){root?.remove();root=null;document.body.classList.remove('access-open','access-pending');}
function emailAuthError(error,fallback){
 // Preserve privacy: do not reveal whether a given address is registered.
 if(error?.code==='over_email_send_rate_limit'||error?.status===429)return 'Limite de envio de e-mails atingido no momento. Tente novamente mais tarde.';
 if(error?.code==='email_address_not_authorized')return 'O serviço de e-mail ainda não está habilitado para este endereço. Contate o suporte do aplicativo.';
 return fallback;
}
async function submit(kind,form){
 const data=new FormData(form),err=form.querySelector('.access-error'),btn=form.querySelector('[type=submit]');
 err.textContent='';btn.disabled=true;
 try{
  const email=String(data.get('email')||'').trim();
  if(kind==='login'){
   const {error}=await client.auth.signInWithPassword({email,password:String(data.get('password')||'')});
   if(error)throw new Error('Falha ao entrar. Confira e-mail e senha.');
   sessionStorage.removeItem(DEMO_SESSION);removeDemoExit();location.reload();return;
  }
  if(kind==='signup'){
   const password=String(data.get('password')||''),confirm=String(data.get('confirm')||'');
   if(password.length<8)throw new Error('Use uma senha com pelo menos 8 caracteres.');
   if(password!==confirm)throw new Error('As senhas não coincidem.');
   const {data:created,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin}});
   if(error)throw new Error(emailAuthError(error,'Não foi possível criar a conta. Confira os dados.'));
   if(created?.session){sessionStorage.removeItem(DEMO_SESSION);removeDemoExit();location.reload();return;}
   show('login','Se for necessário confirmar o cadastro, você receberá um e-mail com as instruções.');return;
  }
  if(kind==='reset'){
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
   if(error)throw new Error(emailAuthError(error,'Não foi possível enviar o e-mail de recuperação.'));
   show('login','Se o e-mail estiver cadastrado, você receberá as instruções para recuperar o acesso.');
  }
  if(kind==='newPassword'){
   if(!recovery)throw new Error('Solicite um novo link de recuperação para atualizar sua senha.');
   const password=String(data.get('password')||''),confirm=String(data.get('confirm')||'');
   if(password.length<8||password.length>128)throw new Error('Use uma senha de 8 a 128 caracteres.');
   if(password!==confirm)throw new Error('As senhas não coincidem.');
   const {error}=await client.auth.updateUser({password});
   if(error)throw new Error('Não foi possível atualizar a senha. Solicite um novo link.');
   recovery=false;
   sessionStorage.removeItem(DEMO_SESSION);
   location.replace(location.origin+location.pathname);
   return;
  }
 }catch(e){err.textContent=e.message||'Não foi possível concluir.';}finally{btn.disabled=false;}
}
async function boot(){
 for(let i=0;i<50&&!globalThis.ENC_V2?.url;i++)await sleep(50);
 if(!globalThis.ENC_V2?.url||!globalThis.ENC_V2?.key){document.body.classList.remove('access-pending');return;}
 const callback=new URLSearchParams(location.hash.slice(1));
 const recoveryLink=callback.get('type')==='recovery';
 const badLink=callback.has('error') || callback.has('error_code');
 client=createClient(globalThis.ENC_V2.url,globalThis.ENC_V2.key,{auth:{storageKey:'enc-v2-auth',persistSession:true,detectSessionInUrl:true}});
 client.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){
   recovery=true;
   sessionStorage.removeItem(DEMO_SESSION);
   setTimeout(()=>show('newPassword'),0);
  }else if(event==='SIGNED_OUT'&&!session){
   recovery=false;
   sessionStorage.removeItem(DEMO_SESSION);
   setTimeout(()=>show('welcome'),0);
  }
 });
 const {data:{session},error}=await client.auth.getSession();
 if(error)throw new Error('Não foi possível restaurar a sessão.');
 if(badLink){
  history.replaceState(null,'',location.pathname+location.search);
  show('reset','O link é inválido ou expirou. Solicite uma nova recuperação.');
  return;
 }
 if(recovery || (recoveryLink && session)){
  recovery=true;
  sessionStorage.removeItem(DEMO_SESSION);
  show('newPassword');
  return;
 }
 if(session){sessionStorage.removeItem(DEMO_SESSION);document.body.classList.remove('access-pending');return;}
 if(recoveryLink){
  show('reset','O link não pôde ser validado. Solicite uma nova recuperação.');
  return;
 }
 if(sessionStorage.getItem(DEMO_SESSION)==='1'){
   document.body.classList.remove('access-pending');
   for(let i=0;i<40&&!document.querySelector('.top-actions');i++)await sleep(50);
   mountDemoExit();
   return;
 }
 show();

}
document.addEventListener('click',e=>{
 const exit=e.target.closest('#demo-exit');
 if(exit){
   sessionStorage.removeItem(DEMO_SESSION);
   removeDemoExit();
   show('welcome');
   return;
 }
 const t=e.target.closest('[data-access]');
 if(t){
  const next=t.dataset.access;
  if(next==='demo'){sessionStorage.setItem(DEMO_SESSION,'1');hide();setTimeout(mountDemoExit,100);return;}
  if(['welcome','login','signup','reset'].includes(next))show(next);
 }
 const logout=e.target.closest('[data-action="logout"]');
 if(logout)setTimeout(async()=>{const result=client?await client.auth.getSession():{data:{session:null}};if(!result.data.session){sessionStorage.removeItem(DEMO_SESSION);show();}},650);
});
document.addEventListener('submit',e=>{const f=e.target.closest('[data-access-form]');if(!f)return;e.preventDefault();submit(f.dataset.accessForm,f);});
boot().catch(()=>document.body.classList.remove('access-pending'));
