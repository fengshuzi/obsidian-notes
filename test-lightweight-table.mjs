#!/usr/bin/env node

/**
 * 测试轻量级表格转换方案
 */

// 模拟 convertTableToMarkdown 函数
function convertTableToMarkdown(tableHtml) {
    // 移除 div 和 font 标签
    tableHtml = tableHtml.replace(/<\/?div[^>]*>/gi, '');
    tableHtml = tableHtml.replace(/<\/?font[^>]*>/gi, '');
    
    // 提取所有行
    const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    if (!rowMatches || rowMatches.length === 0) {
        return tableHtml; // 无法解析，返回原始 HTML
    }
    
    const rows = [];
    
    // 解析每一行
    for (const rowHtml of rowMatches) {
        const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
        if (!cellMatches) continue;
        
        const cells = [];
        for (const cellHtml of cellMatches) {
            // 提取单元格内容
            const content = cellHtml
                .replace(/<t[dh][^>]*>/gi, '')
                .replace(/<\/t[dh]>/gi, '')
                .replace(/<[^>]+>/g, '') // 移除所有 HTML 标签
                .trim();
            cells.push(content);
        }
        
        if (cells.length > 0) {
            rows.push(cells);
        }
    }
    
    if (rows.length === 0) {
        return tableHtml; // 无法解析，返回原始 HTML
    }
    
    // 构建 Markdown 表格
    let markdown = '\n\n';
    
    // 第一行作为表头
    markdown += '| ' + rows[0].join(' | ') + ' |\n';
    
    // 分隔线
    markdown += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
    
    // 数据行
    for (let i = 1; i < rows.length; i++) {
        markdown += '| ' + rows[i].join(' | ') + ' |\n';
    }
    
    markdown += '\n';
    
    return markdown;
}

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

console.log('=== 轻量级表格转换测试 ===\n');

console.log('原始 HTML (前200字符):');
console.log(macosTableHTML.substring(0, 200) + '...\n');

const markdown = convertTableToMarkdown(macosTableHTML);

console.log('转换后的 Markdown:');
console.log('---');
console.log(markdown);
console.log('---\n');

console.log('验证:');
console.log('✓ 包含表格语法 (|):', markdown.includes('|'));
console.log('✓ 包含分隔线 (---):', markdown.includes('---'));
console.log('✓ 格式正确:', /\|\s*\w+\s*\|/.test(markdown));

console.log('\n在 Obsidian 中应该显示为:');
console.log('┌──────┬──────┐');
console.log('│ 列1  │ 列2  │');
console.log('├──────┼──────┤');
console.log('│ xxx  │ ddd  │');
console.log('└──────┴──────┘');
