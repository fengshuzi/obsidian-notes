#!/usr/bin/env node

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// 模拟 NotesStorage 类的 extractAttachments 方法
class TestNotesStorage {
    constructor() {
        this.turndownService = new TurndownService({
            headingStyle: "atx",
            codeBlockStyle: "fenced",
            bulletListMarker: "-",
        });
        
        this.turndownService.use(gfm);
        
        this.turndownService.addRule("br", {
            filter: "br",
            replacement: (content, node) => {
                let parent = node.parentNode;
                while (parent) {
                    if (parent.nodeName === "LI") {
                        return " ";
                    }
                    parent = parent.parentNode;
                }
                return "  \n";
            },
        });
        
        this.turndownService.addRule("emptyHeading", {
            filter: (node) => {
                if (!node.nodeName.match(/^H[1-6]$/)) return false;
                const text = node.textContent || "";
                return text.trim() === "";
            },
            replacement: () => {
                return "";
            },
        });
        
        this.turndownService.addRule("emptyListItem", {
            filter: (node) => {
                if (node.nodeName !== "LI") return false;
                const text = node.textContent || "";
                return text.trim() === "";
            },
            replacement: () => {
                return "";
            },
        });
    }

    sanitizeFileName(name) {
        return name
            .replace(/[\\/:*?"<>|]/g, "-")
            .replace(/\n/g, " ")
            .trim()
            .substring(0, 200);
    }

    async extractAttachments(htmlBody, noteTitle) {
        const attachments = [];
        let processedHtml = htmlBody;
        let counter = 1;
        
        console.log('\n=== 图片提取调试 ===');
        console.log('笔记标题:', noteTitle);
        console.log('HTML 中是否包含 <object>:', htmlBody.includes('<object'));
        console.log('HTML 中是否包含 base64:', htmlBody.includes('base64'));
        
        // 匹配 <object> 标签中的 base64 图片
        const objectRegex = /<object[^>]+data="data:image\/([^;]+);base64,([^"]+)"[^>]*>[\s\S]*?<\/object>/gi;
        let match;

        while ((match = objectRegex.exec(htmlBody)) !== null) {
            try {
                const format = match[1];
                const base64Data = match[2];
                const fullObjectTag = match[0];
                
                console.log(`找到图片 ${counter}: 格式=${format}, base64长度=${base64Data.length}`);
                console.log(`完整标签: ${fullObjectTag.substring(0, 100)}...`);
                
                const filename = `${this.sanitizeFileName(noteTitle)}-${String(counter).padStart(3, '0')}.${format}`;
                console.log(`保存为: ${filename}`);
                
                attachments.push({
                    filename: filename,
                    format: format,
                    base64Length: base64Data.length
                });
                
                // 替换为 HTML img 标签，Turndown 会自动转换为 Markdown
                const imgTag = `<img src="attachments/${filename}" alt="">`;
                processedHtml = processedHtml.replace(fullObjectTag, imgTag);
                
                counter++;
            } catch (error) {
                console.error("解析图片失败:", error);
            }
        }
        
        console.log(`共提取 ${attachments.length} 张图片`);
        console.log('=== 图片提取结束 ===\n');

        // 使用 Turndown 转换 HTML 为 Markdown
        const markdownBody = this.turndownService.turndown(processedHtml);

        return { attachments, markdownBody };
    }
}

// 测试用例
async function runTests() {
    const storage = new TestNotesStorage();
    
    console.log("=" .repeat(80));
    console.log("测试 1: 单张 PNG 图片");
    console.log("=" .repeat(80));
    
    const test1Html = `<div>
<h1>测试笔记</h1>
<p>这是一段文字</p>
<object type="image/png" data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="></object>
<p>图片后的文字</p>
</div>`;
    
    const result1 = await storage.extractAttachments(test1Html, "测试笔记");
    
    console.log("\n转换后的 Markdown:");
    console.log("-".repeat(80));
    console.log(result1.markdownBody);
    console.log("-".repeat(80));
    
    console.log("\n验证结果:");
    console.log("✓ 提取图片数量:", result1.attachments.length === 1 ? "通过" : "失败");
    console.log("✓ 图片文件名:", result1.attachments[0]?.filename === "测试笔记-001.png" ? "通过" : "失败");
    console.log("✓ Markdown 包含图片引用:", result1.markdownBody.includes("![](attachments/测试笔记-001.png)") ? "通过" : "失败");
    console.log("✓ Markdown 不包含 base64:", !result1.markdownBody.includes("base64") ? "通过" : "失败");
    console.log("✓ Markdown 不包含转义:", !result1.markdownBody.includes("!\\[\\]") ? "通过" : "失败");
    
    console.log("\n\n");
    console.log("=" .repeat(80));
    console.log("测试 2: 多张不同格式图片");
    console.log("=" .repeat(80));
    
    const test2Html = `<div>
<h1>多图测试</h1>
<p>第一张图片（PNG）：</p>
<object type="image/png" data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="></object>
<p>第二张图片（JPEG）：</p>
<object type="image/jpeg" data="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k="></object>
<p>结束</p>
</div>`;
    
    const result2 = await storage.extractAttachments(test2Html, "多图测试");
    
    console.log("\n转换后的 Markdown:");
    console.log("-".repeat(80));
    console.log(result2.markdownBody);
    console.log("-".repeat(80));
    
    console.log("\n验证结果:");
    console.log("✓ 提取图片数量:", result2.attachments.length === 2 ? "通过" : "失败");
    console.log("✓ 第一张图片:", result2.attachments[0]?.filename === "多图测试-001.png" ? "通过" : "失败");
    console.log("✓ 第二张图片:", result2.attachments[1]?.filename === "多图测试-002.jpeg" ? "通过" : "失败");
    console.log("✓ Markdown 包含第一张图片:", result2.markdownBody.includes("![](attachments/多图测试-001.png)") ? "通过" : "失败");
    console.log("✓ Markdown 包含第二张图片:", result2.markdownBody.includes("![](attachments/多图测试-002.jpeg)") ? "通过" : "失败");
    console.log("✓ Markdown 不包含 base64:", !result2.markdownBody.includes("base64") ? "通过" : "失败");
    
    console.log("\n\n");
    console.log("=" .repeat(80));
    console.log("测试 3: 混合内容（文字 + 图片 + 列表）");
    console.log("=" .repeat(80));
    
    const test3Html = `<div>
<h1>购物清单</h1>
<p>需要购买的物品：</p>
<ul>
<li>苹果<br></li>
<li>香蕉<br></li>
<li>橙子<br></li>
</ul>
<p>产品图片：</p>
<object type="image/png" data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="></object>
<p>备注：记得带购物袋</p>
</div>`;
    
    const result3 = await storage.extractAttachments(test3Html, "购物清单");
    
    console.log("\n转换后的 Markdown:");
    console.log("-".repeat(80));
    console.log(result3.markdownBody);
    console.log("-".repeat(80));
    
    console.log("\n验证结果:");
    console.log("✓ 提取图片数量:", result3.attachments.length === 1 ? "通过" : "失败");
    console.log("✓ 包含标题:", result3.markdownBody.includes("# 购物清单") ? "通过" : "失败");
    console.log("✓ 包含列表:", result3.markdownBody.includes("- 苹果") ? "通过" : "失败");
    console.log("✓ 包含图片:", result3.markdownBody.includes("![](attachments/购物清单-001.png)") ? "通过" : "失败");
    console.log("✓ 包含备注:", result3.markdownBody.includes("备注：记得带购物袋") ? "通过" : "失败");
    console.log("✓ Markdown 不包含 base64:", !result3.markdownBody.includes("base64") ? "通过" : "失败");
    
    console.log("\n\n");
    console.log("=" .repeat(80));
    console.log("测试 4: 没有图片的笔记");
    console.log("=" .repeat(80));
    
    const test4Html = `<div>
<h1>纯文本笔记</h1>
<p>这是一个没有图片的笔记</p>
<ul>
<li>项目 1<br></li>
<li>项目 2<br></li>
</ul>
</div>`;
    
    const result4 = await storage.extractAttachments(test4Html, "纯文本笔记");
    
    console.log("\n转换后的 Markdown:");
    console.log("-".repeat(80));
    console.log(result4.markdownBody);
    console.log("-".repeat(80));
    
    console.log("\n验证结果:");
    console.log("✓ 提取图片数量:", result4.attachments.length === 0 ? "通过" : "失败");
    console.log("✓ Markdown 不包含图片引用:", !result4.markdownBody.includes("![](") ? "通过" : "失败");
    console.log("✓ Markdown 不包含 base64:", !result4.markdownBody.includes("base64") ? "通过" : "失败");
    
    // 总结
    console.log("\n\n");
    console.log("=" .repeat(80));
    console.log("测试总结");
    console.log("=" .repeat(80));
    
    const allTests = [
        result1.attachments.length === 1,
        result1.markdownBody.includes("![](attachments/测试笔记-001.png)"),
        !result1.markdownBody.includes("base64"),
        result2.attachments.length === 2,
        result2.markdownBody.includes("![](attachments/多图测试-001.png)"),
        result2.markdownBody.includes("![](attachments/多图测试-002.jpeg)"),
        !result2.markdownBody.includes("base64"),
        result3.attachments.length === 1,
        result3.markdownBody.includes("![](attachments/购物清单-001.png)"),
        !result3.markdownBody.includes("base64"),
        result4.attachments.length === 0,
        !result4.markdownBody.includes("base64"),
    ];
    
    const passedTests = allTests.filter(t => t).length;
    const totalTests = allTests.length;
    
    console.log(`\n通过: ${passedTests}/${totalTests}`);
    
    if (passedTests === totalTests) {
        console.log("\n✅ 所有测试通过！图片转换功能正常工作。");
    } else {
        console.log("\n❌ 部分测试失败，请检查代码。");
    }
}

runTests().catch(console.error);
