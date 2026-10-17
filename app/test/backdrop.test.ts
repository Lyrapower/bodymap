// The production build kept only `-webkit-backdrop-filter` for sheets and panels (the CSS minifier merges the two forms
// and keeps the one declared last), so Chrome and Android drew them with no blur and the page underneath showed
// through. Build the app as production does and require the standard property on every blurred surface.
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";

describe("backdrop blur survives the production build", () => {
  it("emits the standard property next to every -webkit- one", async () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const out = (await build({ root, logLevel: "silent", build: { write: false } })) as any;
    const files = (Array.isArray(out) ? out : [out]).flatMap((o: any) => o.output);
    const css = files.filter((f: any) => f.fileName.endsWith(".css")).map((f: any) => String(f.source)).join("\n");
    const webkit = css.match(/-webkit-backdrop-filter:/g)?.length ?? 0;
    const standard = css.match(/(?<!-webkit-)backdrop-filter:/g)?.length ?? 0;
    expect(webkit).toBeGreaterThan(0);
    expect(standard).toBe(webkit);
    expect(css).toMatch(/\.sheet\{[^}]*(?<!-webkit-)backdrop-filter:blur\(26px\)/);
  }, 60000);
});
