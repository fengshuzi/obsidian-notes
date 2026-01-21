#!/usr/bin/env node

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// 实际的 macOS Notes HTML
const testHTML = `<div><h1>和医生沟通事宜</h1><h1><br></h1></div>
<ul>
<li>买钙片足够到九月底<br></li>
<li>多种维生素的<br></li>
<li>果糖开四盒最好到九月底<br></li>
<li>婴儿体重 两斤多<br></li>
<li>羊水是否足够<br></li>
<li>腹围<br></li>
<li>股骨长短有补吗？<br></li>
<li>下一次产检时间  两个星期<br></li>
<li>护士前台打印转院资料<br></li>
<li><br></li>
</ul>`;

// 初始化 Turndown
const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

turndownService.use(gfm);

// 修复 br - macOS Notes 在 li 标签内使用 <br>
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

// 修复空的标题标签
turndownService.addRule("emptyHeading", {
    filter: (node) => {
        if (!node.nodeName.match(/^H[1-6]$/)) return false;
        const text = node.textContent || "";
        return text.trim() === "";
    },
    replacement: () => {
        return "";
    },
});

// 修复空的列表项
turndownService.addRule("emptyListItem", {
    filter: (node) => {
        if (node.nodeName !== "LI") return false;
        const text = node.textContent || "";
        return text.trim() === "";
    },
    replacement: () => {
        return "";
    },
});

console.log("原始 HTML:");
console.log("=".repeat(80));
console.log(testHTML);
console.log("\n");

console.log("转换后的 Markdown:");
console.log("=".repeat(80));
const markdown = turndownService.turndown(testHTML);
console.log(markdown);
console.log("\n");

console.log("Markdown 行数:", markdown.split('\n').length);
console.log("是否有多余空行:", markdown.includes('\n\n\n'));
