#!/usr/bin/env node

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";

const execAsync = promisify(exec);

async function checkTableHTML() {
    // 修改这里的搜索条件，查找包含表格的笔记
    const script = `
        tell application "Notes"
            set targetFolder to folder "Notes"
            set allNotes to notes of targetFolder
            
            repeat with aNote in allNotes
                set noteTitle to name of aNote
                set noteBody to body of aNote
                
                -- 检查是否包含表格标签
                if noteBody contains "<table" then
                    return "TITLE: " & noteTitle & "
===BODY===
" & noteBody
                end if
            end repeat
            
            return "未找到包含表格的笔记"
        end tell
    `;

    try {
        console.log('正在搜索包含表格的备忘录...\n');
        const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
        
        if (stdout.includes('未找到')) {
            console.log('❌ 未找到包含表格的笔记');
            console.log('请在 macOS 备忘录中创建一个包含表格的笔记');
            return;
        }
        
        // 分离标题和内容
        const parts = stdout.split('===BODY===');
        const title = parts[0].replace('TITLE: ', '').trim();
        const body = parts[1];
        
        console.log('✓ 找到包含表格的笔记:', title);
        console.log('HTML 长度:', body.length);
        console.log('');
        
        // 保存完整 HTML
        await writeFile('table-html-output.html', body);
        console.log('✓ 已保存完整 HTML 到 table-html-output.html\n');
        
        // 分析表格结构
        console.log('=== 表格分析 ===');
        
        // 检查 table 标签
        const tableMatches = body.match(/<table[^>]*>/gi);
        if (tableMatches) {
            console.log('找到 <table> 标签:', tableMatches.length);
            console.log('第一个 table 标签:');
            console.log(tableMatches[0]);
            console.log('');
        }
        
        // 提取完整的表格 HTML
        const fullTableMatch = body.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
        if (fullTableMatch) {
            console.log('=== 完整表格 HTML ===');
            fullTableMatch.forEach((table, index) => {
                console.log(`\n--- 表格 ${index + 1} ---`);
                console.log(table);
                
                // 保存单独的表格
                writeFile(`table-${index + 1}.html`, table);
            });
        }
        
        // 检查 tr 标签
        const trMatches = body.match(/<tr[^>]*>/gi);
        if (trMatches) {
            console.log('\n找到 <tr> 标签:', trMatches.length);
        }
        
        // 检查 td 标签
        const tdMatches = body.match(/<td[^>]*>/gi);
        if (tdMatches) {
            console.log('找到 <td> 标签:', tdMatches.length);
        }
        
        // 检查 th 标签
        const thMatches = body.match(/<th[^>]*>/gi);
        if (thMatches) {
            console.log('找到 <th> 标签:', thMatches.length);
        }
        
        // 检查是否有特殊的样式或属性
        console.log('\n=== 样式和属性分析 ===');
        const styleMatches = body.match(/style="[^"]*"/gi);
        if (styleMatches) {
            console.log('找到 style 属性:', styleMatches.length);
            console.log('示例:', styleMatches.slice(0, 3));
        }
        
        const classMatches = body.match(/class="[^"]*"/gi);
        if (classMatches) {
            console.log('找到 class 属性:', classMatches.length);
            console.log('示例:', classMatches.slice(0, 3));
        }
        
    } catch (error) {
        console.error('错误:', error.message);
        console.log('\n提示：');
        console.log('1. 确保 macOS 备忘录应用正在运行');
        console.log('2. 确保有名为 "Notes" 的文件夹');
        console.log('3. 在该文件夹中创建一个包含表格的笔记');
    }
}

console.log('macOS 备忘录表格 HTML 检查工具');
console.log('================================\n');
checkTableHTML();
