let prompts=[], activeCat='全部', searchTimer=null, isComposing=false, isLoading=false; const $=s=>document.querySelector(s);
const esc=s=>(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
async function api(url,opt){const r=await fetch(url,opt);const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.error||'请求失败');return j}
function setSync(text,state='ok',detail='Cloudflare ↔ 飞书'){ $('#syncText').textContent=text;$('#syncDetail').textContent=detail;$('#dot').className='dot '+state; }
function render(){const q=$('#search').value.trim().toLowerCase(); const filter=$('#categoryFilter').value; const list=prompts.filter(p=>(activeCat==='全部'||p.category===activeCat)&&(filter==='全部分类'||p.category===filter)&&(!q||[p.title,p.category,(p.tags||[]).join(' '),p.content].join(' ').toLowerCase().includes(q))); $('#count').textContent=`${list.length} 条提示词`; $('#grid').innerHTML=list.map(p=>`<article class="card"><div><h3>${esc(p.title)}</h3><div class="chips"><span class="chip">${esc(p.category)}</span>${(p.tags||[]).slice(0,4).map(t=>`<span class="chip">#${esc(t)}</span>`).join('')}</div></div><div class="preview">${esc(p.content)}</div><div class="card-actions"><button onclick="copyPrompt('${p.id}')">复制</button><div><button onclick="editPrompt('${p.id}')">编辑</button><button onclick="removePrompt('${p.id}')">删除</button></div></div></article>`).join('')||'<p>没有符合条件的提示词。</p>';}
function rebuildCats(){const cats=[...new Set(prompts.map(p=>p.category||'未分类'))].sort();$('#cats').innerHTML=cats.map(c=>`<button class="nav" data-cat="${esc(c)}"># ${esc(c)}</button>`).join('');$('#categoryFilter').innerHTML='<option>全部分类</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{activeCat=b.dataset.cat;document.querySelectorAll('[data-cat]').forEach(x=>x.classList.toggle('active',x.dataset.cat===activeCat));render()})}
async function load(fresh=false){
  if(isLoading)return;
  isLoading=true;
  try{
    setSync('同步中…','');
    const j=await api('/api/prompts'+(fresh?'?fresh=1':''));
    prompts=j.items;
    rebuildCats();
    render();
    setSync('已同步','ok',`刚刚 · ${prompts.length} 条`);
  }catch(e){
    setSync('同步失败','err',e.message);
  }finally{
    isLoading=false;
  }
}
window.copyPrompt=async id=>{const p=prompts.find(x=>x.id===id);await navigator.clipboard.writeText(p.content);setSync('已复制','ok',p.title)};
window.editPrompt=id=>{const p=prompts.find(x=>x.id===id);$('#pid').value=p.id;$('#title').value=p.title;$('#category').value=p.category;$('#tags').value=(p.tags||[]).join('，');$('#content').value=p.content;$('#modalTitle').textContent='编辑提示词';$('#editor').showModal()};
window.removePrompt=async id=>{if(!confirm('删除后会同时从飞书同步文档中删除，确定吗？'))return;try{setSync('正在删除并同步…','');await api('/api/prompts/'+id,{method:'DELETE'});await load()}catch(e){setSync('删除失败','err',e.message)}};
$('#newBtn').onclick=()=>{$('#pid').value='';$('#title').value='';$('#category').value='未分类';$('#tags').value='';$('#content').value='';$('#modalTitle').textContent='新建提示词';$('#editor').showModal()};
$('#saveBtn').onclick=async()=>{const id=$('#pid').value;const body={title:$('#title').value.trim(),category:$('#category').value.trim()||'未分类',tags:$('#tags').value.split(/[,，]/).map(s=>s.trim()).filter(Boolean),content:$('#content').value};if(!body.title)return alert('请输入标题');try{setSync('正在保存并同步飞书…','');await api(id?'/api/prompts/'+id:'/api/prompts',{method:id?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});$('#editor').close();await load()}catch(e){setSync('保存失败','err',e.message)}};
const search=$('#search');
function scheduleSearch(){
  if(isComposing)return;
  clearTimeout(searchTimer);
  searchTimer=setTimeout(render,120);
}
search.addEventListener('compositionstart',()=>{isComposing=true});
search.addEventListener('compositionend',()=>{isComposing=false;scheduleSearch()});
search.addEventListener('input',scheduleSearch);
$('#categoryFilter').onchange=render;
$('#pullBtn').onclick=()=>load(true);
$('#syncBtn').onclick=async()=>{try{setSync('正在双向同步…','');await api('/api/sync/pull',{method:'POST'});await load();setSync('已同步','ok','飞书 → Cloudflare 完成')}catch(e){setSync('同步失败','err',e.message)}};
(async()=>{
  await load(true);
  let seconds=8;
  try{const c=await api('/api/config');seconds=Math.max(5,c.pollSeconds||8)}catch{}
  setInterval(()=>{
    // 用户正在输入/中文输入法组词/编辑弹窗时，不做后台刷新，避免光标和输入状态被打断。
    if(document.activeElement===search || isComposing || $('#editor').open)return;
    load(true);
  },seconds*1000);
})();
