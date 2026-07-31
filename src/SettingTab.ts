import { App, Plugin, PluginSettingTab, SettingGroup, setIcon } from "obsidian";
import type {
	IRibbonFolderPlugin,
	RibbonFolder,
	MenuDisplayMode,
	MenuTriggerMode,
	RibbonFolderEntry,
	RibbonFolderCommandEntry,
	RibbonFolderNoteEntry,
	RibbonFolderWebEntry,
	RibbonPin,
	NoteOpenLocation,
} from "./types";
import {
	isRibbonCommandEntry,
	isRibbonNoteEntry,
	isRibbonSeparatorEntry,
	isRibbonWebEntry,
} from "./types";
import { getEntryIconRaw, getEntryLabel, getPathExtension } from "./utils/entry";
import { CommandPickerModal } from "./CommandPickerModal";
import { openDeleteConfirm } from "./ConfirmModal";
import { EditCommandModal } from "./EditCommandModal";
import { EditNoteModal } from "./EditNoteModal";
import { EditWebModal } from "./EditWebModal";
import { NotePickerModal } from "./NotePickerModal";
import { resolveIconId, applyWideIconSize } from "./utils/icon";
import { addSelectSvgExtraButton } from "./utils/selectSvgButton";
import { t } from "./i18n";
import { normalizeExternalUrl } from "./utils/url";

const REBUILD_DEBOUNCE_MS = 300;
const MENU_DISPLAY_OPTIONS: Record<MenuDisplayMode, string> = {
	"icon-only": t("folder.menuDisplayOptions.icon-only"),
	"label-only": t("folder.menuDisplayOptions.label-only"),
	both: t("folder.menuDisplayOptions.both"),
};
const TRIGGER_MODE_OPTIONS: Record<MenuTriggerMode, string> = {
	click: t("folder.triggerModeOptions.click"),
	hover: t("folder.triggerModeOptions.hover"),
};
const NOTE_OPEN_OPTIONS: Record<NoteOpenLocation, string> = {
	tab: t("settings.noteOpenLocation.options.tab"),
	current: t("settings.noteOpenLocation.options.current"),
	split: t("settings.noteOpenLocation.options.split"),
};

type SettingsTabId = "general" | "pins" | "groups";

const SETTINGS_TAB_IDS: SettingsTabId[] = ["general", "pins", "groups"];

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(attrs: Record<string, string>, ...children: SVGElement[]): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, "svg");
	for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
	for (const c of children) svg.appendChild(c);
	return svg;
}

function createDragHandleSvg(): SVGSVGElement {
	const circles = [
		[9, 6],
		[9, 12],
		[9, 18],
		[15, 6],
		[15, 12],
		[15, 18],
	].map(([cx, cy]) => {
		const c = document.createElementNS(SVG_NS, "circle");
		c.setAttribute("cx", String(cx));
		c.setAttribute("cy", String(cy));
		c.setAttribute("r", "1");
		return c;
	});
	return createSvgElement(
		{ width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" },
		...circles
	);
}

function createTrashSvg(): SVGSVGElement {
	const polyline = document.createElementNS(SVG_NS, "polyline");
	polyline.setAttribute("points", "3 6 5 6 21 6");
	const path = document.createElementNS(SVG_NS, "path");
	path.setAttribute(
		"d",
		"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
	);
	const line1 = document.createElementNS(SVG_NS, "line");
	line1.setAttribute("x1", "10");
	line1.setAttribute("y1", "11");
	line1.setAttribute("x2", "10");
	line1.setAttribute("y2", "17");
	const line2 = document.createElementNS(SVG_NS, "line");
	line2.setAttribute("x1", "14");
	line2.setAttribute("y1", "11");
	line2.setAttribute("x2", "14");
	line2.setAttribute("y2", "17");
	return createSvgElement(
		{ width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" },
		polyline,
		path,
		line1,
		line2
	);
}

/** 设置列表行上的图标按钮（编辑 / 移除 / 隐藏等） */
function createEntryIconButton(
	parent: HTMLElement,
	icon: string,
	label: string,
	onClick: (e: MouseEvent) => void,
	extraCls?: string
): HTMLButtonElement {
	const btn = parent.createEl("button", {
		cls: "clickable-icon ribbon-folder-entry-icon-btn" + (extraCls ? ` ${extraCls}` : ""),
		attr: { "aria-label": label },
	});
	setIcon(btn, icon);
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		onClick(e);
	});
	return btn;
}

function setFolderChevron(el: HTMLElement, expanded: boolean): void {
	setIcon(el, expanded ? "chevron-down" : "chevron-right");
}

export class RibbonFolderSettingTab extends PluginSettingTab {
	plugin: IRibbonFolderPlugin;
	private rebuildRibbonsTimer: number | null = null;
	/** 按 folderId 防抖，避免名称/图标每输入一字就移除并重建该分组按钮 */
	private refreshFolderTimers = new Map<string, number>();
	private activeSettingsTab: SettingsTabId = "general";

	constructor(app: App, plugin: Plugin) {
		super(app, plugin);
		this.plugin = plugin as unknown as IRibbonFolderPlugin;
	}

	/** 仅当「图标文件夹」等全局设置变更时防抖重建整个 Ribbon */
	private scheduleRebuildRibbons(): void {
		if (this.rebuildRibbonsTimer != null) clearTimeout(this.rebuildRibbonsTimer);
		this.rebuildRibbonsTimer = window.setTimeout(() => {
			this.rebuildRibbonsTimer = null;
			void this.plugin.rebuildRibbons();
		}, REBUILD_DEBOUNCE_MS);
	}

	/** 防抖后只刷新该分组按钮（停止输入约 300ms 后再执行先删后加） */
	private scheduleRefreshRibbonForFolder(folder: RibbonFolder): void {
		const id = folder.id;
		const existing = this.refreshFolderTimers.get(id);
		if (existing != null) clearTimeout(existing);
		this.refreshFolderTimers.set(
			id,
			window.setTimeout(() => {
				this.refreshFolderTimers.delete(id);
				void this.refreshRibbonForFolder(folder);
			}, REBUILD_DEBOUNCE_MS)
		);
	}

	/** 立即刷新该分组在 Ribbon 上的按钮（用于下拉、选择 SVG 等单次操作） */
	private async refreshRibbonForFolder(folder: RibbonFolder): Promise<void> {
		this.plugin.removeRibbonForFolder(folder.id);
		await this.plugin.addRibbonForFolder(folder);
	}

	private scheduleRefreshRibbonForPin(pin: RibbonPin): void {
		const id = pin.id;
		const existing = this.refreshFolderTimers.get(id);
		if (existing != null) clearTimeout(existing);
		this.refreshFolderTimers.set(
			id,
			window.setTimeout(() => {
				this.refreshFolderTimers.delete(id);
				void this.refreshRibbonForPin(pin);
			}, REBUILD_DEBOUNCE_MS)
		);
	}

	private async refreshRibbonForPin(pin: RibbonPin): Promise<void> {
		this.plugin.removeRibbonForPin(pin.id);
		await this.plugin.addRibbonForPin(pin);
	}

	private get pins(): RibbonPin[] {
		if (!this.plugin.settings.pins) {
			this.plugin.settings.pins = [];
		}
		return this.plugin.settings.pins;
	}

	/** 设置页内容所在的可滚动祖先（empty() 重绘后需恢复 scrollTop，否则会跳回顶部） */
	private getSettingsScrollParent(): HTMLElement | null {
		const { containerEl } = this;
		const byClassEl = containerEl.closest(".vertical-tab-content");
		const byClass = byClassEl instanceof HTMLElement ? byClassEl : null;
		if (byClass instanceof HTMLElement && byClass.scrollHeight > byClass.clientHeight + 1) return byClass;
		let cur: HTMLElement | null = containerEl.parentElement;
		while (cur) {
			const oy = window.getComputedStyle(cur).overflowY;
			if (
				(oy === "auto" || oy === "scroll" || oy === "overlay") &&
				cur.scrollHeight > cur.clientHeight + 1
			) {
				return cur;
			}
			cur = cur.parentElement;
		}
		return byClass;
	}

	private readActiveTabFromDom(): SettingsTabId | null {
		const el = this.containerEl.querySelector(".ribbon-folder-settings-tab.is-active");
		const id = el?.getAttribute("data-tab");
		if (id === "general" || id === "pins" || id === "groups") return id;
		return null;
	}

	private showSettingsTab(tabId: SettingsTabId, tabsContainer: HTMLElement, panels: HTMLElement[]): void {
		this.activeSettingsTab = tabId;
		tabsContainer.querySelectorAll(".ribbon-folder-settings-tab").forEach((el) => {
			el.classList.toggle("is-active", el.getAttribute("data-tab") === tabId);
		});
		panels.forEach((panel) => {
			panel.classList.toggle("is-active", panel.getAttribute("data-panel") === tabId);
		});
	}

	display(): void {
		const { containerEl } = this;
		const scrollParent = this.getSettingsScrollParent();
		const savedScrollTop = scrollParent?.scrollTop ?? 0;
		const expandedIndices = new Set<number>();
		containerEl.querySelectorAll(".ribbon-folder-folder-block.is-expanded").forEach((el) => {
			const idx = el.getAttribute("data-folder-index");
			if (idx !== null) expandedIndices.add(parseInt(idx, 10));
		});
		const domTab = this.readActiveTabFromDom();
		if (domTab) this.activeSettingsTab = domTab;

		containerEl.empty();

		const tabsContainer = containerEl.createDiv({ cls: "ribbon-folder-settings-tabs" });
		const panels: HTMLElement[] = [];
		const tabLabels: Record<SettingsTabId, string> = {
			general: t("settings.tabs.general"),
			pins: t("settings.tabs.pins"),
			groups: t("settings.tabs.groups"),
		};

		for (const tabId of SETTINGS_TAB_IDS) {
			const tab = tabsContainer.createDiv({
				cls: "ribbon-folder-settings-tab",
				text: tabLabels[tabId],
			});
			tab.setAttribute("data-tab", tabId);
			tab.classList.toggle("is-active", tabId === this.activeSettingsTab);
			tab.addEventListener("click", () => this.showSettingsTab(tabId, tabsContainer, panels));

			const panel = containerEl.createDiv({ cls: "ribbon-folder-settings-panel" });
			panel.setAttribute("data-panel", tabId);
			panel.classList.toggle("is-active", tabId === this.activeSettingsTab);
			panels.push(panel);

			if (tabId === "general") this.renderGeneralTab(panel);
			else if (tabId === "pins") this.renderPinsTab(panel);
			else this.renderGroupsTab(panel, expandedIndices);
		}

		if (scrollParent != null) {
			const restore = (): void => {
				scrollParent.scrollTop = savedScrollTop;
			};
			queueMicrotask(restore);
			requestAnimationFrame(restore);
			window.setTimeout(restore, 0);
		}
	}

	private renderGeneralTab(parent: HTMLElement): void {
		const group = new SettingGroup(parent);
		group.addSetting((setting) => {
			setting
				.setName(t("settings.iconFolder.name"))
				.setDesc(t("settings.iconFolder.description"))
				.addText((text) =>
					text
						.setPlaceholder(t("settings.iconFolder.placeholder"))
						.setValue(this.plugin.settings.iconFolder ?? "")
						.onChange((value) => {
							this.plugin.settings.iconFolder = (value ?? "").trim();
							void (async () => {
								await this.plugin.saveSettings();
								this.scheduleRebuildRibbons();
							})();
						})
				);
		});
		group.addSetting((setting) => {
			setting
				.setName(t("settings.noteOpenLocation.name"))
				.setDesc(t("settings.noteOpenLocation.description"))
				.addDropdown((dropdown) => {
					(Object.keys(NOTE_OPEN_OPTIONS) as NoteOpenLocation[]).forEach((k) => {
						void dropdown.addOption(k, NOTE_OPEN_OPTIONS[k]);
					});
					dropdown.setValue(this.plugin.settings.noteOpenLocation ?? "tab");
					dropdown.onChange((value) => {
						this.plugin.settings.noteOpenLocation = value as NoteOpenLocation;
						void this.plugin.saveSettings();
					});
				});
		});
	}

	private renderPinsTab(parent: HTMLElement): void {
		const intro = new SettingGroup(parent);
		intro.addSetting((setting) => {
			setting
				.setName(t("settings.pinsList"))
				.setDesc(t("settings.pinsListDescription"))
				.addButton((btn) =>
					btn.setButtonText(t("folder.addCommand")).onClick(() => {
						new CommandPickerModal(this.app, (chosenId) => {
							if (this.pins.some((p) => isRibbonCommandEntry(p.entry) && p.entry.id === chosenId)) {
								return;
							}
							const pin: RibbonPin = { id: "pin-" + Date.now(), entry: { id: chosenId } };
							this.pins.push(pin);
							void (async () => {
								await this.plugin.addRibbonForPin(pin);
								await this.plugin.saveSettings();
								this.activeSettingsTab = "pins";
								this.display();
							})();
						}).open();
					})
				)
				.addButton((btn) =>
					btn.setButtonText(t("folder.addNote")).onClick(() => {
						new NotePickerModal(this.app, (file) => {
							if (this.pins.some((p) => isRibbonNoteEntry(p.entry) && p.entry.path === file.path)) {
								return;
							}
							const pin: RibbonPin = { id: "pin-" + Date.now(), entry: { kind: "note", path: file.path } };
							this.pins.push(pin);
							void (async () => {
								await this.plugin.addRibbonForPin(pin);
								await this.plugin.saveSettings();
								this.activeSettingsTab = "pins";
								this.display();
							})();
						}).open();
					})
				)
				.addButton((btn) =>
					btn.setButtonText(t("folder.addWeb")).onClick(() => {
						const draft: RibbonFolderWebEntry = { kind: "web", url: "" };
						new EditWebModal(
							this.app,
							draft,
							this.plugin.settings.iconFolder ?? "",
							(result) => {
								const normalized = normalizeExternalUrl(result.url);
								if (!normalized) return;
								if (this.pins.some((p) => isRibbonWebEntry(p.entry) && normalizeExternalUrl(p.entry.url) === normalized)) {
									return;
								}
								const pin: RibbonPin = {
									id: "pin-" + Date.now(),
									entry: {
										kind: "web",
										url: result.url.trim(),
										displayName: result.displayName,
										icon: result.icon,
									},
								};
								this.pins.push(pin);
								void (async () => {
									await this.plugin.addRibbonForPin(pin);
									await this.plugin.saveSettings();
									this.activeSettingsTab = "pins";
									this.display();
								})();
							},
							true
						).open();
					})
				);
		});

		const pinsWrap = parent.createDiv({ cls: "ribbon-folder-pins-wrap" });
		const pinListEl = pinsWrap.createDiv({ cls: "ribbon-folder-entry-list ribbon-folder-draggable-list" });
		void this.renderPinRows(pinListEl);
	}

	private renderGroupsTab(parent: HTMLElement, expandedIndices: Set<number>): void {
		const top = new SettingGroup(parent);
		top.addSetting((setting) => {
			setting
				.setName(t("settings.addFolder.name"))
				.setDesc(t("settings.addFolder.description"))
				.addButton((btn) =>
					btn.setButtonText(t("settings.addFolder.name")).onClick(() => {
						void this.addNewFolder();
					})
				);
		});

		const listWrap = parent.createDiv({ cls: "ribbon-folder-folders-wrap" });
		for (let i = 0; i < this.plugin.settings.folders.length; i++) {
			this.renderFolderBlock(listWrap, this.plugin.settings.folders[i], i);
		}
		expandedIndices.forEach((idx) => {
			const block = listWrap.querySelector(`.ribbon-folder-folder-block[data-folder-index="${idx}"]`);
			if (block) {
				block.addClass("is-expanded");
				const chevron = block.querySelector(".ribbon-folder-folder-chevron");
				if (chevron instanceof HTMLElement) setFolderChevron(chevron, true);
			}
		});
	}

	private entryLabel(entry: RibbonFolderEntry): string {
		if (isRibbonSeparatorEntry(entry)) return t("folder.separatorLabel");
		return getEntryLabel(entry, this.plugin.app);
	}

	private entryKindLabel(entry: RibbonFolderCommandEntry | RibbonFolderNoteEntry | RibbonFolderWebEntry): string {
		if (isRibbonNoteEntry(entry)) return getPathExtension(entry.path) || t("folder.itemKind.file");
		if (isRibbonWebEntry(entry)) return t("folder.itemKind.web");
		return t("folder.itemKind.command");
	}

	/** 与弹出菜单一致的图标解析用原始字符串（Lucide 名或 .svg 路径） */
	private openEditEntryModal(
		entry: RibbonFolderCommandEntry | RibbonFolderNoteEntry | RibbonFolderWebEntry,
		onSaved: () => void,
		forPin = false
	): void {
		const iconFolder = this.plugin.settings.iconFolder ?? "";
		if (isRibbonNoteEntry(entry)) {
			new EditNoteModal(this.app, entry, iconFolder, (result) => {
				entry.path = result.path;
				entry.displayName = result.displayName;
				entry.icon = result.icon;
				onSaved();
			}, forPin).open();
		} else if (isRibbonWebEntry(entry)) {
			new EditWebModal(this.app, entry, iconFolder, (result) => {
				entry.url = result.url;
				entry.displayName = result.displayName;
				entry.icon = result.icon;
				onSaved();
			}, forPin).open();
		} else {
			new EditCommandModal(this.app, entry, iconFolder, (result) => {
				entry.id = result.id;
				entry.displayName = result.displayName;
				entry.icon = result.icon;
				onSaved();
			}, forPin).open();
		}
	}

	/** Ribbon 快捷项列表（拖拽排序） */
	private async renderPinRows(listEl: HTMLElement): Promise<void> {
		listEl.empty();
		const iconFolder = this.plugin.settings.iconFolder ?? "";
		const pins = this.pins;
		if (pins.length === 0) {
			listEl.createSpan({ text: t("settings.pinsEmpty"), cls: "ribbon-folder-entry-hint" });
			return;
		}
		for (let pinIndex = 0; pinIndex < pins.length; pinIndex++) {
			const pin = pins[pinIndex];
			const entry = pin.entry;
			const displayName = getEntryLabel(entry, this.plugin.app);
			const row = listEl.createDiv({ cls: "ribbon-folder-entry-row" });
			row.setAttr("data-pin-index", String(pinIndex));
			row.draggable = true;
			row.addClass("ribbon-folder-draggable-row");

			const main = row.createDiv({ cls: "ribbon-folder-entry-row-main" });
			const iconWrap = main.createSpan({ cls: "ribbon-folder-entry-row-icon" });
			const iconId = await resolveIconId(this.plugin.app, iconFolder, getEntryIconRaw(entry, this.plugin.app));
			setIcon(iconWrap, iconId);
			applyWideIconSize(iconWrap, iconId);
			const textWrap = main.createDiv({ cls: "ribbon-folder-entry-row-text" });
			textWrap.createSpan({ cls: "ribbon-folder-entry-row-label", text: displayName });
			textWrap.createSpan({ cls: "ribbon-folder-entry-row-kind", text: this.entryKindLabel(entry) });

			const btnWrap = row.createSpan({ cls: "ribbon-folder-entry-row-btns" });
			createEntryIconButton(btnWrap, "pencil", t("commands.editBtn"), () => {
				this.openEditEntryModal(
					entry,
					() => {
						void (async () => {
							await this.plugin.saveSettings();
							this.plugin.updatePinRibbonDisplay(pin);
							this.scheduleRefreshRibbonForPin(pin);
							listEl.empty();
							await this.renderPinRows(listEl);
						})();
					},
					true
				);
			});
			createEntryIconButton(btnWrap, "trash-2", t("commands.removeBtn"), () => {
				openDeleteConfirm(this.app, {
					title: t("commands.removePinConfirmTitle"),
					message: t("commands.removePinConfirm", { name: displayName }),
					confirmText: t("commands.removeConfirmBtn"),
					onConfirm: () => {
						void (async () => {
							this.plugin.settings.pins = this.pins.filter((_, i) => i !== pinIndex);
							this.plugin.removeRibbonForPin(pin.id);
							await this.plugin.saveSettings();
							this.display();
						})();
					},
				});
			}, "ribbon-folder-entry-icon-btn--danger");

			row.addEventListener("dragstart", (e: DragEvent) => {
				e.stopPropagation();
				if (!e.dataTransfer) return;
				e.dataTransfer.setData("application/x-ribbon-pin-index", String(pinIndex));
				e.dataTransfer.effectAllowed = "move";
				row.addClass("ribbon-folder-dragging");
			});
			row.addEventListener("dragend", () => row.removeClass("ribbon-folder-dragging"));
			row.addEventListener("dragover", (e: DragEvent) => {
				e.preventDefault();
				e.stopPropagation();
				if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
				row.addClass("ribbon-folder-drag-over");
			});
			row.addEventListener("dragleave", (e: DragEvent) => {
				e.stopPropagation();
				row.removeClass("ribbon-folder-drag-over");
			});
			row.addEventListener("drop", (e: DragEvent) => {
				e.preventDefault();
				e.stopPropagation();
				row.removeClass("ribbon-folder-drag-over");
				const fromIndex = parseInt(e.dataTransfer?.getData("application/x-ribbon-pin-index") ?? "", 10);
				const toIndex = pinIndex;
				if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
				const item = this.pins[fromIndex];
				this.pins.splice(fromIndex, 1);
				this.pins.splice(toIndex, 0, item);
				void (async () => {
					await this.plugin.saveSettings();
					await this.plugin.rebuildRibbons();
					this.display();
				})();
			});
		}
	}

	/** 仅渲染某分组的菜单项列表（命令、文件与网页；拖拽后局部刷新） */
	private async renderFolderEntryRows(
		entryListEl: HTMLElement,
		folder: RibbonFolder,
		metaEl: HTMLElement
	): Promise<void> {
		entryListEl.empty();
		const iconFolder = this.plugin.settings.iconFolder ?? "";
		for (let cmdIndex = 0; cmdIndex < folder.commands.length; cmdIndex++) {
			const entry = folder.commands[cmdIndex];
			const displayName = this.entryLabel(entry);
			const row = entryListEl.createDiv({ cls: "ribbon-folder-entry-row" });
			row.setAttr("data-command-index", String(cmdIndex));
			row.draggable = true;
			row.addClass("ribbon-folder-draggable-row");
			if (entry.hidden) row.addClass("is-hidden");

			const main = row.createDiv({ cls: "ribbon-folder-entry-row-main" });
			if (isRibbonSeparatorEntry(entry)) {
				main.addClass("ribbon-folder-entry-row-main--separator");
				main.createSpan({ cls: "ribbon-folder-entry-row-label", text: displayName });
			} else {
				const iconWrap = main.createSpan({ cls: "ribbon-folder-entry-row-icon" });
				const iconId = await resolveIconId(this.plugin.app, iconFolder, getEntryIconRaw(entry, this.plugin.app));
				setIcon(iconWrap, iconId);
				applyWideIconSize(iconWrap, iconId);
				const textWrap = main.createDiv({ cls: "ribbon-folder-entry-row-text" });
				textWrap.createSpan({ cls: "ribbon-folder-entry-row-label", text: displayName });
				textWrap.createSpan({ cls: "ribbon-folder-entry-row-kind", text: this.entryKindLabel(entry) });
			}

			if (isRibbonSeparatorEntry(entry)) row.addClass("ribbon-folder-entry-row-separator");
			const btnWrap = row.createSpan({ cls: "ribbon-folder-entry-row-btns" });
			if (!isRibbonSeparatorEntry(entry)) {
				createEntryIconButton(btnWrap, "pencil", t("commands.editBtn"), () => {
					this.openEditEntryModal(entry, () => {
						void this.plugin.saveSettings();
						metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
						this.display();
					});
				});
			}
			const hidden = !!entry.hidden;
			createEntryIconButton(
				btnWrap,
				hidden ? "eye-off" : "eye",
				hidden ? t("commands.showBtn") : t("commands.hideBtn"),
				() => {
					entry.hidden = !entry.hidden;
					void (async () => {
						await this.plugin.saveSettings();
						entryListEl.empty();
						await this.renderFolderEntryRows(entryListEl, folder, metaEl);
					})();
				},
				"ribbon-folder-entry-icon-btn--visibility"
			);
			createEntryIconButton(btnWrap, "trash-2", t("commands.removeBtn"), () => {
				openDeleteConfirm(this.app, {
					title: t("commands.removeConfirmTitle"),
					message: t("commands.removeConfirm", { name: displayName }),
					confirmText: t("commands.removeConfirmBtn"),
					onConfirm: () => {
						void (async () => {
							folder.commands = folder.commands.filter((_, i) => i !== cmdIndex);
							await this.plugin.saveSettings();
							metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
							this.display();
						})();
					},
				});
			}, "ribbon-folder-entry-icon-btn--danger");

			row.addEventListener("dragstart", (e: DragEvent) => {
				e.stopPropagation();
				if (!e.dataTransfer) return;
				e.dataTransfer.setData("text/plain", String(cmdIndex));
				e.dataTransfer.effectAllowed = "move";
				row.addClass("ribbon-folder-dragging");
			});
			row.addEventListener("dragend", () => row.removeClass("ribbon-folder-dragging"));
			row.addEventListener("dragover", (e: DragEvent) => {
				e.preventDefault();
				e.stopPropagation();
				if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
				row.addClass("ribbon-folder-drag-over");
			});
			row.addEventListener("dragleave", (e: DragEvent) => {
				e.stopPropagation();
				row.removeClass("ribbon-folder-drag-over");
			});
			row.addEventListener("drop", (e: DragEvent) => {
				e.preventDefault();
				e.stopPropagation();
				row.removeClass("ribbon-folder-drag-over");
				const fromIndex = parseInt(e.dataTransfer?.getData("text/plain") ?? "", 10);
				const toIndex = cmdIndex;
				if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
				const item = folder.commands[fromIndex];
				folder.commands.splice(fromIndex, 1);
				folder.commands.splice(toIndex, 0, item);
				void (async () => {
					await this.plugin.saveSettings();
					entryListEl.empty();
					await this.renderFolderEntryRows(entryListEl, folder, metaEl);
				})();
			});
		}
	}

	private async setFolderHeaderIcon(iconEl: HTMLElement, rawIcon: string): Promise<void> {
		const iconFolder = this.plugin.settings.iconFolder ?? "";
		const iconId = await resolveIconId(this.plugin.app, iconFolder, rawIcon || "folder");
		iconEl.empty();
		setIcon(iconEl, iconId);
		applyWideIconSize(iconEl, iconId);
	}

	private async addNewFolder() {
		const id = "folder-" + Date.now();
		const folder: RibbonFolder = {
			id,
			name: t("settings.addFolder.name"),
			icon: "folder",
			commands: [],
			menuDisplay: "both",
		};
		this.plugin.settings.folders.push(folder);
		await this.plugin.addRibbonForFolder(folder);
		await this.plugin.saveSettings();
		this.display();
	}

	private renderFolderBlock(parent: HTMLElement, folder: RibbonFolder, index: number) {
		const block = parent.createDiv({ cls: "ribbon-folder-setting-block ribbon-folder-folder-block" });
		block.setAttribute("data-folder-index", String(index));

		const header = block.createDiv({ cls: "ribbon-folder-folder-header" });
		header.setAttribute("role", "button");
		header.setAttribute("tabindex", "0");

		const dragHandle = header.createSpan({ cls: "ribbon-folder-folder-drag-handle" });
		dragHandle.setAttribute("draggable", "true");
		dragHandle.setAttribute("aria-label", "Drag to reorder");
		dragHandle.appendChild(createDragHandleSvg());
		dragHandle.onclick = (e) => e.stopPropagation();
		dragHandle.ondragstart = (e) => {
			e.stopPropagation();
			if (e.dataTransfer) {
				e.dataTransfer.setData("application/x-ribbon-folder-index", String(index));
				e.dataTransfer.effectAllowed = "move";
			}
		};

		const chevron = header.createSpan({ cls: "ribbon-folder-folder-chevron" });
		setFolderChevron(chevron, false);
		const headerIconEl = header.createSpan({ cls: "ribbon-folder-folder-header-icon" });
		void this.setFolderHeaderIcon(headerIconEl, folder.icon || "folder");
		const titleEl = header.createSpan({ cls: "ribbon-folder-folder-title", text: folder.name || t("folder.unnamed") });
		const metaEl = header.createSpan({
			cls: "ribbon-folder-folder-meta",
			text: t("folder.itemsCount", { count: folder.commands.length }),
		});

		const deleteBtn = header.createEl("button", { cls: "clickable-icon ribbon-folder-folder-delete" });
		deleteBtn.setAttribute("aria-label", t("folder.delete"));
		deleteBtn.appendChild(createTrashSvg());
		deleteBtn.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			openDeleteConfirm(this.app, {
				title: t("folder.deleteConfirmTitle"),
				message: t("folder.deleteConfirm", { name: folder.name || t("folder.unnamed") }),
				onConfirm: () => {
					this.plugin.settings.folders = this.plugin.settings.folders.filter((f) => f.id !== folder.id);
					this.plugin.removeRibbonForFolder(folder.id);
					void (async () => {
						await this.plugin.saveSettings();
						this.display();
					})();
				},
			});
		};

		header.onclick = (e) => {
			if (
				(e.target as HTMLElement).closest(".ribbon-folder-folder-delete") ||
				(e.target as HTMLElement).closest(".ribbon-folder-folder-drag-handle")
			)
				return;
			const next = !block.hasClass("is-expanded");
			block.toggleClass("is-expanded", next);
			setFolderChevron(chevron, next);
		};
		header.onkeydown = (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				header.click();
			}
		};

		const body = block.createDiv({ cls: "ribbon-folder-folder-body" });
		const folderSettings = new SettingGroup(body);

		folderSettings.addSetting((setting) => {
			setting.setName(t("folder.name")).addText((text) =>
				text
					.setPlaceholder(t("folder.namePlaceholder"))
					.setValue(folder.name)
					.onChange((value) => {
						folder.name = value || t("folder.unnamed");
						void (async () => {
							await this.plugin.saveSettings();
							titleEl.setText(folder.name || t("folder.unnamed"));
							this.plugin.updateRibbonDisplay(folder);
						})();
					})
			);
		});

		let folderIconInput: HTMLInputElement;
		folderSettings.addSetting((setting) => {
			setting
				.setName(t("folder.icon"))
				.setDesc(t("folder.iconDescription"))
				.addText((text) => {
					folderIconInput = text.inputEl;
					text
						.setPlaceholder(t("folder.iconPlaceholder"))
						.setValue(folder.icon)
						.onChange((value) => {
							folder.icon = value || "folder";
							void (async () => {
								await this.plugin.saveSettings();
								await this.setFolderHeaderIcon(headerIconEl, folder.icon);
								this.scheduleRefreshRibbonForFolder(folder);
							})();
						});
				});
			addSelectSvgExtraButton(
				setting,
				this.plugin.app,
				() => this.plugin.settings.iconFolder ?? "",
				(path) => {
					folderIconInput.value = path;
					folder.icon = path;
					void (async () => {
						await this.plugin.saveSettings();
						await this.setFolderHeaderIcon(headerIconEl, folder.icon);
						await this.refreshRibbonForFolder(folder);
					})();
				}
			);
		});

		folderSettings.addSetting((setting) => {
			setting
				.setName(t("folder.menuDisplay"))
				.setDesc(t("folder.menuDisplayDescription"))
				.addDropdown((dropdown) => {
					(Object.keys(MENU_DISPLAY_OPTIONS) as MenuDisplayMode[]).forEach((k) => {
						void dropdown.addOption(k, MENU_DISPLAY_OPTIONS[k]);
					});
					dropdown.setValue(folder.menuDisplay ?? "both");
					dropdown.onChange((value) => {
						folder.menuDisplay = value as MenuDisplayMode;
						void this.plugin.saveSettings();
					});
				});
		});

		folderSettings.addSetting((setting) => {
			setting
				.setName(t("folder.triggerMode"))
				.setDesc(t("folder.triggerModeDescription"))
				.addDropdown((dropdown) => {
					(Object.keys(TRIGGER_MODE_OPTIONS) as MenuTriggerMode[]).forEach((k) => {
						void dropdown.addOption(k, TRIGGER_MODE_OPTIONS[k]);
					});
					dropdown.setValue(folder.triggerMode ?? "click");
					dropdown.onChange((value) => {
						folder.triggerMode = value as MenuTriggerMode;
						void (async () => {
							await this.plugin.saveSettings();
							await this.refreshRibbonForFolder(folder);
						})();
					});
				});
		});

		const entriesBlock = body.createDiv({ cls: "ribbon-folder-entries-block" });
		entriesBlock.createEl("strong", { text: t("folder.itemsSection") });
		entriesBlock.createSpan({ text: t("folder.commandsHint"), cls: "ribbon-folder-entry-hint" });

		const entryListEl = entriesBlock.createDiv({ cls: "ribbon-folder-entry-list ribbon-folder-draggable-list" });
		void this.renderFolderEntryRows(entryListEl, folder, metaEl);

		const addRow = entriesBlock.createDiv({ cls: "ribbon-folder-entry-actions" });
		const addActions = new SettingGroup(addRow);
		addActions.addSetting((setting) => {
			setting
				.setName("")
				.addButton((btn) =>
					btn.setButtonText(t("folder.addCommand")).onClick(() => {
						new CommandPickerModal(this.app, (chosenId) => {
							if (!folder.commands.some((c) => isRibbonCommandEntry(c) && c.id === chosenId)) {
								folder.commands.push({ id: chosenId });
								void this.plugin.saveSettings();
								metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
								this.display();
							}
						}).open();
					})
				)
				.addButton((btn) =>
					btn.setButtonText(t("folder.addNote")).onClick(() => {
						new NotePickerModal(this.app, (file) => {
							if (!folder.commands.some((c) => isRibbonNoteEntry(c) && c.path === file.path)) {
								folder.commands.push({ kind: "note", path: file.path });
								void this.plugin.saveSettings();
								metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
								this.display();
							}
						}).open();
					})
				)
				.addButton((btn) =>
					btn.setButtonText(t("folder.addWeb")).onClick(() => {
						const draft: RibbonFolderWebEntry = { kind: "web", url: "" };
						new EditWebModal(this.app, draft, this.plugin.settings.iconFolder ?? "", (result) => {
							const normalized = normalizeExternalUrl(result.url);
							if (!normalized) return;
							if (folder.commands.some((c) => isRibbonWebEntry(c) && normalizeExternalUrl(c.url) === normalized)) {
								return;
							}
							folder.commands.push({
								kind: "web",
								url: result.url.trim(),
								displayName: result.displayName,
								icon: result.icon,
							});
							void this.plugin.saveSettings();
							metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
							this.display();
						}).open();
					})
				)
				.addButton((btn) =>
					btn.setButtonText(t("folder.addSeparator")).onClick(() => {
						folder.commands.push({ kind: "separator" });
						void this.plugin.saveSettings();
						metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
						this.display();
					})
				);
		});

		block.ondragover = (e) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			block.addClass("is-drag-over");
		};
		block.ondragleave = (e) => {
			if (!block.contains(e.relatedTarget as Node)) block.removeClass("is-drag-over");
		};
		block.ondrop = (e) => {
			e.preventDefault();
			block.removeClass("is-drag-over");
			const fromIndex = parseInt(e.dataTransfer?.getData("application/x-ribbon-folder-index") ?? "", 10);
			const toIndex = parseInt(block.getAttribute("data-folder-index") ?? "", 10);
			if (fromIndex === toIndex || Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return;
			const arr = this.plugin.settings.folders;
			const [item] = arr.splice(fromIndex, 1);
			const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
			arr.splice(insertAt, 0, item);
			void (async () => {
				await this.plugin.saveSettings();
				await this.plugin.rebuildRibbons();
				this.display();
			})();
		};
	}
}
