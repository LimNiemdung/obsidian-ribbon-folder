import { App, addIcon } from "obsidian";

const CUSTOM_ICON_PREFIX = "ribbon-folder-icon-";

export function normalizePath(p: string): string {
	return p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

export function computeHash(s: string): string {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
	}
	return (h >>> 0).toString(16);
}

/**
 * 列出文件夹下所有 .svg 路径（使用 adapter.list 以包含隐藏目录如 .obsidian/icons）
 */
export async function getSvgPathsInFolder(app: App, folderPath: string): Promise<string[]> {
	const base = normalizePath(folderPath).replace(/\/$/, "") || "";
	const out: string[] = [];

	async function walk(dir: string): Promise<void> {
		try {
			const listed = await app.vault.adapter.list(dir);
			for (const f of listed.files) {
				const p = f.includes("/") ? normalizePath(f) : dir ? dir + "/" + f : f;
				if (p.toLowerCase().endsWith(".svg")) out.push(p);
			}
			for (const sub of listed.folders) {
				const subDir = sub.includes("/") ? normalizePath(sub) : dir ? dir + "/" + sub : sub;
				await walk(subDir);
			}
		} catch {
			// ignore missing or inaccessible dir
		}
	}

	await walk(base);
	return out.sort();
}

/**
 * 将 SVG 文件内容规范为 Obsidian addIcon 所需格式（提取内层、viewBox、currentColor）
 */
export function normalizeSvgForObsidian(svgFileContent: string): string {
	const svgTagMatch = svgFileContent.match(/<svg([^>]*)>([\s\S]*?)<\/svg>/i);
	const inner = svgTagMatch ? svgTagMatch[2].trim() : svgFileContent.trim();
	const attrs = svgTagMatch ? svgTagMatch[1] : "";
	const viewBoxMatch = attrs.match(/viewBox\s*=\s*["']?\s*([\d.\s-]+)["']?/i);
	let viewBox: number[];
	if (viewBoxMatch) {
		viewBox = viewBoxMatch[1].trim().split(/\s+/).map(Number);
	} else {
		const widthMatch = attrs.match(/\bwidth\s*=\s*["']?\s*([\d.]+)["']?/i);
		const heightMatch = attrs.match(/\bheight\s*=\s*["']?\s*([\d.]+)["']?/i);
		const w = widthMatch ? Number(widthMatch[1]) : 24;
		const h = heightMatch ? Number(heightMatch[1]) : 24;
		viewBox = [0, 0, w, h];
	}
	const w = viewBox[2] - viewBox[0] || 100;
	const h = viewBox[3] - viewBox[1] || 100;
	const scale = Math.abs(w) > 0 && Math.abs(h) > 0 ? Math.min(100 / w, 100 / h) : 1;
	const wrapped =
		scale < 0.99 || scale > 1.01
			? `<g fill="currentColor"><g transform="scale(${scale})">${inner}</g></g>`
			: `<g fill="currentColor">${inner}</g>`;
	return wrapped;
}

/**
 * 解析图标：Lucide 名直接返回；.svg 路径则读取库内文件、注册 addIcon 后返回注册 id
 */
export async function resolveIconId(
	app: App,
	iconFolder: string,
	raw: string
): Promise<string> {
	const trimmed = (raw ?? "").trim();
	if (!trimmed || !trimmed.toLowerCase().endsWith(".svg")) {
		return trimmed || "folder";
	}
	const base = (iconFolder ?? "").trim();
	let path =
		base && !trimmed.includes("/") ? normalizePath(base + "/" + trimmed) : normalizePath(trimmed);
	if (base && path.includes(base + "/" + base)) {
		path = path.split(base + "/" + base).join(base);
	}

	let content: string;
	try {
		content = await app.vault.adapter.read(path);
	} catch {
		const altPath = path.startsWith(".") ? path.slice(1) : path;
		try {
			content = await app.vault.adapter.read(altPath);
			path = altPath;
		} catch {
			return "folder";
		}
	}

	const inner = normalizeSvgForObsidian(content);
	const iconId = CUSTOM_ICON_PREFIX + computeHash(path);
	try {
		addIcon(iconId, inner);
		return iconId;
	} catch {
		return "folder";
	}
}
