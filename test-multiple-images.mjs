#!/usr/bin/env node

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// 模拟包含多张不同格式图片的 HTML
const testHTMLWithMultipleImages = `<div>
<h1>多图测试</h1>
<p>第一张图片（PNG）：</p>
<object type="image/png" data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="></object>
<p>第二张图片（JPEG）：</p>
<object type="image/jpeg" data="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="></object>
<p>第三张图片（GIF）：</p>
<object type="image/gif" data="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></object>
<p>结束</p>
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
console.log(testHTMLWithMultipleImages);
console.log("\n");

// 模拟图片提取过程
let processedHtml = testHTMLWithMultipleImages;
const attachments = [];
let counter = 1;

const objectRegex = /<object[^>]+data="data:image\/([^;]+);base64,([^"]+)"[^>]*>[\s\S]*?<\/object>/gi;
let match;

console.log("提取图片...");
while ((match = objectRegex.exec(testHTMLWithMultipleImages)) !== null) {
    const format = match[1];
    const base64Data = match[2];
    const fullObjectTag = match[0];
    
    const filename = `multi-test-${String(counter).padStart(3, '0')}.${format}`;
    
    console.log(`找到图片 ${counter}: ${filename} (格式: ${format}, base64长度: ${base64Data.length})`);
    
    attachments.push({
        filename: filename,
        format: format,
        base64Length: base64Data.length
    });
    
    // 替换为 HTML img 标签
    const imgTag = `<img src="attachments/${filename}" alt="">`;
    processedHtml = processedHtml.replace(fullObjectTag, imgTag);
    
    counter++;
}

console.log(`\n提取了 ${attachments.length} 张图片\n`);

console.log("转换后的 Markdown:");
console.log("=".repeat(80));
const markdown = turndownService.turndown(processedHtml);
console.log(markdown);
console.log("\n");

console.log("附件列表:");
attachments.forEach((att, i) => {
    console.log(`${i + 1}. ${att.filename} (${att.format}, ${att.base64Length} bytes base64)`);
});
