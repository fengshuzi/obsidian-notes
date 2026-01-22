#!/usr/bin/env node

import TurndownService from "turndown";
import { gfm, tables, strikethrough, taskListItems } from "turndown-plugin-gfm";

console.log('=== 测试 GFM 插件的各个功能 ===\n');

// 测试删除线
console.log('1. 测试删除线:');
const strikeHTML = '<p>这是<del>删除的</del>文字</p>';
const td1 = new TurndownService();
td1.use(strikethrough);
console.log('输入:', strikeHTML);
console.log('输出:', td1.turndown(strikeHTML));
console.log('');

// 测试任务列表
console.log('2. 测试任务列表:');
const taskHTML = '<ul><li><input type="checkbox" checked> 已完成</li><li><input type="checkbox"> 未完成</li></ul>';
const td2 = new TurndownService();
td2.use(taskListItems);
console.log('输入:', taskHTML);
console.log('输出:', td2.turndown(taskHTML));
console.log('');

// 测试表格 - 标准格式
console.log('3. 测试表格 (标准格式):');
const tableHTML1 = '<table><thead><tr><th>列1</th><th>列2</th></tr></thead><tbody><tr><td>数据1</td><td>数据2</td></tr></tbody></table>';
const td3 = new TurndownService();
td3.use(tables);
console.log('输入:', tableHTML1);
console.log('输出:', td3.turndown(tableHTML1));
console.log('');

// 测试表格 - 无 thead
console.log('4. 测试表格 (无 thead):');
const tableHTML2 = '<table><tbody><tr><td>列1</td><td>列2</td></tr><tr><td>数据1</td><td>数据2</td></tr></tbody></table>';
const td4 = new TurndownService();
td4.use(tables);
console.log('输入:', tableHTML2);
console.log('输出:', td4.turndown(tableHTML2));
console.log('');

// 测试表格 - 无 tbody
console.log('5. 测试表格 (无 tbody):');
const tableHTML3 = '<table><tr><td>列1</td><td>列2</td></tr><tr><td>数据1</td><td>数据2</td></tr></table>';
const td5 = new TurndownService();
td5.use(tables);
console.log('输入:', tableHTML3);
console.log('输出:', td5.turndown(tableHTML3));
console.log('');

// 测试完整 GFM
console.log('6. 测试完整 GFM (包含表格):');
const td6 = new TurndownService();
td6.use(gfm);
console.log('输入:', tableHTML1);
console.log('输出:', td6.turndown(tableHTML1));
console.log('');

console.log('7. 测试完整 GFM (无 thead):');
const td7 = new TurndownService();
td7.use(gfm);
console.log('输入:', tableHTML2);
console.log('输出:', td7.turndown(tableHTML2));
