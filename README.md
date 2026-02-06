# Obsidian Notes

多源笔记同步到 Obsidian：**macOS 备忘录**、**Joplin**、**思源笔记**、**Notion** 等，仅手动刷新。

## 功能特性

### 多源刷新

- 侧边栏「刷新」按钮、命令「刷新（按配置更新）」：按设置勾选依次执行 **macOS 备忘录**、**Joplin**、**思源笔记**、**Notion** 同步
- 可单独执行：命令「同步 macOS 备忘录」「从 Joplin 导入笔记」「从思源笔记导入」「从 Notion 导入」

### macOS 备忘录（仅 macOS）

- 从系统「备忘录」App 指定文件夹同步到 Obsidian
- 支持图片、表格等，可配置 App 内文件夹名与 Obsidian 目标文件夹

### Joplin 同步

- ✅ 导入指定 Joplin 笔记本及其所有子笔记本
- ✅ 保持原有的文件夹层级结构
- ✅ 自动处理图片和附件资源
- ✅ 将 Joplin 资源链接转换为 Obsidian 格式
- ✅ 图片自动重命名：按 `笔记名-001.ext` 格式命名
- ✅ 可配置输出目录和附件文件夹名称
- ✅ 设置界面一键导入

### 思源笔记同步

- ✅ **仅同步指定路径**：与 Joplin 一致，只同步配置的「要同步的路径」及其子路径（如 `/` 整个笔记本或 `/Folder` 某文件夹）
- ✅ **图片与 Joplin 一致**：图片从思源 `data/assets` 复制到 vault 的图片文件夹（与 Joplin 共用同一配置），链接改为简写路径
- ✅ 需思源内核运行并开启 API（设置 → 关于 → API Token）
- ✅ 可配置 API 地址、Token、笔记本 ID、路径、Obsidian 输出文件夹、思源资源目录

### Notion 同步

- ✅ **Token 与多页面配置化**：在设置中填写 Notion Integration Token、要同步的页面列表（每行一个 URL 或 page_id）
- ✅ **多页面**：支持多个页面/数据库；每行可选用 Tab 分隔指定该页面的输出文件夹
- ✅ 图片按笔记名重命名（`笔记名-001.ext`），链接使用简写路径，与 Joplin/思源一致
- ✅ 支持页面子页面递归导出、数据库条目逐条导出

## 安装方法

### 从 GitHub Release 安装（推荐）

1. 前往 [Releases](../../releases) 页面下载最新版本
2. 下载 `main.js`、`manifest.json`，如有 `styles.css`、`sql-wasm.wasm` 一并下载
3. 在 Obsidian 库中创建插件目录：`.obsidian/plugins/obsidian-notes/`
4. 将下载的文件复制到该目录
5. 重启 Obsidian 或刷新插件列表，在设置中启用「Obsidian Notes」

### 手动构建

```bash
cd obsidian-notes
npm install
npm run build
# 将 dist/ 下的文件复制到 .obsidian/plugins/obsidian-notes/
```

## 使用方法

1. 打开 Obsidian 设置 → 第三方插件 → **Obsidian Notes**
2. **刷新时更新**：勾选「刷新时同步 macOS 备忘录」和/或「刷新时同步 Joplin」和/或「刷新时同步思源笔记」和/或「刷新时同步 Notion」
3. **macOS 备忘录**：配置「备忘录」App 内文件夹名称、Obsidian 目标文件夹（仅 macOS）
4. **Joplin**：配置数据库路径、资源目录、要导入的笔记本名称、输出文件夹等；导入前请先**关闭 Joplin**
5. **思源笔记**：配置 API 地址、Token、笔记本 ID、要同步的路径（仅该路径及子路径）、Obsidian 输出文件夹、思源资源目录；需思源内核运行
6. **Notion**：在 notion.so 创建 Integration 并复制 Token，把要同步的页面分享给该 Integration；在「要同步的页面」中每行填一个页面 URL（可多行），可选 Tab 分隔输出文件夹
7. 侧边栏点击刷新图标，或命令面板「刷新（按配置更新）」执行同步；也可单独使用「同步 macOS 备忘录」「从 Joplin 导入笔记」「从思源笔记导入」「从 Notion 导入」

详细说明与目录结构见原 Joplin 导入文档（逻辑一致，仅插件名改为 Obsidian Notes）。

## 后续计划

- 其他 Markdown 笔记来源（按需扩展）

## 开发

```bash
npm install
npm run dev    # 开发模式
npm run build  # 构建
npm run deploy # 部署到本地 vault
npm run release # 发布到 GitHub
```

## 许可证

MIT
