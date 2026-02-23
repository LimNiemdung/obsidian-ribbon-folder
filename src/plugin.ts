import { App, Menu, MenuItem, Plugin } from "obsidian";
import type { AppCommands, RibbonFolder, RibbonFolderSettings } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { getCssVarPx } from "./utils";
import { resolveIconId } from "./utils/icon";
import { RibbonFolderSettingTab } from "./SettingTab";
import { t, updateLanguage, i18next } from "./i18n";

export type { RibbonFolder, RibbonFolderCommand, RibbonFolderSettings } from "./types";

const RIBBON_OR_LAYOUT_CLS = /horizontal-main-container|workspace-leaf|workspace-split|mod-root|side-dock-actions|workspace-ribbon|mod-left/;

export default class RibbonFolderPlugin extends Plugin {
	settings: RibbonFolderSettings;
	private ribbonEls: Map<string, HTMLElement> = new Map();
	private skipNextOpenFolderId: string | null = null;

	async onload() {
		await this.loadSettings();
		await this.rebuildRibbons();
		this.addSettingTab(new RibbonFolderSettingTab(this.app, this));

		// 初始化语言检测
		updateLanguage();
		console.log("Ribbon Folder plugin language initialized to:", i18next.language);

		// 尝试监听语言变化事件（如果 Obsidian 提供此事件）
		try {
			// @ts-ignore - 尝试监听可能的语言变化事件
			(this.app as any).setting?.on("language-change", updateLanguage);
		} catch (error) {
			console.warn("Failed to set up language change listener:", error);
		}
	}

	onunload() {
		this.removeAllRibbons();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		const usedIds = new Set<string>();
		this.settings.folders.forEach((folder, i) => {
			if (!folder.id || usedIds.has(folder.id)) {
				folder.id = "folder-" + Date.now() + "-" + i;
			}
			usedIds.add(folder.id);
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
		let el: HTMLElement;
		if (triggerMode === "hover") {
			el = this.addRibbonIcon(iconId, name, () => {});
			const leftOffset = getCssVarPx("--size-4-1");
			el.addEventListener("mouseenter", (e: MouseEvent) => {
				const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
				this.showFolderMenu(folder, { clientX: rect.right - leftOffset, clientY: rect.top + rect.height / 2 } as MouseEvent, true);
			});
		} else {
			el = this.addRibbonIcon(iconId, name, (evt: MouseEvent) => this.showFolderMenu(folder, evt));
		}
		this.ribbonEls.set(folder.id, el);
	}

	removeRibbonForFolder(folderId: string) {
		const el = this.ribbonEls.get(folderId);
		if (el) {
			el.remove();
			this.ribbonEls.delete(folderId);
		}
	}

	/** 仅更新已有按钮的 tooltip/标题，不删除不重建，避免与 rebuildRibbons 竞态导致重复按钮 */
	updateRibbonDisplay(folder: RibbonFolder): void {
		const el = this.ribbonEls.get(folder.id);
		if (!el) return;
		const name = folder.name || "Ribbon Folder";
		el.setAttribute("aria-label", name);
		el.setAttribute("title", name);
	}

	private async showFolderMenu(folder: RibbonFolder, evt: MouseEvent, openByHover = false) {
		if (!openByHover && this.skipNextOpenFolderId === folder.id) {
			this.skipNextOpenFolderId = null;
			return;
		}
		const menu = new Menu();
		const appCommands = (this.app as App & { commands: AppCommands }).commands;
		const allCommands = appCommands.listCommands();
		const iconFolder = this.settings.iconFolder ?? "";

		const displayMode = folder.menuDisplay ?? "both";
		for (const entry of folder.commands) {
			const cmd = allCommands.find((c: { id: string; name: string }) => c.id === entry.id);
			const title = entry.displayName?.trim() || (cmd ? cmd.name : entry.id);
			const rawIcon = entry.icon?.trim() || (cmd as { icon?: string } | undefined)?.icon || null;
			const iconId =
				rawIcon && displayMode !== "label-only"
					? await resolveIconId(this.app, iconFolder, rawIcon)
					: null;
			menu.addItem((item: MenuItem) => {
				if (displayMode !== "label-only" && iconId) item.setIcon(iconId as Parameters<MenuItem["setIcon"]>[0]);
				else if (displayMode === "label-only") item.setIcon(null);
				if (displayMode !== "icon-only") item.setTitle(title);
				else if (!iconId) item.setTitle(title);
				else item.setTitle("");
				item.onClick(() => appCommands.executeCommandById(entry.id));
			});
		}

		if (folder.commands.length === 0) {
			menu.addItem((item: MenuItem) => {
				item.setTitle(t("folder.noCommands")).setDisabled(true);
			});
		}

		const leftOffset = getCssVarPx("--size-4-2");
		const ribbonRect = document.querySelector(".workspace-ribbon.mod-left")?.getBoundingClientRect();
		const x = ribbonRect ? ribbonRect.right - leftOffset : evt.clientX - leftOffset;
		const folderRibbonEl = this.ribbonEls.get(folder.id);
		const br = folderRibbonEl?.getBoundingClientRect();
		// const y = br ? br.top + br.height / 2 : evt.clientY;
		const y = br ? br.top : evt.clientY;
		menu.showAtPosition({ x, y });

		const setDisplayAttr = (el: HTMLElement) => el.setAttribute("data-ribbon-folder-display", displayMode);
		const menuContainerEl = (menu as unknown as { containerEl: HTMLElement }).containerEl;
		if (menuContainerEl) setDisplayAttr(menuContainerEl);
		const inRect = (cx: number, cy: number, r: DOMRect) =>
			cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
		const closeIfOutside = (e: MouseEvent) => {
			const target = e.target as Node;
			const hitOutside = menuContainerEl && !menuContainerEl.contains(target);
			const r = folderRibbonEl?.getBoundingClientRect();
			const hitRibbon = r && inRect(e.clientX, e.clientY, r);
			if (hitOutside || hitRibbon) {
				if (folderRibbonEl?.contains(target)) this.skipNextOpenFolderId = folder.id;
				menu.close();
				document.removeEventListener("mousedown", closeIfOutside);
			}
		};
		menu.onHide(() => document.removeEventListener("mousedown", closeIfOutside));
		setTimeout(() => document.addEventListener("mousedown", closeIfOutside), 0);

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
				const at = document.elementsFromPoint(px, py);
				for (const node of at) {
					const el = node instanceof HTMLElement ? node : null;
					if (!el || el === document.body) continue;
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
			if (!openByHover) return;
			const el = findMenuDomEl(x, y);
			const ribbonEl = this.ribbonEls.get(folder.id);
			if (!ribbonEl) return;
			if (!el) {
				if (attempt < 20) setTimeout(() => setupHoverClose(attempt + 1), 25);
				return;
			}
			const hoverMenuEl = el;
			let closeTimer: number | null = null;
			const HOVER_CLOSE_DELAY_MS = 120;
			const isOverMenu = (cx: number, cy: number): boolean => {
				const under = document.elementFromPoint(cx, cy);
				if (under != null && hoverMenuEl.contains(under)) return true;
				const r = hoverMenuEl.getBoundingClientRect();
				const pad = 2;
				return cx >= r.left - pad && cx <= r.right + pad && cy >= r.top - pad && cy <= r.bottom + pad;
			};
			const onMouseMove = (e: MouseEvent) => {
				const overRibbon = inRect(e.clientX, e.clientY, ribbonEl.getBoundingClientRect());
				const overMenu = isOverMenu(e.clientX, e.clientY);
				if (overRibbon || overMenu) {
					if (closeTimer) clearTimeout(closeTimer);
					closeTimer = null;
				} else if (!closeTimer) {
					closeTimer = window.setTimeout(() => {
						menu.close();
						closeTimer = null;
					}, HOVER_CLOSE_DELAY_MS);
				}
			};
			document.addEventListener("mousemove", onMouseMove);
			menu.onHide(() => {
				document.removeEventListener("mousemove", onMouseMove);
				if (closeTimer) clearTimeout(closeTimer);
			});
		};
		const trySetDisplayAttr = (): boolean => {
			const el = findMenuDomEl(x, y);
			if (el) setDisplayAttr(el);
			return !!el;
		};
		const applySubmenuDisplayAttr = (attempt = 0) => {
			if (trySetDisplayAttr()) return;
			if (attempt < 12) setTimeout(() => applySubmenuDisplayAttr(attempt + 1), 16);
		};
		if (!menuContainerEl) {
			queueMicrotask(() => {
				if (!trySetDisplayAttr()) requestAnimationFrame(() => {
					if (!trySetDisplayAttr()) applySubmenuDisplayAttr(0);
				});
			});
		}
		setTimeout(() => setupHoverClose(0), 0);
	}

	getAllCommands(): { id: string; name: string }[] {
		const commands = (this.app as App & { commands: AppCommands }).commands;
		return commands.listCommands();
	}
}
