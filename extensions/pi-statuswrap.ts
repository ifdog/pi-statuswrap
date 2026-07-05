/**
 * pi-statuswrap — fold extension statuses onto multiple footer lines
 * instead of truncating them to one. Built-in footer lines untouched.
 *
 * Problem: core FooterComponent.render() joins all extension statuses into
 * a single line and truncates to terminal width, silently dropping statuses
 * that sort later alphabetically (e.g. ralph, subagents) when many extensions
 * run concurrently.
 *
 * Fix: patch FooterComponent.prototype.render to replace that single
 * truncated status line with one line per extension (each clipped to width
 * via truncateToWidth if a single status is too wide). No setFooter, no
 * built-in-line duplication, no config.
 *
 * Install: this file is auto-discovered at ~/.pi/agent/extensions/. /reload.
 *
 * Fragility surface (all internal, low risk):
 *  - FooterComponent exported from @earendil-works/pi-coding-agent  (public)
 *  - instance field named `footerData`                             (internal)
 *  - status line is the last element of render()'s returned lines   (internal)
 * Any change to the above breaks the patch; the try/catch fallback returns
 * the original render output (single-line truncated) instead of crashing.
 *
 * Drop this extension once upstream folds statuses natively.
 */
import { FooterComponent } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

const sanitize = (v: string): string =>
	v.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();

export default function (): void {
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
				.map((v) => truncateToWidth(v, width, "…")); // one extension per line; clip if a single status exceeds width
			if (perLine.length === 0) return lines;

			return [...lines.slice(0, -1), ...perLine];
		} catch {
			return lines; // internal structure changed → fall back to built-in (single-line truncated)
		}
	};

	proto.__statuswrap = true;
}
