import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccount,requestRecovery,updatePassword} from '../v2/auth-flow.js';

const returnUrl='https://controle.wadigitallabs.com/v2/index.html';

test('cadastro preserva confirmação de e-mail e usa retorno da própria origem',async()=>{
  let received;
  const auth={signUp:async args=>{received=args;return {data:{user:{id:'test'},session:null},error:null};}};
  const result=await createAccount(auth,' pessoa@example.com ','senha-super-segura','senha-super-segura',returnUrl);
  assert.equal(result.signedIn,false);
  assert.deepEqual(received,{email:'pessoa@example.com',password:'senha-super-segura',options:{emailRedirectTo:returnUrl}});
});

test('cadastro com sessão ativa é sinalizado para sincronização',async()=>{
  const auth={signUp:async()=>({data:{session:{access_token:'fake'}},error:null})};
  assert.equal((await createAccount(auth,'a@b.com','senhateste','senhateste',returnUrl)).signedIn,true);
});

test('cadastro bloqueia senha curta, divergente e e-mail inválido sem chamar Supabase',async()=>{
  const auth={signUp:()=>{throw Error('Não deve ser chamado.');}};
  await assert.rejects(createAccount(auth,'inválido','senhateste','senhateste',returnUrl),/e-mail válido/);
  await assert.rejects(createAccount(auth,'a@b.com','curta','curta',returnUrl),/8 e 128/);
  await assert.rejects(createAccount(auth,'a@b.com','senhateste','outrasenha',returnUrl),/não coincidem/);
});

test('recuperação não revela se o e-mail existe',async()=>{
  let received;
  const auth={resetPasswordForEmail:async (email,options)=>{received={email,options};return {error:null};}};
  const message=await requestRecovery(auth,' a@b.com ',returnUrl);
  assert.deepEqual(received,{email:'a@b.com',options:{redirectTo:returnUrl}});
  assert.match(message,/Se o e-mail estiver cadastrado/);
});

test('falha na recuperação não expõe detalhes internos do provedor',async()=>{
  const auth={resetPasswordForEmail:async()=>({error:{message:'user not found'}})};
  await assert.rejects(requestRecovery(auth,'a@b.com',returnUrl),e=>!e.message.includes('user not found'));
});

test('alteração da senha só envia senha confirmada ao Supabase',async()=>{
  let sent;
  const auth={updateUser:async payload=>{sent=payload;return {error:null};}};
  await assert.rejects(updatePassword(auth,'senhateste','não bate'),/não coincidem/);
  const result=await updatePassword(auth,'nova-senha-forte','nova-senha-forte');
  assert.deepEqual(sent,{password:'nova-senha-forte'});
  assert.match(result,/sucesso/);
});
