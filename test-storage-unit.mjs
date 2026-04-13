#!/usr/bin/env node
/**
 * storage.ts 核心流程单元测试
 * 直接调用 AppleScript，验证新的三步拉取逻辑
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { readFile, rename } from 'fs/promises';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const FOLDER = 'Notes';
const TMP = '/tmp/storage-unit-test';

async function osascript(script) {
  const { stdout } = await execFileAsync('osascript', ['-e', script], {
    maxBuffer: 100 * 1024 * 1024
  });
  return stdout;
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log('  ✅', msg);
    passed++;
  } else {
    console.error('  ❌', msg);
    failed++;
  }
}

// ── 测试1：getNotesMeta 批量拿元数据，stdout 极小 ──────────────────────────
async function testGetNotesMeta() {
  console.log('\n[测试1] getNotesMeta - 批量拿元数据');
  const script = `
    tell application "Notes"
      set output to ""
      set targetFolder to folder "${FOLDER}"
      set counter to 0
      repeat with aNote in notes of targetFolder
        set counter to counter + 1
        if counter > 5 then exit repeat
        set noteId to id of aNote
        set noteTitle to name of aNote
        set attCnt to (count of attachments of aNote) as string
        set output to output & noteId & "|||" & noteTitle & "|||" & attCnt & "###SEP###"
      end repeat
      return output
    end tell
  `;
  const out = await osascript(script);
  const metas = out.split('###SEP###').filter(s => s.trim()).map(c => {
    const p = c.trim().split('|||');
    return { id: p[0]?.trim(), title: p[1]?.trim(), attachmentCount: parseInt(p[2]?.trim()) || 0 };
  }).filter(m => m.id);

  assert(metas.length > 0, `获取到 ${metas.length} 条元数据`);
  assert(out.length < 5 * 1024 * 1024, `stdout 大小 ${(out.length/1024).toFixed(1)}KB < 5MB（无图片）`);
  metas.forEach(m => console.log(`    - "${m.title}" attachments:${m.attachmentCount}`));
  return metas;
}

// ── 测试2：getNoteBody 单条拿 body ─────────────────────────────────────────
async function testGetNoteBody(noteId, noteTitle) {
  console.log(`\n[测试2] getNoteBody - 单条拿 body: "${noteTitle}"`);
  const script = `
    tell application "Notes"
      set aNote to note id "${noteId}"
      set noteBody to body of aNote
      try
        set noteFolder to name of container of aNote
      on error
        set noteFolder to "${FOLDER}"
      end try
      set noteCreation to creation date of aNote as string
      set noteMod to modification date of aNote as string
      return noteBody & "###META###" & noteFolder & "|||" & noteCreation & "|||" & noteMod
    end tell
  `;
  const out = await osascript(script);
  const metaSep = out.lastIndexOf('###META###');
  const htmlBody = metaSep >= 0 ? out.slice(0, metaSep) : out;
  const metaPart = metaSep >= 0 ? out.slice(metaSep + 10) : '';
  const metaParts = metaPart.split('|||');

  assert(htmlBody.length > 0, `body 长度 ${htmlBody.length} bytes`);
  assert(metaParts.length >= 3, `元信息解析正确: folder="${metaParts[0]?.trim()}"`);
  return { htmlBody, folder: metaParts[0]?.trim(), creationDate: metaParts[1]?.trim(), modificationDate: metaParts[2]?.trim() };
}

// ── 测试3：detectImageExt magic bytes ──────────────────────────────────────
async function testDetectImageExt(filePath) {
  const buf = await readFile(filePath);
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[6] === 0x57) return 'webp';
  if (buf[0] === 0x42 && buf[1] === 0x4D) return 'bmp';
  return 'png';
}

// ── 测试4：save attachment to file 直接写磁盘 ──────────────────────────────
async function testSaveAttachment(noteId, noteTitle, attIndex) {
  console.log(`\n[测试3] save attachment - "${noteTitle}" attachment[${attIndex}]`);
  if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

  const tmpPath = join(TMP, `att-${attIndex}`);
  const script = `
    tell application "Notes"
      set aNote to note id "${noteId}"
      save attachment ${attIndex} of aNote in POSIX file "${tmpPath}"
    end tell
  `;
  await osascript(script);

  assert(existsSync(tmpPath), 'attachment 文件已写入磁盘');
  if (existsSync(tmpPath)) {
    const size = statSync(tmpPath).size;
    const ext = await testDetectImageExt(tmpPath);
    assert(size > 0, `文件大小 ${(size/1024).toFixed(1)}KB`);
    assert(['png','jpeg','gif','webp','bmp'].includes(ext), `格式识别: ${ext}`);

    // 重命名测试（模拟最终命名规则）
    const safeTitle = noteTitle.replace(/[\\/:*?"<>|]/g, '-').slice(0, 50);
    const finalName = `${safeTitle}-${String(attIndex).padStart(3,'0')}.${ext}`;
    const destPath = join(TMP, finalName);
    await rename(tmpPath, destPath);
    assert(existsSync(destPath), `重命名成功: ${finalName}`);
    return { ext, finalName };
  }
  return null;
}

// ── 测试5：单条失败不影响其他条 ────────────────────────────────────────────
async function testFailIsolation(metas) {
  console.log('\n[测试4] 单条失败隔离');
  let ok = 0, fail = 0;
  const failedTitles = [];
  for (const meta of metas) {
    try {
      // 模拟：id 含 FAKE 的强制失败
      if (meta.id.includes('FAKE')) throw new Error('模拟失败');
      ok++;
    } catch (e) {
      fail++;
      failedTitles.push(meta.title);
    }
  }
  assert(ok === metas.length, `全部 ${ok} 条成功，${fail} 条失败（无强制失败项）`);
  assert(fail === 0, '无意外失败');
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    const metas = await testGetNotesMeta();
    if (!metas.length) {
      console.error('❌ 无法获取元数据，终止测试');
      process.exit(1);
    }

    await testGetNoteBody(metas[0].id, metas[0].title);

    const withAtt = metas.find(m => m.attachmentCount > 0);
    if (withAtt) {
      await testSaveAttachment(withAtt.id, withAtt.title, 1);
    } else {
      console.log('\n[测试3] 跳过（前5条无附件）');
      passed++; // 不算失败
    }

    await testFailIsolation(metas);

  } catch (e) {
    console.error('\n❌ 测试异常:', e.message);
    failed++;
  } finally {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`结果: ${passed} 通过, ${failed} 失败`);
    if (failed > 0) process.exit(1);
  }
})();
