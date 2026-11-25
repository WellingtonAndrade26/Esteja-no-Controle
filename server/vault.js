// Envelope for partner tokens. Keys are held by the server secret manager, independently
// of the database. AAD prevents using an envelope for another owner, provider or connection.
const enc=new TextEncoder(),dec=new TextDecoder();
const to64=bytes=>btoa(String.fromCharCode(...bytes));
const from64=v=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
async function key(ring,kid){
 const bytes=ring[kid] && from64(ring[kid]);
 if(!bytes||bytes.length!==32)throw new Error('Chave de integração indisponível.');
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
function aad(context,kid){return enc.encode(JSON.stringify([context.owner,context.connection,context.provider,kid]));}
export async function seal(value,context,kid,ring){
 const iv=crypto.getRandomValues(new Uint8Array(12)),k=await key(ring,kid);
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(context,kid)},k,enc.encode(JSON.stringify(value)));
 return {kid,iv:to64(iv),cipher:to64(new Uint8Array(cipher))};
}
export async function unseal(envelope,context,ring){
 const k=await key(ring,envelope.kid);
 const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(envelope.iv),additionalData:aad(context,envelope.kid)},k,from64(envelope.cipher));
 return JSON.parse(dec.decode(raw));
}
