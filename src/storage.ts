import { exec } from "child_process";
import { promisify } from "util";
import { readFile as fsReadFile, rename } from "fs/promises";
import { existsSync, mkdirSync, unlinkSync } from "fs";
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
    /** 图片已直接写到磁盘，data 不再使用，保留字段兼容旧调用 */
    data: Buffer;
    format: string;
}

export interface NotesMeta {
    id: string;
    title: string;
    attachmentCount: number;
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
            const { stdout } = await execAsync(`echo ${JSON.stringify(cleanedHtml)} | pandoc -f html -t gfm`, { maxBuffer: 50 * 1024 * 1024 });
            return '\n\n' + stdout.trim() + '\n\n';
        } catch (error) {
            console.error('pandoc 转换失败，回退到正则方案:', error);
            return this.convertTableToMarkdown(tableHtml);
        }
    }

    setFolderName(folderName: string): void {
        this.folderName = folderName;
    }

    /**
     * 读取文件头 magic bytes 判断图片格式，返回扩展名如 png / jpeg / gif / webp
     */
    private async detectImageExt(filePath: string): Promise<string> {
        try {
            const buf = await fsReadFile(filePath);
            if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
            if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpeg';
            if (buf[0] === 0x47 && buf[1] === 0x49) return 'gif';
            if (buf[0] === 0x52 && buf[1] === 0x49 && buf[6] === 0x57) return 'webp';
            if (buf[0] === 0x42 && buf[1] === 0x4D) return 'bmp';
        } catch { /* ignore */ }
        return 'png'; // 默认 fallback
    }

    /**
     * 第一步：批量拿所有笔记的元数据（id / title / attachmentCount），stdout 极小
     */
    async getNotesMeta(): Promise<NotesMeta[]> {
        const countScript = `
            tell application "Notes"
                return count of notes of folder "${this.folderName}"
            end tell
        `;
        const { stdout: countOut } = await execAsync(
            `osascript -e '${countScript.replace(/'/g, "'\\''")}'`,
            { maxBuffer: 1 * 1024 * 1024 }
        );
        const total = parseInt(countOut.trim());
        if (isNaN(total) || total === 0) return [];

        const batchSize = 50;
        const result: NotesMeta[] = [];

        for (let offset = 0; offset < total; offset += batchSize) {
            const start = offset + 1;
            const end = Math.min(offset + batchSize, total);
            // 只拿 id / title / attachmentCount，不拿 body，stdout 极小
            const script = `
                tell application "Notes"
                    set output to ""
                    set targetFolder to folder "${this.folderName}"
                    set counter to 0
                    repeat with aNote in notes of targetFolder
                        set counter to counter + 1
                        if counter < ${start} then
                        else if counter <= ${end} then
                            set noteId to id of aNote
                            set noteTitle to name of aNote
                            set attCnt to (count of attachments of aNote) as string
                            set output to output & noteId & "|||" & noteTitle & "|||" & attCnt & "###SEP###"
                        end if
                        if counter >= ${end} then exit repeat
                    end repeat
                    return output
                end tell
            `;
            const { stdout } = await execAsync(
                `osascript -e '${script.replace(/'/g, "'\\''")}'`,
                { maxBuffer: 10 * 1024 * 1024 }
            );
            for (const chunk of stdout.split('###SEP###')) {
                const parts = chunk.trim().split('|||');
                if (parts.length >= 3) {
                    result.push({
                        id: parts[0].trim(),
                        title: parts[1].trim(),
                        attachmentCount: parseInt(parts[2].trim()) || 0,
                    });
                }
            }
        }
        return result;
    }

    /**
     * 第二步：单独拿一条笔记的 body（HTML），每次只一条，stdout 上限 = 单条文本大小
     */
    async getNoteBody(noteId: string): Promise<{ htmlBody: string; folder: string; creationDate: string; modificationDate: string }> {
        const script = `
            tell application "Notes"
                set aNote to note id "${noteId}"
                set noteBody to body of aNote
                try
                    set noteFolder to name of container of aNote
                on error
                    set noteFolder to "${this.folderName}"
                end try
                set noteCreation to creation date of aNote as string
                set noteMod to modification date of aNote as string
                return noteBody & "###META###" & noteFolder & "|||" & noteCreation & "|||" & noteMod
            end tell
        `;
        const { stdout } = await execAsync(
            `osascript -e '${script.replace(/'/g, "'\\''")}'`,
            { maxBuffer: 500 * 1024 * 1024 }  // 单条 500MB，应对大量图片的笔记
        );
        const metaSep = stdout.lastIndexOf('###META###');
        const htmlBody = metaSep >= 0 ? stdout.slice(0, metaSep) : stdout;
        const metaPart = metaSep >= 0 ? stdout.slice(metaSep + 10) : '';
        const metaParts = metaPart.split('|||');
        return {
            htmlBody,
            folder: metaParts[0]?.trim() || this.folderName,
            creationDate: metaParts[1]?.trim() || '',
            modificationDate: metaParts[2]?.trim() || '',
        };
    }

    /**
     * 第三步：把某条笔记的第 N 个 attachment 直接用 AppleScript save 写到指定路径
     * 完全不走 stdout，彻底绕开 maxBuffer
     */
    async saveAttachmentToPath(noteId: string, attIndex: number, destPath: string): Promise<void> {
        const script = `
            tell application "Notes"
                set aNote to note id "${noteId}"
                save attachment ${attIndex} of aNote in POSIX file "${destPath}"
            end tell
        `;
        await execAsync(
            `osascript -e '${script.replace(/'/g, "'\\''")}'`,
            { maxBuffer: 1 * 1024 * 1024 }
        );
    }

    /**
     * 通过 AppleScript save attachment 直接写磁盘，处理图片附件
     * 不走 stdout base64，彻底解决 maxBuffer 问题
     */
    async extractAttachmentsViaAppleScript(
        noteId: string,
        noteTitle: string,
        attachmentCount: number,
        htmlBody: string,
        attachmentsAbsPath: string,
        tmpDir: string
    ): Promise<{ attachments: Attachment[]; markdownBody: string }> {
        const safeTitle = this.sanitizeFileName(noteTitle);
        const attachments: Attachment[] = [];

        // 先把所有 attachment save 到 tmp，探测格式，重命名到 attachments/
        let imgCounter = 0;
        for (let i = 1; i <= attachmentCount; i++) {
            const tmpPath = join(tmpDir, `att-${noteId.replace(/[^a-zA-Z0-9]/g, '_').slice(-16)}-${i}`);
            try {
                // 幂等：tmp 里若已存在同名文件先删掉，避免 save 报"已存在"
                if (existsSync(tmpPath)) {
                    unlinkSync(tmpPath);
                }
                await this.saveAttachmentToPath(noteId, i, tmpPath);
                if (!existsSync(tmpPath)) continue;

                const ext = await this.detectImageExt(tmpPath);
                imgCounter++;
                const filename = `${safeTitle}-${String(imgCounter).padStart(3, '0')}.${ext}`;
                const destPath = join(attachmentsAbsPath, filename);

                // 幂等：目标已存在则覆盖
                if (existsSync(destPath)) {
                    unlinkSync(destPath);
                }
                await rename(tmpPath, destPath);
                attachments.push({ filename, data: Buffer.alloc(0), format: ext });
            } catch (err: any) {
                // -10000: 非图片类 attachment（内嵌对象等），静默跳过
                // 其他错误才打日志
                if (!err?.message?.includes('-10000') && !err?.message?.includes('AppleEvent')) {
                    console.warn(`附件 ${i} 跳过 (${noteTitle}):`, err?.message);
                }
                if (existsSync(tmpPath)) {
                    try { unlinkSync(tmpPath); } catch {}
                }
            }
        }

        // HTML 里的 base64 img 替换为已保存的文件名（按顺序对应）
        let processedHtml = htmlBody.replace(/\r?\n|\r/g, '');
        let imgIdx = 0;
        processedHtml = processedHtml.replace(
            /<img[^>]+src="data:image\/[^;]+;base64,[^"]*"[^>]*>/gi,
            () => {
                const att = attachments[imgIdx++];
                if (!att) return '';
                return `<img src="attachments/${att.filename}" alt="">`;
            }
        );

        const markdownBody = await this.htmlToMarkdown(processedHtml, htmlBody);
        return { attachments, markdownBody };
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

    async extractAttachments(htmlBody: string, noteTitle: string): Promise<{ attachments: Attachment[], markdownBody: string }> {
        const attachments: Attachment[] = [];
        let counter = 1;

        let processedHtml = htmlBody.replace(/\r?\n|\r/g, '');
        const imgRegex = /<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"[^>]*>/gi;
        let match;

        console.log('\n=== 处理笔记:', noteTitle, '===');

        while ((match = imgRegex.exec(processedHtml)) !== null) {
            try {
                const format = match[1];
                const base64Data = match[2];
                const fullImgTag = match[0];
                const buffer = Buffer.from(base64Data, 'base64');
                const filename = `${this.sanitizeFileName(noteTitle)}-${String(counter).padStart(3, '0')}.${format}`;
                attachments.push({ filename, data: buffer, format });
                const imgTag = `<img src="attachments/${filename}" alt="">`;
                processedHtml = processedHtml.replace(fullImgTag, imgTag);
                counter++;
            } catch (error) {
                console.error("✗ 解析图片失败:", error);
            }
        }

        const markdownBody = await this.htmlToMarkdown(processedHtml, htmlBody);
        return { attachments, markdownBody };
    }

    /** 将处理过的 HTML 转为 Markdown（含表格处理） */
    private async htmlToMarkdown(processedHtml: string, originalHtml: string): Promise<string> {
        const hasTable = originalHtml.includes('<table');

        let markdownBody = this.turndownService.turndown(processedHtml);

        if (hasTable) {
            const tableMatches = originalHtml.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
            if (tableMatches) {
                for (const tableHtml of tableMatches) {
                    let markdownTable: string;
                    if (this.hasPandoc) {
                        markdownTable = await this.convertTableWithPandoc(tableHtml);
                    } else {
                        markdownTable = this.convertTableToMarkdown(tableHtml);
                    }
                    markdownBody = markdownBody.replace(/<table[^>]*>[\s\S]*?<\/table>/i, markdownTable);
                }
            }
        }

        markdownBody = markdownBody.replace(/^[\s\n\r<br>\/\\]+/, '');
        markdownBody = markdownBody.replace(/\n{3,}/g, '\n\n');
        markdownBody = markdownBody.replace(/ +$/gm, '');
        markdownBody = markdownBody.replace(/\n+$/, '\n');
        return markdownBody;
    }

    private sanitizeFileName(name: string): string {
        return name
            .replace(/[\\/:*?"<>|]/g, "-")
            .replace(/\n/g, " ")
            .trim()
            .substring(0, 200);
    }

}
