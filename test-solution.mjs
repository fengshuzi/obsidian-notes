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
 * 预处理表格 HTML，将第一行转换为 thead
 */
function preprocessTableHTML(html) {
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
            th.innerHTML = cell.innerHTML;
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.insertBefore(thead, tbody);
        
        // 从 tbody 中移除第一行
        firstRow.remove();
    });
    
    return document.body.innerHTML;
}

console.log('=== 解决方案测试 ===\n');

console.log('原始 HTML:');
console.log(macosTableHTML);
console.log('\n');

const processedHTML = preprocessTableHTML(macosTableHTML);
console.log('预处理后的 HTML:');
console.log(processedHTML);
console.log('\n');

const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

turndown.use(gfm);

const markdown = turndown.turndown(processedHTML);
console.log('转换为 Markdown:');
console.log(markdown);
console.log('\n');

console.log('✓ 包含表格语法:', markdown.includes('|'));
console.log('✓ 包含分隔线:', markdown.includes('---'));
