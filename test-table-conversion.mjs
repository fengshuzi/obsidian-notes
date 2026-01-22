#!/usr/bin/env node

import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// 实际从 macOS 备忘录获取的表格 HTML
const testTableHTML = `<table cellspacing="0" cellpadding="0" style="border-collapse: collapse; direction: ltr">
<tbody>
<tr><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div><font face=".PingFangUITextSC-Regular">列</font>1</div>
</td><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div><font face=".PingFangUITextSC-Regular">列</font>2</div>
</td></tr>
<tr><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div>xxx</div>
</td><td valign="top" style="border-style: solid; border-width: 1.0px 1.0px 1.0px 1.0px; border-color: #ccc; padding: 3.0px 5.0px 3.0px 5.0px; min-width: 70px"><div>ddd</div>
</td></tr>
</tbody>
</table>`;

console.log('=== 测试 1: 基础 Turndown (无插件) ===\n');

const basicTurndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

const basicResult = basicTurndown.turndown(testTableHTML);
console.log('转换结果:');
console.log(basicResult);
console.log('\n包含表格语法:', basicResult.includes('|'));
console.log('');

console.log('=== 测试 2: 使用 GFM 插件 ===\n');

const gfmTurndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

gfmTurndown.use(gfm);

const gfmResult = gfmTurndown.turndown(testTableHTML);
console.log('转换结果:');
console.log(gfmResult);
console.log('\n包含表格语法:', gfmResult.includes('|'));
console.log('');

console.log('=== 测试 3: 添加 div 处理规则 ===\n');

const customTurndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

customTurndown.use(gfm);

// 添加 div 处理规则（类似插件中的规则）
customTurndown.addRule("div", {
    filter: "div",
    replacement: (content) => {
        if (!content.trim()) {
            return "";
        }
        return content + "\n";
    },
});

const customResult = customTurndown.turndown(testTableHTML);
console.log('转换结果:');
console.log(customResult);
console.log('\n包含表格语法:', customResult.includes('|'));
console.log('');

console.log('=== 测试 4: 完整的插件配置 ===\n');

const fullTurndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
});

fullTurndown.use(gfm);

// 添加所有插件中的自定义规则
fullTurndown.addRule("br", {
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

fullTurndown.addRule("emptyHeading", {
    filter: (node) => {
        if (!node.nodeName.match(/^H[1-6]$/)) return false;
        const text = node.textContent || "";
        return text.trim() === "";
    },
    replacement: () => {
        return "";
    },
});

fullTurndown.addRule("emptyListItem", {
    filter: (node) => {
        if (node.nodeName !== "LI") return false;
        const text = node.textContent || "";
        return text.trim() === "";
    },
    replacement: () => {
        return "";
    },
});

fullTurndown.addRule("emptyDiv", {
    filter: (node) => {
        if (node.nodeName !== "DIV") return false;
        const text = node.textContent || "";
        return text.trim() === "";
    },
    replacement: () => {
        return "";
    },
});

fullTurndown.addRule("div", {
    filter: "div",
    replacement: (content) => {
        if (!content.trim()) {
            return "";
        }
        return content + "\n";
    },
});

const fullResult = fullTurndown.turndown(testTableHTML);
console.log('转换结果:');
console.log(fullResult);
console.log('\n包含表格语法:', fullResult.includes('|'));
console.log('');

console.log('=== 分析 ===');
console.log('原始 HTML 包含 <table>:', testTableHTML.includes('<table'));
console.log('原始 HTML 包含 <td>:', testTableHTML.includes('<td'));
console.log('原始 HTML 包含 <div>:', testTableHTML.includes('<div'));
console.log('原始 HTML 包含 <font>:', testTableHTML.includes('<font'));
