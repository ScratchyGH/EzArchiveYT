const MEM={};
const LS_PREFIX='ezarchive_cache_';
const TTL=1000*60*60*6;
export function memSet(k,v){MEM[k]={v,t:Date.now()};}
export function memGet(k){
const e=MEM[k];
if(!e)return null;
if(Date.now()-e.t>TTL){delete MEM[k];return null;}
return e.v;
}
export function lsSet(k,v){
try{localStorage.setItem(LS_PREFIX+k,JSON.stringify({v,t:Date.now()}));}catch(_){}
}
export function lsGet(k){
try{
const raw=localStorage.getItem(LS_PREFIX+k);
if(!raw)return null;
const e=JSON.parse(raw);
if(Date.now()-e.t>TTL){localStorage.removeItem(LS_PREFIX+k);return null;}
return e.v;
}catch(_){return null;}
}
export function lsDel(k){try{localStorage.removeItem(LS_PREFIX+k);}catch(_){}}
export function cacheMeta(id,data){
memSet('meta_'+id,data);
lsSet('meta_'+id,data);
}
export function getCachedMeta(id){
return memGet('meta_'+id)||lsGet('meta_'+id);
}
export function cacheSettings(s){lsSet('settings',s);}
export function getSettings(){return lsGet('settings')||{};}
