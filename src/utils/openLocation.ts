import { App, Platform, TFile, type WorkspaceLeaf } from "obsidian";
import type { EntryOpenLocation, FileOpenLocation, OpenLocation, RibbonFolderSettings } from "../types";
import { t } from "../i18n";

const WEB_VIEWER_VIEW_TYPE = "webviewer";

type AppWithViewRegistry = App & {
	viewRegistry?: {
		viewByType?: Record<string, unknown>;
	};
};

type ElectronShell = {
	openExternal(url: string): Promise<void>;
};

type DesktopWindow = Window & {
	require?: (moduleId: string) => { shell?: ElectronShell };
};

export const OPEN_LOCATION_KEYS: OpenLocation[] = [
	"tab",
	"current",
	"split-right",
	"split-left",
	"split-up",
	"split-down",
	"left",
	"right",
	"window",
	"browser",
];

export const FILE_OPEN_LOCATION_KEYS: FileOpenLocation[] = [
	"tab",
	"current",
	"split-right",
	"split-left",
	"split-up",
	"split-down",
	"left",
	"right",
	"window",
];

export const FILE_ENTRY_OPEN_LOCATION_KEYS: EntryOpenLocation[] = ["default", ...FILE_OPEN_LOCATION_KEYS];

export const WEB_ENTRY_OPEN_LOCATION_KEYS: EntryOpenLocation[] = ["default", ...OPEN_LOCATION_KEYS];

export function openLocationLabel(key: OpenLocation | EntryOpenLocation): string {
	return t(`openLocation.options.${key}`);
}

/** 兼容旧版 noteOpenLocation（含 split） */
export function migrateOpenLocation(value: string | undefined): OpenLocation {
	if (value === "split") return "split-right";
	if (value && OPEN_LOCATION_KEYS.includes(value as OpenLocation)) {
		return value as OpenLocation;
	}
	return "tab";
}

export function migrateFileOpenLocation(value: string | undefined): FileOpenLocation {
	const location = migrateOpenLocation(value);
	return location === "browser" ? "tab" : location;
}

export function resolveFileOpenLocation(
	entryLocation: EntryOpenLocation | undefined,
	settings: RibbonFolderSettings
): FileOpenLocation {
	if (entryLocation && entryLocation !== "default" && entryLocation !== "browser") {
		return entryLocation;
	}
	return settings.defaultFileOpenLocation ?? migrateFileOpenLocation(settings.defaultOpenLocation);
}

export function resolveWebOpenLocation(
	entryLocation: EntryOpenLocation | undefined,
	settings: RibbonFolderSettings
): OpenLocation {
	if (entryLocation && entryLocation !== "default") {
		return entryLocation;
	}
	return settings.defaultWebOpenLocation ?? settings.defaultOpenLocation ?? "tab";
}

export function normalizeEntryOpenLocation(value: EntryOpenLocation | undefined): EntryOpenLocation | undefined {
	return value && value !== "default" ? value : undefined;
}

function getSplitLeaf(app: App, direction: "vertical" | "horizontal", before: boolean): WorkspaceLeaf {
	const ws = app.workspace;
	if (!before) {
		return ws.getLeaf("split", direction);
	}
	const base = ws.activeLeaf ?? ws.getMostRecentLeaf();
	if (base) {
		return ws.createLeafBySplit(base, direction, true);
	}
	return ws.getLeaf("split", direction);
}

export function getLeafForOpenLocation(app: App, location: OpenLocation): WorkspaceLeaf {
	const ws = app.workspace;
	switch (location) {
		case "tab":
			return ws.getLeaf("tab");
		case "current":
			return ws.getLeaf(false);
		case "split-right":
			return getSplitLeaf(app, "vertical", false);
		case "split-down":
			return getSplitLeaf(app, "horizontal", false);
		case "split-left":
			return getSplitLeaf(app, "vertical", true);
		case "split-up":
			return getSplitLeaf(app, "horizontal", true);
		case "left": {
			const leaf = ws.getLeftLeaf(false) ?? ws.getLeftLeaf(true);
			return leaf ?? ws.getLeaf("tab");
		}
		case "right": {
			const leaf = ws.getRightLeaf(false) ?? ws.getRightLeaf(true);
			return leaf ?? ws.getLeaf("tab");
		}
		case "window":
			return Platform.isDesktopApp ? ws.getLeaf("window") : ws.getLeaf("tab");
		case "browser":
			return ws.getLeaf("tab");
	}
}

async function revealAndFocusLeaf(app: App, leaf: WorkspaceLeaf): Promise<void> {
	await app.workspace.revealLeaf(leaf);
	app.workspace.setActiveLeaf(leaf, { focus: true });
}

export async function openFileAtLocation(app: App, file: TFile, location: FileOpenLocation): Promise<void> {
	const leaf = getLeafForOpenLocation(app, location);
	await leaf.openFile(file, { active: true });
	await revealAndFocusLeaf(app, leaf);
}

/** Obsidian 会接受未注册的视图类型并显示“插件不再活动”，因此必须在创建 leaf 前检查。 */
export function isWebViewerAvailable(app: App): boolean {
	const viewByType = (app as AppWithViewRegistry).viewRegistry?.viewByType;
	return !!viewByType && Object.prototype.hasOwnProperty.call(viewByType, WEB_VIEWER_VIEW_TYPE);
}

function openWebInSystemBrowser(url: string): void {
	if (Platform.isDesktopApp) {
		try {
			const shell = (window as DesktopWindow).require?.("electron").shell;
			if (shell) {
				void shell.openExternal(url).catch(() => {
					window.open(url, "_blank", "noopener,noreferrer");
				});
				return;
			}
		} catch {
			// 桌面桥接不可用时继续使用跨平台回退。
		}
	}
	window.open(url, "_blank", "noopener,noreferrer");
}

export async function openWebAtLocation(app: App, url: string, location: OpenLocation): Promise<void> {
	if (location === "browser") {
		openWebInSystemBrowser(url);
		return;
	}
	if (!isWebViewerAvailable(app)) {
		openWebInSystemBrowser(url);
		return;
	}
	const leaf = getLeafForOpenLocation(app, location);
	try {
		await leaf.setViewState({
			type: WEB_VIEWER_VIEW_TYPE,
			active: true,
			state: { url },
		});
	} catch {
		openWebInSystemBrowser(url);
		return;
	}
	await revealAndFocusLeaf(app, leaf);
}
