#!/usr/bin/env node

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";

const execAsync = promisify(exec);

async function debugNotes() {
    const folderName = "Notes"; // 修改为你的备忘录文件夹名称
    
    console.log(`正在获取 "${folderName}" 文件夹中的备忘录...\n`);
    
    try {
        // AppleScript 获取备忘录
        const script = `
            tell application "Notes"
                set notesList to {}
                set targetFolder to folder "${folderName}"
                set allNotes to notes of targetFolder
                
                log "找到 " & (count of allNotes) & " 个笔记"
                
                -- 获取所有笔记
                repeat with aNote in allNotes
                    set noteId to id of aNote
                    set noteTitle to name of aNote
                    set noteBody to body of aNote
                    set notePlaintext to plaintext of aNote
                    
                    -- 检查是否包含勾选标记
                    if noteBody contains "☑" or noteBody contains "☐" or noteBody contains "checkbox" or noteBody contains "checked" then
                        set noteData to noteId & "|||" & noteTitle & "|||" & notePlaintext & "|||" & noteBody
                        set end of notesList to noteData
                    end if
                end repeat
                
                -- 如果没有找到带勾选的笔记，返回前3个
                if (count of notesList) = 0 then
                    log "没有找到带勾选标记的笔记，返回前3个笔记"
                    repeat with i from 1 to 3
                        if i > (count of allNotes) then exit repeat
                        set aNote to note i of targetFolder
                        set noteId to id of aNote
                        set noteTitle to name of aNote
                        set noteBody to body of aNote
                        set notePlaintext to plaintext of aNote
                        
                        set noteData to noteId & "|||" & noteTitle & "|||" & notePlaintext & "|||" & noteBody
                        set end of notesList to noteData
                    end repeat
                end if
                
                set AppleScript's text item delimiters to "###SEPARATOR###"
                return notesList as text
            end tell
        `;

        const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
        
        if (!stdout || stdout.trim() === "") {
            console.log("没有找到备忘录");
            return;
        }

        // 解析返回的数据
        const notesData = stdout.split("###SEPARATOR###");
        
        console.log(`成功获取 ${notesData.length} 个笔记\n`);
        console.log("=" .repeat(80));
        
        for (let i = 0; i < notesData.length; i++) {
            const noteData = notesData[i];
            if (!noteData.trim()) continue;

            const parts = noteData.split("|||");
            if (parts.length >= 4) {
                const noteId = parts[0].trim();
                const noteTitle = parts[1].trim();
                const plaintext = parts[2];
                const htmlBody = parts[3];
                
                console.log(`\n笔记 ${i + 1}: ${noteTitle}`);
                console.log("-".repeat(80));
                
                // 保存完整 HTML 到文件
                const htmlFilename = `/tmp/note-${i + 1}-${noteTitle.replace(/[^a-zA-Z0-9]/g, '-')}.html`;
                await writeFile(htmlFilename, htmlBody, 'utf-8');
                console.log(`✓ 完整 HTML 已保存到: ${htmlFilename}`);
                
                // 分析 HTML 结构
                console.log("\n--- HTML 分析 ---");
                console.log(`HTML 长度: ${htmlBody.length} 字符`);
                
                // 检查列表
                const ulCount = (htmlBody.match(/<ul/gi) || []).length;
                const olCount = (htmlBody.match(/<ol/gi) || []).length;
                const liCount = (htmlBody.match(/<li/gi) || []).length;
                console.log(`列表元素: ${ulCount} 个 <ul>, ${olCount} 个 <ol>, ${liCount} 个 <li>`);
                
                // 检查 checkbox 相关
                const hasCheckbox = htmlBody.includes('checkbox');
                const hasCheckedSymbol = htmlBody.includes('☑');
                const hasUncheckedSymbol = htmlBody.includes('☐');
                const hasInput = htmlBody.includes('<input');
                
                console.log(`Checkbox 检测:`);
                console.log(`  - 包含 "checkbox" 字符串: ${hasCheckbox}`);
                console.log(`  - 包含 <input> 标签: ${hasInput}`);
                console.log(`  - 包含 ☑ 符号: ${hasCheckedSymbol}`);
                console.log(`  - 包含 ☐ 符号: ${hasUncheckedSymbol}`);
                
                // 如果有列表，显示第一个 ul 的内容
                if (ulCount > 0) {
                    const ulMatch = htmlBody.match(/<ul[^>]*>[\s\S]*?<\/ul>/i);
                    if (ulMatch) {
                        console.log("\n--- 第一个 <ul> 标签内容 ---");
                        console.log(ulMatch[0].substring(0, 1000)); // 显示前1000字符
                    }
                }
                
                // 如果有 li，显示前3个
                if (liCount > 0) {
                    const liMatches = htmlBody.match(/<li[^>]*>[\s\S]*?<\/li>/gi);
                    if (liMatches) {
                        console.log("\n--- 前3个 <li> 标签 ---");
                        liMatches.slice(0, 3).forEach((li, idx) => {
                            console.log(`\nLI ${idx + 1}:`);
                            console.log(li);
                        });
                    }
                }
                
                // 显示纯文本内容（前200字符）
                console.log("\n--- 纯文本内容（前200字符）---");
                console.log(plaintext.substring(0, 200));
                
                console.log("\n" + "=".repeat(80));
            }
        }
        
        console.log("\n✓ 调试完成！请检查 /tmp 目录下的 HTML 文件");
        
    } catch (error) {
        console.error("错误:", error.message);
        if (error.stderr) {
            console.error("stderr:", error.stderr);
        }
    }
}

debugNotes();
