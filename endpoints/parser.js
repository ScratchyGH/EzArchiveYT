const YT_PATTERNS=[
/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
/^([a-zA-Z0-9_-]{11})$/
];
export function extractVideoId(url){
if(!url)return null;
const s=url.trim();
for(const p of YT_PATTERNS){
const m=s.match(p);
if(m)return m[1];
}
return null;
}
export function parseMultiInput(raw){
const lines=raw.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
const results=[];
const seen=new Set();
for(const line of lines){
const id=extractVideoId(line);
if(id&&!seen.has(id)){seen.add(id);results.push({id,raw:line});}
}
return results;
}
export function buildThumbnailUrl(id,quality='hqdefault'){
return `https://img.youtube.com/vi/${id}/${quality}.jpg`;
}
export function buildWatchUrl(id){return`https://www.youtube.com/watch?v=${id}`;}
export function buildEmbedUrl(id){return`https://www.youtube.com/embed/${id}`;}
export async function fetchOEmbed(id){
const url=`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
try{
const r=await fetch(url);
if(!r.ok)throw new Error('oembed_fail');
return await r.json();
}catch(e){return null;}
}
export function generateId(){
return Date.now().toString(36)+Math.random().toString(36).slice(2,7);
}
export function formatDuration(s){
if(!s||isNaN(s))return'--:--';
const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
if(h>0)return`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
return`${m}:${String(sec).padStart(2,'0')}`;
}
export function formatDate(ts){
if(!ts)return'';
return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
export function sanitizeTitle(t){
if(!t)return'Untitled';
return t.replace(/[<>]/g,'').trim().slice(0,120);
}
