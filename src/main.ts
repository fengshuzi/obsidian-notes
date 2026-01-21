import { Plugin, Platform, Notice, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";
import { NotesStorage } from "./storage";

interface NotesSettings {
    folderName: string;
    syncInterval: number;
    autoSync: boolean;
    notesFolder: string;
}

const DEFAULT_SETTINGS: NotesSettings = {
    folderName: "Notes",
    syncInterval: 300000, // 5分钟
    autoSync: false,
    notesFolder: "备忘录"
};

export default class NotesPlugin extends Plugin {
    storage: NotesStorage;
    settings: NotesSettings;
    syncIntervalId: number | null = null;

    async onload(): Promise<void> {
        console.log("加载备忘录同步插件");

        if (!Platform.isMacOS) {
            new Notice("备忘录同步插件仅支持 macOS 系统");
            console.warn("备忘录同步插件仅支持 macOS 系统");
            return;
        }

        await this.loadSettings();

        this.storage = new NotesStorage(this.settings.folderName);

        // 添加侧边栏按钮
        this.addRibbonIcon("sync", "同步备忘录", () => {
            this.syncNotes();
        });

        // 添加命令：手动同步
        this.addCommand({
            id: "sync-notes",
            name: "同步备忘录",
            callback: () => this.syncNotes(),
        });

        // 添加命令：立即同步一次
        this.addCommand({
            id: "sync-notes-once",
            name: "立即同步备忘录（一次）",
            callback: () => this.syncNotes(),
        });

        // 添加设置页面
        this.addSettingTab(new NotesSettingTab(this.app, this));

        // 如果启用自动同步，启动定时器
        if (this.settings.autoSync) {
            this.startAutoSync();
        }

        // 插件加载时执行一次同步
        this.syncNotes();
    }

    async onunload(): Promise<void> {
        console.log("卸载备忘录同步插件");
        this.stopAutoSync();
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        
        // 更新 storage 的文件夹名称
        if (this.storage) {
            this.storage.setFolderName(this.settings.folderName);
        }

        // 重启自动同步
        if (this.settings.autoSync) {
            this.startAutoSync();
        } else {
            this.stopAutoSync();
        }
    }

    startAutoSync(): void {
        this.stopAutoSync();
        this.syncIntervalId = window.setInterval(() => {
            this.syncNotes();
        }, this.settings.syncInterval);
        console.log(`自动同步已启动，间隔: ${this.settings.syncInterval}ms`);
    }

    stopAutoSync(): void {
        if (this.syncIntervalId !== null) {
            window.clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
            console.log("自动同步已停止");
        }
    }

    async syncNotes(): Promise<void> {
        try {
            new Notice("开始同步备忘录...");
            
            // 从 macOS 备忘录获取笔记
            const notes = await this.storage.getNotes();
            
            if (notes.length === 0) {
                new Notice("没有找到备忘录");
                return;
            }

            // 确保目标文件夹存在
            const folderPath = normalizePath(this.settings.notesFolder);
            const folder = this.app.vault.getAbstractFileByPath(folderPath);
            
            if (!folder) {
                await this.app.vault.createFolder(folderPath);
            }

            // 确保附件文件夹存在
            const attachmentsPath = normalizePath(`${folderPath}/attachments`);
            const attachmentsFolder = this.app.vault.getAbstractFileByPath(attachmentsPath);
            if (!attachmentsFolder) {
                await this.app.vault.createFolder(attachmentsPath);
            }

            let syncCount = 0;
            let imageCount = 0;
            
            // 同步每个笔记
            for (const note of notes) {
                const fileName = this.sanitizeFileName(note.title || "未命名笔记");
                const filePath = normalizePath(`${folderPath}/${fileName}.md`);
                
                // 保存附件
                if (note.attachments && note.attachments.length > 0) {
                    // 使用 Obsidian 的 vault API 保存附件
                    for (const attachment of note.attachments) {
                        const attachmentPath = normalizePath(`${attachmentsPath}/${attachment.filename}`);
                        const existingAttachment = this.app.vault.getAbstractFileByPath(attachmentPath);
                        
                        // 将 Buffer 转换为 ArrayBuffer
                        const arrayBuffer = attachment.data.buffer.slice(
                            attachment.data.byteOffset,
                            attachment.data.byteOffset + attachment.data.byteLength
                        ) as ArrayBuffer;
                        
                        if (existingAttachment instanceof TFile) {
                            // 文件存在，更新
                            await this.app.vault.modifyBinary(existingAttachment, arrayBuffer);
                        } else {
                            // 文件不存在，创建
                            await this.app.vault.createBinary(attachmentPath, arrayBuffer);
                        }
                    }
                    imageCount += note.attachments.length;
                }
                
                // 构建笔记内容
                const content = this.buildNoteContent(note);
                
                // 检查文件是否存在
                const existingFile = this.app.vault.getAbstractFileByPath(filePath);
                
                if (existingFile instanceof TFile) {
                    // 文件存在，检查是否需要更新
                    const existingContent = await this.app.vault.read(existingFile);
                    if (existingContent !== content) {
                        await this.app.vault.modify(existingFile, content);
                        syncCount++;
                    }
                } else {
                    // 文件不存在，创建新文件
                    await this.app.vault.create(filePath, content);
                    syncCount++;
                }
            }

            new Notice(`同步完成！更新了 ${syncCount} 个笔记，${imageCount} 张图片`);
            console.log(`同步完成，共 ${notes.length} 个笔记，更新了 ${syncCount} 个，${imageCount} 张图片`);
        } catch (error) {
            console.error("同步备忘录失败:", error);
            new Notice(`同步失败: ${error.message}`);
        }
    }

    sanitizeFileName(name: string): string {
        // 移除或替换文件名中的非法字符
        return name
            .replace(/[\\/:*?"<>|]/g, "-")
            .replace(/\n/g, " ")
            .trim()
            .substring(0, 200); // 限制文件名长度
    }

    buildNoteContent(note: any): string {
        // 直接返回转换后的 Markdown 内容，不添加额外的元数据
        return note.body;
    }
}

class NotesSettingTab extends PluginSettingTab {
    plugin: NotesPlugin;

    constructor(app: any, plugin: NotesPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl("h2", { text: "备忘录同步设置" });

        new Setting(containerEl)
            .setName("备忘录文件夹名称")
            .setDesc("指定要同步的 macOS 备忘录文件夹名称（默认：Notes）")
            .addText((text) =>
                text
                    .setPlaceholder("Notes")
                    .setValue(this.plugin.settings.folderName)
                    .onChange(async (value) => {
                        this.plugin.settings.folderName = value || "Notes";
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Obsidian 目标文件夹")
            .setDesc("笔记将同步到此文件夹（默认：备忘录）")
            .addText((text) =>
                text
                    .setPlaceholder("备忘录")
                    .setValue(this.plugin.settings.notesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.notesFolder = value || "备忘录";
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("启用自动同步")
            .setDesc("定期自动同步备忘录")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoSync)
                    .onChange(async (value) => {
                        this.plugin.settings.autoSync = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("同步间隔（分钟）")
            .setDesc("自动同步的时间间隔")
            .addText((text) =>
                text
                    .setPlaceholder("5")
                    .setValue(String(this.plugin.settings.syncInterval / 60000))
                    .onChange(async (value) => {
                        const minutes = parseInt(value) || 5;
                        this.plugin.settings.syncInterval = minutes * 60000;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
