import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { readFile, writeFile } from "fs/promises";

// 初始化 Turndown
const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

turndownService.use(gfm);

// 修复 br 标签
turndownService.addRule("br", {
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

// 修复空标题
turndownService.addRule("emptyHeading", {
    filter: (node) => {
        if (!node.nodeName.match(/^H[1-6]$/)) return false;
        const text = node.textContent || "";
        return text.trim() === "";
    },
    replacement: () => "",
});

// 修复空列表项
turndownService.addRule("emptyListItem", {
    filter: (node) => {
        if (node.nodeName !== "LI") return false;
        const text = node.textContent || "";
        return text.trim() === "";
    },
    replacement: () => "",
});

async function testConversion() {
    try {
        // 读取实际的 HTML
        const html = await readFile('actual-html-output.html', 'utf-8');
        
        console.log('原始 HTML 长度:', html.length);
        console.log('包含 <img>:', html.includes('<img'));
        console.log('包含 base64:', html.includes('base64'));
        
        // 移除换行符
        let processedHtml = html.replace(/\r?\n|\r/g, '');
        console.log('清理后 HTML 长度:', processedHtml.length);
        
        // 提取图片
        const imgRegex = /<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"[^>]*>/gi;
        let match;
        let counter = 1;
        
        while ((match = imgRegex.exec(processedHtml)) !== null) {
            const format = match[1];
            const base64Data = match[2];
            const fullImgTag = match[0];
            
            console.log(`找到图片 ${counter}: 格式=${format}, base64长度=${base64Data.length}`);
            
            const filename = `test-image-${String(counter).padStart(3, '0')}.${format}`;
            const imgTag = `<img src="attachments/${filename}" alt="">`;
            processedHtml = processedHtml.replace(fullImgTag, imgTag);
            
            counter++;
        }
        
        console.log(`共提取 ${counter - 1} 张图片`);
        
        // 转换为 Markdown
        let markdown = turndownService.turndown(processedHtml);
        
        console.log('\n=== 转换前的 Markdown ===');
        console.log('长度:', markdown.length);
        console.log('换行数量:', (markdown.match(/\n/g) || []).length);
        
        // 保存原始转换结果
        await writeFile('markdown-before-cleanup.md', markdown);
        console.log('已保存到 markdown-before-cleanup.md');
        
        // 清理多余换行
        markdown = markdown.replace(/\n{3,}/g, '\n\n');
        markdown = markdown.replace(/ +$/gm, '');
        
        console.log('\n=== 清理后的 Markdown ===');
        console.log('长度:', markdown.length);
        console.log('换行数量:', (markdown.match(/\n/g) || []).length);
        
        // 保存清理后的结果
        await writeFile('markdown-after-cleanup.md', markdown);
        console.log('已保存到 markdown-after-cleanup.md');
        
        // 显示前500个字符
        console.log('\n=== Markdown 预览（前500字符）===');
        console.log(markdown.substring(0, 500));
        
    } catch (error) {
        console.error('错误:', error);
    }
}

testConversion();
