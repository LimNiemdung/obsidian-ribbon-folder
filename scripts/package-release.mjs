import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execPath, platform } from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRoot = join(repositoryRoot, ".release");
const packageRoot = join(releaseRoot, "ribbon-folder");
const files = ["main.js", "manifest.json", "styles.css"];

const worktreeStatus = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
	cwd: repositoryRoot,
	encoding: "utf8",
}).trim();
if (worktreeStatus) {
	throw new Error(`Release worktree must be clean before packaging:\n${worktreeStatus}`);
}

const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
	cwd: repositoryRoot,
	encoding: "utf8",
}).trim();
if (branch !== "HEAD") {
	throw new Error(`Release packaging requires a detached worktree, found: ${branch}`);
}

const npmCliPath = join(dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
const npmProgram = platform === "win32" ? execPath : "npm";
const npmArguments = platform === "win32" ? [npmCliPath, "run", "build"] : ["run", "build"];
if (platform === "win32" && !existsSync(npmCliPath)) {
	throw new Error(`Could not locate npm CLI next to Node.js: ${npmCliPath}`);
}
execFileSync(npmProgram, npmArguments, {
	cwd: repositoryRoot,
	stdio: "inherit",
});

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(packageRoot, { recursive: true });

const records = {};
for (const relativePath of files) {
	const sourcePath = join(repositoryRoot, relativePath);
	const targetPath = join(packageRoot, relativePath);
	copyFileSync(sourcePath, targetPath);
	const content = readFileSync(targetPath);
	records[relativePath] = {
		bytes: statSync(targetPath).size,
		sha256: createHash("sha256").update(content).digest("hex"),
	};
}

const pluginManifest = JSON.parse(readFileSync(join(packageRoot, "manifest.json"), "utf8"));
if (pluginManifest.id !== "ribbon-folder") {
	throw new Error(`Unexpected plugin id: ${String(pluginManifest.id)}`);
}

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
	cwd: repositoryRoot,
	encoding: "utf8",
}).trim();
const releaseManifest = {
	pluginId: pluginManifest.id,
	version: pluginManifest.version,
	format: "obsidian-plugin-directory-v1",
	sourceCommit,
	files: records,
};

writeFileSync(
	join(releaseRoot, "release-manifest.json"),
	`${JSON.stringify(releaseManifest, null, 2)}\n`,
	"utf8",
);
