# pi-statuswrap 设计文档

> 状态：已实现并发布。npm `@ifdog/pi-statuswrap@1.0.1`，GitHub [ifdog/pi-statuswrap](https://github.com/ifdog/pi-statuswrap)。

## 研究目的

pi (coding agent) 的第三方扩展通过 `ctx.ui.setStatus(key, text)` 往 footer 状态栏写状态。
多个扩展同时输出时，状态被拼在同一行，总宽超过终端宽度即被截断，排在后面的扩展状态丢失。
目标：确认问题根因，评估现有解法，给出合理的扩展方案。

---

## 调研结果

### 1. 根因定位

核心渲染逻辑在 agent 内置 footer 组件：

```
/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/footer.js
```

关键代码（`FooterComponent.render()`，L209-217）：

```js
// Add extension statuses on a single line, sorted by key alphabetically
const extensionStatuses = this.footerData.getExtensionStatuses();
if (extensionStatuses.size > 0) {
    const sortedStatuses = Array.from(extensionStatuses.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, text]) => sanitizeStatusText(text));
    const statusLine = sortedStatuses.join(" ");          // ← 全部拼成一行
    lines.push(truncateToWidth(statusLine, width, ...));  // ← 超宽直接截断
}
```

- 所有 extension status 用 `.join(" ")` 拼成**单行**
- 再 `truncateToWidth(line, width, "…")` 截到终端宽度

### 2. 截断方向

`truncateToWidth`（`@earendil-works/pi-tui/dist/utils.js`）保留**前缀**、砍**尾部** + 加省略号。
status 按 key `localeCompare` 排序，因此：

```
caveman < grill-me < ponytail < ralph < subagents
```

字母靠前的（caveman / grill-me）总是存活，靠后的（ralph / subagents）先被砍掉。

### 3. 现存扩展与典型宽度

当前会发 status 的扩展：

| key | 来源 | 示例文本 | 可见宽 |
|-----|------|---------|------|
| caveman | pi-caveman | `༺ caveman level: full` | ~22 |
| grill-me | @majorgilles/pi-grill-me | `interview: scoping` | ~20 |
| ponytail | @dietrichgebert/ponytail | `● 🐴 ponytail: full lazy` | ~26 |
| ralph | @tmustier/pi-ralph-wiggum | `refactor-auth ● iter 3/50` | ~28 |
| subagents | @tintinweb/pi-subagents | `fleet: 2 running, 1 done` | ~25 |

合计 ≈ 121 + 4 分隔符 ≈ **125 chars**。
- 120 列终端 → 从尾部砍，subagents / ralph 消失
- 80 列终端 → ponytail 之后全没

### 4. 结论

问题确实存在，是 agent 核心 footer 渲染逻辑的**设计缺陷**（单行拼接 + 截断），
不是单个扩展的 bug。

---

## 现有解法评估：pi-footer

pi-footer 能缓解，但本质是"换掉整个 footer"，过重。

### pi-footer 的机制

1. `ctx.ui.setFooter(callback)` **替换整条内置 footer**
2. config 里 `lines: [[行1 widgets],[行2 widgets],...]`，内置 widget（cwd/git/tokens/context/model）摊到多行
3. extension status 行**仍是单行拼接**，通过 `extensionStatusRow.hiddenKeys` 藏掉吵的 key 减数

### 为何"太重"

| 想要的 | pi-footer 强加的 |
|-------|----------------|
| 修 extension status 截断这一行 | 替换整个 footer 渲染器 |
| — | 重配 cwd/git/tokens/context/model 全部成 widget |
| — | 200+ 行 JSON config |
| — | 自带 widget store / 10 个 preset / git 采集 / metrics / event-widget / 交互配置 UI |
| — | 多一个 npm 依赖 + status key 污染（"pi-footer"）|
| — | extension status 仍是单行，只靠 hide 减数，没真多行 |

pi-footer 是"替换整条 footer + hide key"绕过截断，不是真修单行拼接缺陷。

---

## API 约束（决定方案空间）

查 `@earendil-works/pi-coding-agent` 的扩展类型定义（`dist/core/extensions/types.d.ts`）：

- `ctx.ui.setStatus(key, text)` — 只写，**无公开读 API**
- `ctx.ui.setFooter(factory)` — factory 收到 `(tui, theme, footerData)`
  - `footerData.getExtensionStatuses()` — **唯一能读全部 status 的地方**
- `setFooter(undefined)` 恢复内置 footer，但**拿不到内置 footer 的引用来包装**

**官方 setFooter 路径是全替换（all-or-nothing）。** 但 `FooterComponent` 类从包导出
（`index.js` L36），其 `render` 内部用 `this.footerData.getExtensionStatuses()`，
且 status 行总是追加在 `lines` 末项。→ 可走 **prototype-patch** 路径绕过 setFooter，
只改 status 行行为，内置两行原样保留。

---

## 上游调研

### Issue #4792 — "Allow more fine-grained API to override footer" — **Closed as not planned**

请求：给扩展"接收原始 footer 文本做微调"的 API。
维护者**拒绝**。立场明确：footer 覆盖 = `setFooter` 全替换，要么全换要么不动。
→ 不要再提"#4792 式 wrap/tweak API"。

### Issue #5211 — 长 text 应 word-wrap

维护者认可 word-wrap 是正道，`@earendil-works/pi-tui` 已导出 `wrapTextWithAnsi`。

### 社区现状

- **无**专门提 status 截断的 issue（空白）
- pi-footer、pi-status-bar 等社区扩展**都用全替换**解布局，均重
- 轻量解法缺位 → 本扩展填空

### PR 策略

- **不**提 #4792 式 API（已拒）
- 提 **bug**：多扩展 status 拼一行超宽即静默丢失，应保证全可见
- 有"用 setFooter 就行"被关的风险，作为 bug 报告成本低

---

## 方案对比（终版）

| 方案 | 复制内置逻辑 | 行布局 | 行数 | 脆弱面 |
|-----|------------|-------|-----|-------|
| A. 改核心 footer.js | 否 | 多行 | ~5 | sudo + 升级覆盖 |
| B. setFooter 全替换 lite | 是（重派生 pwd/stats/model）| 自写 | ~120 | 中 |
| C. pi-footer | 是（全替换 + config 引擎）| 自带 | 数百 | 大 |
| **D. prototype-patch（采纳）** | **否** | **每扩展一行** | **~20** | **小** |

A 是正解归属但非 extension；B/C 重。**D 是 extension 能做到的最轻。**

---

## 采纳方案：D — prototype-patch，每扩展一行

### 定位

正经 pi extension，自动发现，零 config，零运行时依赖。不碰核心文件，升级不丢。
唯一改动 = 把核心 footer 截断的单行 status 换成「每个扩展独占一行」。内置两行真·原代码产出。

### 布局选择：one-per-line

考虑过两种行布局：
- **贪心折叠**（join 全部 status 再 `wrapTextWithAnsi` 折行）——信息密度高，但行边界不在扩展边界
- **每扩展一行**（采纳）——每个扩展独占一行，边界清晰、一眼定位某扩展状态；窄终端代价是多占行

选 **one-per-line**：可读性优先，扩展边界 = 行边界，最清楚。单条超宽用 `truncateToWidth` 末尾 `…` 截断。

### 机制

patch `FooterComponent.prototype.render`：

1. 守卫：`FooterComponent?.prototype?.render` 不存在 → no-op（防导出消失崩 loader）
2. 幂等：`proto.__statuswrap` 标记防 `/reload` 重复包壳
3. 调原 `render(width)` → `[pwdLine, statsLine, statusLine?]`
4. `this.footerData.getExtensionStatuses()` 读原始 status（绕过已 join+截断的末行）
5. 无 status → 原样返回（末项是 stats/model，不可删）
6. 有 status → 按 key 字母排序 + sanitize + 滤空 + 每条 `truncateToWidth(v, width, "…")` → 每条一行
7. 丢原末行，多行塞回
8. try/catch 兜底：结构变 → 回退单行截断不崩

### 排序原则

**字母序 `localeCompare`**，照抄核心 footer.js。
- 每行一个扩展，全可见，排序只影响上下顺序
- 跟上游一致 = 最小意外，不引入自己的序
- 零 config、确定性

### 边界处理

| 情况 | 行为 | 由谁保证 |
|-----|------|---------|
| 无 status | 原样返回，不误删 stats 行 | `size===0` 守卫 |
| 空文本 status | filter 掉 | `.filter(v => v.length>0)` |
| 全部 status 为空 | 原样返回 | `perLine.length===0` 守卫 |
| 单条超 width | 该行末尾 `…` 截断 | truncateToWidth |
| status 含 `\r\n\t` | 折成空格 | sanitize（同核心） |
| ANSI 色码 | 保留 | 各扩展自带色，truncateToWidth 宽度感知 |
| FooterComponent 导出消失 | no-op | import 守卫 |
| 内部字段/结构变 | 回退单行截断 | try/catch |

### 脆弱面（诚实）

patch 依赖 3 条内部约定，任一变则退化（不崩）：

| 约定 | 性质 | 退化保护 |
|-----|------|---------|
| `FooterComponent` 从包导出 | 公开 API | import 守卫 → no-op |
| 实例字段名 `footerData` | 内部（TS private） | try/catch → 回退 |
| status 行是 `lines` 末项 | 当前确定 | try/catch → 回退 |

对比"复制 80 行内置 footer 逻辑"：那个每次 agent 改 token 格式/pwd 显示都得跟；本方案只在上述内部结构变才退化。

### 实现

文件：`extensions/pi-statuswrap.ts`

```ts
import { FooterComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const sanitize = (v: string): string =>
	v.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();

export default function (): void {
	// Guard: if a future pi drops the export or changes the render shape, no-op
	// instead of crashing the extension loader.
	if (!FooterComponent?.prototype?.render) return;
	const proto = FooterComponent.prototype as any;
	if (proto.__statuswrap) return; // idempotent: no re-wrap on /reload
	const orig = proto.render;

	proto.render = function (width: number): string[] {
		const lines = orig.call(this, width); // real built-in: pwd/stats/model + trailing status line
		try {
			const statuses = this.footerData.getExtensionStatuses();
			if (statuses.size === 0) return lines; // no status line → last item is stats/model, do not drop

			const perLine = [...statuses.entries()]
				.sort(([a], [b]) => a.localeCompare(b)) // match core ordering, minimal surprise
				.map(([, v]) => sanitize(v))
				.filter((v) => v.length > 0)
				.map((v) => truncateToWidth(v, width, "…")); // one extension per line; clip if too wide
			if (perLine.length === 0) return lines;

			return [...lines.slice(0, -1), ...perLine];
		} catch {
			return lines; // internal structure changed → fall back to built-in (single-line truncated)
		}
	};

	proto.__statuswrap = true;
}
```

### 发布

- npm：`@ifdog/pi-statuswrap`（scoped，`--access public`）
- GitHub：[ifdog/pi-statuswrap](https://github.com/ifdog/pi-statuswrap)
- pi.dev gallery：自动爬 `pi-package` keyword 收录
- 安装：`pi install npm:@ifdog/pi-statuswrap`
- peerDependencies：`@earendil-works/pi-coding-agent *`、`@earendil-works/pi-tui *`（核心，不打包）

### 验证

1. `pi install npm:@ifdog/pi-statuswrap` → `/reload`
2. 同时触发多扩展 status（ralph 循环 + caveman on + ponytail on + subagents fleet）→ 每扩展独占一行，全可见
3. 缩窄终端 → 单条超宽者末尾 `…`，仍各占一行
4. 清空 status → footer 回两行，无误删

### 升级路径

- 上游若修 status 多行（bug PR 中）→ 删本扩展
- 上游若改 `footerData` 字段名 / render 结构 / 导出 → try/catch + import 守卫退化不崩，待更新

---

## 附：相关文件路径

- 核心 footer（只读，升级覆盖）：
  `/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/footer.js`
- 截断函数：`@earendil-works/pi-tui/dist/utils.js` → `truncateToWidth`
- 扩展类型：`@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`
- 扩展加载器：`@earendil-works/pi-coding-agent/dist/core/extensions/loader.js`
- 上游 repo：`github.com/earendil-works/pi`（MIT，包在 `packages/coding-agent`）
- 相关 issue：#4792（细粒度 footer 覆盖，closed as not planned）、#5211（word-wrap 正道）
- 本包：`extensions/pi-statuswrap.ts`
