import {build} from 'esbuild';
import {readFile,writeFile,mkdir,cp,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=new URL('../',import.meta.url).pathname;
process.chdir(root);
await rm('dist',{force:true,recursive:true});
await mkdir('dist',{recursive:true});
await cp('v2','dist',{recursive:true});
const url=process.env.ENC_V2_URL||'',key=process.env.ENC_V2_PUBLIC_KEY||'';
if((url||key)&&(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)||!key.startsWith('sb_publishable_')))throw Error('Configure a URL HTTPS do Supabase e uma chave pública sb_publishable_.');
await writeFile('dist/config.js','globalThis.ENC_V2 = '+JSON.stringify({url,key})+';\n');
if(url){const index=await readFile('dist/index.html','utf8');await writeFile('dist/index.html',index.replace('https://iyfknonepcarerlpcxlu.supabase.co',url));}
await build({stdin:{contents:"export {createClient} from '@supabase/supabase-js';",resolveDir:root},outfile:'dist/vendor/auth.js',bundle:true,platform:'browser',format:'esm',minify:true});
await build({entryPoints:['server/edge.js'],define:{BUILD_ALLOWED_ORIGINS:JSON.stringify(process.env.ENC_BUILD_ALLOWED_ORIGINS||'')},outfile:'supabase/functions/finance-v2/index.ts',bundle:true,platform:'neutral',format:'esm',target:'es2022',banner:{js:'// Generated from server/edge.js by npm run build.'}});
const files=(await readdir('dist',{recursive:true,withFileTypes:true})).filter(d=>d.isFile()&&d.name!=='sw.js').map(d=>'./'+path.relative('dist',path.join(d.parentPath,d.name))).sort();
const hash=createHash('sha256');
for(const file of files){hash.update(file);hash.update(await readFile('dist/'+file));}
const template=await readFile('scripts/sw.template','utf8');
await writeFile('dist/sw.js',template.replace('__HASH__',hash.digest('hex').slice(0,16)).replace('__FILES__',JSON.stringify(files)));
console.log('App, autenticação, Edge Function e cache versionado gerados.');
// The GitHub Pages subdirectory also runs directly, without copying build-only SDK assets.
const sourceFiles=files.filter(f=>!f.startsWith('./vendor/'));
if(!url)await writeFile('v2/sw.js',template.replace('__HASH__','source-'+createHash('sha256').update(await readFile('dist/sw.js')).digest('hex').slice(0,16)).replace('__FILES__',JSON.stringify(sourceFiles)));
