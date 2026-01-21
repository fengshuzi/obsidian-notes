#!/usr/bin/env node

import { JSDOM } from "jsdom";

// 测试各种可能的 checklist HTML 格式
const testCases = [
    {
        name: "标准 checkbox - 未选中",
        html: '<ul><li><input type="checkbox"> 任务1</li></ul>'
    },
    {
        name: "标准 checkbox - 已选中",
        html: '<ul><li><input type="checkbox" checked> 任务1</li></ul>'
    },
    {
        name: "checkbox with checked=true",
        html: '<ul><li><input type="checkbox" checked="true"> 任务1</li></ul>'
    },
    {
        name: "checkbox with checked=checked",
        html: '<ul><li><input type="checkbox" checked="checked"> 任务1</li></ul>'
    },
    {
        name: "li with data-checked",
        html: '<ul><li data-checked="true">任务1</li></ul>'
    },
    {
        name: "li with data-checked=false",
        html: '<ul><li data-checked="false">任务1</li></ul>'
    },
    {
        name: "li with class checked",
        html: '<ul><li class="checked">任务1</li></ul>'
    },
    {
        name: "li with style text-decoration",
        html: '<ul><li style="text-decoration: line-through;">任务1</li></ul>'
    },
    {
        name: "Unicode checkbox - 未选中",
        html: '<ul><li>☐ 任务1</li></ul>'
    },
    {
        name: "Unicode checkbox - 已选中",
        html: '<ul><li>☑ 任务1</li></ul>'
    },
];

console.log("测试各种 checklist HTML 格式\n");
console.log("=".repeat(80));

testCases.forEach((testCase, index) => {
    console.log(`\n${index + 1}. ${testCase.name}`);
    console.log("-".repeat(80));
    console.log("HTML:", testCase.html);
    
    const dom = new JSDOM(testCase.html);
    const doc = dom.window.document;
    
    // 检查 input checkbox
    const checkbox = doc.querySelector('input[type="checkbox"]');
    if (checkbox) {
        console.log("✓ 找到 checkbox");
        console.log("  - checked 属性:", checkbox.checked);
        console.log("  - hasAttribute('checked'):", checkbox.hasAttribute('checked'));
        console.log("  - getAttribute('checked'):", checkbox.getAttribute('checked'));
    }
    
    // 检查 li 元素
    const li = doc.querySelector('li');
    if (li) {
        console.log("✓ 找到 li 元素");
        console.log("  - data-checked:", li.getAttribute('data-checked'));
        console.log("  - class:", li.className);
        console.log("  - style:", li.getAttribute('style'));
        console.log("  - textContent:", li.textContent);
    }
});

console.log("\n" + "=".repeat(80));
console.log("\n请在 macOS Notes 中创建一个真正的 checklist，");
console.log("然后运行 'node debug-notes.mjs' 来查看实际的 HTML 格式。");
