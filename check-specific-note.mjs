#!/usr/bin/env node

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";

const execAsync = promisify(exec);

async function checkNote() {
    try {
        const script = `
            tell application "Notes"
                set targetFolder to folder "Notes"
                set targetNote to missing value
                
                -- 查找标题包含 "20250613165602" 的笔记
                repeat with aNote in notes of targetFolder
                    if name of aNote contains "20250613165602" then
                        set targetNote to aNote
                        exit repeat
                    end if
                end repeat
                
                if targetNote is missing value then
                    return "未找到笔记"
                end if
                
                -- 获取笔记的所有信息
                set noteTitle to name of targetNote
                set noteBody to body of targetNote
                set notePlaintext to plaintext of targetNote
                
                -- 返回信息
                return noteTitle & "|||" & notePlaintext & "|||" & noteBody
            end tell
        `;

        const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
        
        if (stdout.includes("未找到笔记")) {
            console.log("未找到包含 '20250613165602' 的笔记");
            return;
        }

        const parts = stdout.split("|||");
        const title = parts[0];
        const plaintext = parts[1];
        const html = parts[2];
        
        console.log("笔记标题:", title);
        console.log("\n" + "=".repeat(80));
        console.log("纯文本内容:");
        console.log("=".repeat(80));
        console.log(plaintext);
        
        console.log("\n" + "=".repeat(80));
        console.log("HTML 内容:");
        console.log("=".repeat(80));
        console.log(html);
        
        // 保存到文件
        await writeFile("/tmp/specific-note.html", html, 'utf-8');
        console.log("\n✓ HTML 已保存到: /tmp/specific-note.html");
        
        // 分析 HTML
        console.log("\n" + "=".repeat(80));
        console.log("HTML 分析:");
        console.log("=".repeat(80));
        
        // 检查各种可能的 checklist 标记
        const checks = {
            "包含 <input": html.includes("<input"),
            "包含 checkbox": html.includes("checkbox"),
            "包含 checked": html.includes("checked"),
            "包含 data-checked": html.includes("data-checked"),
            "包含 ☑": html.includes("☑"),
            "包含 ☐": html.includes("☐"),
            "包含 class=": html.includes('class="'),
            "包含 style=": html.includes('style="'),
        };
        
        Object.entries(checks).forEach(([key, value]) => {
            console.log(`${value ? "✓" : "✗"} ${key}`);
        });
        
        // 如果包含 style，显示所有 style 属性
        if (checks["包含 style="]) {
            console.log("\n找到的 style 属性:");
            const styleMatches = html.match(/style="[^"]*"/g);
            if (styleMatches) {
                styleMatches.forEach((match, i) => {
                    console.log(`  ${i + 1}. ${match}`);
                });
            }
        }
        
        // 显示所有 li 标签
        console.log("\n所有 <li> 标签:");
        const liMatches = html.match(/<li[^>]*>[\s\S]*?<\/li>/gi);
        if (liMatches) {
            liMatches.forEach((li, i) => {
                console.log(`\n${i + 1}. ${li.substring(0, 200)}`);
            });
        }
        
    } catch (error) {
        console.error("错误:", error.message);
    }
}

checkNote();
