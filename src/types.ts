import type { App } from "obsidian";

/** Obsidian 运行时存在但类型定义中未声明的 commands API */
export interface AppCommands {
	listCommands(): { id: string; name: string }[];
	executeCommandById(id: string): Promise<void> | void;
}

/** 菜单显示方式 */
export type MenuDisplayMode = "icon-only" | "label-only" | "both";

/** 菜单触发方式：点击图标或悬停图标 */
export type MenuTriggerMode = "click" | "hover";

/** 分组内的一条命令，可自定义在菜单中的显示名与图标 */
export interface RibbonFolderCommand {
	id: string;
	displayName?: string;
	/** 菜单项图标：Lucide 名（如 dice）或库内 .svg 路径（如 scripts/icons/add.svg） */
	icon?: string;
}

export interface RibbonFolder {
	id: string;
	name: string;
	icon: string;
	commands: RibbonFolderCommand[];
	/** 菜单中命令的显示方式：仅图标 / 仅标签 / 都显示 */
	menuDisplay?: MenuDisplayMode;
	/** 菜单触发方式：点击显示或悬停显示 */
	triggerMode?: MenuTriggerMode;
}

export interface RibbonFolderSettings {
	folders: RibbonFolder[];
	/** 自定义图标根目录，图标字段可填相对此目录的 .svg（如 add.svg）或库内完整路径 */
	iconFolder?: string;
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
	getAllCommands(): { id: string; name: string }[];
}

export const DEFAULT_SETTINGS: RibbonFolderSettings = {
	folders: [],
};
