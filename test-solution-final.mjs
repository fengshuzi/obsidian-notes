#!/usr/bin/env node

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { JSDOM } from "jsdom";

// macOS 备忘录的实际表格 HTML
const macosTableHTML = `<table cellspacing="0" cellpadding="0" style="border-collapse: collapse; direction: ltr">
<tbody>
<tr><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div><font face=".PingFangUITextSC-Regular">列</font>1</div>
</td><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div><font face=".PingFangUITextSC-Regular">列</font>2</div>
</td></tr>
<tr><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div>xxx</div>
</td><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div>ddd</div>
</td></tr>
</tbody>
</table>`;

/**
 * 清理 HTML 中的多余标签和空白
 */
function cleanHTML(html) {
    let cleaned = html;
    
    // 移除 div 和 font 标签，保留内容
    cleaned = cleaned.replace(/<div[^>]*>/gi, '');
    cleaned = cleaned.replace(/<\/div>/gi, '');
    cleaned = cleaned.replace(/<font[^>]*>/gi, '');
    cleaned = cleaned.replace(/<\/font>/gi, '');
    
    // 清理单元格内的多余空白
    cleaned = cleaned.replace(/>\s+</g, '><');
    
    return cleaned;
}

/**
 * 预处理表格 HTML，将第一行转换为 thead
 */
function preprocessTableHTML(html) {
    // 先清理 HTML
    html = cleanHTML(html);
    
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const tables = document.querySelectorAll('table');
    
    tables.forEach(table => {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        
        // 检查是否已有 thead
        if (table.querySelector('thead')) return;
        
        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) return;
        
        // 将第一行转换为 thead
        const firstRow = rows[0];
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // 将第一行的 td 转换为 th
        const cells = firstRow.querySelectorAll('td');
        cells.forEach(cell => {
            const th = document.createElement('th');
            // 清理单元格内容
            th.textContent = cell.textContent.trim();
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.insertBefore(thead, tbody);
        
        // 从 tbody 中移除第一行
        firstRow.remove();
        
        // 清理剩余单元格的内容
        const remainingCells = tbody.querySelectorAll('td');
        remainingCells.forEach(cell => {
            cell.textContent = cell.textContent.trim();
        });
    });
    
    return document.body.innerHTML;
}

/**
 * 后处理 Markdown，清理表格格式
 */
function cleanMarkdownTable(markdown) {
    // 将表格行分开（每个 | 开头的行）
    const lines = markdown.split('\n');
    const cleanedLines = [];
    
    for (let line of lines) {
        // 如果是表格行
        if (line.trim().startsWith('|')) {
            // 清理多余空格
            line = line.replace(/\|\s+/g, '| ').replace(/\s+\|/g, ' |');
            cleanedLines.push(line);
        } else if (line.trim()) {
            cleanedLines.push(line);
        }
    }
    
    return cleanedLines.join('\n');
}

console.log('=== 最终解决方案测试 ===\n');

console.log('原始 HTML (前200字符):');
console.log(macosTableHTML.substring(0, 200) + '...');
console.log('\n');

const processedHTML = preprocessTableHTML(macosTableHTML);
console.log('预处理后的 HTML (前200字符):');
console.log(processedHTML.substring(0, 200) + '...');
console.log('\n');

const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

turndown.use(gfm);

let markdown = turndown.turndown(processedHTML);
markdown = cleanMarkdownTable(markdown);

console.log('最终 Markdown:');
console.log('---');
console.log(markdown);
console.log('---');
console.log('\n');

console.log('验证:');
console.log('✓ 包含表格语法:', markdown.includes('|'));
console.log('✓ 包含分隔线:', markdown.includes('---'));
console.log('✓ 格式正确:', /\|\s*\w+\s*\|/.test(markdown));

// 测试在 Obsidian 中的显示效果
console.log('\n在 Obsidian 中应该显示为:');
console.log('┌──────┬──────┐');
console.log('│ 列1  │ 列2  │');
console.log('├──────┼──────┤');
console.log('│ xxx  │ ddd  │');
console.log('└──────┴──────┘');
