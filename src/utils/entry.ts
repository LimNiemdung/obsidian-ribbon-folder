import type { App } from "obsidian";
import type {
	RibbonFolderCommandEntry,
	RibbonFolderNoteEntry,
	RibbonFolderWebEntry,
} from "../types";
import {
	DEFAULT_COMMAND_MENU_ICON,
	DEFAULT_NOTE_MENU_ICON,
	DEFAULT_WEB_MENU_ICON,
	isRibbonNoteEntry,
	isRibbonWebEntry,
} from "../types";
import { getCommandById } from "./commands";

export type RibbonActionEntry =
	| RibbonFolderCommandEntry
	| RibbonFolderNoteEntry
	| RibbonFolderWebEntry;

/** 常见扩展名 → Lucide 默认图标（未单独列出的回退为 file） */
const FILE_EXT_DEFAULT_ICONS: Record<string, string> = {
	// Markdown / 纯文本
	md: "file-text",
	mdown: "file-text",
	markdown: "file-text",
	txt: "file-text",
	rtf: "file-text",
	log: "file-text",
	pdf: "file-text",
	doc: "file-text",
	docx: "file-text",
	odt: "file-text",
	ppt: "file-text",
	pptx: "file-text",
	// 图片
	png: "file-image",
	jpg: "file-image",
	jpeg: "file-image",
	gif: "file-image",
	webp: "file-image",
	bmp: "file-image",
	ico: "file-image",
	tif: "file-image",
	tiff: "file-image",
	svg: "image",
	avif: "file-image",
	// 音频
	mp3: "file-audio",
	wav: "file-audio",
	flac: "file-audio",
	ogg: "file-audio",
	m4a: "file-audio",
	aac: "file-audio",
	wma: "file-audio",
	opus: "file-audio",
	// 视频
	mp4: "file-video",
	webm: "file-video",
	mkv: "file-video",
	mov: "file-video",
	avi: "file-video",
	m4v: "file-video",
	wmv: "file-video",
	// 代码
	js: "file-code",
	jsx: "file-code",
	mjs: "file-code",
	cjs: "file-code",
	ts: "file-code",
	tsx: "file-code",
	py: "file-code",
	rb: "file-code",
	go: "file-code",
	rs: "file-code",
	java: "file-code",
	kt: "file-code",
	c: "file-code",
	cpp: "file-code",
	cc: "file-code",
	cxx: "file-code",
	h: "file-code",
	hpp: "file-code",
	cs: "file-code",
	php: "file-code",
	swift: "file-code",
	html: "file-code",
	htm: "file-code",
	css: "file-code",
	scss: "file-code",
	sass: "file-code",
	less: "file-code",
	vue: "file-code",
	svelte: "file-code",
	sh: "file-code",
	bash: "file-code",
	zsh: "file-code",
	ps1: "file-code",
	bat: "file-code",
	cmd: "file-code",
	sql: "file-code",
	r: "file-code",
	lua: "file-code",
	pl: "file-code",
	// 数据 / 配置
	json: "file-json",
	jsonc: "file-json",
	json5: "file-json",
	csv: "file-spreadsheet",
	tsv: "file-spreadsheet",
	xls: "file-spreadsheet",
	xlsx: "file-spreadsheet",
	ods: "file-spreadsheet",
	yaml: "file-code",
	yml: "file-code",
	toml: "file-code",
	ini: "file-code",
	xml: "file-code",
	// 压缩包
	zip: "file-archive",
	rar: "file-archive",
	"7z": "file-archive",
	tar: "file-archive",
	gz: "file-archive",
	tgz: "file-archive",
	bz2: "file-archive",
	xz: "file-archive",
	// Obsidian / 应用
	canvas: "layout-dashboard",
	base: "database",
	excalidraw: "pencil",
	// 字体
	ttf: "type",
	otf: "type",
	woff: "type",
	woff2: "type",
};

export function getEntryLabel(entry: RibbonActionEntry, app: App): string {
	if (isRibbonNoteEntry(entry)) {
		if (entry.displayName?.trim()) return entry.displayName.trim();
		const base = entry.path.split("/").pop() ?? entry.path;
		const ext = getPathExtension(base);
		if (!ext) return base;
		return base.slice(0, -(ext.length + 1));
	}
	if (isRibbonWebEntry(entry)) {
		return entry.displayName?.trim() || entry.url.trim();
	}
	const cmd = getCommandById(app, entry.id);
	return entry.displayName?.trim() || (cmd?.name ?? entry.id);
}

/** 取路径扩展名（小写、无点）；无扩展名时返回空串 */
export function getPathExtension(path: string): string {
	const name = path.split("/").pop() ?? path;
	const i = name.lastIndexOf(".");
	if (i <= 0 || i === name.length - 1) return "";
	return name.slice(i + 1).toLowerCase();
}

/** 按扩展名返回文件默认图标；未知扩展名用 file */
export function getDefaultFileIcon(path: string): string {
	const ext = getPathExtension(path);
	if (!ext) return DEFAULT_NOTE_MENU_ICON;
	return FILE_EXT_DEFAULT_ICONS[ext] ?? DEFAULT_NOTE_MENU_ICON;
}

export function getEntryIconRaw(entry: RibbonActionEntry, app: App): string {
	if (isRibbonNoteEntry(entry)) {
		return entry.icon?.trim() || getDefaultFileIcon(entry.path);
	}
	if (isRibbonWebEntry(entry)) {
		return entry.icon?.trim() || DEFAULT_WEB_MENU_ICON;
	}
	const cmd = getCommandById(app, entry.id);
	return entry.icon?.trim() || cmd?.icon?.trim() || DEFAULT_COMMAND_MENU_ICON;
}
