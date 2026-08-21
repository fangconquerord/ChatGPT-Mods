# ChatGPT Mods 中文版

这是 [medvedeff-true/ChatGPT-Mods](https://github.com/medvedeff-true/ChatGPT-Mods) 的简体中文 Fork。核心功能保持上游版本 **v1.2.1** 不变，本 Fork 主要对扩展弹窗和 ChatGPT 页面中由扩展注入的界面文字进行中文本地化。

> 上游项目采用 MIT License。本 Fork 保留原项目许可，并感谢原作者 Medvedeff 的开发工作。

## 功能

- **聊天导出**：将当前聊天或消息片段导出为 PDF、Word（RTF）或 TXT。
- **分屏视图**：同一窗口中并排打开两个 ChatGPT 聊天，可拖动分隔条调整宽度。
- **聊天文件夹**：在侧边栏创建本地文件夹，并给聊天设置颜色和图标。
- **保存临时聊天**：将临时聊天上下文迁移到新的普通聊天。
- **附件信息**：更紧凑地展示输入区中的附件，并显示超出附件上限的项目。
- **本地 Prompt Compiler**：在输入框旁提供提示词优化按钮，使用本地规则和启发式算法，不调用外部 AI API。

## 中文化方式

为了尽量减少对上游核心逻辑的修改，本 Fork 新增 `content-zh-CN.js` 作为中文界面层：

- 仅翻译 ChatGPT Mods 自己注入的 `cgpt-*` / `chat-export__*` 界面元素；
- 不翻译 ChatGPT 原生界面，也不会修改普通聊天消息内容；
- 同时处理扩展使用的确认框、提示框、警告框、文件保存窗口和打印窗口中的固定界面文字；
- “保存临时聊天”生成的新聊天迁移提示也会转换为中文；
- 扩展弹窗 `popup.html` / `popup.js` 已直接改为简体中文。

这种方式便于后续从上游同步功能更新，同时降低本地化改动破坏核心功能的风险。

## 安装

本扩展目前以 Chrome / Chromium 的“加载已解压的扩展程序”方式安装。

1. 下载或克隆本仓库：

```bash
git clone https://github.com/fangconquerord/ChatGPT-Mods.git
```

2. 在 Chrome / Edge 地址栏打开：

```text
chrome://extensions
```

3. 开启右上角的 **开发者模式**。
4. 点击 **加载已解压的扩展程序**。
5. 选择本仓库目录。
6. 打开或刷新 `https://chatgpt.com/`。

更新代码后，可在扩展管理页点击此扩展的 **重新加载** 按钮，然后刷新 ChatGPT 页面。

## 隐私

上游项目的核心设计为本地运行：

- 不调用第三方 AI API；
- 不收集分析数据；
- 扩展存储主要用于功能设置、聊天文件夹配置以及临时聊天迁移所需的短期数据。

## 与上游同步

本 Fork 的中文化尽量集中在少量文件中。同步上游时，建议优先保留：

- `content-zh-CN.js`
- `popup.html`
- `popup.js`
- `manifest.json` 中对 `content-zh-CN.js` 的引用

然后再检查上游是否新增了需要翻译的界面文字。

## 说明

当前上游 Prompt Compiler 的内部生成语言主要支持俄文和英文。这个中文 Fork 已把它的按钮、提示和错误信息中文化，但不会擅自重写 Prompt Compiler 的算法和规则库，以便保持与上游行为一致。

## 许可证

MIT License。详见 [LICENSE](LICENSE)。
