import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,access} from 'node:fs/promises';
test('PWA instala arquivos existentes, reabre offline e preserva outros caches',async()=>{
 const root=new URL('../v2/',import.meta.url),scope='https://preview.example/app/',handlers={},cache=new Map(),deleted=[];
 const cacheKey=v=>new URL(typeof v==='string'?v:v.url,scope).href;
 const storage={addAll:async paths=>{for(const req of paths){const name=new URL(req.url).pathname.slice('/app/'.length);await access(new URL(name,root));cache.set(cacheKey(req),{name});}},match:async k=>cache.get(cacheKey(k))};
 const self={registration:{scope},clients:{claim:async()=>{}},addEventListener:(k,v)=>{handlers[k]=v;},skipWaiting:async()=>{}};
 class RequestMock{constructor(url){this.url=cacheKey(url);}}
 vm.runInNewContext(await readFile(new URL('sw.js',root),'utf8'),{self,URL,Request:RequestMock,location:new URL(scope),caches:{open:async()=>storage,keys:async()=>['enc-v2:/app/:old','outra-aplicacao'],delete:async k=>deleted.push(k)},fetch:async()=>{throw new Error('offline');}});
 let wait;handlers.install({waitUntil:p=>wait=p});await wait;handlers.activate({waitUntil:p=>wait=p});await wait;
 assert.deepEqual(deleted,['enc-v2:/app/:old']);let response;const request={url:scope,method:'GET',mode:'navigate',headers:new Headers()};
 handlers.fetch({request,respondWith:p=>response=p});assert.equal((await response).name,'index.html');
 response=undefined;handlers.fetch({request:{...request,headers:new Headers({authorization:'Bearer teste'})},respondWith:p=>response=p});assert.equal(response,undefined);
 handlers.fetch({request:{...request,url:'https://example.supabase.co/rest/v1/a'},respondWith:p=>response=p});assert.equal(response,undefined);
});
