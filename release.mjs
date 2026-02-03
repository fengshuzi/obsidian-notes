#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

let forceMode = process.argv.includes('--force');

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const version = manifest.version;
const tag = `v${version}`;

console.log(`🚀 准备发布版本: ${tag}${forceMode ? ' (强制模式)' : ''}\n`);

try {
  console.log('📦 开始构建...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ 构建完成\n');

  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch (error) {
    console.error('❌ 未安装 GitHub CLI (gh)');
    console.error('请先安装: brew install gh');
    process.exit(1);
  }

  let mainJsPath;
  if (existsSync('dist/main.js')) {
    mainJsPath = 'dist/main.js';
  } else if (existsSync('build/main.js')) {
    mainJsPath = 'build/main.js';
  } else if (existsSync('main.js')) {
    mainJsPath = 'main.js';
  } else {
    console.error('❌ 找不到 main.js 文件');
    process.exit(1);
  }
  console.log(`📄 检测到 main.js: ${mainJsPath}\n`);

  const files = [mainJsPath, 'manifest.json'];
  if (existsSync('dist/styles.css')) files.push('dist/styles.css');
  if (existsSync('styles.css')) files.push('styles.css');
  if (existsSync('dist/sql-wasm.wasm')) files.push('dist/sql-wasm.wasm');
  if (existsSync('config.json')) files.push('config.json');

  console.log(`📦 将上传文件: ${files.join(', ')}\n`);

  console.log(`📌 创建 tag: ${tag}`);
  try {
    execSync(`git tag ${tag}`, { stdio: 'pipe' });
    console.log('✅ Tag 创建成功\n');
  } catch (error) {
    if (!forceMode) {
      console.log('⚠️  Tag 已存在，自动启用强制模式...\n');
      forceMode = true;
    }
    console.log('🔄 删除旧 tag...');
    try { execSync(`git tag -d ${tag}`, { stdio: 'pipe' }); } catch (e) {}
    try { execSync(`git push origin :refs/tags/${tag}`, { stdio: 'pipe' }); } catch (e) {}
    try { execSync(`gh release delete ${tag} -y`, { stdio: 'pipe' }); } catch (e) {}
    try {
      execSync(`git tag ${tag}`, { stdio: 'pipe' });
      console.log('✅ Tag 重新创建成功\n');
    } catch (e) {
      console.error('❌ Tag 创建失败');
      process.exit(1);
    }
  }

  console.log('⬆️  推送 tag 到 GitHub...');
  execSync(`git push origin ${tag}`, { stdio: 'inherit' });
  console.log('✅ Tag 推送成功\n');

  console.log('🎉 创建 GitHub Release...');
  const filesArg = files.join(' ');
  execSync(
    `gh release create ${tag} ${filesArg} --title "${tag}" --notes "Release ${version}"`,
    { stdio: 'inherit' }
  );
  console.log('\n✅ Release 创建成功！\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎊 版本 ${tag} 发布完成！`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
} catch (error) {
  console.error('\n❌ 发布失败:', error.message);
  process.exit(1);
}
