import{saveVideo,getAllVideos,deleteVideo,clearAll,bulkSave}from'./endpoints/persist.js';
import{Queue}from'./endpoints/queue.js';
import{extractVideoId,parseMultiInput,buildThumbnailUrl,buildWatchUrl,fetchOEmbed,generateId,formatDate,sanitizeTitle}from'./endpoints/parser.js';
import{exportJSON,importJSON,exportCSV}from'./endpoints/exporter.js';
import{cacheMeta,getCachedMeta,cacheSettings,getSettings}from'./endpoints/cache.js';

const state={
videos:[],
queue:[],
filter:{q:'',status:'all',sort:'newest'},
view:'archive',
selected:new Set(),
settings:getSettings()
};

const q=new Queue(2);
let renderPending=false;

function scheduleRender(){
if(renderPending)return;
renderPending=true;
requestAnimationFrame(()=>{renderPending=false;renderApp();});
}

q.on('start',id=>{
const v=state.queue.find(x=>x.id===id)||state.videos.find(x=>x.id===id);
if(v){v.status='processing';saveVideo(v);}
scheduleRender();
});
q.on('done',(id,result)=>{
const idx=state.videos.findIndex(x=>x.id===id);
if(idx>=0){state.videos[idx]={...state.videos[idx],...result,status:'archived',archivedAt:Date.now()};saveVideo(state.videos[idx]);}
state.queue=state.queue.filter(x=>x.id!==id);
scheduleRender();
});
q.on('error',(id,err)=>{
const v=state.videos.find(x=>x.id===id);
if(v){v.status='failed';v.error=err.message;saveVideo(v);}
state.queue=state.queue.filter(x=>x.id!==id);
scheduleRender();
});

async function archiveVideo(entry){
const cached=getCachedMeta(entry.videoId);
if(cached)return{...cached};
const meta=await fetchOEmbed(entry.videoId);
if(!meta)throw new Error('Metadata unavailable');
const result={
title:sanitizeTitle(meta.title),
author:meta.author_name||'Unknown',
thumbnail:buildThumbnailUrl(entry.videoId),
url:buildWatchUrl(entry.videoId),
embedUrl:`https://www.youtube.com/embed/${entry.videoId}`,
width:meta.width,
height:meta.height
};
cacheMeta(entry.videoId,result);
return result;
}

export async function init(){
state.videos=await getAllVideos();
scheduleRender();
setupDragDrop();
}

export async function addFromInput(raw){
const entries=parseMultiInput(raw);
if(!entries.length)return showToast('No valid YouTube URLs detected','warn');
const existing=new Set(state.videos.map(v=>v.videoId));
const fresh=entries.filter(e=>!existing.has(e.id));
if(!fresh.length)return showToast('All URLs already archived','info');
const newVideos=fresh.map(e=>({
id:generateId(),
videoId:e.id,
title:'Fetching...',
author:'',
thumbnail:buildThumbnailUrl(e.id,'default'),
url:buildWatchUrl(e.id),
status:'queued',
addedAt:Date.now(),
archivedAt:null,
tags:[],
notes:'',
error:null
}));
state.videos.unshift(...newVideos);
await bulkSave(newVideos);
newVideos.forEach(v=>{
state.queue.push(v);
q.add({id:v.id,run:()=>archiveVideo(v)});
});
showToast(`Added ${newVideos.length} video${newVideos.length>1?'s':''} to queue`,'success');
scheduleRender();
}

export async function removeVideo(id){
await deleteVideo(id);
state.videos=state.videos.filter(v=>v.id!==id);
state.selected.delete(id);
scheduleRender();
}

export async function removeSelected(){
const ids=[...state.selected];
await Promise.all(ids.map(id=>deleteVideo(id)));
state.videos=state.videos.filter(v=>!state.selected.has(v.id));
state.selected.clear();
scheduleRender();
}

export async function retryVideo(id){
const v=state.videos.find(x=>x.id===id);
if(!v)return;
v.status='queued';v.error=null;
await saveVideo(v);
state.queue.push(v);
q.add({id:v.id,run:()=>archiveVideo(v)});
scheduleRender();
}

export function setFilter(updates){
Object.assign(state.filter,updates);
scheduleRender();
}

export function setView(v){state.view=v;scheduleRender();}

export function toggleSelect(id){
if(state.selected.has(id))state.selected.delete(id);
else state.selected.add(id);
scheduleRender();
}

export function selectAll(){
const filtered=getFilteredVideos();
filtered.forEach(v=>state.selected.add(v.id));
scheduleRender();
}

export function clearSelection(){state.selected.clear();scheduleRender();}

export async function doExportJSON(){exportJSON(state.videos);}
export async function doExportCSV(){exportCSV(state.videos);}

export async function doImport(file){
try{
const videos=await importJSON(file);
const existing=new Set(state.videos.map(v=>v.videoId));
const fresh=videos.filter(v=>v.videoId&&!existing.has(v.videoId));
if(!fresh.length)return showToast('No new videos to import','info');
await bulkSave(fresh);
state.videos=[...fresh,...state.videos];
showToast(`Imported ${fresh.length} video${fresh.length>1?'s':''}`,'success');
scheduleRender();
}catch(e){showToast('Import failed: invalid file','error');}
}

export async function clearArchive(){
if(!confirm('Clear all archived videos? This cannot be undone.'))return;
await clearAll();
state.videos=[];
state.selected.clear();
scheduleRender();
}

function getFilteredVideos(){
let list=[...state.videos];
const{q,status,sort}=state.filter;
if(status!=='all')list=list.filter(v=>v.status===status);
if(q){
const lq=q.toLowerCase();
list=list.filter(v=>
(v.title||'').toLowerCase().includes(lq)||
(v.author||'').toLowerCase().includes(lq)||
(v.videoId||'').toLowerCase().includes(lq)||
(v.tags||[]).some(t=>t.toLowerCase().includes(lq))
);
}
if(sort==='newest')list.sort((a,b)=>b.addedAt-a.addedAt);
else if(sort==='oldest')list.sort((a,b)=>a.addedAt-b.addedAt);
else if(sort==='title')list.sort((a,b)=>(a.title||'').localeCompare(b.title||''));
else if(sort==='author')list.sort((a,b)=>(a.author||'').localeCompare(b.author||''));
return list;
}

function getStats(){
const all=state.videos;
return{
total:all.length,
archived:all.filter(v=>v.status==='archived').length,
queued:all.filter(v=>v.status==='queued'||v.status==='processing').length,
failed:all.filter(v=>v.status==='failed').length
};
}

const icons={
archive:`<svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><rect width="20"height="5"x="2"y="3"rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
queue:`<svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>`,
settings:`<svg width="16"height="16"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12"cy="12"r="3"/></svg>`,
search:`<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><circle cx="11"cy="11"r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
plus:`<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"stroke-linecap="round"stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
trash:`<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
refresh:`<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
external:`<svg width="12"height="12"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
download:`<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12"y1="15"x2="12"y2="3"/></svg>`,
upload:`<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12"y1="3"x2="12"y2="15"/></svg>`,
check:`<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2.2"stroke-linecap="round"stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
x:`<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"stroke-linecap="round"stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
filter:`<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
video:`<svg width="32"height="32"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.4"stroke-linecap="round"stroke-linejoin="round"><rect width="18"height="14"x="3"y="5"rx="2"/><path d="m16 10-4 2-4-2v4l4-2 4 2v-4z"/></svg>`,
loader:`<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="2"stroke-linecap="round"stroke-linejoin="round"class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
tag:`<svg width="11"height="11"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>`,
copy:`<svg width="13"height="13"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><rect width="14"height="14"x="8"y="8"rx="2"ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
info:`<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><circle cx="12"cy="12"r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
warning:`<svg width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"stroke-width="1.8"stroke-linecap="round"stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
};

function statusBadge(s){
const map={archived:'badge-green',queued:'badge-yellow',processing:'badge-blue',failed:'badge-red'};
const labels={archived:'Archived',queued:'Queued',processing:'Processing',failed:'Failed'};
const spin=s==='processing'?icons.loader:'';
return`<span class="badge ${map[s]||'badge-gray'}">${spin}${labels[s]||s}</span>`;
}

let toastTimer=null;
function showToast(msg,type='info'){
clearTimeout(toastTimer);
const el=document.getElementById('toast');
if(!el)return;
const map={success:'toast-success',error:'toast-error',warn:'toast-warn',info:'toast-info'};
const ico={success:icons.check,error:icons.x,warn:icons.warning,info:icons.info};
el.className=`toast ${map[type]||'toast-info'} show`;
el.innerHTML=`<span class="toast-icon">${ico[type]||icons.info}</span><span>${msg}</span>`;
toastTimer=setTimeout(()=>el.classList.remove('show'),3200);
}

function renderSidebar(){
const stats=getStats();
const nav=[
{id:'archive',label:'Archive',icon:icons.archive,count:stats.total},
{id:'queue',label:'Queue',icon:icons.queue,count:stats.queued},
];
return`<aside class="sidebar">
<div class="sidebar-logo"><span class="logo-mark">EZ</span><span class="logo-text">ARCHIVEYT</span></div>
<nav class="sidebar-nav">${nav.map(n=>`
<button class="nav-item${state.view===n.id?' active':''}" onclick="window._app.setView('${n.id}')">
<span class="nav-icon">${n.icon}</span>
<span class="nav-label">${n.label}</span>
${n.count>0?`<span class="nav-badge">${n.count}</span>`:''}
</button>`).join('')}
</nav>
<div class="sidebar-stats">
<div class="stat-row"><span class="stat-label">Total</span><span class="stat-val">${stats.total}</span></div>
<div class="stat-row"><span class="stat-label">Archived</span><span class="stat-val text-green">${stats.archived}</span></div>
<div class="stat-row"><span class="stat-label">Failed</span><span class="stat-val text-red">${stats.failed}</span></div>
</div>
<div class="sidebar-actions">
<button class="sidebar-btn" onclick="window._app.triggerImport()" title="Import JSON">${icons.upload}<span>Import</span></button>
<button class="sidebar-btn" onclick="window._app.doExportJSON()" title="Export JSON">${icons.download}<span>Export JSON</span></button>
<button class="sidebar-btn" onclick="window._app.doExportCSV()" title="Export CSV">${icons.download}<span>Export CSV</span></button>
</div>
</aside>`;
}

function renderAddBar(){
return`<div class="add-bar">
<div class="add-bar-inner">
<div class="add-input-wrap" id="drop-zone">
<span class="add-input-icon">${icons.plus}</span>
<textarea id="url-input" class="add-input" placeholder="Paste YouTube URLs, IDs, or drop a JSON file here — one per line or comma-separated" rows="1" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,140)+'px'" onkeydown="if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();window._app.submitInput();}"></textarea>
</div>
<button class="btn-primary" onclick="window._app.submitInput()">${icons.plus} Add to Queue</button>
</div>
</div>`;
}

function renderToolbar(filtered){
const anySelected=state.selected.size>0;
return`<div class="toolbar">
<div class="toolbar-left">
<div class="search-wrap">
${icons.search}
<input class="search-input" type="text" placeholder="Search videos, authors, IDs..." value="${state.filter.q||''}" oninput="window._app.setFilter({q:this.value})">
</div>
<div class="filter-group">
${icons.filter}
<select class="filter-select" onchange="window._app.setFilter({status:this.value})">
<option value="all"${state.filter.status==='all'?' selected':''}>All Status</option>
<option value="archived"${state.filter.status==='archived'?' selected':''}>Archived</option>
<option value="queued"${state.filter.status==='queued'?' selected':''}>Queued</option>
<option value="processing"${state.filter.status==='processing'?' selected':''}>Processing</option>
<option value="failed"${state.filter.status==='failed'?' selected':''}>Failed</option>
</select>
<select class="filter-select" onchange="window._app.setFilter({sort:this.value})">
<option value="newest"${state.filter.sort==='newest'?' selected':''}>Newest</option>
<option value="oldest"${state.filter.sort==='oldest'?' selected':''}>Oldest</option>
<option value="title"${state.filter.sort==='title'?' selected':''}>Title A-Z</option>
<option value="author"${state.filter.sort==='author'?' selected':''}>Author</option>
</select>
</div>
</div>
<div class="toolbar-right">
<span class="result-count">${filtered.length} video${filtered.length!==1?'s':''}</span>
${anySelected?`
<button class="btn-ghost btn-sm" onclick="window._app.clearSelection()">${icons.x} Clear (${state.selected.size})</button>
<button class="btn-ghost btn-sm text-red" onclick="window._app.removeSelected()">${icons.trash} Delete Selected</button>
`:`<button class="btn-ghost btn-sm" onclick="window._app.selectAll()">Select All</button>`}
${state.videos.length>0?`<button class="btn-ghost btn-sm text-red" onclick="window._app.clearArchive()">${icons.trash} Clear All</button>`:''}
</div>
</div>`;
}

function renderVideoCard(v){
const sel=state.selected.has(v.id);
const thumb=v.thumbnail||buildThumbnailUrl(v.videoId);
return`<div class="video-card${sel?' selected':''}" data-id="${v.id}">
<label class="card-check">
<input type="checkbox"${sel?' checked':''} onchange="window._app.toggleSelect('${v.id}')">
<span class="checkmark">${sel?icons.check:''}</span>
</label>
<div class="card-thumb" onclick="window._app.openPreview('${v.id}')">
<img src="${thumb}" alt="" loading="lazy" onerror="this.parentElement.classList.add('thumb-err');this.remove()">
<div class="thumb-overlay">${icons.video}</div>
</div>
<div class="card-body">
<div class="card-header">
<span class="card-title" title="${(v.title||'').replace(/"/g,'&quot;')}">${v.title||'Untitled'}</span>
${statusBadge(v.status)}
</div>
<div class="card-meta">
${v.author?`<span class="card-author">${v.author}</span>`:''}
<span class="card-id" onclick="navigator.clipboard.writeText('${v.videoId}').then(()=>window._app.toast('ID copied','success'))" title="Copy video ID">${icons.copy} ${v.videoId}</span>
<span class="card-date">${formatDate(v.addedAt)}</span>
</div>
${v.error?`<div class="card-error">${icons.warning} ${v.error}</div>`:''}
${v.tags&&v.tags.length?`<div class="card-tags">${v.tags.map(t=>`<span class="tag">${icons.tag}${t}</span>`).join('')}</div>`:''}
</div>
<div class="card-actions">
<a class="icon-btn" href="${v.url}" target="_blank" rel="noopener" title="Open on YouTube">${icons.external}</a>
${v.status==='failed'?`<button class="icon-btn" onclick="window._app.retryVideo('${v.id}')" title="Retry">${icons.refresh}</button>`:''}
${v.status==='processing'||v.status==='queued'?`<span class="icon-btn icon-btn-spin">${icons.loader}</span>`:''}
<button class="icon-btn icon-btn-danger" onclick="window._app.removeVideo('${v.id}')" title="Remove">${icons.trash}</button>
</div>
</div>`;
}

function renderEmpty(){
return`<div class="empty-state">
<div class="empty-icon">${icons.video}</div>
<div class="empty-title">No videos archived</div>
<div class="empty-sub">Paste YouTube URLs above to start archiving</div>
</div>`;
}

function renderEmptyFilter(){
return`<div class="empty-state">
<div class="empty-icon">${icons.filter}</div>
<div class="empty-title">No results</div>
<div class="empty-sub">Try adjusting your search or filters</div>
</div>`;
}

function renderQueueView(){
const active=state.videos.filter(v=>v.status==='queued'||v.status==='processing');
return`<div class="view-wrap">
<div class="view-header">
<h1 class="view-title">Queue</h1>
<span class="view-sub">${active.length} item${active.length!==1?'s':''} pending</span>
</div>
${active.length===0?`<div class="empty-state"><div class="empty-icon">${icons.queue}</div><div class="empty-title">Queue is empty</div><div class="empty-sub">Add videos from the Archive view</div></div>`:`
<div class="queue-list">
${active.map(v=>`<div class="queue-item">
<div class="queue-thumb"><img src="${v.thumbnail}" alt="" loading="lazy" onerror="this.remove()"></div>
<div class="queue-info">
<span class="queue-title">${v.title||v.videoId}</span>
<span class="queue-id">${v.videoId}</span>
</div>
<div class="queue-status">${statusBadge(v.status)}</div>
<button class="icon-btn icon-btn-danger" onclick="window._app.removeVideo('${v.id}')">${icons.trash}</button>
</div>`).join('')}
</div>`}
</div>`;
}

function renderArchiveView(){
const filtered=getFilteredVideos();
return`<div class="view-wrap">
<div class="view-header">
<h1 class="view-title">Archive</h1>
<span class="view-sub">Your personal video library</span>
</div>
${renderAddBar()}
${renderToolbar(filtered)}
<div class="video-grid" id="video-grid">
${state.videos.length===0?renderEmpty():filtered.length===0?renderEmptyFilter():filtered.map(renderVideoCard).join('')}
</div>
</div>`;
}

function renderModal(){
const id=state.previewId;
if(!id)return'';
const v=state.videos.find(x=>x.id===id);
if(!v)return'';
return`<div class="modal-backdrop" onclick="if(event.target===this)window._app.closePreview()">
<div class="modal">
<div class="modal-header">
<span class="modal-title">${v.title||v.videoId}</span>
<button class="modal-close" onclick="window._app.closePreview()">${icons.x}</button>
</div>
<div class="modal-body">
<div class="embed-wrap">
<iframe src="${v.embedUrl||`https://www.youtube.com/embed/${v.videoId}`}" frameborder="0" allowfullscreen allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"></iframe>
</div>
<div class="modal-meta">
<div class="meta-row"><span class="meta-k">Author</span><span class="meta-v">${v.author||'—'}</span></div>
<div class="meta-row"><span class="meta-k">Video ID</span><span class="meta-v mono">${v.videoId}</span></div>
<div class="meta-row"><span class="meta-k">Status</span><span class="meta-v">${statusBadge(v.status)}</span></div>
<div class="meta-row"><span class="meta-k">Added</span><span class="meta-v">${formatDate(v.addedAt)}</span></div>
${v.archivedAt?`<div class="meta-row"><span class="meta-k">Archived</span><span class="meta-v">${formatDate(v.archivedAt)}</span></div>`:''}
<div class="meta-row"><span class="meta-k">URL</span><span class="meta-v"><a href="${v.url}" target="_blank" rel="noopener" class="link">${v.url}</a></span></div>
</div>
<div class="modal-notes">
<label class="notes-label">Notes</label>
<textarea class="notes-input" placeholder="Add notes..." onchange="window._app.updateNotes('${v.id}',this.value)">${v.notes||''}</textarea>
</div>
<div class="modal-tags">
<label class="notes-label">Tags</label>
<input class="tag-input" type="text" placeholder="Add tags (comma-separated)" value="${(v.tags||[]).join(', ')}" onchange="window._app.updateTags('${v.id}',this.value)">
</div>
</div>
<div class="modal-footer">
<a class="btn-primary btn-sm" href="${v.url}" target="_blank" rel="noopener">${icons.external} Open YouTube</a>
<button class="btn-ghost btn-sm text-red" onclick="window._app.removeVideo('${v.id}');window._app.closePreview()">${icons.trash} Remove</button>
</div>
</div>
</div>`;
}

export async function openPreview(id){state.previewId=id;scheduleRender();}
export function closePreview(){state.previewId=null;scheduleRender();}

export async function updateNotes(id,notes){
const v=state.videos.find(x=>x.id===id);
if(v){v.notes=notes;await saveVideo(v);}
}

export async function updateTags(id,raw){
const v=state.videos.find(x=>x.id===id);
if(v){
v.tags=raw.split(',').map(s=>s.trim()).filter(Boolean);
await saveVideo(v);
scheduleRender();
}
}

function renderApp(){
const root=document.getElementById('app');
if(!root)return;
root.innerHTML=`
${renderSidebar()}
<main class="main">
${state.view==='archive'?renderArchiveView():renderQueueView()}
</main>
${renderModal()}
<div id="toast" class="toast"></div>
<input type="file" id="import-file" accept=".json" style="display:none" onchange="window._app.handleImportFile(this)">
`;
}

function setupDragDrop(){
document.addEventListener('dragover',e=>{
if(e.dataTransfer.types.includes('Files')||e.dataTransfer.types.includes('text/uri-list')||e.dataTransfer.types.includes('text/plain')){
e.preventDefault();
const dz=document.getElementById('drop-zone');
if(dz)dz.classList.add('drag-over');
}
});
document.addEventListener('dragleave',e=>{
if(!document.getElementById('drop-zone')?.contains(e.relatedTarget)){
document.getElementById('drop-zone')?.classList.remove('drag-over');
}
});
document.addEventListener('drop',e=>{
e.preventDefault();
document.getElementById('drop-zone')?.classList.remove('drag-over');
const files=[...e.dataTransfer.files].filter(f=>f.name.endsWith('.json'));
if(files.length){files.forEach(f=>doImport(f));return;}
const text=e.dataTransfer.getData('text/plain')||e.dataTransfer.getData('text/uri-list');
if(text){addFromInput(text);}
});
}

export function triggerImport(){
const el=document.getElementById('import-file');
if(el)el.click();
}

export async function handleImportFile(input){
if(!input.files.length)return;
for(const f of input.files)await doImport(f);
input.value='';
}

export function submitInput(){
const el=document.getElementById('url-input');
if(!el||!el.value.trim())return;
addFromInput(el.value);
el.value='';
el.style.height='auto';
}

window._app={
setView,setFilter,submitInput,
addFromInput,removeVideo,removeSelected,retryVideo,
toggleSelect,selectAll,clearSelection,
doExportJSON,doExportCSV,triggerImport,handleImportFile,
openPreview,closePreview,updateNotes,updateTags,
clearArchive,toast:showToast
};
