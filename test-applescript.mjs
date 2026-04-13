#!/usr/bin/env node
/**
 * 测试 AppleScript 是否支持：
 * 1. 只拿笔记元数据（不含图片 body）
 * 2. 单独按 attachment 对象导出图片二进制（写到文件，不走 stdout base64）
 *
 * 用法：node test-applescript.mjs [文件夹名] [输出目录]
 * 示例：node test-applescript.mjs Notes /tmp/notes-test
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

const folderName = process.argv[2] || 'Notes';
const outputDir = process.argv[3] || '/tmp/notes-test';

if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

console.log(`\n📁 备忘录文件夹: ${folderName}`);
console.log(`📂 输出目录: ${outputDir}\n`);

// ─────────────────────────────────────────────
// 测试 1：只拿元数据（id、title、plaintext），不拿 body（HTML）
// ─────────────────────────────────────────────
async function testMetaOnly() {
  console.log('=== 测试 1：只拿元数据（不含 HTML body / 图片）===');
  const script = `
    tell application "Notes"
      set result to {}
      set targetFolder to folder "${folderName}"
      set counter to 0
      repeat with aNote in notes of targetFolder
        set counter to counter + 1
        if counter > 5 then exit repeat
        set noteId to id of aNote
        set noteTitle to name of aNote
        set notePlain to plaintext of aNote
        set noteCreation to creation date of aNote as string
        set noteMod to modification date of aNote as string
        set end of result to (noteId & "|||" & noteTitle & "|||" & noteCreation & "|||" & noteMod & "|||" & notePlain)
      end repeat
      set AppleScript's text item delimiters to "###SEP###"
      return result as text
    end tell
  `;

  try {
    const { stdout } = await execAsync(
      `osascript -e '${script.replace(/'/g, "'\\''")}'`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const notes = stdout.split('###SEP###').filter(Boolean);
    console.log(`✅ 成功，获取到 ${notes.length} 条笔记元数据`);
    for (const n of notes) {
      const parts = n.split('|||');
      console.log(`  - [${parts[1]?.trim()}] id=${parts[0]?.trim().slice(0, 30)}...`);
    }
    return notes.map(n => {
      const p = n.split('|||');
      return { id: p[0]?.trim(), title: p[1]?.trim() };
    });
  } catch (err) {
    console.error('❌ 失败:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// 测试 2：查询某条笔记有多少个 attachment 对象
// ─────────────────────────────────────────────
async function testAttachmentCount(noteId) {
  console.log(`\n=== 测试 2：查询 attachment 数量（noteId=${noteId.slice(0, 40)}...）===`);
  const script = `
    tell application "Notes"
      set aNote to note id "${noteId}"
      set cnt to count of attachments of aNote
      return cnt as string
    end tell
  `;
  try {
    const { stdout } = await execAsync(
      `osascript -e '${script.replace(/'/g, "'\\''")}'`,
      { maxBuffer: 1 * 1024 * 1024 }
    );
    const count = parseInt(stdout.trim());
    console.log(`✅ 该笔记有 ${count} 个 attachment`);
    return count;
  } catch (err) {
    console.error('❌ 失败:', err.message);
    return 0;
  }
}

// ─────────────────────────────────────────────
// 测试 3：列出 attachment 的元信息（名称、类型），不导出二进制
// ─────────────────────────────────────────────
async function testAttachmentMeta(noteId) {
  console.log(`\n=== 测试 3：列出 attachment 元信息 ===`);
  const script = `
    tell application "Notes"
      set aNote to note id "${noteId}"
      set result to {}
      repeat with att in attachments of aNote
        try
          set attName to name of att
        on error
          set attName to "unknown"
        end try
        try
          set attId to id of att
        on error
          set attId to "no-id"
        end try
        set end of result to (attId & "|||" & attName)
      end repeat
      set AppleScript's text item delimiters to "###SEP###"
      return result as text
    end tell
  `;
  try {
    const { stdout } = await execAsync(
      `osascript -e '${script.replace(/'/g, "'\\''")}'`,
      { maxBuffer: 1 * 1024 * 1024 }
    );
    if (!stdout.trim()) {
      console.log('  （无 attachment）');
      return [];
    }
    const atts = stdout.split('###SEP###').filter(Boolean);
    console.log(`✅ 共 ${atts.length} 个 attachment：`);
    for (const a of atts) {
      const [id, name] = a.split('|||');
      console.log(`  - name=${name?.trim()}  id=${id?.trim().slice(0, 40)}...`);
    }
    return atts.map(a => {
      const [id, name] = a.split('|||');
      return { id: id?.trim(), name: name?.trim() };
    });
  } catch (err) {
    console.error('❌ 失败:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────
// 测试 4：用 AppleScript 把 attachment 直接写到文件（不走 stdout）
// 这是关键测试：save attachment to file
// ─────────────────────────────────────────────
async function testSaveAttachmentToFile(noteId, attIndex, outputPath) {
  console.log(`\n=== 测试 4：save attachment to file（index=${attIndex}）===`);
  // AppleScript 的 save 命令，直接写磁盘，完全绕开 stdout
  const script = `
    tell application "Notes"
      set aNote to note id "${noteId}"
      set att to attachment ${attIndex} of aNote
      save att in POSIX file "${outputPath}"
    end tell
  `;
  try {
    await execAsync(
      `osascript -e '${script.replace(/'/g, "'\\''")}'`,
      { maxBuffer: 1 * 1024 * 1024 }
    );
    if (existsSync(outputPath)) {
      const size = statSync(outputPath).size;
      console.log(`✅ 成功！文件已写到 ${outputPath}，大小 ${(size / 1024).toFixed(1)} KB`);
      return true;
    } else {
      console.log('❌ 命令未报错但文件不存在');
      return false;
    }
  } catch (err) {
    console.error('❌ 失败:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// 测试 5：用 AppleScript 把 attachment 读为 base64 但只走单个 attachment
// 对比测试：看单个 attachment 的 base64 stdout 是否可控
// ─────────────────────────────────────────────
async function testSingleAttachmentBase64(noteId, attIndex) {
  console.log(`\n=== 测试 5：单个 attachment base64 via stdout（index=${attIndex}）===`);
  const script = `
    tell application "Notes"
      set aNote to note id "${noteId}"
      set att to attachment ${attIndex} of aNote
      set attData to content of att
      return attData
    end tell
  `;
  try {
    const { stdout } = await execAsync(
      `osascript -e '${script.replace(/'/g, "'\\''")}'`,
      { maxBuffer: 50 * 1024 * 1024 }
    );
    console.log(`✅ stdout 长度: ${(stdout.length / 1024).toFixed(1)} KB`);
    return true;
  } catch (err) {
    console.error('❌ 失败（可能不支持 content of attachment）:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────
(async () => {
  // 1. 拿元数据
  const notes = await testMetaOnly();
  if (!notes.length) {
    console.log('\n⚠️  没有获取到笔记，请检查文件夹名称是否正确');
    process.exit(1);
  }

  // 找第一条有 attachment 的笔记来测试
  let targetNote = null;
  let attCount = 0;
  for (const note of notes) {
    const cnt = await testAttachmentCount(note.id);
    if (cnt > 0) {
      targetNote = note;
      attCount = cnt;
      break;
    }
  }

  if (!targetNote) {
    console.log('\n⚠️  前 5 条笔记都没有 attachment，跳过附件相关测试');
    console.log('💡 建议：在备忘录里找一条有图片的笔记，手动传入其 id 测试');
    process.exit(0);
  }

  console.log(`\n🎯 选中笔记: [${targetNote.title}]，有 ${attCount} 个 attachment`);

  // 3. 列出 attachment 元信息
  const atts = await testAttachmentMeta(targetNote.id);

  // 4. 测试 save to file（核心：绕开 stdout）
  const savePath = join(outputDir, `test-att-1`);
  const saved = await testSaveAttachmentToFile(targetNote.id, 1, savePath);

  // 5. 对比：单个 attachment 走 stdout
  await testSingleAttachmentBase64(targetNote.id, 1);

  // 总结
  console.log('\n' + '='.repeat(50));
  console.log('📊 测试总结：');
  console.log(`  元数据拉取（不含图片）: ✅ 支持`);
  console.log(`  attachment 数量查询:    ✅ 支持`);
  console.log(`  attachment 元信息列举:  ${atts.length > 0 ? '✅ 支持' : '⚠️  无数据'}`);
  console.log(`  save attachment to file: ${saved ? '✅ 支持（可绕开 stdout）' : '❌ 不支持'}`);
  console.log('='.repeat(50));

  if (saved) {
    console.log('\n✅ 结论：AppleScript 支持直接写文件，可以彻底绕开 maxBuffer 问题！');
    console.log('   方案：先批量拉元数据+plaintext，再逐条 save attachment to file');
  } else {
    console.log('\n⚠️  结论：save to file 不可用，需要考虑其他方案');
  }
})();
