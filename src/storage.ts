import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const execAsync = promisify(exec);

export interface Note {
    id: string;
    title: string;
    body: string;
    htmlBody: string;
    folder: string;
    creationDate: string;
    modificationDate: string;
    attachments: Attachment[];
}

export interface Attachment {
    filename: string;
    data: Buffer;
    format: string;
}

export class NotesStorage {
    private folderName: string;
    private turndownService: TurndownService;

    constructor(folderName: string) {
        this.folderName = folderName;
        
        // 初始化 Turndown 服务，支持 GitHub Flavored Markdown
        this.turndownService = new TurndownService({
            headingStyle: "atx",
            codeBlockStyle: "fenced",
            bulletListMarker: "-",
        });
        
        // 使用 GFM 插件（包含表格、删除线、任务列表等）
        this.turndownService.use(gfm);
        
        // 修复 br - macOS Notes 在 li 标签内使用 <br>
        // 在列表项内的 br 应该被忽略，其他地方使用软换行
        this.turndownService.addRule("br", {
            filter: "br",
            replacement: (content: string, node: HTMLElement) => {
                // 检查 br 是否在 li 标签内
                let parent = node.parentNode as HTMLElement;
                while (parent) {
                    if (parent.nodeName === "LI") {
                        // 在 li 内的 br 转换为空格
                        return " ";
                    }
                    parent = parent.parentNode as HTMLElement;
                }
                // 其他地方的 br 使用 Markdown 软换行
                return "  \n";
            },
        });
        
        // 修复空的标题标签（如 <h1><br></h1>）
        this.turndownService.addRule("emptyHeading", {
            filter: (node: HTMLElement) => {
                if (!node.nodeName.match(/^H[1-6]$/)) return false;
                const text = node.textContent || "";
                return text.trim() === "";
            },
            replacement: () => {
                // 空标题转换为空字符串（忽略）
                return "";
            },
        });
        
        // 修复空的列表项（如 <li><br></li>）
        this.turndownService.addRule("emptyListItem", {
            filter: (node: HTMLElement) => {
                if (node.nodeName !== "LI") return false;
                const text = node.textContent || "";
                return text.trim() === "";
            },
            replacement: () => {
                // 空列表项转换为空字符串（忽略）
                return "";
            },
        });
        
        // 修复空的 div 标签（如 <div><br></div>）
        this.turndownService.addRule("emptyDiv", {
            filter: (node: HTMLElement) => {
                if (node.nodeName !== "DIV") return false;
                const text = node.textContent || "";
                // 只包含空白字符的 div 转换为空字符串
                return text.trim() === "";
            },
            replacement: () => {
                // 空 div 转换为空字符串（忽略）
                return "";
            },
        });
        
        // 修复 div 标签 - macOS Notes 使用 div 作为段落
        this.turndownService.addRule("div", {
            filter: "div",
            replacement: (content: string) => {
                // 如果内容为空，返回空字符串
                if (!content.trim()) {
                    return "";
                }
                // 否则返回内容加一个换行
                return content + "\n";
            },
        });
    }

    setFolderName(folderName: string): void {
        this.folderName = folderName;
    }

    async getNotes(): Promise<Note[]> {
        try {
            // 使用 AppleScript 获取备忘录（包含 HTML body）
            const script = `
                tell application "Notes"
                    set notesList to {}
                    set targetFolder to folder "${this.folderName}"
                    repeat with aNote in notes of targetFolder
                        set noteId to id of aNote
                        set noteTitle to name of aNote
                        set noteBody to body of aNote
                        set notePlaintext to plaintext of aNote
                        
                        try
                            set noteFolder to name of container of aNote
                        on error
                            set noteFolder to "${this.folderName}"
                        end try
                        
                        set noteCreation to creation date of aNote as string
                        set noteMod to modification date of aNote as string
                        
                        set noteData to noteId & "|||" & noteTitle & "|||" & notePlaintext & "|||" & noteBody & "|||" & noteFolder & "|||" & noteCreation & "|||" & noteMod
                        set end of notesList to noteData
                    end repeat
                    
                    set AppleScript's text item delimiters to "###SEPARATOR###"
                    return notesList as text
                end tell
            `;

            const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
            
            if (!stdout || stdout.trim() === "") {
                return [];
            }

            // 解析返回的数据
            const notesData = stdout.split("###SEPARATOR###");
            const notes: Note[] = [];

            for (const noteData of notesData) {
                if (!noteData.trim()) continue;

                const parts = noteData.split("|||");
                if (parts.length >= 7) {
                    const noteTitle = parts[1].trim();
                    const htmlBody = parts[3];
                    
                    // 提取附件并转换为 Markdown
                    const { attachments, markdownBody } = await this.extractAttachments(htmlBody, noteTitle);
                    
                    notes.push({
                        id: parts[0].trim(),
                        title: noteTitle,
                        body: markdownBody,
                        htmlBody: htmlBody,
                        folder: parts[4].trim(),
                        creationDate: parts[5].trim(),
                        modificationDate: parts[6].trim(),
                        attachments: attachments,
                    });
                }
            }

            return notes;
        } catch (error) {
            console.error("获取备忘录失败:", error);
            throw new Error(`无法获取备忘录: ${error.message}`);
        }
    }

    private async extractAttachments(htmlBody: string, noteTitle: string): Promise<{ attachments: Attachment[], markdownBody: string }> {
        const attachments: Attachment[] = [];
        let counter = 1;
        
        // 调试：检查是否包含 checklist 相关的 HTML
        if (htmlBody.includes('<ul') || htmlBody.includes('<li')) {
            console.log('\n=== CHECKLIST DEBUG ===');
            console.log('笔记标题:', noteTitle);
            
            // 提取所有 ul 标签
            const ulMatches = htmlBody.match(/<ul[^>]*>[\s\S]*?<\/ul>/gi);
            if (ulMatches) {
                console.log(`找到 ${ulMatches.length} 个 <ul> 标签`);
                ulMatches.forEach((ul, index) => {
                    console.log(`\n--- UL ${index + 1} ---`);
                    console.log(ul.substring(0, 500)); // 只显示前500字符
                });
            }
            
            // 提取所有 li 标签
            const liMatches = htmlBody.match(/<li[^>]*>[\s\S]*?<\/li>/gi);
            if (liMatches) {
                console.log(`\n找到 ${liMatches.length} 个 <li> 标签`);
                liMatches.slice(0, 5).forEach((li, index) => {
                    console.log(`\n--- LI ${index + 1} ---`);
                    console.log(li);
                });
            }
            
            // 检查是否有 checkbox 相关的元素
            if (htmlBody.includes('checkbox') || htmlBody.includes('☑') || htmlBody.includes('☐')) {
                console.log('\n发现 checkbox 相关内容！');
                if (htmlBody.includes('checkbox')) console.log('- 包含 "checkbox" 字符串');
                if (htmlBody.includes('☑')) console.log('- 包含 ☑ 字符');
                if (htmlBody.includes('☐')) console.log('- 包含 ☐ 字符');
            }
            
            console.log('=== END DEBUG ===\n');
        }
        
        // 匹配 <img> 标签中的 base64 图片
        // 先移除所有换行符，然后再匹配
        let processedHtml = htmlBody.replace(/\r?\n|\r/g, '');
        const imgRegex = /<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"[^>]*>/gi;
        let match;

        console.log('\n=== 图片提取调试 ===');
        console.log('笔记标题:', noteTitle);
        console.log('HTML 中是否包含 <img>:', htmlBody.includes('<img'));
        console.log('HTML 中是否包含 base64:', htmlBody.includes('base64'));
        console.log('清理后的 HTML 长度:', processedHtml.length);

        while ((match = imgRegex.exec(processedHtml)) !== null) {
            try {
                const format = match[1]; // png, jpeg, gif, etc.
                const base64Data = match[2];
                const fullImgTag = match[0];
                
                console.log(`找到图片 ${counter}: 格式=${format}, base64长度=${base64Data.length}`);
                
                // 解码 base64 数据
                const buffer = Buffer.from(base64Data, 'base64');
                
                const filename = `${this.sanitizeFileName(noteTitle)}-${String(counter).padStart(3, '0')}.${format}`;
                console.log(`保存为: ${filename}`);
                
                attachments.push({
                    filename: filename,
                    data: buffer,
                    format: format,
                });
                
                // 替换为普通的 HTML img 标签，让 Turndown 来转换
                const imgTag = `<img src="attachments/${filename}" alt="">`;
                processedHtml = processedHtml.replace(fullImgTag, imgTag);
                
                counter++;
            } catch (error) {
                console.error("解析图片失败:", error);
            }
        }
        
        console.log(`共提取 ${attachments.length} 张图片`);
        console.log('=== 图片提取结束 ===\n');

        // 使用 Turndown 转换 HTML 为 Markdown
        let markdownBody = this.turndownService.turndown(processedHtml);
        
        // 清理开头的所有空白字符（换行、空格、br 等）
        markdownBody = markdownBody.replace(/^[\s\n\r<br>\/\\]+/, '');
        
        // 清理多余的换行（连续3个以上换行替换为2个）
        markdownBody = markdownBody.replace(/\n{3,}/g, '\n\n');
        
        // 清理行尾的空格
        markdownBody = markdownBody.replace(/ +$/gm, '');
        
        // 清理结尾的多余空行
        markdownBody = markdownBody.replace(/\n+$/, '\n');

        return { attachments, markdownBody };
    }

    private sanitizeFileName(name: string): string {
        return name
            .replace(/[\\/:*?"<>|]/g, "-")
            .replace(/\n/g, " ")
            .trim()
            .substring(0, 200);
    }

    async saveAttachments(attachments: Attachment[], attachmentsDir: string): Promise<void> {
        if (attachments.length === 0) return;

        try {
            // 确保附件目录存在
            await mkdir(attachmentsDir, { recursive: true });

            // 保存每个附件
            for (const attachment of attachments) {
                const filePath = join(attachmentsDir, attachment.filename);
                await writeFile(filePath, attachment.data);
            }
        } catch (error) {
            console.error("保存附件失败:", error);
            throw error;
        }
    }
}
