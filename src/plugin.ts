import {
	App,
	Menu,
	MenuItem,
	Notice,
	Platform,
	Plugin,
	TFile,
	type HoverParent,
	type HoverPopover,
} from "obsidian";
import type {
	AppCommands,
	CommandListItem,
	RibbonFolder,
	RibbonFolderSettings,
	RibbonPin,
	MenuDisplayMode,
	NoteOpenLocation,
} from "./types";
import {
	DEFAULT_SETTINGS,
	isEntryHidden,
	isRibbonNoteEntry,
	isRibbonSeparatorEntry,
	isRibbonWebEntry,
} from "./types";
import { isUrlSafeToOpen, normalizeExternalUrl } from "./utils/url";
import { getEntryIconRaw, getEntryLabel, getPathExtension, type RibbonActionEntry } from "./utils/entry";
import { listCommandsWithIcons } from "./utils/commands";
import { getCssVarPx } from "./utils";
import { resolveIconId, applyWideIconSize } from "./utils/icon";
import { RibbonFolderSettingTab } from "./SettingTab";
import { t, updateLanguage } from "./i18n";

export type {
	CommandListItem,
	RibbonFolder,
	RibbonFolderCommandEntry,
	RibbonFolderNoteEntry,
	RibbonFolderWebEntry,
	RibbonFolderSeparatorEntry,
	RibbonFolderEntry,
	RibbonPin,
	RibbonPinEntry,
	RibbonFolderSettings,
	NoteOpenLocation,
} from "./types";

const RIBBON_OR_LAYOUT_CLS = /horizontal-main-container|workspace-leaf|workspace-split|mod-root|side-dock-actions|workspace-ribbon|mod-left/;

const HOVER_LINK_SOURCE_ID = "ribbon-folder";

export default class RibbonFolderPlugin extends Plugin implements HoverParent {
	hoverPopover: HoverPopover | null = null;
	settings: RibbonFolderSettings;
	private ribbonEls: Map<string, HTMLElement> = new Map();
	private skipNextOpenFolderId: string | null = null;

	async onload() {
		await this.loadSettings();
		await this.rebuildRibbons();
		this.addSettingTab(new RibbonFolderSettingTab(this.app, this));

		this.registerHoverLinkSource(HOVER_LINK_SOURCE_ID, {
			display: this.manifest.name,
			defaultMod: false,
		});

		this.addCommand({
			id: "open-group-menu",
			name: t("plugin.openGroupMenu"),
			callback: () => this.openGroupPicker(),
		});

		// 初始化语言（按当前 Obsidian 语言环境）
		updateLanguage();
	}

	onunload() {
		this.removeAllRibbons();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (!this.settings.pins) {
			this.settings.pins = [];
		}
		const usedIds = new Set<string>();
		this.settings.folders.forEach((folder, i) => {
			if (!folder.id || usedIds.has(folder.id)) {
				folder.id = "folder-" + Date.now() + "-" + i;
			}
			usedIds.add(folder.id);
		});
		this.settings.pins.forEach((pin, i) => {
			if (!pin.id || usedIds.has(pin.id)) {
				pin.id = "pin-" + Date.now() + "-" + i;
			}
			usedIds.add(pin.id);
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async rebuildRibbons() {
		this.removeAllRibbons();
		const iconFolder = this.settings.iconFolder ?? "";
		for (const folder of this.settings.folders) {
			await this.addRibbonForFolder(folder, iconFolder);
		}
		for (const pin of this.settings.pins ?? []) {
			await this.addRibbonForPin(pin, iconFolder);
		}
	}

	private removeAllRibbons() {
		this.ribbonEls.forEach((el) => el.remove());
		this.ribbonEls.clear();
	}

	async addRibbonForFolder(folder: RibbonFolder, iconFolder?: string) {
		const base = iconFolder ?? this.settings.iconFolder ?? "";
		const iconId = await resolveIconId(this.app, base, folder.icon || "folder");
		const name = folder.name || "Ribbon Folder";
		const triggerMode = folder.triggerMode ?? "click";
		/** 仅桌面端支持悬停打开；手机/平板无可靠悬停，按点击处理 */
		const useHoverOpen = triggerMode === "hover" && Platform.isDesktop;
		let el: HTMLElement;
		if (useHoverOpen) {
			el = this.addRibbonIcon(iconId, name, () => {});
			const leftOffset = getCssVarPx("--size-4-1");
			el.addEventListener("mouseenter", (e: MouseEvent) => {
				const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
				void this.showFolderMenu(folder, { clientX: rect.right - leftOffset, clientY: rect.top + rect.height / 2 } as MouseEvent, true);
			});
		} else {
			el = this.addRibbonIcon(iconId, name, (evt: MouseEvent) => void this.showFolderMenu(folder, evt));
		}
		this.ribbonEls.set(folder.id, el);
	}

	removeRibbonForFolder(folderId: string) {
		this.removeRibbonEl(folderId);
	}

	removeRibbonForPin(pinId: string) {
		this.removeRibbonEl(pinId);
	}

	private removeRibbonEl(id: string) {
		const el = this.ribbonEls.get(id);
		if (el) {
			el.remove();
			this.ribbonEls.delete(id);
		}
	}

	async addRibbonForPin(pin: RibbonPin, iconFolder?: string) {
		const base = iconFolder ?? this.settings.iconFolder ?? "";
		const { title, onClick } = this.resolveEntryAction(pin.entry);
		const rawIcon = getEntryIconRaw(pin.entry, this.app);
		const iconId = await resolveIconId(this.app, base, rawIcon);
		const el = this.addRibbonIcon(iconId, title, onClick);
		if (isRibbonNoteEntry(pin.entry) && Platform.isDesktop && getPathExtension(pin.entry.path) === "md") {
			const notePath = pin.entry.path;
			el.addEventListener("mouseenter", (e: MouseEvent) => {
				this.triggerNotePagePreview(el, notePath, e);
			});
		}
		this.ribbonEls.set(pin.id, el);
	}

	updatePinRibbonDisplay(pin: RibbonPin): void {
		const el = this.ribbonEls.get(pin.id);
		if (!el) return;
		const title = getEntryLabel(pin.entry, this.app);
		el.setAttribute("aria-label", title);
		el.setAttribute("title", title);
	}

	/** Ribbon 只在主窗口；菜单与坐标一律相对主窗口，避免弹出到聚焦的 pop-out */
	private getMainDoc(): Document {
		return this.app.workspace.rootSplit.doc;
	}

	private getMainWin(): Window {
		return this.app.workspace.rootSplit.win;
	}

	/** 命令面板：打开分组菜单（移动端侧栏 Ribbon 不便时可用；仅一个分组时直接打开） */
	private openGroupPicker(): void {
		const folders = this.settings.folders;
		if (folders.length === 0) {
			new Notice(t("plugin.noGroupsYet"));
			return;
		}
		if (folders.length === 1) {
			void this.showFolderMenu(folders[0], this.syntheticMenuAnchorEvent());
			return;
		}
		const menu = new Menu();
		menu.setUseNativeMenu(false);
		for (const f of folders) {
			menu.addItem((item: MenuItem) => {
				item.setTitle(f.name?.trim() || t("folder.unnamed"));
				item.onClick(() => void this.showFolderMenu(f, this.syntheticMenuAnchorEvent()));
			});
		}
		const win = this.getMainWin();
		menu.showAtPosition(
			{
				x: Math.floor(win.innerWidth / 2),
				y: Math.min(160, Math.floor(win.innerHeight * 0.12)),
			},
			this.getMainDoc()
		);
	}

	/** 无真实点击事件时用于菜单定位（命令面板 / 居中弹出） */
	private syntheticMenuAnchorEvent(): MouseEvent {
		const win = this.getMainWin();
		const x = Math.floor(win.innerWidth / 2);
		const y = Math.min(160, Math.floor(win.innerHeight * 0.12));
		return { clientX: x, clientY: y } as MouseEvent;
	}

	/** 按设置将库内文件在指定 leaf 中打开 */
	openNoteFile(file: TFile): void {
		const mode: NoteOpenLocation = this.settings.noteOpenLocation ?? "tab";
		let leaf;
		if (mode === "tab") {
			leaf = this.app.workspace.getLeaf("tab");
		} else if (mode === "split") {
			leaf = this.app.workspace.getLeaf("split");
		} else {
			leaf = this.app.workspace.getLeaf(false);
		}
		void leaf.openFile(file);
	}

	/**
	 * 触发笔记的页面预览。仅使用 `workspace.trigger("hover-link", …)`（与 `registerHoverLinkSource` 配套）。
	 * 不调用 core `page-preview.instance.onLinkHover`：在 Ribbon 菜单里以 `Plugin` 为 HoverParent 时，
	 * 核心内部会异步拒绝（`undefined.app`），且预览实际已由 `hover-link` 正常显示。
	 */
	private triggerNotePagePreview(targetEl: HTMLElement, path: string, event: MouseEvent): void {
		const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
		this.app.workspace.trigger("hover-link", {
			event,
			source: HOVER_LINK_SOURCE_ID,
			hoverParent: this,
			targetEl,
			linktext: path,
			sourcePath,
		});
	}

	/**
	 * 在 MenuItem 创建后把悬停绑到其 `dom` 上（与 Quick Explorer 一致）。
	 * 勿依赖 `menu.containerEl`：部分版本在 showAtPosition 后仍为空。
	 */
	private bindNoteItemHover(item: MenuItem, path: string, retriesLeft = 25): void {
		const el = (item as unknown as { dom?: HTMLElement }).dom;
		if (el instanceof HTMLElement) {
			el.addEventListener("mouseenter", (e: MouseEvent) => {
				this.triggerNotePagePreview(el, path, e);
			});
			return;
		}
		if (retriesLeft <= 0) return;
		window.setTimeout(() => this.bindNoteItemHover(item, path, retriesLeft - 1), 16);
	}

	/** 仅更新已有按钮的 tooltip/标题，不删除不重建，避免与 rebuildRibbons 竞态导致重复按钮 */
	updateRibbonDisplay(folder: RibbonFolder): void {
		const el = this.ribbonEls.get(folder.id);
		if (!el) return;
		const name = folder.name || "Ribbon Folder";
		el.setAttribute("aria-label", name);
		el.setAttribute("title", name);
	}

	private resolveEntryAction(entry: RibbonActionEntry): { title: string; onClick: () => void } {
		const appCommands = (this.app as App & { commands: AppCommands }).commands;
		const title = getEntryLabel(entry, this.app);
		let onClick: () => void;
		if (isRibbonNoteEntry(entry)) {
			onClick = () => {
				const f = this.app.vault.getAbstractFileByPath(entry.path);
				if (f instanceof TFile) {
					this.openNoteFile(f);
				}
			};
		} else if (isRibbonWebEntry(entry)) {
			onClick = () => {
				const normalized = normalizeExternalUrl(entry.url);
				if (!normalized || !isUrlSafeToOpen(normalized)) {
					new Notice(t("web.openBlocked"));
					return;
				}
				window.open(normalized, "_blank", "noopener,noreferrer");
			};
		} else {
			onClick = () => {
				void appCommands.executeCommandById(entry.id);
			};
		}
		return { title, onClick };
	}

	private async addMenuItemForEntry(
		menu: Menu,
		entry: RibbonActionEntry,
		ctx: {
			displayMode: MenuDisplayMode;
			iconFolder: string;
		}
	): Promise<void> {
		const { displayMode, iconFolder } = ctx;
		const { title, onClick } = this.resolveEntryAction(entry);
		const rawIcon = getEntryIconRaw(entry, this.app);

		const iconId =
			rawIcon && displayMode !== "label-only"
				? await resolveIconId(this.app, iconFolder, rawIcon)
				: null;
		menu.addItem((item: MenuItem) => {
			if (displayMode !== "label-only" && iconId) {
				item.setIcon(iconId as Parameters<MenuItem["setIcon"]>[0]);
				setTimeout(() => {
					const anyItem = item as unknown as { iconEl?: HTMLElement };
					if (anyItem?.iconEl) applyWideIconSize(anyItem.iconEl, iconId, "var(--icon-size)");
				}, 0);
			} else if (displayMode === "label-only") item.setIcon(null);
			if (displayMode !== "icon-only") item.setTitle(title);
			else if (!iconId) item.setTitle(title);
			else item.setTitle("");
			item.onClick(onClick);
			// 页面预览仅对 Markdown 有意义；触摸设备无 hover-link 体验，跳过绑定
			if (isRibbonNoteEntry(entry) && Platform.isDesktop && getPathExtension(entry.path) === "md") {
				queueMicrotask(() => this.bindNoteItemHover(item, entry.path));
			}
		});
	}

	private async showFolderMenu(folder: RibbonFolder, evt: MouseEvent, openByHover = false) {
		if (!openByHover && this.skipNextOpenFolderId === folder.id) {
			this.skipNextOpenFolderId = null;
			return;
		}
		const menu = new Menu();
		// 桌面端须用 DOM 菜单，原生菜单无法触发 hover-link / 页面预览
		menu.setUseNativeMenu(false);

		const iconFolder = this.settings.iconFolder ?? "";

		const displayMode = folder.menuDisplay ?? "both";
		const ctx = { displayMode, iconFolder };
		const visibleEntries = folder.commands.filter((entry) => !isEntryHidden(entry));
		for (const entry of visibleEntries) {
			if (isRibbonSeparatorEntry(entry)) {
				menu.addSeparator();
				continue;
			}
			await this.addMenuItemForEntry(menu, entry, ctx);
		}

		if (visibleEntries.length === 0) {
			menu.addItem((item: MenuItem) => {
				item.setTitle(t("folder.noItems")).setDisabled(true);
			});
		}

		const mainDoc = this.getMainDoc();
		const mainWin = this.getMainWin();
		const leftOffset = getCssVarPx("--size-4-2");
		const ribbonRect = mainDoc.querySelector(".workspace-ribbon.mod-left")?.getBoundingClientRect();
		const x = ribbonRect ? ribbonRect.right - leftOffset : evt.clientX - leftOffset;
		const folderRibbonEl = this.ribbonEls.get(folder.id);
		const br = folderRibbonEl?.getBoundingClientRect();
		// const y = br ? br.top + br.height / 2 : evt.clientY;
		const y = br ? br.top : evt.clientY;
		menu.showAtPosition({ x, y }, mainDoc);

		const setDisplayAttr = (el: HTMLElement) => el.setAttribute("data-ribbon-folder-display", displayMode);
		const menuContainerEl =
			(menu as unknown as { containerEl?: HTMLElement; dom?: HTMLElement }).containerEl ??
			(menu as unknown as { dom?: HTMLElement }).dom;
		if (menuContainerEl) setDisplayAttr(menuContainerEl);
		const inRect = (cx: number, cy: number, r: DOMRect) =>
			cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
		const closeIfOutside = (e: PointerEvent) => {
			const target = e.target as Node;
			const hitOutside = menuContainerEl && !menuContainerEl.contains(target);
			const r = folderRibbonEl?.getBoundingClientRect();
			const hitRibbon = r && inRect(e.clientX, e.clientY, r);
			if (hitOutside || hitRibbon) {
				if (folderRibbonEl?.contains(target)) this.skipNextOpenFolderId = folder.id;
				menu.close();
				mainDoc.removeEventListener("pointerdown", closeIfOutside, true);
			}
		};
		menu.onHide(() => mainDoc.removeEventListener("pointerdown", closeIfOutside, true));
		mainWin.setTimeout(() => mainDoc.addEventListener("pointerdown", closeIfOutside, true), 0);

		const findMenuDomEl = (atX: number, atY: number): HTMLElement | null => {
			const fromApi = (menu as unknown as { containerEl?: HTMLElement }).containerEl;
			if (fromApi) return fromApi;
			const isRibbonOrLayout = (el: HTMLElement) => {
				const r = el.getBoundingClientRect();
				if (r.width > 450 || r.height > 600) return true;
				if (RIBBON_OR_LAYOUT_CLS.test(el.className?.toString() ?? "")) return true;
				return !!(el.closest(".workspace-ribbon") || el.closest(".side-dock-actions") || el.closest(".workspace-leaf"));
			};
			const points = [
				[atX, atY],
				[atX + 40, atY + 20],
				[atX + 80, atY + 40],
			];
			for (const [px, py] of points) {
				const at = mainDoc.elementsFromPoint(px, py);
				for (const node of at) {
					const el = node instanceof HTMLElement ? node : null;
					if (!el || el === mainDoc.body) continue;
					if (isRibbonOrLayout(el)) continue;
					const root = el.closest(".menu") ?? el.closest("[class*='menu']") ?? (el.classList?.contains("menu") ? el : null);
					if (root && root instanceof HTMLElement && !isRibbonOrLayout(root)) return root;
					const r = el.getBoundingClientRect();
					if (r.width > 30 && r.height > 20 && r.width < 450 && r.height < 600) return el;
				}
			}
			return null;
		};

		const setupHoverClose = (attempt = 0) => {
			if (!openByHover || !Platform.isDesktop) return;
			const el = findMenuDomEl(x, y);
			const ribbonEl = this.ribbonEls.get(folder.id);
			if (!ribbonEl) return;
			if (!el) {
				if (attempt < 20) mainWin.setTimeout(() => setupHoverClose(attempt + 1), 25);
				return;
			}
			const hoverMenuEl = el;
			let closeTimer: number | null = null;
			const HOVER_CLOSE_DELAY_MS = 120;
			const isOverMenu = (cx: number, cy: number): boolean => {
				const under = mainDoc.elementFromPoint(cx, cy);
				if (under != null && hoverMenuEl.contains(under)) return true;
				const r = hoverMenuEl.getBoundingClientRect();
				const pad = 2;
				return cx >= r.left - pad && cx <= r.right + pad && cy >= r.top - pad && cy <= r.bottom + pad;
			};
			const onMouseMove = (e: MouseEvent) => {
				const overRibbon = inRect(e.clientX, e.clientY, ribbonEl.getBoundingClientRect());
				const overMenu = isOverMenu(e.clientX, e.clientY);
				if (overRibbon || overMenu) {
					if (closeTimer) mainWin.clearTimeout(closeTimer);
					closeTimer = null;
				} else if (!closeTimer) {
					closeTimer = mainWin.setTimeout(() => {
						menu.close();
						closeTimer = null;
					}, HOVER_CLOSE_DELAY_MS);
				}
			};
			mainDoc.addEventListener("mousemove", onMouseMove);
			menu.onHide(() => {
				mainDoc.removeEventListener("mousemove", onMouseMove);
				if (closeTimer) mainWin.clearTimeout(closeTimer);
			});
		};
		const trySetDisplayAttr = (): boolean => {
			const el = findMenuDomEl(x, y);
			if (el) setDisplayAttr(el);
			return !!el;
		};
		const applySubmenuDisplayAttr = (attempt = 0) => {
			if (trySetDisplayAttr()) return;
			if (attempt < 12) mainWin.setTimeout(() => applySubmenuDisplayAttr(attempt + 1), 16);
		};
		if (!menuContainerEl) {
			queueMicrotask(() => {
				if (!trySetDisplayAttr()) mainWin.requestAnimationFrame(() => {
					if (!trySetDisplayAttr()) applySubmenuDisplayAttr(0);
				});
			});
		}
		mainWin.setTimeout(() => setupHoverClose(0), 0);
	}

	getAllCommands(): CommandListItem[] {
		return listCommandsWithIcons(this.app);
	}
}
