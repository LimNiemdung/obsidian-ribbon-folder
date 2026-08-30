import type { App } from "obsidian";

/** 命令列表项（含可选 icon，与 Obsidian `addCommand` 注册一致，常作为 Ribbon/命令面板默认图标） */
export type CommandListItem = { id: string; name: string; icon?: string };

/** Obsidian 运行时存在但类型定义中未声明的 commands API */
export interface AppCommands {
	listCommands(): CommandListItem[];
	executeCommandById(id: string): Promise<void> | void;
}

/** 菜单显示方式 */
export type MenuDisplayMode = "icon-only" | "label-only" | "both";

/** 菜单触发方式：点击图标或悬停图标 */
export type MenuTriggerMode = "click" | "hover";

/** 打开文件或网页的位置 */
export type OpenLocation =
	| "tab"
	| "current"
	| "split-right"
	| "split-left"
	| "split-up"
	| "split-down"
	| "left"
	| "right"
	| "window"
	| "browser";

/** 库内文件支持的打开位置（不含系统浏览器） */
export type FileOpenLocation = Exclude<OpenLocation, "browser">;

/** 菜单项单独设置；default 表示跟随全局默认 */
export type EntryOpenLocation = "default" | OpenLocation;

/** 旧版笔记打开位置类型（含 split），保留供外部类型兼容 */
export type NoteOpenLocation = "tab" | "current" | "split";

/** 分组内一条命令（菜单项） */
export interface RibbonFolderCommandEntry {
	kind?: "command";
	id: string;
	displayName?: string;
	/** 菜单项图标：Lucide 名（如 dice）或库内 .svg 路径；未填时默认 command */
	icon?: string;
	/** 为 true 时不出现在分组弹出菜单中，设置页仍保留 */
	hidden?: boolean;
}

/** 分组内一条库内文件（点击打开；kind 仍为 note 以兼容旧数据） */
export interface RibbonFolderNoteEntry {
	kind: "note";
	/** 库内路径（任意文件，不限于 Markdown） */
	path: string;
	displayName?: string;
	/** 菜单项图标；未填时默认 file */
	icon?: string;
	/** 打开位置；未填或 default 时使用全局默认 */
	openLocation?: EntryOpenLocation;
	/** 为 true 时不出现在分组弹出菜单中，设置页仍保留 */
	hidden?: boolean;
}

/** 分组内一条网页（点击在 Obsidian 内嵌浏览器或系统浏览器中打开） */
export interface RibbonFolderWebEntry {
	kind: "web";
	/** 完整 URL 或可补全为 https 的域名（如 example.com/path） */
	url: string;
	displayName?: string;
	/** 菜单项图标；未填时默认 globe */
	icon?: string;
	/** 打开位置；未填或 default 时使用全局默认 */
	openLocation?: EntryOpenLocation;
	/** 为 true 时不出现在分组弹出菜单中，设置页仍保留 */
	hidden?: boolean;
}

/** 分组内一条分隔线（仅视觉分隔，无点击） */
export interface RibbonFolderSeparatorEntry {
	kind: "separator";
	/** 为 true 时不出现在分组弹出菜单中，设置页仍保留 */
	hidden?: boolean;
}

export type RibbonFolderEntry =
	| RibbonFolderCommandEntry
	| RibbonFolderNoteEntry
	| RibbonFolderWebEntry
	| RibbonFolderSeparatorEntry;

/** 可直接钉在 Ribbon 上的条目（命令 / 文件 / 网页，无分隔线） */
export type RibbonPinEntry = RibbonFolderCommandEntry | RibbonFolderNoteEntry | RibbonFolderWebEntry;

/** Ribbon 上的单个快捷按钮（点击直接执行，不弹出分组菜单） */
export interface RibbonPin {
	id: string;
	entry: RibbonPinEntry;
}

/** @deprecated 使用 RibbonFolderCommandEntry */
export type RibbonFolderCommand = RibbonFolderCommandEntry;

export function isRibbonNoteEntry(e: RibbonFolderEntry): e is RibbonFolderNoteEntry {
	return e.kind === "note";
}

export function isRibbonSeparatorEntry(e: RibbonFolderEntry): e is RibbonFolderSeparatorEntry {
	return e.kind === "separator";
}

export function isRibbonWebEntry(e: RibbonFolderEntry): e is RibbonFolderWebEntry {
	return e.kind === "web";
}

export function isRibbonCommandEntry(e: RibbonFolderEntry): e is RibbonFolderCommandEntry {
	return e.kind !== "note" && e.kind !== "separator" && e.kind !== "web";
}

export function isEntryHidden(e: RibbonFolderEntry): boolean {
	return !!e.hidden;
}

/** 命令菜单项默认 Lucide 图标 */
export const DEFAULT_COMMAND_MENU_ICON = "command";
/** 文件菜单项通用默认 Lucide 图标（未知扩展名时回退） */
export const DEFAULT_NOTE_MENU_ICON = "file";
/** 网页菜单项默认 Lucide 图标 */
export const DEFAULT_WEB_MENU_ICON = "globe";

export interface RibbonFolder {
	id: string;
	name: string;
	icon: string;
	/** 命令、文件与网页条目（历史数据仅有 id 无 kind 时视为命令） */
	commands: RibbonFolderEntry[];
	/** 菜单中命令的显示方式：仅图标 / 仅标签 / 都显示 */
	menuDisplay?: MenuDisplayMode;
	/** 菜单触发方式：点击显示或悬停显示 */
	triggerMode?: MenuTriggerMode;
}

export interface RibbonFolderSettings {
	folders: RibbonFolder[];
	/** Ribbon 快捷项：每个条目对应 Ribbon 上一个独立按钮 */
	pins?: RibbonPin[];
	/** 自定义图标根目录，图标字段可填相对此目录的 .svg（如 add.svg）或库内完整路径 */
	iconFolder?: string;
	/** 文件菜单项的默认打开位置 */
	defaultFileOpenLocation?: FileOpenLocation;
	/** 网页菜单项的默认打开位置 */
	defaultWebOpenLocation?: OpenLocation;
	/** @deprecated 使用 defaultFileOpenLocation 与 defaultWebOpenLocation */
	defaultOpenLocation?: OpenLocation;
	/** @deprecated 使用 defaultFileOpenLocation */
	noteOpenLocation?: NoteOpenLocation;
}

/** 设置页所需插件能力，避免 SettingTab 直接引用 plugin 造成模块解析问题 */
export interface IRibbonFolderPlugin {
	app: App;
	settings: RibbonFolderSettings;
	saveSettings(): Promise<void>;
	rebuildRibbons(): Promise<void>;
	addRibbonForFolder(folder: RibbonFolder, iconFolder?: string): Promise<void>;
	addRibbonForPin(pin: RibbonPin, iconFolder?: string): Promise<void>;
	removeRibbonForFolder(folderId: string): void;
	removeRibbonForPin(pinId: string): void;
	/** 仅更新已有按钮的标题/图标显示，不删除重建，避免重复按钮 */
	updateRibbonDisplay(folder: RibbonFolder): void;
	updatePinRibbonDisplay(pin: RibbonPin): void;
	getAllCommands(): CommandListItem[];
}

export const DEFAULT_SETTINGS: RibbonFolderSettings = {
	folders: [],
	pins: [],
	defaultFileOpenLocation: "tab",
	defaultWebOpenLocation: "tab",
};
