# Checklist 支持优化

## 优化内容

### 1. 启用 GFM 任务列表插件
- 使用 `turndown-plugin-gfm` 的 `taskListItems` 插件
- 支持标准的 GitHub Flavored Markdown 任务列表格式

### 2. 添加自定义规则处理 macOS Notes 的 Checklist

#### Checkbox 规则
处理 `<input type="checkbox">` 元素：
- 未选中：`[ ]`
- 已选中：`[x]`

#### Checklist 项规则
处理包含 checkbox 的列表项 `<li>` 元素：
- 未选中：`- [ ] 内容`
- 已选中：`- [x] 内容`

### 3. Turndown 配置优化
```typescript
{
    headingStyle: "atx",           // 使用 # 风格的标题
    codeBlockStyle: "fenced",      // 使用 ``` 风格的代码块
    bulletListMarker: "-",         // 使用 - 作为列表标记
    emDelimiter: "*",              // 使用 * 表示斜体
    strongDelimiter: "**",         // 使用 ** 表示粗体
    linkStyle: "inlined",          // 内联链接风格
    linkReferenceStyle: "full",    // 完整引用风格
}
```

## macOS Notes Checklist 格式

macOS 备忘录中的 checklist 通常使用以下 HTML 格式：

```html
<ul>
  <li><input type="checkbox" checked> 已完成的任务</li>
  <li><input type="checkbox"> 未完成的任务</li>
</ul>
```

## 转换后的 Markdown 格式

```markdown
- [x] 已完成的任务
- [ ] 未完成的任务
```

## 兼容性

- ✅ Obsidian 原生支持
- ✅ GitHub Markdown 兼容
- ✅ 大多数 Markdown 编辑器支持
