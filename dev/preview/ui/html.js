import {brl} from '../domain/base.js';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const paths={arrow:'M6 18 18 6 M7 6h11v11',inicio:'M3 11 12 3l9 8 M5 10v11h5v-7h4v7h5V10',contas:'M3 7h18v13H3z M5 7V4h14v3 M16 13h5',extrato:'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',planejamento:'M3 6h18v15H3z M7 3v6 M17 3v6 M3 11h18',cartoes:'M3 5h18v14H3z M3 10h18 M6 15h5',patrimonio:'M3 20h18 M5 17v-4 M10 17V9 M15 17V5 M20 17V3',vales:'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z M15 7v10',conexoes:'M3 9l9-6 9 6z M6 11v7 M12 11v7 M18 11v7 M3 21h18',copiloto:'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',ajustes:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',mais:'M4 12h2 M11 12h2 M18 12h2',up:'M5 17 17 5 M8 5h9v9',down:'M5 7l12 12 M8 19h9v-9'};
export const icon=k=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[k]+'"/></svg>';
export const pages={inicio:'Visão geral',extrato:'Movimentações',contas:'Contas',planejamento:'Planejamento',cartoes:'Cartões',patrimonio:'Patrimônio',vales:'Vales',conexoes:'Open Finance',copiloto:'IA Financeira',ajustes:'Configurações',mais:'Mais'};
export const dateLabel=d=>d?.split('-').reverse().join('/')||'—';
export const btn=(text,action,id='',primary=false)=>'<button class="btn '+(primary?'primary':'ghost')+'" data-action="'+esc(action)+'" data-id="'+esc(id)+'">'+esc(text)+'</button>';
export const nav=(key,title=pages[key])=>'<a class="nav-link" href="#'+key+'">'+icon(key)+'<span>'+esc(title)+'</span></a>';
export const panel=(title,body,extra='')=>'<section class="panel stack"><div class="panel-title"><h2>'+esc(title)+'</h2>'+extra+'</div>'+body+'</section>';
export const list=rows=>rows.length?'<ul class="list">'+rows.join('')+'</ul>':'<p class="empty">Nenhum registro nesta área.</p>';
export const row=(name,detail,value='',actions='')=>'<li class="row"><div class="row-main"><strong class="wrap">'+esc(name)+'</strong><small>'+esc(detail)+'</small></div><div class="actions"><b class="amount '+(String(value).startsWith('+ ')?'inflow':String(value).startsWith('− ')?'outflow':'')+'">'+esc(value)+'</b>'+actions+'</div></li>';
export const metric=(name,value,detail,i,sign='')=>'<article class="metric tone-'+i+'"><div class="metric-top"><span class="mini-icon glass-tile">'+icon(i)+'</span><h3>'+esc(name)+'</h3></div><strong class="amount">'+(value>0?sign:'')+brl(value)+'</strong><small>'+esc(detail)+'</small></article>';
export const head=(title,actions='',subtitle='')=>'<div class="page-head"><div class="page-title"><h1>'+esc(title)+'</h1>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+'</div><div class="actions">'+actions+'</div></div>';
export const sectionTabs=(page,current,items)=>'<div class="section-tabs" role="tablist" aria-label="Seções de '+esc(pages[page]||page)+'">'+items.map(([id,label])=>'<button type="button" role="tab" aria-selected="'+(current===id)+'" data-action="section-tab" data-id="'+esc(page+':'+id)+'">'+esc(label)+'</button>').join('')+'</div>';
export function chart(points) {
  if (!points.length) return '<p class="empty">Cadastre uma conta para projetar o saldo.</p>';
  const values = points.map(p=>p.value), low = Math.min(...values), high = Math.max(...values);
  const margin = (high-low)*.12 || Math.max(100,Math.abs(high)*.05);
  const floor=low-margin, ceiling=high+margin, width=480, height=116;
  const x=i=>points.length===1 ? 0 : width*i/(points.length-1);
  const y=v=>((ceiling-v)/(ceiling-floor)*height).toFixed(2);
  const line='M0 '+y(values[0])+values.slice(1).map((v,i)=>'H'+x(i+1).toFixed(2)+'V'+y(v)).join('');
  const last=points.at(-1), endX=x(points.length-1);
  const labels=[ceiling,(ceiling+floor)/2,floor].map(v=>'<span>'+brl(Math.round(v))+'</span>').join('');
  const dates=[0,Math.floor((points.length-1)/2),points.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  return '<figure class="chart"><figcaption><span>Saldo ao fim do período</span><strong>'+brl(last.value)+'</strong></figcaption>'+
    '<div class="plot"><div class="y-axis" aria-hidden="true">'+labels+'</div><div class="canvas"><svg viewBox="-2 -3 484 122" preserveAspectRatio="none" role="img" aria-label="'+esc('Saldo mínimo '+brl(low)+', máximo '+brl(high)+', final '+brl(last.value))+'"><defs><linearGradient id="cash-fill" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#4bdaf5" stop-opacity=".26"/><stop offset="1" stop-color="#4bdaf5" stop-opacity=".015"/></linearGradient></defs>'+
    '<path class="gridline" d="M0 0H480 M0 58H480 M0 116H480"/><path d="'+line+'V116H0Z" fill="url(#cash-fill)"/><path d="'+line+'" class="trace"/><circle cx="'+endX+'" cy="'+y(last.value)+'" r="3" fill="#aff5ff"/></svg>'+
    '<div class="x-axis">'+dates.map(i=>'<span>'+(i===0?'Hoje':dateLabel(points[i].date).slice(0,5))+'</span>').join('')+'</div></div></div></figure>';
}
