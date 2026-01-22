#!/usr/bin/env node

import TurndownService from "turndown";
import { gfm, tables } from "turndown-plugin-gfm";

// 实际从 macOS 备忘录获取的表格 HTML
const originalHTML = `<table cellspacing="0" cellpadding="0" style="border-collapse: collapse; direction: ltr">
<tbody>
<tr><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div><font face=".PingFangUITextSC-Regular">列</font>1</div>
</td><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div><font face=".PingFangUITextSC-Regular">列</font>2</div>
</td></tr>
<tr><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div>xxx</div>
</td><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div>ddd</div>
</td></tr>
</tbody>
</table>`;

console.log('=== 测试不同的预处理方法 ===\n');

// 方法 1: 清理 HTML（移除样式和属性）
function cleanTableHTML(html) {
    let cleaned = html;
    
    // 移除所有 style 属性
    cleaned = cleaned.replace(/\s*style="[^"]*"/gi, '');
    
    // 移除所有其他属性（保留基本标签）
    cleaned = cleaned.replace(/<table[^>]*>/gi, '<table>');
    cleaned = cleaned.replace(/<tbody[^>]*>/gi, '<tbody>');
    cleaned = cleaned.replace(/<tr[^>]*>/gi, '<tr>');
    cleaned = cleaned.replace(/<td[^>]*>/gi, '<td>');
    cleaned = cleaned.replace(/<th[^>]*>/gi, '<th>');
    
    // 移除 div 和 font 标签，保留内容
    cleaned = cleaned.replace(/<\/?div[^>]*>/gi, '');
    cleaned = cleaned.replace(/<\/?font[^>]*>/gi, '');
    
    // 清理多余的空白
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/>\s+</g, '><');
    
    return cleaned;
}

const cleanedHTML = cleanTableHTML(originalHTML);
console.log('清理后的 HTML:');
console.log(cleanedHTML);
console.log('\n');

// 测试转换
const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

turndown.use(gfm);

const result = turndown.turndown(cleanedHTML);
console.log('转换结果:');
console.log(result);
console.log('\n包含表格语法:', result.includes('|'));
console.log('');

// 方法 2: 只使用 tables 插件
console.log('=== 测试只使用 tables 插件 ===\n');

const turndown2 = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

turndown2.use(tables);

const result2 = turndown2.turndown(cleanedHTML);
console.log('转换结果:');
console.log(result2);
console.log('\n包含表格语法:', result2.includes('|'));
console.log('');

// 方法 3: 测试简单的表格
console.log('=== 测试简单表格 ===\n');

const simpleTable = `<table>
<tr><td>列1</td><td>列2</td></tr>
<tr><td>xxx</td><td>ddd</td></tr>
</table>`;

const result3 = turndown.turndown(simpleTable);
console.log('简单表格转换结果:');
console.log(result3);
console.log('\n包含表格语法:', result3.includes('|'));
