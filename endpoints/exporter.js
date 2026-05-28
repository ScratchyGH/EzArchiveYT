export function exportJSON(videos){
const payload={version:'1.0',exported:new Date().toISOString(),videos};
const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
const url=URL.createObjectURL(blob);
const a=document.createElement('a');
a.href=url;
a.download=`ezarchive-${Date.now()}.json`;
a.click();
setTimeout(()=>URL.revokeObjectURL(url),5000);
}
export function importJSON(file){
return new Promise((res,rej)=>{
const r=new FileReader();
r.onload=e=>{
try{
const data=JSON.parse(e.target.result);
if(!data.videos||!Array.isArray(data.videos))throw new Error('invalid_format');
res(data.videos);
}catch(err){rej(err);}
};
r.onerror=()=>rej(new Error('read_error'));
r.readAsText(file);
});
}
export function exportCSV(videos){
const cols=['id','videoId','title','author','status','addedAt','archivedAt','url','tags'];
const rows=[cols.join(','),...videos.map(v=>cols.map(c=>{
const val=v[c]??'';
const s=String(Array.isArray(val)?val.join(';'):val);
return s.includes(',')||s.includes('"')?`"${s.replace(/"/g,'""')}"`:s;
}).join(','))];
const blob=new Blob([rows.join('\n')],{type:'text/csv'});
const url=URL.createObjectURL(blob);
const a=document.createElement('a');
a.href=url;
a.download=`ezarchive-${Date.now()}.csv`;
a.click();
setTimeout(()=>URL.revokeObjectURL(url),5000);
}
