# LastTab Chrome 扩展设计文档

**日期：** 2026-06-11  
**状态：** 已批准  
**方案：** 纯原生 JS，Manifest V3，零构建

## 概述

开发一个 Chrome 扩展，通过快捷键在标签页访问历史栈中后退/前进，体验类似 VSCode 的导航历史。支持点击工具栏图标后退、设置页配置历史范围，以及中英文国际化。

## 需求摘要

| 项目 | 决定 |
|------|------|
| 核心行为 | 完整前进/后退历史栈（非仅两标签切换） |
| 历史范围 | 全局跨窗口（默认）/ 按窗口独立，设置页可选 |
| 交互形式 | 快捷键 + 点击图标后退 |
| 默认快捷键 | Alt+Z 后退 / Alt+X 前进 |
| 技术方案 | 方案 A：纯原生 JS，零构建 |
| 国际化 | 中英文，跟随 Chrome 浏览器语言 |

## 文件结构

```
lastTab/
├── manifest.json              # MV3 清单
├── background.js              # Service Worker：历史栈核心逻辑
├── options.html               # 设置页
├── options.js                 # 设置页逻辑
├── options.css                # 设置页样式
├── _locales/
│   ├── en/messages.json       # 英文文案
│   └── zh_CN/messages.json    # 简体中文文案
└── icons/                     # 16/48/128 扩展图标
```

## 架构

### 模块职责

| 模块 | 职责 |
|------|------|
| `background.js` | 监听标签激活事件，维护历史栈；响应快捷键和图标点击 |
| `options.*` | 历史范围设置 + 快捷键配置说明 |
| `_locales/` | 所有用户可见文案的中英文翻译 |

### 权限

- `tabs` — 监听激活、切换标签页
- `storage` — `session` 存历史栈，`local` 存用户设置
- `commands` — 注册 Alt+Z / Alt+X 快捷键

## 历史栈数据模型

历史栈与指针保存在 `chrome.storage.session`，防止 Service Worker 休眠后丢失。

```javascript
{
  // 全局模式
  global: {
    stack: [
      { tabId: 123, windowId: 1 },
      { tabId: 456, windowId: 1 },
      { tabId: 789, windowId: 2 }
    ],
    pointer: 2
  },

  // 按窗口模式（windowId 为 key）
  perWindow: {
    "1": { stack: [...], pointer: 1 },
    "2": { stack: [...], pointer: 0 }
  }
}
```

用户设置（`chrome.storage.local`）：

```javascript
{
  historyScope: "global" | "perWindow"  // 默认 "global"
}
```

## 导航逻辑

### 写入规则（`tabs.onActivated`）

1. 若 `isNavigating` 标志为 true → 忽略（防止导航触发循环写入）
2. 若新激活标签就是指针当前项 → 忽略（去重）
3. 若指针不在栈顶 → 截断指针之后的"前进历史"
4. 压入 `{ tabId, windowId }`，指针移到栈顶
5. 栈长度上限 50，超出从栈底丢弃

**不记录页内导航：** 同一标签页内 URL 变化（未切换标签）不写入历史。

### 导航规则

| 操作 | 触发方式 | 行为 |
|------|----------|------|
| 后退 | Alt+Z / 点击图标 | `pointer--`，激活 `stack[pointer]`；已在栈底则忽略 |
| 前进 | Alt+X | `pointer++`，激活对应项；已在栈顶则忽略 |

### 跨窗口跳转（全局模式）

后退/前进时若目标在另一窗口：
1. `chrome.windows.update(windowId, { focused: true })`
2. `chrome.tabs.update(tabId, { active: true })`

### 标签关闭清理

监听 `tabs.onRemoved`，从所有栈中移除该 `tabId` 条目。若被删项在指针位置或之前，相应调整指针。

## 设置页

### 内容

1. **历史范围** — 单选框：
   - 全局历史栈（默认）
   - 按窗口独立历史栈
2. **快捷键说明** — 只读说明区：
   - 默认：Alt+Z 后退、Alt+X 前进
   - 链接至 `chrome://extensions/shortcuts` 引导自定义
   - 冲突排查提示
3. **图标行为说明** — 点击工具栏图标 = 后退

### manifest 命令注册

```json
"commands": {
  "go-back": {
    "suggested_key": { "default": "Alt+Z" },
    "description": "__MSG_commandGoBack__"
  },
  "go-forward": {
    "suggested_key": { "default": "Alt+X" },
    "description": "__MSG_commandGoForward__"
  }
}
```

`action` 不设 `default_popup`，通过 `chrome.action.onClicked` 触发后退。

## 国际化

### 文件

- `_locales/en/messages.json`
- `_locales/zh_CN/messages.json`

### 语言规则

自动跟随 Chrome 浏览器语言，设置页不提供手动切换。

### 翻译范围

- 扩展名称与描述（manifest `__MSG_xxx__`）
- 命令描述（快捷键管理页）
- 设置页全部 UI 文案
- `options.js` 通过 `chrome.i18n.getMessage()` 动态填充

### HTML 写法

静态 HTML 结构 + `data-i18n` 属性，`options.js` 启动时遍历替换文本。

## 错误处理与边界情况

| 场景 | 处理 |
|------|------|
| 目标标签已关闭 | 向同方向跳过无效项，找不到则静默忽略 |
| 目标窗口已关闭 | 同上 |
| 栈空或指针在边界 | 静默无操作 |
| Service Worker 重启 | 从 session storage 恢复 |
| 切换历史范围设置 | 立即生效，不清空历史，两套栈独立维护 |
| 扩展刚安装 | 后退/前进无效果，正常 |
| API 调用失败 | try/catch + `console.warn`，不弹窗 |

## 测试计划

手动测试（无自动化框架）：

1. 多标签切换后 Alt+Z 沿历史回退，Alt+X 前进
2. 回退后切换新标签，前进历史被截断
3. 关闭历史中的标签，后退自动跳过
4. 全局模式下跨窗口后退/前进
5. 按窗口模式下仅在当前窗口内导航
6. 点击工具栏图标 = 后退
7. Chrome 语言切换后文案正确
8. 在 shortcuts 页修改快捷键后生效

## 不在范围内

- 页内 URL 导航历史
- 可视化历史列表面板
- 用户手动选择界面语言
- TypeScript / 构建工具链
- 自动化测试框架
