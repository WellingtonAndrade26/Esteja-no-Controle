import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

const source=await readFile(new URL('../prisma/access.js',import.meta.url),'utf8');

function stage(hash='',session=null){
 const events={},bodyClasses=new Set(['access-pending']),sessionValues=new Map();
 let root,authCallback,updatedPassword,replacedUrl,clearedUrl;
 const auth={
   onAuthStateChange(callback){authCallback=callback;return {data:{subscription:{unsubscribe(){}}}};},
   async getSession(){return {data:{session},error:null};},
   async updateUser({password}){updatedPassword=password;return {error:null};}
 };
 const body={
   classList:{add(k){bodyClasses.add(k);},remove(...ks){for(const k of ks)bodyClasses.delete(k);}},
   appendChild(element){root=element;},
   prepend(){}
 };
 const document={
   body,addEventListener(k,v){events[k]=v;},
   createElement(){return {innerHTML:'',querySelector(){return null;},remove(){root=undefined;},setAttribute(){}};},
   getElementById(){return null;},
   querySelector(){return null;}
 };
 class FakeFormData{constructor(form){this.values=form.values;}get(key){return this.values[key]??null;}}
 const url={origin:'https://controle.wadigitallabs.com',pathname:'/',search:'',hash,replace(v){replacedUrl=v;}};
 const ctx={document,sessionStorage:{getItem:k=>sessionValues.get(k),setItem:(k,v)=>sessionValues.set(k,v),removeItem:k=>sessionValues.delete(k)},
   location:url,history:{replaceState(...x){clearedUrl=x[2];}},
   URLSearchParams,FormData:FakeFormData,setTimeout,clearTimeout,console,
   ENC_V2:{url:'https://supabase.example',key:'sb_publishable_test'},
   createClient:()=>({auth})};
 vm.runInNewContext(source.replace("import {createClient} from './vendor/auth.js';",'').trim(),ctx,{filename:'prisma/access.js'});
 return {
   events,authEvent:(...args)=>authCallback?.(...args),
   html:()=>root?.innerHTML||'',status:()=>({classes:[...bodyClasses],updatedPassword,replacedUrl,clearedUrl}),
   form:(mode,values)=>({
     dataset:{accessForm:mode},values,
     querySelector(selector){return selector==='.access-error'?{textContent:''}:{disabled:false};}
   })
 };
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));

test('código do portão Prisma compila como módulo JavaScript',()=>{
 const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('retorno de recuperação com sessão mostra formulário de nova senha',async()=>{
 const page=stage('#access_token=test&type=recovery',{access_token:'token'});
 await tick();
 assert.match(page.html(),/data-access-form="newPassword"/);
 assert.match(page.html(),/Confirmar nova senha/);
});

test('evento PASSWORD_RECOVERY mostra a tela mesmo após boot',async()=>{
 const page=stage('',{access_token:'token'});
 await tick();
 page.authEvent('PASSWORD_RECOVERY',{access_token:'token'});
 await tick();
 assert.match(page.html(),/data-access-form="newPassword"/);
});

test('nova senha recuperada é confirmada e atualizada com Supabase Auth',async()=>{
 const page=stage('#access_token=test&type=recovery',{access_token:'token'});
 await tick();
 const form=page.form('newPassword',{password:'senha-muito-forte',confirm:'senha-muito-forte'});
 page.events.submit({target:{closest:()=>form},preventDefault(){}});
 await tick();
 assert.equal(page.status().updatedPassword,'senha-muito-forte');
 assert.equal(page.status().replacedUrl,'https://controle.wadigitallabs.com/');
});

test('link expirado apresenta aviso e limpa parâmetros de erro da URL',async()=>{
 const page=stage('#error=access_denied&error_code=otp_expired');
 await tick();
 assert.match(page.html(),/O link é inválido ou expirou/);
 assert.equal(page.status().clearedUrl,'/');
});

test('sem token de recuperação não mostra formulário de alteração de senha',async()=>{
 const page=stage();
 await tick();
 assert.doesNotMatch(page.html(),/data-access-form="newPassword"/);
});
