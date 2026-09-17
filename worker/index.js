const FEISHU='https://open.feishu.cn/open-apis';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status}}
let cachedToken;
let cachedTables={until:0,items:[]};

function needEnv(env){
  if(!env.FEISHU_APP_ID||!env.FEISHU_APP_SECRET)throw new ApiError('后台尚未配置 FEISHU_APP_ID / FEISHU_APP_SECRET',503);
  if(!baseToken(env))throw new ApiError('后台尚未配置 FEISHU_BASE_TOKEN',503);
}
function baseToken(env){
  const direct=String(env.FEISHU_BASE_TOKEN||'').trim();
  if(direct)return direct;
  const raw=String(env.FEISHU_BASE_URL||'').trim();
  const m=raw.match(/\/base\/([A-Za-z0-9_-]+)/);
  return m?.[1]||'';
}
function checkOrigin(request){if(!['GET','HEAD'].includes(request.method)){const o=request.headers.get('origin');if(o&&o!==new URL(request.url).origin)throw new ApiError('不允许跨站写入',403)}}
async function token(env){if(cachedToken?.until>Date.now())return cachedToken.value;const r=await fetch(`${FEISHU}/auth/v3/tenant_access_token/internal`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app_id:env.FEISHU_APP_ID,app_secret:env.FEISHU_APP_SECRET})});const d=await r.json();if(!r.ok||d.code!==0)throw new ApiError(`飞书授权失败：${d.msg||r.status}`,502);cachedToken={value:d.tenant_access_token,until:Date.now()+Math.max(0,(d.expire||7200)-120)*1000};return cachedToken.value}
async function fs(env,path,opt={}){const r=await fetch(FEISHU+path,{...opt,headers:{...(opt.body instanceof FormData?{}:{'content-type':'application/json'}),'authorization':`Bearer ${await token(env)}`,...(opt.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok||d.code!==0)throw new ApiError(`飞书请求失败（${d.code||r.status}）：${d.msg||'请检查应用权限'}`,r.status===429?429:r.status===403?403:502);return d.data||{}}
async function all(env,path,size=100){let items=[],page='',seen=new Set();do{const q=new URLSearchParams({page_size:String(size)});if(page)q.set('page_token',page);const d=await fs(env,`${path}${path.includes('?')?'&':'?'}${q}`);items.push(...(d.items||[]));page=d.has_more?d.page_token:'';if(d.has_more&&(!page||seen.has(page)))throw new ApiError('飞书分页返回异常',502);seen.add(page)}while(page);return items}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v}
export function slugify(s=''){return String(s).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)}
export async function revision(fields){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(stable(fields))));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const roleDefs={title:['Subject','提示词名称','名称','标题','作品名称'],cover:['Image Preview','ImagePreview','预览图','效果图','参考图','封面','封面图片','图片'],prompt:['Lang_ZH','LangZH','中文提示词','正向提示词','提示词','Prompt','prompt'],negative:['Lang_NEG','Negative','负向提示词','反向提示词','Negative Prompt','negative prompt'],category:['分类','提示词分类','类型'],style:['风格','画风','风格分类'],model:['绘画工具','模型','生成模型','AI模型','平台'],tags:['标签','Tag','Tags'],source:['来源','来源链接','参考链接','原文链接'],status:['状态','提示词状态'],notes:['备注','说明','描述']};
export function autoMapping(fields=[]){const map={};for(const [role,names] of Object.entries(roleDefs)){let f=fields.find(x=>names.includes(x.field_name));if(!f&&role==='title')f=fields.find(x=>x.is_primary)||fields.find(x=>/^subject$/i.test(x.field_name||''));if(!f&&role==='cover')f=fields.find(x=>x.type===17&&/(image|preview|预览|封面|图片)/i.test(x.field_name||''))||fields.find(x=>x.type===17);if(!f&&role==='prompt')f=fields.find(x=>/lang[_-]?zh|中文.*提示|prompt.*zh/i.test(x.field_name||''));if(!f&&role==='model')f=fields.find(x=>/绘画工具|生成工具|模型|model|tool/i.test(x.field_name||''));if(!f&&role==='source')f=fields.find(x=>/来源|source/i.test(x.field_name||''));if(f)map[role]=f.field_name}return map}
function csvSet(v){return new Set(String(v||'').split(/[,，\n]/).map(x=>x.trim()).filter(Boolean))}
async function tables(env,force=false){
  if(!force&&cachedTables.until>Date.now())return cachedTables.items;
  const app=baseToken(env),items=await all(env,`/bitable/v1/apps/${app}/tables`);
  const allow=csvSet(env.FEISHU_TABLE_ALLOWLIST),hidden=csvSet(env.FEISHU_TABLE_HIDDEN);
  let out=items.filter(t=>!hidden.has(t.table_id)&&!hidden.has(t.name));
  if(allow.size)out=out.filter(t=>allow.has(t.table_id)||allow.has(t.name));
  cachedTables={until:Date.now()+60000,items:out};
  return out;
}
function pageFromTable(t,index=0){return{id:t.table_id,name:t.name||`数据表 ${index+1}`,slug:t.table_id,description:'',icon:'✦',sort_order:index,enabled:true,display:{}}}
async function pageBySlug(env,slug){const ts=await tables(env);const t=ts.find(x=>x.table_id===slug);if(!t)throw new ApiError('数据表不存在或已被后台隐藏',404);const fields=await all(env,`/bitable/v1/apps/${baseToken(env)}/tables/${t.table_id}/fields`);return{...pageFromTable(t,ts.indexOf(t)),mapping:autoMapping(fields),fields}}
function publicPage(p){return{id:p.id,name:p.name,slug:p.slug,description:p.description||'',icon:p.icon||'✦',sort_order:p.sort_order||0,enabled:true,mapping:p.mapping||{},display:p.display||{}}}
async function liveData(env,page){const base=`/bitable/v1/apps/${baseToken(env)}/tables/${page.id}`;const fields=page.fields||await all(env,base+'/fields');const records=await all(env,base+'/records',500);return{fields,records:await Promise.all(records.map(async r=>({...r,revision:await revision(r.fields||{})})))}}
function writeable(fields){return new Set(fields.filter(f=>!f.is_computed&&[1,2,3,4,5,7,13,15,17,18,21].includes(f.type)).map(f=>f.field_name))}
async function assetResponse(request,env){let r=await env.ASSETS.fetch(request);if(r.status!==404)return r;const u=new URL(request.url);u.pathname='/index.html';return env.ASSETS.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}))}

export default{async fetch(request,env){const u=new URL(request.url);if(!u.pathname.startsWith('/api/'))return assetResponse(request,env);try{needEnv(env);checkOrigin(request);
  if(u.pathname==='/api/site'&&request.method==='GET'){
    const ts=await tables(env);
    return json({title:String(env.SITE_TITLE||'AI Prompt Gallery'),subtitle:String(env.SITE_SUBTITLE||'灵感、提示词与视觉参考'),pages:ts.map(pageFromTable),source:'feishu',autoTables:true});
  }
  if(u.pathname==='/api/health'&&request.method==='GET')return json({ok:true,feishu:true,baseToken:true,tables:(await tables(env)).length});

  const pageDataMatch=u.pathname.match(/^\/api\/page\/([^/]+)\/data$/);
  if(pageDataMatch&&request.method==='GET'){const page=await pageBySlug(env,decodeURIComponent(pageDataMatch[1]));const data=await liveData(env,page);return json({page:publicPage(page),...data})}

  const recMatch=u.pathname.match(/^\/api\/page\/([^/]+)\/records(?:\/([^/]+))?$/);
  if(recMatch){const page=await pageBySlug(env,decodeURIComponent(recMatch[1]));const rid=recMatch[2]||'';const base=`/bitable/v1/apps/${baseToken(env)}/tables/${page.id}`;
    if(request.method==='POST'){const body=await request.json(),allowed=writeable(page.fields);if(!body.fields||Object.keys(body.fields).some(k=>!allowed.has(k)))throw new ApiError('包含不可写字段');const d=await fs(env,base+'/records',{method:'POST',body:JSON.stringify({fields:body.fields})});return json(d)}
    if(['PUT','DELETE'].includes(request.method)){if(!/^rec[A-Za-z0-9_-]+$/.test(rid))throw new ApiError('记录标识无效');const body=await request.json();if(!body.revision)throw new ApiError('缺少编辑版本',409);const cur=await fs(env,`${base}/records/${rid}`);if(await revision(cur.record.fields||{})!==body.revision)throw new ApiError('这条记录已在飞书或其他窗口修改，请同步后重试',409);if(request.method==='DELETE'){await fs(env,`${base}/records/${rid}`,{method:'DELETE'});return json({success:true})}const allowed=writeable(page.fields);if(!body.fields||Object.keys(body.fields).some(k=>!allowed.has(k)))throw new ApiError('包含不可写字段');const d=await fs(env,`${base}/records/${rid}`,{method:'PUT',body:JSON.stringify({fields:body.fields})});return json(d)}
  }

  const mediaMatch=u.pathname.match(/^\/api\/page\/([^/]+)\/media$/);
  if(mediaMatch&&request.method==='GET'){const page=await pageBySlug(env,decodeURIComponent(mediaMatch[1]));const ft=(u.searchParams.get('file_token')||'').trim(),field=(u.searchParams.get('field_id')||'').trim(),record=(u.searchParams.get('record_id')||'').trim();if(!ft||!field||!record)throw new ApiError('附件上下文不完整',400);const extra=JSON.stringify({bitablePerm:{tableId:page.id,attachments:{[field]:{[record]:[ft]}}}});const mu=new URL(`${FEISHU}/drive/v1/medias/${encodeURIComponent(ft)}/download`);mu.searchParams.set('extra',extra);const r=await fetch(mu,{headers:{authorization:`Bearer ${await token(env)}`}});if(!r.ok){let detail='';try{const d=await r.clone().json();detail=d.msg||d.message||''}catch{}throw new ApiError(`图片读取失败（${r.status}）：${detail||'请检查飞书附件权限'}`,r.status===400?400:r.status===403?403:502)}return new Response(r.body,{headers:{'content-type':r.headers.get('content-type')||'application/octet-stream','cache-control':'private,max-age=21600','x-content-type-options':'nosniff'}})}

  const uploadMatch=u.pathname.match(/^\/api\/page\/([^/]+)\/media\/upload$/);
  if(uploadMatch&&request.method==='POST'){await pageBySlug(env,decodeURIComponent(uploadMatch[1]));const form=await request.formData(),file=form.get('file');if(!file||typeof file==='string')throw new ApiError('请选择图片');if(!file.type?.startsWith('image/'))throw new ApiError('仅支持图片');if(file.size>20*1024*1024)throw new ApiError('图片不能超过 20MB');const fd=new FormData();fd.set('file_name',file.name||`prompt-${Date.now()}.png`);fd.set('parent_type','bitable_image');fd.set('parent_node',baseToken(env));fd.set('size',String(file.size));fd.set('file',file,file.name||`prompt-${Date.now()}.png`);const r=await fetch(`${FEISHU}/drive/v1/medias/upload_all`,{method:'POST',headers:{authorization:`Bearer ${await token(env)}`},body:fd});let d={};try{d=await r.json()}catch{}if(!r.ok||d.code!==0||!d.data?.file_token)throw new ApiError(`图片上传失败：${d.msg||r.status}`,502);return json({file_token:d.data.file_token})}

  return json({message:'接口不存在'},404)
}catch(e){return json({message:e.message||'服务器错误'},e.status||500)}}};
