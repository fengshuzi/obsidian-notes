#!/usr/bin/env node

/**
 * 测试完整的表格转换功能
 */

import { NotesStorage } from "./dist/main.js";

console.log('=== 测试表格转换功能 ===\n');

// 创建 NotesStorage 实例
const storage = new NotesStorage("Notes");

console.log('正在从备忘录获取笔记...\n');

try {
    const notes = await storage.getNotes();
    
    console.log(`✓ 获取到 ${notes.length} 个笔记\n`);
    
    // 查找包含表格的笔记
    const tableNotes = notes.filter(note => note.htmlBody.includes('<table'));
    
    if (tableNotes.length === 0) {
        console.log('❌ 没有找到包含表格的笔记');
        console.log('请在 macOS 备忘录中创建一个包含表格的笔记');
    } else {
        console.log(`✓ 找到 ${tableNotes.length} 个包含表格的笔记\n`);
        
        tableNotes.forEach((note, index) => {
            console.log(`\n--- 笔记 ${index + 1}: ${note.title} ---`);
            console.log('Markdown 内容:');
            console.log('---');
            console.log(note.body);
            console.log('---');
            
            // 验证表格格式
            const hasTableSyntax = note.body.includes('|');
            const hasSeparator = note.body.includes('---');
            
            console.log('\n验证:');
            console.log('✓ 包含表格语法 (|):', hasTableSyntax ? '是' : '否');
            console.log('✓ 包含分隔线 (---):', hasSeparator ? '是' : '否');
            
            if (hasTableSyntax && hasSeparator) {
                console.log('✅ 表格转换成功！');
            } else {
                console.log('❌ 表格转换可能有问题');
            }
        });
    }
    
} catch (error) {
    console.error('❌ 错误:', error.message);
}
