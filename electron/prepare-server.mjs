// Assembles the Next.js standalone build into electron/build/server.
// Run after `bun run build` in apps/web.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "apps", "web");
const standalone = join(web, ".next", "standalone");
const out = join(here, "build", "server");

if (!existsSync(join(standalone, "apps", "web", "server.js"))) {
	console.error("No standalone build found. Run `bun run build` in apps/web first.");
	process.exit(1);
}

rmSync(out, { recursive: true, force: true });
// dereference: bun links workspace packages, and symlinks don't survive packaging
cpSync(standalone, out, { recursive: true, dereference: true });
cpSync(join(web, ".next", "static"), join(out, "apps", "web", ".next", "static"), {
	recursive: true,
});
cpSync(join(web, "public"), join(out, "apps", "web", "public"), { recursive: true });
// Runtime env comes from main.js; never ship local secrets
for (const f of [".env", ".env.local", ".env.production"]) {
	rmSync(join(out, "apps", "web", f), { force: true });
}
console.log(`Server bundle ready at ${out}`);
