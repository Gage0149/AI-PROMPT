interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  FEISHU_DOCUMENT_ID: string;
  FEISHU_VERIFICATION_TOKEN?: string;
  SYNC_POLL_SECONDS?: string;
}

type Prompt = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  updatedAt: number;
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

async function getTenantToken(env: Env) {
  const cacheKey = 'feishu_token';
  const row = await env.DB.prepare('SELECT value, updated_at FROM sync_state WHERE key=?').bind(cacheKey).first<any>();
  if (row && Date.now() - Number(row.updated_at) < 90 * 60 * 1000) return row.value;

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET })
  });
  const body: any = await res.json();
  if (!res.ok || !body.tenant_access_token) throw new Error(`飞书鉴权失败: ${body.msg || res.status}`);
  await env.DB.prepare('INSERT INTO sync_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind(cacheKey, body.tenant_access_token, Date.now()).run();
  return body.tenant_access_token as string;
}

async function feishu(env: Env, path: string, init: RequestInit = {}) {
  const token = await getTenantToken(env);
  const res = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || (body.code !== undefined && body.code !== 0)) {
    throw new Error(`飞书 API 失败: ${body.msg || res.status} (${body.code ?? 'HTTP'})`);
  }
  return body;
}

function textOfBlock(block: any) {
  const rich = block.heading1 || block.heading2 || block.heading3 || block.text || block.bullet || block.ordered;
  return (rich?.elements || []).map((e: any) => e.text_run?.content || '').join('');
}

function parsePrompts(blocks: any[]): Prompt[] {
  const prompts: Prompt[] = [];
  let current: Prompt | null = null;
  let inContent = false;

  for (const b of blocks) {
    const text = textOfBlock(b).trimEnd();
    const marker = text.match(/^\[prompt:([^\]]+)\]\s*(.*)$/i);
    if (b.block_type === 4 && marker) { // heading2
      if (current) prompts.push(current);
      current = {
        id: marker[1].trim(),
        title: marker[2].trim() || marker[1].trim(),
        category: '未分类',
        tags: [],
        content: '',
        updatedAt: Date.now()
      };
      inContent = false;
      continue;
    }
    if (!current) continue;
    if (text.startsWith('分类：')) { current.category = text.slice(3).trim() || '未分类'; continue; }
    if (text.startsWith('标签：')) { current.tags = text.slice(3).split(/[,，]/).map(s => s.trim()).filter(Boolean); continue; }
    if (text === '---') { inContent = true; continue; }
    if (inContent && text) current.content += (current.content ? '\n' : '') + text;
  }
  if (current) prompts.push(current);
  return prompts;
}

function richTextBlock(text: string) {
  return { block_type: 2, text: { elements: [{ text_run: { content: text, text_element_style: {} } }], style: {} } };
}
function heading2Block(text: string) {
  return { block_type: 4, heading2: { elements: [{ text_run: { content: text, text_element_style: {} } }], style: {} } };
}

function promptToBlocks(p: Prompt) {
  const bodyLines = p.content.split('\n');
  return [
    heading2Block(`[prompt:${p.id}] ${p.title}`),
    richTextBlock(`分类：${p.category || '未分类'}`),
    richTextBlock(`标签：${(p.tags || []).join('，')}`),
    richTextBlock('---'),
    ...bodyLines.map(line => richTextBlock(line || ' '))
  ];
}

async function pullFromFeishu(env: Env) {
  let pageToken = '';
  const blocks: any[] = [];
  do {
    const q = new URLSearchParams({ page_size: '500', document_revision_id: '-1' });
    if (pageToken) q.set('page_token', pageToken);
    const body = await feishu(env, `/docx/v1/documents/${env.FEISHU_DOCUMENT_ID}/blocks?${q}`);
    blocks.push(...(body.data?.items || []));
    pageToken = body.data?.has_more ? body.data?.page_token || '' : '';
  } while (pageToken);

  const prompts = parsePrompts(blocks);
  const now = Date.now();
  const stmts = prompts.map(p => env.DB.prepare(
    `INSERT INTO prompts(id,title,category,tags,content,updated_at,source_revision) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,tags=excluded.tags,content=excluded.content,updated_at=excluded.updated_at,source_revision=excluded.source_revision`
  ).bind(p.id, p.title, p.category, JSON.stringify(p.tags), p.content, now, String(now)));
  if (stmts.length) await env.DB.batch(stmts);
  await env.DB.prepare('INSERT INTO sync_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind('last_pull', String(prompts.length), now).run();
  return prompts;
}

async function listPrompts(env: Env): Promise<Prompt[]> {
  const { results } = await env.DB.prepare('SELECT * FROM prompts ORDER BY updated_at DESC').all<any>();
  return results.map(r => ({ id:r.id, title:r.title, category:r.category, tags:JSON.parse(r.tags || '[]'), content:r.content, updatedAt:r.updated_at }));
}

async function pushAllToFeishu(env: Env) {
  const prompts = await listPrompts(env);
  const docId = env.FEISHU_DOCUMENT_ID;
  const list = await feishu(env, `/docx/v1/documents/${docId}/blocks/${docId}/children?page_size=500&document_revision_id=-1`);
  const count = (list.data?.items || []).length;
  if (count > 0) {
    await feishu(env, `/docx/v1/documents/${docId}/blocks/${docId}/children/batch_delete`, {
      method: 'DELETE',
      body: JSON.stringify({ start_index: 0, end_index: count })
    });
  }

  const blocks = prompts.flatMap(promptToBlocks);
  for (let i = 0; i < blocks.length; i += 40) {
    await feishu(env, `/docx/v1/documents/${docId}/blocks/${docId}/children`, {
      method: 'POST',
      body: JSON.stringify({ index: -1, children: blocks.slice(i, i + 40) })
    });
  }
  await env.DB.prepare('INSERT INTO sync_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
    .bind('last_push', String(prompts.length), Date.now()).run();
}

function uid() { return 'p_' + crypto.randomUUID().slice(0, 8); }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/api/config') {
        return json({ pollSeconds: Number(env.SYNC_POLL_SECONDS || 8), documentId: env.FEISHU_DOCUMENT_ID });
      }
      if (url.pathname === '/api/prompts' && req.method === 'GET') {
        if (url.searchParams.get('fresh') === '1') await pullFromFeishu(env);
        return json({ items: await listPrompts(env) });
      }
      if (url.pathname === '/api/sync/pull' && req.method === 'POST') {
        const items = await pullFromFeishu(env); return json({ ok: true, count: items.length });
      }
      if (url.pathname === '/api/sync/push' && req.method === 'POST') {
        await pushAllToFeishu(env); return json({ ok: true });
      }
      if (url.pathname === '/api/prompts' && req.method === 'POST') {
        const p: any = await req.json();
        const id = p.id || uid();
        const now = Date.now();
        await env.DB.prepare('INSERT INTO prompts(id,title,category,tags,content,updated_at) VALUES(?,?,?,?,?,?)')
          .bind(id, p.title || '未命名提示词', p.category || '未分类', JSON.stringify(p.tags || []), p.content || '', now).run();
        await pushAllToFeishu(env);
        return json({ ok: true, id });
      }
      const m = url.pathname.match(/^\/api\/prompts\/([^/]+)$/);
      if (m && req.method === 'PUT') {
        const p: any = await req.json();
        const now = Date.now();
        await env.DB.prepare('UPDATE prompts SET title=?,category=?,tags=?,content=?,updated_at=? WHERE id=?')
          .bind(p.title, p.category || '未分类', JSON.stringify(p.tags || []), p.content || '', now, m[1]).run();
        await pushAllToFeishu(env);
        return json({ ok: true });
      }
      if (m && req.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM prompts WHERE id=?').bind(m[1]).run();
        await pushAllToFeishu(env);
        return json({ ok: true });
      }
      if (url.pathname === '/api/feishu/events' && req.method === 'POST') {
        const body: any = await req.json();
        if (body.challenge) return json({ challenge: body.challenge });
        if (env.FEISHU_VERIFICATION_TOKEN && body.token && body.token !== env.FEISHU_VERIFICATION_TOKEN) return json({ ok:false }, 403);
        // 不在回调内重写文档，只标记为 dirty；前端下一次轮询会 pull，避免回调超时和同步循环。
        await env.DB.prepare('INSERT INTO sync_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
          .bind('feishu_dirty', '1', Date.now()).run();
        return json({ ok: true });
      }
      if (url.pathname === '/api/sync/status') {
        const dirty = await env.DB.prepare('SELECT value,updated_at FROM sync_state WHERE key=?').bind('feishu_dirty').first<any>();
        return json({ dirty: dirty?.value === '1', changedAt: dirty?.updated_at || null });
      }
      return env.ASSETS.fetch(req);
    } catch (e: any) {
      return json({ ok: false, error: e?.message || String(e) }, 500);
    }
  }
};
