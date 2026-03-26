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

/** 点击菜单中的笔记时在何处打开 */
export type NoteOpenLocation = "tab" | "current" | "split";

/** 分组内一条命令（菜单项） */
export interface RibbonFolderCommandEntry {
	kind?: "command";
	id: string;
	displayName?: string;
	/** 菜单项图标：Lucide 名（如 dice）或库内 .svg 路径；未填时默认 command */
	icon?: string;
}

/** 分组内一条笔记（点击在编辑器中打开） */
export interface RibbonFolderNoteEntry {
	kind: "note";
	/** 库内路径 */
	path: string;
	displayName?: string;
	/** 菜单项图标；未填时默认 file */
	icon?: string;
}

/** 分组内一条分隔线（仅视觉分隔，无点击） */
export interface RibbonFolderSeparatorEntry {
	kind: "separator";
}

export type RibbonFolderEntry = RibbonFolderCommandEntry | RibbonFolderNoteEntry | RibbonFolderSeparatorEntry;

/** @deprecated 使用 RibbonFolderCommandEntry */
export type RibbonFolderCommand = RibbonFolderCommandEntry;

export function isRibbonNoteEntry(e: RibbonFolderEntry): e is RibbonFolderNoteEntry {
	return e.kind === "note";
}

export function isRibbonSeparatorEntry(e: RibbonFolderEntry): e is RibbonFolderSeparatorEntry {
	return e.kind === "separator";
}

export function isRibbonCommandEntry(e: RibbonFolderEntry): e is RibbonFolderCommandEntry {
	return e.kind !== "note" && e.kind !== "separator";
}

/** 命令菜单项默认 Lucide 图标 */
export const DEFAULT_COMMAND_MENU_ICON = "command";
/** 笔记菜单项默认 Lucide 图标 */
export const DEFAULT_NOTE_MENU_ICON = "file";

export interface RibbonFolder {
	id: string;
	name: string;
	icon: string;
	/** 命令与笔记条目（历史数据仅有 id 无 kind 时视为命令） */
	commands: RibbonFolderEntry[];
	/** 菜单中命令的显示方式：仅图标 / 仅标签 / 都显示 */
	menuDisplay?: MenuDisplayMode;
	/** 菜单触发方式：点击显示或悬停显示 */
	triggerMode?: MenuTriggerMode;
}

export interface RibbonFolderSettings {
	folders: RibbonFolder[];
	/** 自定义图标根目录，图标字段可填相对此目录的 .svg（如 add.svg）或库内完整路径 */
	iconFolder?: string;
	/** 笔记菜单项点击后打开位置，默认新标签页 */
	noteOpenLocation?: NoteOpenLocation;
}

/** 设置页所需插件能力，避免 SettingTab 直接引用 plugin 造成模块解析问题 */
export interface IRibbonFolderPlugin {
	app: App;
	settings: RibbonFolderSettings;
	saveSettings(): Promise<void>;
	rebuildRibbons(): Promise<void>;
	addRibbonForFolder(folder: RibbonFolder, iconFolder?: string): Promise<void>;
	removeRibbonForFolder(folderId: string): void;
	/** 仅更新已有按钮的标题/图标显示，不删除重建，避免重复按钮 */
	updateRibbonDisplay(folder: RibbonFolder): void;
	getAllCommands(): CommandListItem[];
}

export const DEFAULT_SETTINGS: RibbonFolderSettings = {
	folders: [],
	noteOpenLocation: "tab",
};
