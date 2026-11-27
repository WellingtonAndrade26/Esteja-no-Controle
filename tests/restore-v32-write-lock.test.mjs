import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const source=readFileSync(new URL('../supabase/functions/restore-v32/index.ts',import.meta.url),'utf8');
const block="if(body?.action==='restore') return respond(";
const preflight="if(body?.action==='preflight'){";
const rpc="p_apply:true";

test('legacy v32 rejects writes before any restore RPC',()=>{
  const guard=source.indexOf(block);
  assert.ok(guard>0,'missing production write lock');
  assert.ok(guard<source.indexOf(preflight),'write lock must precede preflight');
  assert.ok(guard<source.indexOf(rpc),'write lock must precede mutation');
  assert.match(source.slice(guard,guard+240),/423/,'blocked restoration should return HTTP 423');
});
test('read-only preflight and authentication remain present',()=>{
  assert.match(source,/who=await authenticate\(req\)/);
  assert.match(source,/body\?\.action==='preflight'/);
  assert.match(source,/p_apply:false/);
});
