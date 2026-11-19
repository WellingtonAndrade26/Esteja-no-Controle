import test from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal} from '../server/vault.js';
test('cofre segrega titular, conexão e versão da chave',async()=>{const ring={v1:Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')},ctx={owner:'a',connection:'c',provider:'p'},v=await seal({access:'synthetic'},ctx,'v1',ring);assert.deepEqual(await unseal(v,ctx,ring),{access:'synthetic'});await assert.rejects(()=>unseal(v,{...ctx,owner:'b'},ring));await assert.rejects(()=>unseal(v,{...ctx,connection:'d'},ring));await assert.rejects(()=>unseal({...v,kid:'v2'},ctx,ring));});
