#!/usr/bin/env node

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";

const execAsync = promisify(exec);

async function getNoteAsHtml() {
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
                
                -- 获取笔记的 HTML body
                set noteTitle to name of targetNote
                set noteBody to body of targetNote
                
                -- 返回信息
                return noteTitle & "|||" & noteBody
            end tell
        `;

        const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
        
        if (stdout.includes("未找到笔记")) {
            console.log("未找到包含 '20250613165602' 的笔记");
            return;
        }

        const parts = stdout.split("|||");
        const title = parts[0];
        const html = parts[1];
        
        console.log("笔记标题:", title);
        console.log("\n" + "=".repeat(80));
        console.log("HTML 内容:");
        console.log("=".repeat(80));
        console.log(html);
        
        // 保存到文件
        await writeFile("obsidian-notes/note-html-output.html", html, 'utf-8');
        console.log("\n✓ HTML 已保存到: obsidian-notes/note-html-output.html");
        
        // 分析 HTML 结构
        console.log("\n" + "=".repeat(80));
        console.log("HTML 结构分析:");
        console.log("=".repeat(80));
        
        // 统计各种标签
        const tags = {
            "div": (html.match(/<div[^>]*>/g) || []).length,
            "br": (html.match(/<br[^>]*>/g) || []).length,
            "ul": (html.match(/<ul[^>]*>/g) || []).length,
            "li": (html.match(/<li[^>]*>/g) || []).length,
            "p": (html.match(/<p[^>]*>/g) || []).length,
            "img": (html.match(/<img[^>]*>/g) || []).length,
        };
        
        console.log("\n标签统计:");
        Object.entries(tags).forEach(([tag, count]) => {
            console.log(`  ${tag}: ${count}`);
        });
        
        // 显示前几个标签
        console.log("\n前面的标签结构:");
        const firstPart = html.substring(0, 500);
        const tagMatches = firstPart.match(/<[^>]+>/g);
        if (tagMatches) {
            tagMatches.slice(0, 10).forEach((tag, i) => {
                console.log(`  ${i + 1}. ${tag}`);
            });
        }
        
    } catch (error) {
        console.error("错误:", error.message);
    }
}

getNoteAsHtml();
