# 更新日志

## [未发布]

### 修复
- 🐛 修复图片转换问题：将 base64 图片正确保存为本地文件
  - 之前：图片以 base64 编码嵌入 Markdown，导致文件过大
  - 现在：图片保存到 `attachments/` 文件夹，使用相对路径引用
  - 支持 PNG、JPEG、GIF 等多种格式
  - 自动命名：`笔记标题-001.png`、`笔记标题-002.jpg` 等

### 技术细节
- 修改 `storage.ts` 中的 `extractAttachments` 方法
- 使用 HTML `<img>` 标签替代直接插入 Markdown 语法
- 让 Turndown 库正确转换为 Markdown 图片语法

## [1.0.0] - 初始版本

### 功能
- ✨ 从 macOS 备忘录同步笔记到 Obsidian
- ✨ 支持手动和自动同步
- ✨ 可配置同步间隔
- ✨ 支持自定义目标文件夹
- ✨ 保留笔记的创建和修改时间
- ✨ 支持 Markdown 格式转换
