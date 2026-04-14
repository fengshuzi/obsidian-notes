import { App, Plugin, PluginSettingTab, Setting, Notice, Platform, TFile, normalizePath } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { NotesStorage } from './src/storage';

interface ObsidianNotesSettings {
  /** macOS 备忘录：要同步的 App 内文件夹名称 */
  memoFolderName: string;
  /** macOS 备忘录：在 Obsidian 中的目标文件夹 */
  memoNotesFolder: string;
}

const DEFAULT_SETTINGS: ObsidianNotesSettings = {
  memoFolderName: 'Notes',
  memoNotesFolder: '备忘录',
};

export default class ObsidianNotesPlugin extends Plugin {
  settings: ObsidianNotesSettings;
  notesStorage: NotesStorage | null = null;

  async onload() {
    await this.loadSettings();

    if (Platform.isMacOS) {
      this.notesStorage = new NotesStorage(this.settings.memoFolderName);
    }

    this.addRibbonIcon('sync', '同步 macOS 备忘录', () => this.syncNotes());

    this.addCommand({
      id: 'sync-memo',
      name: '同步 macOS 备忘录',
      callback: () => this.syncNotes()
    });

    this.addSettingTab(new ObsidianNotesSettingTab(this.app, this));
  }

  async loadSettings() {
    interface SavedSettings { memoFolderName?: string; memoNotesFolder?: string; }
    const saved = (await this.loadData() as SavedSettings | null) ?? {};
    this.settings = {
      memoFolderName: saved.memoFolderName ?? DEFAULT_SETTINGS.memoFolderName,
      memoNotesFolder: saved.memoNotesFolder ?? DEFAULT_SETTINGS.memoNotesFolder,
    };
    if (this.notesStorage) {
      this.notesStorage.setFolderName(this.settings.memoFolderName);
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.notesStorage) {
      this.notesStorage.setFolderName(this.settings.memoFolderName);
    }
  }

  /** 同步 macOS 备忘录到 Obsidian（仅 macOS） */
  async syncNotes(): Promise<void> {
    if (!Platform.isMacOS || !this.notesStorage) {
      new Notice('macOS 备忘录同步仅支持 macOS 系统');
      return;
    }
    try {
      new Notice('开始同步 macOS 备忘录...');

      const folderPath = normalizePath(this.settings.memoNotesFolder);
      if (!this.app.vault.getAbstractFileByPath(folderPath)) {
        await this.app.vault.createFolder(folderPath);
      }
      const attachmentsPath = normalizePath(`${folderPath}/attachments`);
      if (!this.app.vault.getAbstractFileByPath(attachmentsPath)) {
        await this.app.vault.createFolder(attachmentsPath);
      }

      // attachments 绝对路径，供 AppleScript save attachment 直接写入
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const vaultPath = (this.app.vault.adapter as any).basePath as string;
      const attachmentsAbsPath = path.join(vaultPath, ...attachmentsPath.split('/'));

      // 先拿所有元数据（不含图片，stdout 极小）
      const metas = await this.notesStorage.getNotesMeta();
      if (metas.length === 0) {
        new Notice('未在 macOS 备忘录中找到笔记');
        return;
      }

      let syncCount = 0;
      let imageCount = 0;
      const failedNotes: string[] = [];

      for (const meta of metas) {
        try {
          // 逐条拿 body
          const { htmlBody } = await this.notesStorage.getNoteBody(meta.id);

          let markdownBody: string;
          let attachments: { filename: string }[] = [];

          if (meta.attachmentCount > 0) {
            // 图片直接 save 到 attachments/.tmp/，再重命名，不走 stdout
            const tmpDir = path.join(vaultPath, ...attachmentsPath.split('/'), '.tmp');
            if (!fs.existsSync(tmpDir)) {
              fs.mkdirSync(tmpDir, { recursive: true });
            }
            const result = await this.notesStorage.extractAttachmentsViaAppleScript(
              meta.id, meta.title, meta.attachmentCount,
              htmlBody, attachmentsAbsPath, tmpDir
            );
            markdownBody = result.markdownBody;
            attachments = result.attachments;
            imageCount += attachments.length;
          } else {
            const result = await this.notesStorage.extractAttachments(htmlBody, meta.title);
            markdownBody = result.markdownBody;
          }

          const fileName = this.sanitizeMemoFileName(meta.title || '未命名笔记');
          const filePath = normalizePath(`${folderPath}/${fileName}.md`);
          const existingFile = this.app.vault.getAbstractFileByPath(filePath);
          if (existingFile instanceof TFile) {
            const existingContent = await this.app.vault.read(existingFile);
            if (existingContent !== markdownBody) {
              await this.app.vault.modify(existingFile, markdownBody);
              syncCount++;
            }
          } else {
            await this.app.vault.create(filePath, markdownBody);
            syncCount++;
          }
        } catch (err: unknown) {
          console.error(`同步笔记失败: ${meta.title}`, err);
          failedNotes.push(meta.title || '未命名笔记');
        }
      }

      // 清理 .tmp 目录
      const tmpDir = path.join(vaultPath, ...attachmentsPath.split('/'), '.tmp');
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }

      const failMsg = failedNotes.length > 0
        ? `，${failedNotes.length} 个失败：${failedNotes.slice(0, 3).join('、')}${failedNotes.length > 3 ? '...' : ''}`
        : '';
      new Notice(`macOS 备忘录同步完成：更新 ${syncCount} 个笔记，${imageCount} 张图片${failMsg}`);
      if (failedNotes.length > 0) {
        console.error('同步失败的笔记：', failedNotes);
      }
    } catch (error: unknown) {
      console.error('同步 macOS 备忘录失败:', error);
      new Notice(`同步失败: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
    }
  }

  private sanitizeMemoFileName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\n/g, ' ')
      .trim()
      .substring(0, 200);
  }
}

class ObsidianNotesSettingTab extends PluginSettingTab {
  plugin: ObsidianNotesPlugin;

  constructor(app: App, plugin: ObsidianNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // eslint-disable-next-line obsidianmd/ui/sentence-case
    new Setting(containerEl).setName('Obsidian Notes 设置').setHeading();

    new Setting(containerEl)
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setName('备忘录 App 内文件夹名称')
      // eslint-disable-next-line obsidianmd/ui/sentence-case
      .setDesc('macOS 备忘录 App 中要同步的文件夹名（默认：Notes）')
      .addText(text => text
        .setPlaceholder('备忘录文件夹名')
        .setValue(this.plugin.settings.memoFolderName)
        .onChange(async (value) => {
          this.plugin.settings.memoFolderName = value || 'Notes';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Obsidian 目标文件夹')
      .setDesc('macOS 备忘录中的笔记将导入到此文件夹（默认：备忘录）')
      .addText(text => text
        .setPlaceholder('备忘录')
        .setValue(this.plugin.settings.memoNotesFolder)
        .onChange(async (value) => {
          this.plugin.settings.memoNotesFolder = value || '备忘录';
          await this.plugin.saveSettings();
        }));

    const donateSection = containerEl.createDiv({ cls: 'plugin-donate-section' });
    new Setting(donateSection).setName('☕ 请作者喝杯咖啡').setHeading();
    donateSection.createEl('p', { text: '如果这个插件帮助了你，欢迎请作者喝杯咖啡 ☕', cls: 'plugin-donate-desc' });
    const imgWrap = donateSection.createDiv({ cls: 'plugin-donate-qr' });
    imgWrap.createEl('img', { attr: { src: this.plugin.app.vault.adapter.getResourcePath(`${this.plugin.manifest.dir}/assets/wechat-donate.jpg`), alt: '微信打赏', width: '160' } });
    imgWrap.createEl('p', { text: '微信扫码', cls: 'plugin-donate-label' });
  }
}
