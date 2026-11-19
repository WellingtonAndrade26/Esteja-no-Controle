import {SandboxProvider} from '../v2/open-finance/provider.js';
// Registration is server-owned. Production adapters implement the same read contracts.
export const providers=new Map([['sandbox',new SandboxProvider()]]);
export function providerFor(id){const p=providers.get(id);if(!p)throw new Error('Provedor indisponível.');return p;}
export async function fetchConsentedPage(connection){
 const p=providerFor(connection.provider),remote=await p.getConsent(connection);
 if(remote.status!=='active')throw new Error('inactive_consent');
 return p.syncConnection({...connection,scopes:connection.scopes.filter(s=>remote.scopes.includes(s))},connection.cursor);
}
