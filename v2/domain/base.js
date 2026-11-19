export const assert = (condition, message) => { if (!condition) throw new Error(message); };
export function integer(value, min, max, label) {
  assert(Number.isSafeInteger(value) && value >= min && value <= max, label);
  return value;
}
export const cents = (v, min = 1) => integer(v, min, 999_999_999_999, 'Valor em centavos inválido.');
export function parseMoney(raw) {
  const value = String(raw).trim().replace(/\s/g, '');
  assert(/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value), 'Use o formato 1.234,56.');
  const [whole, part = ''] = value.replaceAll('.', '').replace('-', '').split(',');
  return cents((value.startsWith('-') ? -1 : 1) * (Number(whole) * 100 + Number(part.padEnd(2,'0'))), -999_999_999_999);
}
export const brl = v => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(v / 100);
export function dateKey(value) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1900-01-01' && value <= '2199-12-31', 'Data inválida.');
  const date = new Date(value + 'T12:00:00Z');
  assert(!Number.isNaN(+date) && date.toISOString().slice(0,10) === value,'Data inválida.');
  return value;
}
export function dayAt(month, day) {
  const [y,m] = month.split('-').map(Number);
  return month + '-' + String(Math.min(day, new Date(Date.UTC(y,m,0)).getUTCDate())).padStart(2,'0');
}
export function shift(date, months, anchor = Number(date.slice(8))) {
  const d = new Date(date.slice(0,7)+'-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth()+months);
  return dayAt(d.toISOString().slice(0,7), anchor);
}
export function addDays(date, n) {
  const d = new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10);
}
export function today(d = new Date()) { return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); }
export const sum = (rows, fn = x => x.amount) => {
  const n=rows.reduce((n,x)=>n+fn(x),0); assert(Number.isSafeInteger(n),'Total fora do limite.'); return n;
};
export function split(total, count) {
  cents(total); integer(count,1,600,'Quantidade inválida.'); assert(total >= count,'Cada parcela deve ter pelo menos um centavo.');
  return Array.from({length:count},(_,i)=>Math.floor(total/count)+(i<total%count?1:0));
}
export function label(v) { assert(typeof v==='string' && v.trim().length>0 && v.trim().length<=140,'Informe um nome de até 140 caracteres.'); return v.trim(); }
export function one(rows,id) { const row=rows.find(x=>x.id===id); assert(row,'Registro não encontrado.'); return row; }
export function choose(v, values) { assert(values.includes(v),'Opção inválida.'); return v; }
export const uid = () => crypto.randomUUID();
export const blank = () => ({version:2,accounts:[],entries:[],plans:[],dues:[],rules:[],cards:[],purchases:[],positions:[],benefits:[],connections:[],imports:[],resources:[],logs:[]});
