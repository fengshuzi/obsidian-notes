import { App, Plugin, PluginSettingTab, Setting, Notice, TFolder, Platform, TFile, normalizePath } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import initSqlJs, { Database } from 'sql.js';
import { NotesStorage } from './src/storage';
import { syncNotion, type NotionPageEntry } from './src/notionSync';

interface ObsidianNotesSettings {
  /** 刷新时是否同步 macOS 备忘录 */
  refreshSyncMemo: boolean;
  /** 刷新时是否同步 Joplin */
  refreshSyncJoplin: boolean;
  /** 刷新时是否同步思源笔记 */
  refreshSyncSiYuan: boolean;
  /** 刷新时是否同步 Notion */
  refreshSyncNotion: boolean;
  /** macOS 备忘录：要同步的 App 内文件夹名称 */
  memoFolderName: string;
  /** macOS 备忘录：在 Obsidian 中的目标文件夹 */
  memoNotesFolder: string;
  joplinDbPath: string;
  joplinResourceDir: string;
  targetFolderName: string;
  outputFolder: string;
  attachmentsFolderName: string;
  /** 思源：API 地址 */
  siyuanHost: string;
  /** 思源：API Token */
  siyuanToken: string;
  /** 思源：笔记本 ID */
  siyuanNotebookId: string;
  /** 思源：要同步的路径（仅同步该路径及其子路径，如 / 或 /Folder） */
  siyuanPath: string;
  /** 思源：导入到 Obsidian 的目标文件夹 */
  siyuanOutputFolder: string;
  /** 思源：资源目录（思源 data 下的 assets 路径，用于复制图片） */
  siyuanAssetsDir: string;
  /** Notion：API Token（Integration 密钥） */
  notionToken: string;
  /** Notion：要同步的页面列表（每行一个 URL 或 page_id，可选用 Tab 分隔输出文件夹） */
  notionPagesJson: string;
  /** Notion：默认导出到的 vault 子文件夹 */
  notionOutputFolder: string;
  /** Notion：图片保存目录（相对 vault 根，默认 assets 即根目录下 assets） */
  notionAssetsFolder: string;
}

const DEFAULT_SETTINGS: ObsidianNotesSettings = {
  refreshSyncMemo: true,
  refreshSyncJoplin: false,
  refreshSyncSiYuan: false,
  refreshSyncNotion: false,
  memoFolderName: 'Notes',
  memoNotesFolder: '备忘录',
  joplinDbPath: '~/.config/joplin-desktop/database.sqlite',
  joplinResourceDir: '~/.config/joplin-desktop/resources',
  targetFolderName: 'joplin',
  outputFolder: 'joplin',
  attachmentsFolderName: 'assets',
  siyuanHost: 'http://127.0.0.1:6806',
  siyuanToken: '',
  siyuanNotebookId: '',
  siyuanPath: '/',
  siyuanOutputFolder: 'siyuan',
  siyuanAssetsDir: '~/SiYuan/data/assets',
  notionToken: '',
  notionPagesJson: '',
  notionOutputFolder: 'notion',
  notionAssetsFolder: 'assets'
};

interface FolderHierarchy {
  [folderId: string]: string;
}

interface ResourceLookup {
  [resourceId: string]: string;
}

export default class ObsidianNotesPlugin extends Plugin {
  settings: ObsidianNotesSettings;
  notesStorage: NotesStorage | null = null;

  async onload() {
    await this.loadSettings();

    if (Platform.isMacOS) {
      this.notesStorage = new NotesStorage(this.settings.memoFolderName);
    }

    // 侧边栏刷新：按配置同时更新各来源（macOS 备忘录 / Joplin）
    this.addRibbonIcon('sync', '刷新（按配置更新）', () => this.refreshAll());

    this.addCommand({
      id: 'refresh-all',
      name: '刷新（按配置更新）',
      callback: () => this.refreshAll()
    });
    this.addCommand({
      id: 'sync-memo',
      name: '同步 macOS 备忘录',
      callback: () => this.syncNotes()
    });
    this.addCommand({
      id: 'import-joplin-notes',
      name: '从 Joplin 导入笔记',
      callback: () => this.importNotes()
    });
    this.addCommand({
      id: 'import-siyuan-notes',
      name: '从思源笔记导入',
      callback: () => this.syncSiYuan()
    });
    this.addCommand({
      id: 'import-notion-notes',
      name: '从 Notion 导入',
      callback: () => this.syncNotion()
    });

    this.addSettingTab(new ObsidianNotesSettingTab(this.app, this));
  }

  /** 按配置执行刷新：勾选了的源会依次更新 */
  async refreshAll() {
    const messages: string[] = [];
    if (Platform.isMacOS && this.settings.refreshSyncMemo && this.notesStorage) {
      await this.syncNotes();
      messages.push('macOS 备忘录');
    }
    if (this.settings.refreshSyncJoplin) {
      await this.importNotes();
      messages.push('Joplin');
    }
    if (this.settings.refreshSyncSiYuan) {
      await this.syncSiYuan();
      messages.push('思源笔记');
    }
    if (this.settings.refreshSyncNotion) {
      await this.syncNotion();
      messages.push('Notion');
    }
    if (messages.length === 0) {
      new Notice('请在设置中勾选刷新时要更新的来源（macOS 备忘录、Joplin、思源笔记或 Notion）');
    }
  }

  async loadSettings() {
    const saved = await this.loadData() || {};
    this.settings = {
      refreshSyncMemo: saved.refreshSyncMemo ?? DEFAULT_SETTINGS.refreshSyncMemo,
      refreshSyncJoplin: saved.refreshSyncJoplin ?? DEFAULT_SETTINGS.refreshSyncJoplin,
      refreshSyncSiYuan: saved.refreshSyncSiYuan ?? DEFAULT_SETTINGS.refreshSyncSiYuan,
      refreshSyncNotion: saved.refreshSyncNotion ?? DEFAULT_SETTINGS.refreshSyncNotion,
      memoFolderName: saved.memoFolderName ?? DEFAULT_SETTINGS.memoFolderName,
      memoNotesFolder: saved.memoNotesFolder ?? DEFAULT_SETTINGS.memoNotesFolder,
      joplinDbPath: saved.joplinDbPath ?? DEFAULT_SETTINGS.joplinDbPath,
      joplinResourceDir: saved.joplinResourceDir ?? DEFAULT_SETTINGS.joplinResourceDir,
      targetFolderName: saved.targetFolderName ?? DEFAULT_SETTINGS.targetFolderName,
      outputFolder: saved.outputFolder ?? DEFAULT_SETTINGS.outputFolder,
      attachmentsFolderName: saved.attachmentsFolderName ?? DEFAULT_SETTINGS.attachmentsFolderName,
      siyuanHost: saved.siyuanHost ?? DEFAULT_SETTINGS.siyuanHost,
      siyuanToken: saved.siyuanToken ?? DEFAULT_SETTINGS.siyuanToken,
      siyuanNotebookId: saved.siyuanNotebookId ?? DEFAULT_SETTINGS.siyuanNotebookId,
      siyuanPath: saved.siyuanPath ?? DEFAULT_SETTINGS.siyuanPath,
      siyuanOutputFolder: saved.siyuanOutputFolder ?? DEFAULT_SETTINGS.siyuanOutputFolder,
      siyuanAssetsDir: saved.siyuanAssetsDir ?? DEFAULT_SETTINGS.siyuanAssetsDir,
      notionToken: saved.notionToken ?? DEFAULT_SETTINGS.notionToken,
      notionPagesJson: saved.notionPagesJson ?? DEFAULT_SETTINGS.notionPagesJson,
      notionOutputFolder: saved.notionOutputFolder ?? DEFAULT_SETTINGS.notionOutputFolder,
      notionAssetsFolder: saved.notionAssetsFolder ?? DEFAULT_SETTINGS.notionAssetsFolder,
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
      const vaultPath = (this.app.vault.adapter as any).basePath;
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
          const { htmlBody, folder, creationDate, modificationDate } =
            await this.notesStorage.getNoteBody(meta.id);

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
        } catch (err: any) {
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
    } catch (error: any) {
      console.error('同步 macOS 备忘录失败:', error);
      new Notice(`同步失败: ${error?.message || error}`);
    }
  }

  private sanitizeMemoFileName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\n/g, ' ')
      .trim()
      .substring(0, 200);
  }

  /** 展开路径中的 ~ 为用户主目录 */
  private expandPath(p: string): string {
    if (p.startsWith('~/')) {
      return path.join(os.homedir(), p.slice(2));
    }
    if (p === '~') {
      return os.homedir();
    }
    return p;
  }

  /** 清理文件名中的非法字符 */
  private sanitizeFilename(name: string): string {
    return name.replace(/[\\/:"*?<>|]+/g, '_');
  }

  /** 构建资源 ID -> 文件名映射 */
  private buildResourceLookup(): ResourceLookup {
    const lookup: ResourceLookup = {};
    const resourceDir = this.expandPath(this.settings.joplinResourceDir);

    if (!fs.existsSync(resourceDir)) {
      console.warn(`资源目录不存在: ${resourceDir}`);
      return lookup;
    }

    const files = fs.readdirSync(resourceDir);
    for (const fname of files) {
      if (/^[a-f0-9]{32}\.\w+$/.test(fname)) {
        const rid = fname.split('.')[0];
        lookup[rid] = fname;
      }
    }
    return lookup;
  }

  /** 获取文件夹层级结构 */
  private getFolderHierarchy(db: Database, targetFolderName: string): { hierarchy: FolderHierarchy; rootFolderId: string } {
    const rootResult = db.exec(
      `SELECT id FROM folders WHERE title = '${targetFolderName.replace(/'/g, "''")}' AND parent_id = ''`
    );

    if (!rootResult.length || !rootResult[0].values.length) {
      throw new Error(`找不到名为 '${targetFolderName}' 的 Joplin 笔记本`);
    }

    const rootFolderId = rootResult[0].values[0][0] as string;
    const hierarchy: FolderHierarchy = {};
    hierarchy[rootFolderId] = '';

    const buildHierarchy = (parentId: string, basePath: string) => {
      const subfolders = db.exec(
        `SELECT id, title FROM folders WHERE parent_id = '${parentId}'`
      );

      if (!subfolders.length) return;

      for (const row of subfolders[0].values) {
        const folderId = row[0] as string;
        const folderTitle = row[1] as string;
        const folderPath = basePath
          ? path.join(basePath, this.sanitizeFilename(folderTitle))
          : this.sanitizeFilename(folderTitle);
        hierarchy[folderId] = folderPath;
        buildHierarchy(folderId, folderPath);
      }
    };

    buildHierarchy(rootFolderId, '');
    return { hierarchy, rootFolderId };
  }

  /** 处理笔记内容中的资源链接 */
  private processResources(
    body: string,
    resourceLookup: ResourceLookup,
    vaultPath: string,
    noteBaseName: string
  ): string {
    const attachmentsFolderName = this.settings.attachmentsFolderName;
    const resourceDir = this.expandPath(this.settings.joplinResourceDir);
    const assetsDir = path.join(vaultPath, attachmentsFolderName);
    const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp']);

    const resourceMatches = [...body.matchAll(/!\[\]\(:\/([a-f0-9]{32})\)/g)];
    const ridToNewFilename = new Map<string, string>();
    let imageCounter = 0;

    for (const match of resourceMatches) {
      const rid = match[1];
      if (ridToNewFilename.has(rid)) continue;

      if (!resourceLookup[rid]) {
        console.warn(`未找到资源: ${rid}`);
        continue;
      }

      const resFilename = resourceLookup[rid];
      const ext = resFilename.split('.').pop()?.toLowerCase() || '';

      let newFilename: string;
      if (imageExts.has(ext)) {
        imageCounter++;
        newFilename = `${noteBaseName}-${String(imageCounter).padStart(3, '0')}.${ext}`;
      } else {
        newFilename = resFilename;
      }

      ridToNewFilename.set(rid, newFilename);
    }

    let assetsDirCreated = false;
    for (const [rid, newFilename] of ridToNewFilename) {
      const srcPath = path.join(resourceDir, resourceLookup[rid]);
      const dstPath = path.join(assetsDir, newFilename);
      if (fs.existsSync(srcPath) && !fs.existsSync(dstPath)) {
        if (!assetsDirCreated && !fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
          assetsDirCreated = true;
        }
        fs.copyFileSync(srcPath, dstPath);
      }
    }

    const processed = body.replace(/!\[\]\(:\/([a-f0-9]{32})\)/g, (match, rid) => {
      const newFilename = ridToNewFilename.get(rid);
      if (newFilename) {
        return `![](${newFilename})`;
      }
      return match;
    });

    return processed.replace(/&nbsp;/g, ' ');
  }

  /** 导入笔记（Joplin） */
  async importNotes() {
    const { targetFolderName, outputFolder } = this.settings;
    const joplinDbPath = this.expandPath(this.settings.joplinDbPath);
    const joplinResourceDir = this.expandPath(this.settings.joplinResourceDir);

    if (!fs.existsSync(joplinDbPath)) {
      new Notice(`❌ Joplin 数据库文件不存在: ${joplinDbPath}`);
      return;
    }

    new Notice('🔄 开始导入 Joplin 笔记...');

    try {
      const vaultBasePath = (this.app.vault.adapter as any).basePath;
      const manifestDir = this.manifest.dir;
      const pluginDir = path.join(vaultBasePath, manifestDir);
      const wasmPath = path.join(pluginDir, 'sql-wasm.wasm');

      let SQL;
      if (fs.existsSync(wasmPath)) {
        const wasmBinary = fs.readFileSync(wasmPath);
        SQL = await initSqlJs({ wasmBinary });
      } else {
        new Notice('❌ 找不到 sql-wasm.wasm 文件，请确保插件正确安装');
        return;
      }

      const dbBuffer = fs.readFileSync(joplinDbPath);
      const db = new SQL.Database(dbBuffer);

      const vaultPath = (this.app.vault.adapter as any).basePath;
      const outputFolderNorm = (outputFolder || '').replace(/\\/g, '/').trim() || 'joplin';
      const outputBasePath = outputFolderNorm
        ? path.join(vaultPath, ...outputFolderNorm.split('/'))
        : vaultPath;

      if (!fs.existsSync(outputBasePath)) {
        fs.mkdirSync(outputBasePath, { recursive: true });
      }

      const { hierarchy, rootFolderId } = this.getFolderHierarchy(db, targetFolderName);
      const resourceLookup = this.buildResourceLookup();

      const folderIds = Object.keys(hierarchy);
      const notesQuery = `SELECT id, title, body, parent_id FROM notes WHERE parent_id IN (${folderIds.map(id => `'${id}'`).join(',')}) AND is_conflict = 0 AND deleted_time = 0`;

      const notesResult = db.exec(notesQuery);

      if (!notesResult.length || !notesResult[0].values.length) {
        new Notice(`❌ '${targetFolderName}' 文件夹及其子文件夹中没有找到笔记`);
        db.close();
        return;
      }

      const notes = notesResult[0].values;
      let successCount = 0;
      let failCount = 0;

      for (const note of notes) {
        const [noteId, title, body, parentId] = note as [string, string, string, string];

        try {
          const folderPath = hierarchy[parentId] || '';
          const safeTitle = this.sanitizeFilename((title || 'Untitled').trim()).slice(0, 100);

          const outputFile = folderPath
            ? path.join(outputBasePath, folderPath, `${safeTitle}.md`)
            : path.join(outputBasePath, `${safeTitle}.md`);

          let processedBody = body || '';
          if (processedBody) {
            processedBody = this.processResources(processedBody, resourceLookup, vaultPath, safeTitle);
          }

          const noteDir = path.dirname(outputFile);
          if (!fs.existsSync(noteDir)) {
            fs.mkdirSync(noteDir, { recursive: true });
          }

          fs.writeFileSync(outputFile, processedBody, 'utf-8');
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`❌ 导出失败: ${title}`, error);
        }
      }

      db.close();
      await this.refreshVault(outputFolderNorm);

      new Notice(`🎉 导入完成！成功 ${successCount} 个，失败 ${failCount} 个`);
    } catch (error) {
      console.error('导入失败:', error);
      new Notice(`❌ 导入失败: ${error.message}`);
    }
  }

  private async refreshVault(folderPath: string) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!folderPath) return;
    const vaultPathNorm = normalizePath(folderPath.replace(/\\/g, '/'));
    const folder = this.app.vault.getAbstractFileByPath(vaultPathNorm);
    if (folder && folder instanceof TFolder) {
      await this.app.vault.adapter.list(vaultPathNorm);
    }
  }

  // ---------- 思源笔记 API 与同步（与 Joplin 一致：仅指定路径，图片放 assets）----------
  private siyuanHeaders(): Record<string, string> {
    const raw = (this.settings.siyuanToken || '').trim();
    if (!raw) return { 'Content-Type': 'application/json' };
    const auth = raw.toLowerCase().startsWith('token ') ? raw : `Token ${raw}`;
    return {
      'Content-Type': 'application/json',
      'Authorization': auth,
    };
  }

  private async siyuanPost(apiPath: string, body: object): Promise<{ code: number; data?: any; msg?: string }> {
    const base = (this.settings.siyuanHost || 'http://127.0.0.1:6806').replace(/\/$/, '');
    const url = `${base}${apiPath.startsWith('/') ? apiPath : '/' + apiPath}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.siyuanHeaders(),
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return json as { code: number; data?: any; msg?: string };
  }

  /** 根据人可读路径获取文档 ID */
  private async siyuanGetIdsByHPath(notebook: string, path: string): Promise<string | null> {
    const r = await this.siyuanPost('/api/filetree/getIDsByHPath', { notebook, path });
    if (r.code === 0 && Array.isArray(r.data) && r.data.length > 0) {
      return r.data[0];
    }
    return null;
  }

  /** 导出文档为 Markdown 内容 */
  private async siyuanExportMdContent(docId: string): Promise<string | null> {
    const r = await this.siyuanPost('/api/export/exportMdContent', { id: docId });
    if (r.code === 0 && r.data && typeof r.data.content === 'string') {
      return r.data.content;
    }
    return null;
  }

  /** 查询指定路径下的所有文档（type=d），返回 { id, hpath }[]；仅返回叶子文档，不把文件夹当文档 */
  private async siyuanListDocsUnderPath(rootId: string): Promise<{ id: string; hpath: string }[]> {
    const stmt = `SELECT id, hpath FROM blocks WHERE type='d' AND path LIKE '%${rootId.replace(/'/g, "''")}%'`;
    const r = await this.siyuanPost('/api/query/sql', { stmt });
    if (r.code !== 0 || !Array.isArray(r.data)) return [];
    const all = (r.data as { id?: string; hpath?: string }[])
      .filter(b => b.id && b.hpath != null)
      .map(b => ({ id: b.id!, hpath: ('/' + String(b.hpath).trim()).replace(/\/+/g, '/').replace(/\/$/, '') }));
    // 只保留叶子文档：若某 doc 的 hpath 是另一 doc 的路径前缀，则该 doc 是“文件夹”，不导出为 .md
    return all.filter(d => !all.some(other => other.id !== d.id && other.hpath.startsWith(d.hpath + '/')));
  }

  /** 移除思源导出的 YAML 前置（不需要 yaml 属性） */
  private stripSiYuanYaml(content: string): string {
    return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
  }

  /**
   * 处理思源内容中的图片：复制到 vault 根目录的 assets，链接改为相对路径以便 Obsidian 正确显示。
   * @param noteDirFromVaultRoot 当前笔记所在目录相对于 vault 根目录的路径，如 "siyuan" 或 "siyuan/A/B"
   */
  private processSiYuanResources(
    content: string,
    vaultPath: string,
    noteBaseName: string,
    noteDirFromVaultRoot: string
  ): { content: string; imageCount: number } {
    const attachmentsFolderName = this.settings.attachmentsFolderName;
    const assetsDir = this.expandPath(this.settings.siyuanAssetsDir);
    const vaultAssetsDir = path.join(vaultPath, attachmentsFolderName);
    const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp']);
    let imageCount = 0;

    const matches = [...content.matchAll(/!\[(.*?)\]\(assets\/(.*?)\)/g)];
    const replacer = new Map<string, string>();

    for (const m of matches) {
      const origRef = (m[2] || '').trim();
      if (!origRef || replacer.has(origRef)) continue;
      const filename = path.basename(origRef);
      const srcPath = path.join(assetsDir, filename);
      if (!fs.existsSync(srcPath)) continue;
      const ext = (filename.split('.').pop() || '').toLowerCase();
      let newFilename: string;
      if (imageExts.has(ext)) {
        imageCount++;
        const safeBase = this.sanitizeFilename(noteBaseName).replace(/\s+/g, '-');
        newFilename = `${safeBase}-${String(imageCount).padStart(3, '0')}.${ext}`;
      } else {
        newFilename = this.sanitizeFilename(filename).replace(/\s+/g, '-');
      }
      replacer.set(origRef, newFilename);
      if (!fs.existsSync(vaultAssetsDir)) {
        fs.mkdirSync(vaultAssetsDir, { recursive: true });
      }
      const dstPath = path.join(vaultAssetsDir, newFilename);
      if (!fs.existsSync(dstPath)) {
        fs.copyFileSync(srcPath, dstPath);
      }
    }

    const depth = noteDirFromVaultRoot.replace(/\\/g, '/').split('/').filter(Boolean).length;
    const assetsPrefix = depth > 0 ? '../'.repeat(depth) + attachmentsFolderName + '/' : attachmentsFolderName + '/';

    let out = content;
    for (const [orig, name] of replacer) {
      const re = new RegExp(`!\\[([^\\]]*)\\]\\(assets/${escapeRegex(orig)}\\)`, 'g');
      out = out.replace(re, (_: string, alt: string) => `![${alt}](${assetsPrefix}${name})`);
    }
    return { content: out.replace(/&nbsp;/g, ' '), imageCount };
  }

  /** 解析 Notion 页面配置字符串为 NotionPageEntry[]（每行一个 URL 或 id，可选用 Tab 分隔输出文件夹） */
  private parseNotionPagesJson(jsonOrLines: string): NotionPageEntry[] {
    const raw = (jsonOrLines || '').trim();
    if (!raw) return [];
    const entries: NotionPageEntry[] = [];
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const tab = line.indexOf('\t');
      if (tab >= 0) {
        entries.push({ id: line.slice(0, tab).trim(), outputFolder: line.slice(tab + 1).trim() || undefined });
      } else {
        entries.push({ id: line.trim() });
      }
    }
    return entries;
  }

  /** 从 Notion 导入（token 与多页面在设置中配置） */
  async syncNotion(): Promise<void> {
    const token = (this.settings.notionToken || '').trim();
    if (!token) {
      new Notice('请先在设置中填写 Notion API Token');
      return;
    }
    const pages = this.parseNotionPagesJson(this.settings.notionPagesJson);
    if (!pages.length) {
      new Notice('请在设置中填写要同步的 Notion 页面（每行一个 URL 或 page_id）');
      return;
    }
    new Notice('🔄 开始从 Notion 导入...');
    try {
      const result = await syncNotion(
        this.app,
        token,
        pages,
        this.settings.notionOutputFolder || 'notion',
        this.settings.notionAssetsFolder || 'assets'
      );
      new Notice(`🎉 Notion 导入完成！成功 ${result.success} 页，失败 ${result.fail}，共 ${result.totalFiles} 个文件`);
    } catch (error: any) {
      console.error('Notion 导入失败:', error);
      new Notice(`❌ Notion 导入失败: ${error?.message || error}`);
    }
  }

  /** 从思源笔记导入（仅同步指定路径，图片逻辑与 Joplin 一致） */
  async syncSiYuan(): Promise<void> {
    const { siyuanNotebookId, siyuanPath, siyuanOutputFolder } = this.settings;
    if (!siyuanNotebookId.trim()) {
      new Notice('请先在设置中填写思源笔记本 ID');
      return;
    }

    new Notice('🔄 开始从思源笔记导入...');

    try {
      const rootId = await this.siyuanGetIdsByHPath(siyuanNotebookId.trim(), siyuanPath.trim() || '/');
      if (!rootId) {
        new Notice(`❌ 未找到思源路径：${siyuanPath || '/'}`);
        return;
      }

      const docs = await this.siyuanListDocsUnderPath(rootId);
      if (docs.length === 0) {
        new Notice('该路径下没有文档');
        return;
      }

      const vaultPath = (this.app.vault.adapter as any).basePath;
      const outputBase = path.join(vaultPath, siyuanOutputFolder || 'siyuan');
      if (!fs.existsSync(outputBase)) {
        fs.mkdirSync(outputBase, { recursive: true });
      }

      let successCount = 0;
      let failCount = 0;
      let totalImages = 0;

      for (const doc of docs) {
        let content = await this.siyuanExportMdContent(doc.id);
        if (content == null) continue;
        content = this.stripSiYuanYaml(content);

        const hpath = doc.hpath.replace(/^\//, '').trim();
        const parts = hpath ? hpath.split('/').filter(Boolean) : [];
        const fileName = this.sanitizeFilename(parts.pop() || 'untitled').slice(0, 200);
        const folderPath = parts.length ? parts.map(p => this.sanitizeFilename(p)).join(path.sep) : '';
        const relPath = folderPath ? path.join(folderPath, fileName) : fileName;
        const mdPath = path.join(outputBase, relPath + (fileName.endsWith('.md') ? '' : '.md'));
        const noteBaseName = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName;
        const noteDirFromVaultRoot = path.relative(vaultPath, path.dirname(mdPath)).replace(/\\/g, '/');

        const { content: processedContent, imageCount } = this.processSiYuanResources(content, vaultPath, noteBaseName, noteDirFromVaultRoot);
        totalImages += imageCount;

        const dir = path.dirname(mdPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        try {
          fs.writeFileSync(mdPath, processedContent, 'utf-8');
          successCount++;
        } catch (e) {
          failCount++;
          console.error('思源导出失败:', doc.hpath, e);
        }
      }

      await this.refreshVault(siyuanOutputFolder);
      new Notice(`🎉 思源导入完成！成功 ${successCount} 个，失败 ${failCount} 个，图片 ${totalImages} 张`);
    } catch (error: any) {
      console.error('思源导入失败:', error);
      new Notice(`❌ 思源导入失败: ${error?.message || error}`);
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    containerEl.createEl('h2', { text: 'Obsidian Notes 设置' });

    containerEl.createEl('p', {
      text: '多源笔记同步到 Obsidian：macOS 备忘录、Joplin、思源笔记等，仅手动刷新。',
      cls: 'setting-item-description'
    });

    containerEl.createEl('h3', { text: '刷新时更新' });
    containerEl.createEl('p', {
      text: '侧边栏点击「刷新」时，按下面勾选依次执行（可只勾选需要的来源）。',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('刷新时同步 macOS 备忘录')
      .setDesc('仅 macOS：点击刷新时从「备忘录」App 同步到 Obsidian')
      .addToggle(t => t
        .setValue(this.plugin.settings.refreshSyncMemo)
        .onChange(async (v) => {
          this.plugin.settings.refreshSyncMemo = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('刷新时同步 Joplin')
      .setDesc('点击刷新时从 Joplin 导入笔记到 Obsidian')
      .addToggle(t => t
        .setValue(this.plugin.settings.refreshSyncJoplin)
        .onChange(async (v) => {
          this.plugin.settings.refreshSyncJoplin = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('刷新时同步思源笔记')
      .setDesc('点击刷新时从思源笔记指定路径导入到 Obsidian（需思源内核运行）')
      .addToggle(t => t
        .setValue(this.plugin.settings.refreshSyncSiYuan)
        .onChange(async (v) => {
          this.plugin.settings.refreshSyncSiYuan = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('刷新时同步 Notion')
      .setDesc('点击刷新时从 Notion 导入配置的页面到 Obsidian')
      .addToggle(t => t
        .setValue(this.plugin.settings.refreshSyncNotion)
        .onChange(async (v) => {
          this.plugin.settings.refreshSyncNotion = v;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: 'macOS 备忘录' });
    containerEl.createEl('p', {
      text: '「备忘录」App 内要同步的文件夹名称，以及导入到 Obsidian 后的目标文件夹。',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('备忘录 App 内文件夹名称')
      .setDesc('macOS 备忘录 App 中要同步的文件夹名（默认：Notes）')
      .addText(text => text
        .setPlaceholder('Notes')
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

    containerEl.createEl('h3', { text: 'Joplin 同步' });
    containerEl.createEl('p', {
      text: '配置 Joplin 数据路径和导入选项。导入前请先关闭 Joplin 应用。',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('Joplin 数据库路径')
      .setDesc('Joplin SQLite 数据库文件路径，支持 ~ 表示用户主目录')
      .addText(text => text
        .setPlaceholder('~/.config/joplin-desktop/database.sqlite')
        .setValue(this.plugin.settings.joplinDbPath)
        .onChange(async (value) => {
          this.plugin.settings.joplinDbPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Joplin 资源目录')
      .setDesc('Joplin 资源文件（图片、附件等）的目录路径，支持 ~ 表示用户主目录')
      .addText(text => text
        .setPlaceholder('~/.config/joplin-desktop/resources')
        .setValue(this.plugin.settings.joplinResourceDir)
        .onChange(async (value) => {
          this.plugin.settings.joplinResourceDir = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('要导入的笔记本名称')
      .setDesc('Joplin 中顶级笔记本的名称（将导入该笔记本及其所有子笔记本）')
      .addText(text => text
        .setPlaceholder('joplin')
        .setValue(this.plugin.settings.targetFolderName)
        .onChange(async (value) => {
          this.plugin.settings.targetFolderName = value || 'joplin';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('输出文件夹')
      .setDesc('Obsidian vault 中用于存放导入笔记的文件夹，支持嵌套路径如 Bike/joplin')
      .addText(text => text
        .setPlaceholder('joplin 或 Bike/joplin')
        .setValue(this.plugin.settings.outputFolder)
        .onChange(async (value) => {
          this.plugin.settings.outputFolder = (value || 'joplin').replace(/\\/g, '/').trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('图片文件夹名称')
      .setDesc('存放图片的文件夹名称（放在 vault 根目录下，图片链接使用简写路径）')
      .addText(text => text
        .setPlaceholder('assets')
        .setValue(this.plugin.settings.attachmentsFolderName)
        .onChange(async (value) => {
          this.plugin.settings.attachmentsFolderName = value || 'assets';
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: '思源笔记' });
    containerEl.createEl('p', {
      text: '仅同步指定路径及其子路径，图片与 Joplin 一致：复制到 vault 图片目录并修正链接。需思源内核运行并开启 API。',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('思源 API 地址')
      .setDesc('思源内核服务地址（默认 http://127.0.0.1:6806）')
      .addText(text => text
        .setPlaceholder('http://127.0.0.1:6806')
        .setValue(this.plugin.settings.siyuanHost)
        .onChange(async (value) => {
          this.plugin.settings.siyuanHost = (value || 'http://127.0.0.1:6806').trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('思源 API Token')
      .setDesc('思源 设置 → 关于 → API Token')
      .addText(text => text
        .setPlaceholder('')
        .setValue(this.plugin.settings.siyuanToken)
        .onChange(async (value) => {
          this.plugin.settings.siyuanToken = (value || '').trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('笔记本 ID')
      .setDesc('要同步的思源笔记本 ID（在笔记本属性或 URL 中可见）')
      .addText(text => text
        .setPlaceholder('20250528130026-xxx')
        .setValue(this.plugin.settings.siyuanNotebookId)
        .onChange(async (value) => {
          this.plugin.settings.siyuanNotebookId = (value || '').trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('要同步的路径')
      .setDesc('仅同步该路径及其子路径，如 / 表示整个笔记本，/Folder 表示该文件夹下')
      .addText(text => text
        .setPlaceholder('/')
        .setValue(this.plugin.settings.siyuanPath)
        .onChange(async (value) => {
          this.plugin.settings.siyuanPath = (value || '/').trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Obsidian 输出文件夹')
      .setDesc('思源文档导入到 vault 的文件夹（默认 siyuan）')
      .addText(text => text
        .setPlaceholder('siyuan')
        .setValue(this.plugin.settings.siyuanOutputFolder)
        .onChange(async (value) => {
          this.plugin.settings.siyuanOutputFolder = (value || 'siyuan').trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('思源资源目录')
      .setDesc('思源 data 下的 assets 路径，用于复制图片（支持 ~）')
      .addText(text => text
        .setPlaceholder('~/SiYuan/data/assets')
        .setValue(this.plugin.settings.siyuanAssetsDir)
        .onChange(async (value) => {
          this.plugin.settings.siyuanAssetsDir = (value || '~/SiYuan/data/assets').trim();
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: 'Notion 同步' });
    containerEl.createEl('p', {
      text: '使用 Notion Integration 密钥与要同步的页面 URL。每行一个页面；可选用 Tab 分隔指定该页面的输出文件夹。',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('Notion API Token')
      .setDesc('Notion 集成密钥（Integration token），在 notion.so 创建 Integration 后复制')
      .addText(text => text
        .setPlaceholder('ntn_xxx 或 secret_xxx')
        .setValue(this.plugin.settings.notionToken)
        .onChange(async (value) => {
          this.plugin.settings.notionToken = (value || '').trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('要同步的页面（多行）')
      .setDesc('每行一个 Notion 页面 URL 或 page_id；可选：同一行用 Tab 分隔填写「输出文件夹」如 notion 或 Bike/notion')
      .addTextArea(text => text
        .setPlaceholder('https://notion.so/页面名-xxx\nhttps://notion.so/另一页-yyy\tOther/notion')
        .setValue(this.plugin.settings.notionPagesJson)
        .onChange(async (value) => {
          this.plugin.settings.notionPagesJson = value || '';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Notion 默认输出文件夹')
      .setDesc('未在行内指定输出文件夹时，导出到此 vault 子文件夹（默认 notion）')
      .addText(text => text
        .setPlaceholder('notion')
        .setValue(this.plugin.settings.notionOutputFolder)
        .onChange(async (value) => {
          this.plugin.settings.notionOutputFolder = (value || 'notion').replace(/\\/g, '/').trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Notion 图片保存目录')
      .setDesc('图片保存位置，相对 vault 根目录。默认 assets 即根目录下 assets 文件夹')
      .addText(text => text
        .setPlaceholder('assets')
        .setValue(this.plugin.settings.notionAssetsFolder)
        .onChange(async (value) => {
          this.plugin.settings.notionAssetsFolder = (value || 'assets').replace(/\\/g, '/').trim();
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: '导入操作' });

    new Setting(containerEl)
      .setName('从 Joplin 导入')
      .setDesc('点击按钮或使用命令「从 Joplin 导入笔记」')
      .addButton(button => button
        .setButtonText('导入 Joplin')
        .onClick(() => this.plugin.importNotes()));

    new Setting(containerEl)
      .setName('从思源笔记导入')
      .setDesc('点击按钮或使用命令「从思源笔记导入」')
      .addButton(button => button
        .setButtonText('导入思源')
        .onClick(() => this.plugin.syncSiYuan()));

    new Setting(containerEl)
      .setName('从 Notion 导入')
      .setDesc('点击按钮或使用命令「从 Notion 导入」')
      .addButton(button => button
        .setButtonText('导入 Notion')
        .onClick(() => this.plugin.syncNotion()));

    containerEl.createEl('h3', { text: '使用说明' });
    const instructionsList = containerEl.createEl('ol');
    instructionsList.createEl('li', { text: 'Joplin：关闭 Joplin 应用后再导入；数据通常在 ~/.config/joplin-desktop/' });
    instructionsList.createEl('li', { text: '思源：保持思源内核运行，在设置中开启 API 并填写 Token、笔记本 ID 与路径' });
    instructionsList.createEl('li', { text: 'Notion：在 notion.so 创建 Integration 并复制 Token；把要同步的页面分享给该 Integration；在「要同步的页面」中每行填一个 URL，可多页' });
    instructionsList.createEl('li', { text: '侧边栏「刷新」或命令「刷新（按配置更新）」会按勾选依次执行各来源' });

    const donateSection = containerEl.createDiv({ cls: 'plugin-donate-section' });
    donateSection.createEl('h3', { text: '☕ 请作者喝杯咖啡' });
    donateSection.createEl('p', { text: '如果这个插件帮助了你，欢迎请作者喝杯咖啡 ☕', cls: 'plugin-donate-desc' });
    const imgWrap = donateSection.createDiv({ cls: 'plugin-donate-qr' });
    imgWrap.createEl('img', { attr: { src: this.plugin.app.vault.adapter.getResourcePath(`${this.plugin.manifest.dir}/assets/wechat-donate.jpg`), alt: '微信打赏', width: '160' } });
    imgWrap.createEl('p', { text: '微信扫码', cls: 'plugin-donate-label' });
  }
}
