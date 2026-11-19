import {brl} from '../domain/base.js';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const paths={inicio:'M3 11 12 3l9 8 M5 10v11h5v-7h4v7h5V10',contas:'M3 7h18v13H3z M5 7V4h14v3 M16 13h5',extrato:'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',planejamento:'M3 6h18v15H3z M7 3v6 M17 3v6 M3 11h18',cartoes:'M3 5h18v14H3z M3 10h18 M6 15h5',patrimonio:'M3 20h18 M5 17v-4 M10 17V9 M15 17V5 M20 17V3',vales:'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z M15 7v10',conexoes:'M3 9l9-6 9 6z M6 11v7 M12 11v7 M18 11v7 M3 21h18',copiloto:'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',ajustes:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',mais:'M4 12h2 M11 12h2 M18 12h2',up:'M5 17 17 5 M8 5h9v9',down:'M5 7l12 12 M8 19h9v-9'};
export const icon=k=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[k]+'"/></svg>';
export const pages={inicio:'Visão geral',extrato:'Extrato',contas:'Minhas contas',planejamento:'Planejamento',cartoes:'Cartões',patrimonio:'Patrimônio',vales:'Vales',conexoes:'Conexões financeiras',copiloto:'Copiloto',ajustes:'Configurações',mais:'Mais'};
export const dateLabel=d=>d?.split('-').reverse().join('/')||'—';
export const btn=(text,action,id='',primary=false)=>'<button class="btn '+(primary?'primary':'ghost')+'" data-action="'+esc(action)+'" data-id="'+esc(id)+'">'+esc(text)+'</button>';
export const nav=(key,title=pages[key])=>'<a class="nav-link" href="#'+key+'">'+icon(key)+'<span>'+esc(title)+'</span></a>';
export const panel=(title,body)=>'<section class="panel stack"><h2>'+esc(title)+'</h2>'+body+'</section>';
export const list=rows=>rows.length?'<ul class="list">'+rows.join('')+'</ul>':'<p class="empty">Nenhum registro neste período.</p>';
export const row=(name,detail,value='',actions='')=>'<li class="row"><div class="row-main"><strong class="wrap">'+esc(name)+'</strong><small>'+esc(detail)+'</small></div><div class="actions"><b class="amount">'+esc(value)+'</b>'+actions+'</div></li>';
export const metric=(name,value,detail,i)=>'<article class="metric"><span class="mini-icon">'+icon(i)+'</span><small>'+esc(name)+'</small><strong class="amount">'+brl(value)+'</strong><small>'+esc(detail)+'</small></article>';
export const head=(title,actions='')=>'<div class="page-head"><h1>'+esc(title)+'</h1><div class="actions">'+actions+'</div></div>';
export function chart(points){
  if(!points.length)return '<p class="empty">Cadastre uma conta para projetar o saldo.</p>';
  const values=points.map(p=>p.value),min=Math.min(...values),max=Math.max(...values),spread=max-min||Math.max(Math.abs(max)*.1,100);
  const span=points.map((p,i)=>[4+i*592/Math.max(1,points.length-1),100-(p.value-min)*78/spread].map(v=>v.toFixed(1)).join(','));
  return '<figure class="chart"><svg viewBox="0 0 600 120" role="img" aria-label="'+esc('Saldo mínimo '+brl(min)+' e máximo '+brl(max))+'"><path class="gridline" d="M0 25H600 M0 65H600 M0 103H600"/><polygon points="4,120 '+span.join(' ')+' 596,120" fill="#83e9ad" opacity=".09"/><polyline points="'+span.join(' ')+'" fill="none" stroke="#9af1ba" stroke-width="3" vector-effect="non-scaling-stroke"/></svg><figcaption><span>Hoje</span><span>'+dateLabel(points.at(-1).date)+' · '+brl(points.at(-1).value)+'</span></figcaption></figure>';
}
