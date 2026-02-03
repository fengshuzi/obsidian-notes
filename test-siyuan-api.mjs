#!/usr/bin/env node
/**
 * 思源笔记 API 单元测试：验证 getIDsByHPath 等接口与 Token 是否可用
 * 用法：
 *   node test-siyuan-api.mjs
 *   SIYUAN_HOST=http://127.0.0.1:6806 SIYUAN_TOKEN=232323 SIYUAN_NOTEBOOK=20250528130026-xxx node test-siyuan-api.mjs
 */
const HOST = process.env.SIYUAN_HOST || 'http://127.0.0.1:6806';
const TOKEN = process.env.SIYUAN_TOKEN || '232323';
const NOTEBOOK_ID = process.env.SIYUAN_NOTEBOOK || '20250528130026-xj0cb3u';

function normalizeToken(token) {
  if (!token) return '';
  const t = String(token).trim();
  if (t.toLowerCase().startsWith('token ')) return t.slice(6).trim();
  return t;
}

const authToken = normalizeToken(TOKEN);
const headers = {
  'Content-Type': 'application/json',
  ...(authToken ? { Authorization: `Token ${authToken}` } : {}),
};

async function post(path, body) {
  const url = `${HOST.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  if (res.status === 401) {
    throw new Error(`401 Unauthorized: 请检查 Token 是否正确，当前使用 Token: ${authToken ? authToken : '(未设置)'}`);
  }
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status}: ${data.msg || text}`);
  }
  return data;
}

async function main() {
  console.log('思源笔记 API 测试');
  console.log('  HOST:', HOST);
  console.log('  Token:', authToken ? `${authToken.slice(0, 4)}***` : '(未设置)');
  console.log('  NOTEBOOK_ID:', NOTEBOOK_ID);
  console.log('');

  try {
    // 1. getIDsByHPath
    console.log('1. POST /api/filetree/getIDsByHPath { notebook, path: "/" }');
    const r1 = await post('/api/filetree/getIDsByHPath', {
      notebook: NOTEBOOK_ID,
      path: '/',
    });
    if (r1.code !== 0) {
      console.log('   失败:', r1.msg || r1);
    } else {
      const d = r1.data;
      const firstId = Array.isArray(d) ? d[0] : (d && d[0] !== undefined ? d[0] : null);
      console.log('   成功:', firstId != null ? `根文档 ID=${firstId}` : `data=${JSON.stringify(d).slice(0, 80)}`);
    }

    // 2. 若有根 ID，可再测 exportMdContent（可选）
    const rootId = r1.code === 0 && Array.isArray(r1.data) ? r1.data[0] : null;
    if (rootId) {
      const docId = rootId;
      console.log('');
      console.log('2. POST /api/export/exportMdContent { id }');
      const r2 = await post('/api/export/exportMdContent', { id: docId });
      if (r2.code !== 0) {
        console.log('   失败:', r2.msg || r2);
      } else {
        const content = r2.data?.content ?? '';
        console.log('   成功: content 长度', content.length);
      }
    }

    console.log('');
    console.log('✅ 思源 API 测试通过（Token 有效）');
  } catch (e) {
    console.error('');
    console.error('❌ 失败:', e.message);
    process.exit(1);
  }
}

main();
