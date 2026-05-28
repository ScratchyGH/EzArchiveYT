const DB_NAME='ezarchive',DB_VER=1,STORE='videos';
let _db=null;
async function openDB(){
if(_db)return _db;
return new Promise((res,rej)=>{
const req=indexedDB.open(DB_NAME,DB_VER);
req.onupgradeneeded=e=>{
const db=e.target.result;
if(!db.objectStoreNames.contains(STORE)){
const s=db.createObjectStore(STORE,{keyPath:'id'});
s.createIndex('status','status',{unique:false});
s.createIndex('addedAt','addedAt',{unique:false});
}
};
req.onsuccess=e=>{_db=e.target.result;res(_db);};
req.onerror=e=>rej(e.target.error);
});
}
export async function saveVideo(v){
const db=await openDB();
return new Promise((res,rej)=>{
const tx=db.transaction(STORE,'readwrite');
tx.objectStore(STORE).put(v);
tx.oncomplete=()=>res(v);
tx.onerror=e=>rej(e.target.error);
});
}
export async function getAllVideos(){
const db=await openDB();
return new Promise((res,rej)=>{
const tx=db.transaction(STORE,'readonly');
const req=tx.objectStore(STORE).getAll();
req.onsuccess=()=>res(req.result||[]);
req.onerror=e=>rej(e.target.error);
});
}
export async function deleteVideo(id){
const db=await openDB();
return new Promise((res,rej)=>{
const tx=db.transaction(STORE,'readwrite');
tx.objectStore(STORE).delete(id);
tx.oncomplete=res;
tx.onerror=e=>rej(e.target.error);
});
}
export async function clearAll(){
const db=await openDB();
return new Promise((res,rej)=>{
const tx=db.transaction(STORE,'readwrite');
tx.objectStore(STORE).clear();
tx.oncomplete=res;
tx.onerror=e=>rej(e.target.error);
});
}
export async function bulkSave(videos){
const db=await openDB();
return new Promise((res,rej)=>{
const tx=db.transaction(STORE,'readwrite');
const st=tx.objectStore(STORE);
videos.forEach(v=>st.put(v));
tx.oncomplete=()=>res(videos);
tx.onerror=e=>rej(e.target.error);
});
}
