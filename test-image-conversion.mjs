#!/usr/bin/env node

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// 模拟包含 base64 图片的 HTML
const testHTMLWithImage = `<div>
<h1>测试笔记</h1>
<p>这是一段文字</p>
<object type="image/png" data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="></object>
<p>图片后的文字</p>
</div>`;

// 初始化 Turndown
const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

turndownService.use(gfm);

console.log("原始 HTML:");
console.log("=".repeat(80));
console.log(testHTMLWithImage);
console.log("\n");

// 模拟图片提取过程
let processedHtml = testHTMLWithImage;
const attachments = [];
let counter = 1;

const objectRegex = /<object[^>]+data="data:image\/([^;]+);base64,([^"]+)"[^>]*>[\s\S]*?<\/object>/gi;
let match;

console.log("提取图片...");
while ((match = objectRegex.exec(testHTMLWithImage)) !== null) {
    const format = match[1];
    const base64Data = match[2];
    const fullObjectTag = match[0];
    
    const filename = `test-note-${String(counter).padStart(3, '0')}.${format}`;
    
    console.log(`找到图片: ${filename} (格式: ${format}, base64长度: ${base64Data.length})`);
    
    attachments.push({
        filename: filename,
        format: format,
        base64Length: base64Data.length
    });
    
    // 替换为 HTML img 标签，Turndown 会自动转换为 Markdown
    const imgTag = `<img src="attachments/${filename}" alt="">`;
    processedHtml = processedHtml.replace(fullObjectTag, imgTag);
    
    counter++;
}

console.log(`\n提取了 ${attachments.length} 张图片\n`);

console.log("处理后的 HTML:");
console.log("=".repeat(80));
console.log(processedHtml);
console.log("\n");

console.log("转换后的 Markdown:");
console.log("=".repeat(80));
const markdown = turndownService.turndown(processedHtml);
console.log(markdown);
console.log("\n");

console.log("附件列表:");
attachments.forEach((att, i) => {
    console.log(`${i + 1}. ${att.filename} (${att.format})`);
});
