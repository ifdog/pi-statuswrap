# @ifdog/pi-statuswrap

[English](README.md) | [中文](README.zh-CN.md)

为 [pi](https://pi.dev) 编程助手提供「每个扩展状态独占一行」的 footer。

## 问题

pi 内置 footer 把**所有**扩展状态拼成**一行**，再按终端宽度截断。当多个扩展同时输出状态时（如 ralph 循环、caveman 指示器、ponytail 模式、subagents 编队），拼出的行超宽，字母排序靠后的状态被**静默丢弃**——你根本看不到。

根因在 `FooterComponent.render()`（核心 `footer.js`）：

```js
const statusLine = sortedStatuses.join(" ");
lines.push(truncateToWidth(statusLine, width, "…"));  // 单行，尾部被砍
```

## 修复

本扩展让每个扩展状态**独占一行**，而不是挤在被截断的一行里。内置 footer 行（cwd / git / tokens / context / model）完全不动。

它 patch 了 `FooterComponent.prototype.render`：先调原函数产出内置行，再把那行单一状态替换成「每个扩展一行」（单条状态超宽时用 `…` 截断）。

不调 `setFooter`、不替换 footer、零配置、无 npm 运行时依赖。

## 安装

```
pi install npm:@ifdog/pi-statuswrap
```

或手动加到 `~/.pi/agent/settings.json`：

```json
{
  "packages": ["npm:@ifdog/pi-statuswrap"]
}
```

然后在 pi 里 `/reload`。

## 行为

- 每个扩展状态独占一行，按状态 key 字母升序排列（与核心 footer 同序）。
- 单条状态宽于终端时末尾 `…` 截断。
- 无状态 → footer 不变（仍是常规两行）。
- 内置行由真·核心代码产出——零复制，pi 升级改 token 格式等都不受影响。

## 注意事项

本扩展 monkey-patch 了导出的 `FooterComponent.prototype.render`，依赖 pi 的三处内部细节：

1. `FooterComponent` 从 `@earendil-works/pi-coding-agent` 导出。
2. 持有 footer 数据提供者的实例字段名为 `footerData`。
3. 状态行是 `render()` 返回行的最后一个元素。

任一变化时，patch 通过 `try/catch` 回退到原始输出（单行截断），而非崩溃。等 pi 原生支持状态多行折叠后，删掉本扩展即可。

已测试 pi 版本：`@earendil-works/pi-coding-agent` 0.80.x。

## 许可证

MIT
