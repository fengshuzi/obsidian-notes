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
    private hasPandoc: boolean = false;

    constructor(folderName: string) {
        this.folderName = folderName;

        // 检测 pandoc 是否可用
        this.checkPandocAvailability();

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

    /**
     * 检测系统是否安装了 pandoc
     */
    private checkPandocAvailability(): void {
        try {
            const { execSync } = require('child_process');
            execSync('which pandoc', { stdio: 'ignore' });
            this.hasPandoc = true;
            console.log('✓ 检测到 pandoc，将使用 pandoc 转换表格');
        } catch {
            this.hasPandoc = false;
            console.log('✗ 未检测到 pandoc，将使用正则方案转换表格');
        }
    }

    /**
     * 使用 pandoc 将表格 HTML 转换为 Markdown
     * 预处理清理脏 HTML 属性后调用 pandoc
     */
    private async convertTableWithPandoc(tableHtml: string): Promise<string> {
        // 预处理：清理 macOS Notes 的脏属性
        let cleanedHtml = tableHtml
            .replace(/ style="[^"]*"/gi, '')
            .replace(/ valign="[^"]*"/gi, '')
            .replace(/ cellspacing="[^"]*"/gi, '')
            .replace(/ cellpadding="[^"]*"/gi, '')
            .replace(/<\/?div>/gi, '')
            .replace(/<font[^>]*>/gi, '')
            .replace(/<\/font>/gi, '');

        try {
            // 调用 pandoc 转换
            const { stdout } = await execAsync(`echo ${JSON.stringify(cleanedHtml)} | pandoc -f html -t gfm`);
            return '\n\n' + stdout.trim() + '\n\n';
        } catch (error) {
            console.error('pandoc 转换失败，回退到正则方案:', error);
            return this.convertTableToMarkdown(tableHtml);
        }
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

    /**
     * 使用正则表达式将表格 HTML 转换为 Markdown
     * 轻量级方案，不依赖 JSDOM
     */
    private convertTableToMarkdown(tableHtml: string): string {
        // 移除 div 和 font 标签
        tableHtml = tableHtml.replace(/<\/?div[^>]*>/gi, '');
        tableHtml = tableHtml.replace(/<\/?font[^>]*>/gi, '');

        // 提取所有行
        const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
        if (!rowMatches || rowMatches.length === 0) {
            return tableHtml; // 无法解析，返回原始 HTML
        }

        const rows: string[][] = [];

        // 解析每一行
        for (const rowHtml of rowMatches) {
            const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
            if (!cellMatches) continue;

            const cells: string[] = [];
            for (const cellHtml of cellMatches) {
                // 提取单元格内容
                const content = cellHtml
                    .replace(/<t[dh][^>]*>/gi, '')
                    .replace(/<\/t[dh]>/gi, '')
                    .replace(/<[^>]+>/g, '') // 移除所有 HTML 标签
                    .trim();
                cells.push(content);
            }

            if (cells.length > 0) {
                rows.push(cells);
            }
        }

        if (rows.length === 0) {
            return tableHtml; // 无法解析，返回原始 HTML
        }

        // 构建 Markdown 表格
        let markdown = '\n\n';

        // 第一行作为表头
        markdown += '| ' + rows[0].join(' | ') + ' |\n';

        // 分隔线
        markdown += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';

        // 数据行
        for (let i = 1; i < rows.length; i++) {
            markdown += '| ' + rows[i].join(' | ') + ' |\n';
        }

        markdown += '\n';

        return markdown;
    }

    private async extractAttachments(htmlBody: string, noteTitle: string): Promise<{ attachments: Attachment[], markdownBody: string }> {
        const attachments: Attachment[] = [];
        let counter = 1;

        // 匹配 <img> 标签中的 base64 图片
        // 先移除所有换行符，然后再匹配
        let processedHtml = htmlBody.replace(/\r?\n|\r/g, '');
        const imgRegex = /<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"[^>]*>/gi;
        let match;

        console.log('\n=== 处理笔记:', noteTitle, '===');

        // 检查是否包含表格
        const hasTable = htmlBody.includes('<table');
        if (hasTable) {
            console.log('✓ 发现表格');
        }

        while ((match = imgRegex.exec(processedHtml)) !== null) {
            try {
                const format = match[1]; // png, jpeg, gif, etc.
                const base64Data = match[2];
                const fullImgTag = match[0];

                console.log(`✓ 找到图片 ${counter}: 格式=${format}`);

                // 解码 base64 数据
                const buffer = Buffer.from(base64Data, 'base64');

                const filename = `${this.sanitizeFileName(noteTitle)}-${String(counter).padStart(3, '0')}.${format}`;

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
                console.error("✗ 解析图片失败:", error);
            }
        }

        if (attachments.length > 0) {
            console.log(`✓ 共提取 ${attachments.length} 张图片`);
        }

        // 先用 Turndown 转换 HTML 为 Markdown
        let markdownBody = this.turndownService.turndown(processedHtml);

        // 处理表格（如果有）- 在 Markdown 中替换
        if (hasTable) {
            // 提取原始 HTML 中的所有表格
            const tableMatches = htmlBody.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
            if (tableMatches) {
                for (const tableHtml of tableMatches) {
                    // 根据 pandoc 可用性选择转换方案
                    let markdownTable: string;
                    if (this.hasPandoc) {
                        markdownTable = await this.convertTableWithPandoc(tableHtml);
                    } else {
                        markdownTable = this.convertTableToMarkdown(tableHtml);
                    }
                    // 在 Markdown 中查找并替换对应的 HTML 表格
                    // Turndown 可能保留了原始 HTML，所以直接替换
                    markdownBody = markdownBody.replace(/<table[^>]*>[\s\S]*?<\/table>/i, markdownTable);
                }
                console.log('✓ 表格转换完成');
            }
        }

        // 清理开头的所有空白字符（换行、空格、br 等）
        markdownBody = markdownBody.replace(/^[\s\n\r<br>\/\\]+/, '');

        // 清理多余的换行（连续3个以上换行替换为2个）
        markdownBody = markdownBody.replace(/\n{3,}/g, '\n\n');

        // 清理行尾的空格
        markdownBody = markdownBody.replace(/ +$/gm, '');

        // 清理结尾的多余空行
        markdownBody = markdownBody.replace(/\n+$/, '\n');

        console.log('=== 处理完成 ===\n');

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
