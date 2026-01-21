# 图片转换修复说明

## 问题描述

之前从 macOS 备忘录导出到 Obsidian 时，图片是以 base64 编码直接嵌入在 Markdown 文件中的，导致：
- Markdown 文件体积过大
- 图片无法单独管理
- 不符合 Obsidian 的最佳实践

## 修复方案

### 修改内容

在 `src/storage.ts` 的 `extractAttachments` 方法中：

**修改前：**
```typescript
// 替换为 Markdown 图片语法
const markdownImg = `![](attachments/${filename})`;
processedHtml = processedHtml.replace(fullObjectTag, markdownImg);
```

**修改后：**
```typescript
// 替换为 HTML img 标签，Turndown 会自动转换为 Markdown
const imgTag = `<img src="attachments/${filename}" alt="">`;
processedHtml = processedHtml.replace(fullObjectTag, imgTag);
```

### 原理说明

1. **提取 base64 图片**：从 HTML 的 `<object>` 标签中提取 base64 编码的图片数据
2. **保存为本地文件**：将图片数据解码并保存到 `attachments/` 文件夹
3. **替换为 img 标签**：在 HTML 中用 `<img>` 标签替换原来的 `<object>` 标签
4. **转换为 Markdown**：Turndown 库会自动将 `<img>` 标签转换为正确的 Markdown 图片语法

### 为什么不直接插入 Markdown 语法？

如果直接在 HTML 中插入 Markdown 语法（如 `![](path)`），Turndown 会将其视为普通文本并进行转义，结果变成：
```
!\[\](attachments/image.png)
```

而使用 HTML `<img>` 标签，Turndown 会正确识别并转换为：
```
![](attachments/image.png)
```

## 功能特性

- ✅ 自动提取 base64 图片
- ✅ 保存为独立的图片文件（PNG、JPEG、GIF 等）
- ✅ 使用相对路径引用：`![](attachments/filename.png)`
- ✅ 支持多张图片
- ✅ 自动命名：`笔记标题-001.png`、`笔记标题-002.jpg` 等

## 测试

运行测试脚本验证功能：

```bash
# 测试单张图片
node test-image-conversion.mjs

# 测试多张图片
node test-multiple-images.mjs
```

## 使用方法

1. 编译插件：`npm run build`
2. 在 Obsidian 中同步备忘录
3. 图片会自动保存到 `备忘录/attachments/` 文件夹
4. Markdown 文件中使用相对路径引用图片

## 文件结构示例

```
备忘录/
├── attachments/
│   ├── 我的笔记-001.png
│   ├── 我的笔记-002.jpg
│   └── 另一个笔记-001.gif
├── 我的笔记.md
└── 另一个笔记.md
```

## Markdown 示例

```markdown
# 我的笔记

这是一段文字

![](attachments/我的笔记-001.png)

图片后的文字
```
