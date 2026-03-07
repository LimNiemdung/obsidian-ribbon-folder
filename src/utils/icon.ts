import { App, addIcon } from "obsidian";

const CUSTOM_ICON_PREFIX = "ribbon-folder-icon-";
const ICON_ASPECT_RATIOS = new Map<string, number>();

export function getIconAspect(iconId: string): number | undefined {
	return ICON_ASPECT_RATIOS.get(iconId);
}

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
	const minX = Number.isFinite(viewBox[0]) ? viewBox[0] : 0;
	const minY = Number.isFinite(viewBox[1]) ? viewBox[1] : 0;
	const vbW = Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : 100;
	const vbH = Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : 100;
	// 固定视窗高度为 100，宽度按比例变化（等比缩放到高度=100）
	const scale = 100 / vbH;
	const scaledW = vbW * scale;
	const scaledH = 100;
	const offsetX = (100 - scaledW) / 2;
	const offsetY = (100 - scaledH) / 2; // 此处恒为 0，但保留写法以便未来扩展
	const needsTransform =
		Math.abs(scale - 1) > 0.001 || Math.abs(offsetX) > 0.001 || Math.abs(offsetY) > 0.001 || minX !== 0 || minY !== 0;
	return needsTransform
		? `<g fill="currentColor"><g transform="translate(${offsetX}, ${offsetY}) scale(${scale}) translate(${-minX}, ${-minY})">${inner}</g></g>`
		: `<g fill="currentColor">${inner}</g>`;
}

function computeSvgAspect(svgFileContent: string): number {
	const svgTagMatch = svgFileContent.match(/<svg([^>]*)>([\s\S]*?)<\/svg>/i);
	const attrs = svgTagMatch ? svgTagMatch[1] : "";
	const viewBoxMatch = attrs.match(/viewBox\s*=\s*["']?\s*([\d.\s-]+)["']?/i);
	let w: number, h: number;
	if (viewBoxMatch) {
		const vb = viewBoxMatch[1].trim().split(/\s+/).map(Number);
		w = Number.isFinite(vb[2]) && vb[2] > 0 ? vb[2] : 100;
		h = Number.isFinite(vb[3]) && vb[3] > 0 ? vb[3] : 100;
	} else {
		const widthMatch = attrs.match(/\bwidth\s*=\s*["']?\s*([\d.]+)["']?/i);
		const heightMatch = attrs.match(/\bheight\s*=\s*["']?\s*([\d.]+)["']?/i);
		w = widthMatch ? Number(widthMatch[1]) : 24;
		h = heightMatch ? Number(heightMatch[1]) : 24;
	}
	const ratio = h > 0 ? w / h : 1;
	// Clamp to a reasonable range to avoid layout explosion
	return Math.min(6, Math.max(0.25, ratio));
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
		// 对于内置/Lucide 图标，默认视为 1:1
		const id = trimmed || "folder";
		ICON_ASPECT_RATIOS.set(id, 1);
		return id;
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
		ICON_ASPECT_RATIOS.set(iconId, computeSvgAspect(content));
		return iconId;
	} catch {
		return "folder";
	}
}
