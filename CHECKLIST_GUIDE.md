# macOS Notes Checklist 使用指南

## 问题诊断

根据调试结果，你的笔记中使用的是**普通列表**（Bullet List），不是 **Checklist**（任务列表）。

### 当前的列表格式（普通列表）
```html
<ul>
  <li>买钙片足够到九月底<br></li>
  <li>多种维生素的<br></li>
</ul>
```

转换为 Markdown：
```markdown
- 买钙片足够到九月底
- 多种维生素的
```

### Checklist 格式（任务列表）
如果使用 macOS Notes 的 Checklist 功能，HTML 应该是：
```html
<ul>
  <li><input type="checkbox" checked> 已完成的任务</li>
  <li><input type="checkbox"> 未完成的任务</li>
</ul>
```

转换为 Markdown：
```markdown
- [x] 已完成的任务
- [ ] 未完成的任务
```

## 如何在 macOS Notes 中创建 Checklist

### 方法 1：使用工具栏按钮
1. 在 macOS Notes 中打开笔记
2. 点击工具栏中的 **☑** 按钮（Checklist 按钮）
3. 输入任务内容

### 方法 2：使用快捷键
- **Shift + Cmd + L** - 创建 Checklist

### 方法 3：转换现有列表
1. 选中现有的普通列表项
2. 点击工具栏的 **☑** 按钮
3. 列表会转换为 Checklist

## 区别对比

| 特性 | 普通列表 (Bullet List) | Checklist (任务列表) |
|------|----------------------|---------------------|
| 图标 | 实心圆点 • | 空心方框 ☐ |
| 可勾选 | ❌ 否 | ✅ 是 |
| HTML | `<ul><li>` | `<ul><li><input type="checkbox">` |
| Markdown | `- 项目` | `- [ ] 任务` |

## 当前插件支持

插件已经支持两种格式：
- ✅ 普通列表 → Markdown 列表
- ✅ Checklist → Markdown 任务列表

如果你需要任务列表功能，请在 macOS Notes 中使用 Checklist 功能创建笔记。
