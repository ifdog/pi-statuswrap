# @ifdog/pi-statuswrap

[English](README.md) | [中文](README.zh-CN.md)

One extension status per footer line for the [pi](https://pi.dev) coding agent.

## Problem

pi's built-in footer joins **all** extension statuses into a **single line** and truncates it to the terminal width. When several extensions emit a status at once (e.g. a ralph loop, a caveman indicator, ponytail mode, a subagents fleet), the combined line overflows and the statuses that sort later alphabetically are silently dropped — you never see them.

Root cause lives in `FooterComponent.render()` (core `footer.js`):

```js
const statusLine = sortedStatuses.join(" ");
lines.push(truncateToWidth(statusLine, width, "…"));  // one line, tail cut off
```

## Fix

This extension gives each extension status its **own footer line** instead of cramming them onto one truncated line. The built-in footer lines (cwd / git / tokens / context / model) are left completely untouched.

It patches `FooterComponent.prototype.render`: call the original to produce the built-in lines, then replace the single status line with one line per extension (each clipped to width with `…` if a single status is wider than the terminal).

No `setFooter`, no footer replacement, no config, no npm runtime dependencies.

## Install

```
pi install npm:@ifdog/pi-statuswrap
```

Or add manually to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:@ifdog/pi-statuswrap"]
}
```

Then `/reload` in pi.

## Behavior

- Each extension status occupies its own line, sorted alphabetically by status key (same order the core footer uses).
- A single status wider than the terminal is clipped with `…`.
- No statuses → footer is unchanged (the usual two lines).
- Built-in lines are produced by the real core code — zero duplication, survives pi updates that change token formatting etc.

## Caveats

This extension monkey-patches the exported `FooterComponent.prototype.render`. It depends on three internal details of pi:

1. `FooterComponent` is exported from `@earendil-works/pi-coding-agent`.
2. The instance field holding the footer data provider is named `footerData`.
3. The status line is the last element of `render()`'s returned lines.

If any of these change, the patch falls back to the original (single-line truncated) output via a `try/catch` rather than crashing. Drop this extension once pi folds statuses onto multiple lines natively.

## License

MIT
