import { App, Plugin, PluginSettingTab, Setting, setIcon } from "obsidian";
import type {
	IRibbonFolderPlugin,
	RibbonFolder,
	MenuDisplayMode,
	MenuTriggerMode,
	RibbonFolderEntry,
	RibbonFolderCommandEntry,
	RibbonFolderNoteEntry,
	NoteOpenLocation,
} from "./types";
import {
	DEFAULT_COMMAND_MENU_ICON,
	DEFAULT_NOTE_MENU_ICON,
	isRibbonNoteEntry,
	isRibbonSeparatorEntry,
} from "./types";
import { CommandPickerModal } from "./CommandPickerModal";
import { ConfirmModal } from "./ConfirmModal";
import { EditCommandModal } from "./EditCommandModal";
import { EditNoteModal } from "./EditNoteModal";
import { NotePickerModal } from "./NotePickerModal";
import { SvgIconSuggestModal } from "./SvgIconSuggestModal";
import { getSvgPathsInFolder, resolveIconId } from "./utils/icon";
import { t } from "./i18n";

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

export class RibbonFolderSettingTab extends PluginSettingTab {
	plugin: IRibbonFolderPlugin;
	private rebuildRibbonsTimer: number | null = null;
	/** 按 folderId 防抖，避免名称/图标每输入一字就移除并重建该分组按钮 */
	private refreshFolderTimers = new Map<string, number>();

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

	/** 设置页内容所在的可滚动祖先（empty() 重绘后需恢复 scrollTop，否则会跳回顶部） */
	private getSettingsScrollParent(): HTMLElement | null {
		const { containerEl } = this;
		const byClass = containerEl.closest(".vertical-tab-content") as HTMLElement | null;
		if (byClass && byClass.scrollHeight > byClass.clientHeight + 1) return byClass;
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

	display(): void {
		const { containerEl } = this;
		const scrollParent = this.getSettingsScrollParent();
		const savedScrollTop = scrollParent?.scrollTop ?? 0;
		// 重绘前保存已展开的分组索引，重绘后恢复，避免命令拖拽等操作后折叠
		const expandedIndices = new Set<number>();
		containerEl.querySelectorAll(".ribbon-folder-folder-block.is-expanded").forEach((el) => {
			const idx = el.getAttribute("data-folder-index");
			if (idx !== null) expandedIndices.add(parseInt(idx, 10));
		});
		containerEl.empty();

		new Setting(containerEl).setName(t("settings.title")).setHeading();
		new Setting(containerEl).setName("").setDesc(t("settings.description"));

		new Setting(containerEl)
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

		new Setting(containerEl)
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

		new Setting(containerEl)
			.setName(t("settings.addFolder.name"))
			.setDesc(t("settings.addFolder.description"))
			.addButton((btn) =>
				btn.setButtonText(t("settings.addFolder.name")).onClick(() => {
					void this.addNewFolder();
				})
			);

		new Setting(containerEl).setName(t("settings.groupsList")).setHeading();
		new Setting(containerEl).setName("").setDesc(t("settings.groupsListDescription"));

		const listWrap = containerEl.createDiv({ cls: "ribbon-folder-folders-wrap" });
		for (let i = 0; i < this.plugin.settings.folders.length; i++) {
			this.renderFolderBlock(listWrap, this.plugin.settings.folders[i], i);
		}
		// 恢复之前展开的分组
		expandedIndices.forEach((idx) => {
			const block = listWrap.querySelector(`.ribbon-folder-folder-block[data-folder-index="${idx}"]`);
			if (block) {
				block.addClass("is-expanded");
				const chevron = block.querySelector(".ribbon-folder-folder-chevron");
				if (chevron) chevron.setText("▾");
			}
		});

		// 恢复滚动位置（编辑命令/笔记点确定后会 display()，避免跳回页首）
		if (scrollParent != null) {
			const restore = (): void => {
				scrollParent.scrollTop = savedScrollTop;
			};
			queueMicrotask(restore);
			requestAnimationFrame(restore);
			window.setTimeout(restore, 0);
		}
	}

	private entryLabel(entry: RibbonFolderEntry, allCommands: { id: string; name: string }[]): string {
		if (isRibbonSeparatorEntry(entry)) return t("folder.separatorLabel");
		if (isRibbonNoteEntry(entry)) {
			const base = entry.path.split("/").pop() ?? entry.path;
			return entry.displayName?.trim() || base;
		}
		const cmd = allCommands.find((c) => c.id === entry.id);
		return entry.displayName?.trim() || (cmd ? cmd.name : entry.id);
	}

	private entryKindLabel(entry: RibbonFolderCommandEntry | RibbonFolderNoteEntry): string {
		if (isRibbonNoteEntry(entry)) return t("folder.itemKind.note");
		return t("folder.itemKind.command");
	}

	/** 与弹出菜单一致的图标解析用原始字符串（Lucide 名或 .svg 路径） */
	private getEntryIconRaw(
		entry: RibbonFolderCommandEntry | RibbonFolderNoteEntry,
		allCommands: { id: string; name: string; icon?: string }[]
	): string {
		if (isRibbonNoteEntry(entry)) {
			return entry.icon?.trim() || DEFAULT_NOTE_MENU_ICON;
		}
		const cmd = allCommands.find((c) => c.id === entry.id);
		return (
			entry.icon?.trim() || (cmd as { icon?: string } | undefined)?.icon?.trim() || DEFAULT_COMMAND_MENU_ICON
		);
	}

	/** 仅渲染某分组的菜单项列表（命令与笔记；拖拽后局部刷新） */
	private async renderFolderCommandRows(
		cmdListEl: HTMLElement,
		folder: RibbonFolder,
		metaEl: HTMLElement
	): Promise<void> {
		cmdListEl.empty();
		const allCommands = this.plugin.getAllCommands();
		const iconFolder = this.plugin.settings.iconFolder ?? "";
		for (let cmdIndex = 0; cmdIndex < folder.commands.length; cmdIndex++) {
			const entry = folder.commands[cmdIndex];
			const displayName = this.entryLabel(entry, allCommands);
			const row = cmdListEl.createDiv({ cls: "ribbon-folder-cmd-row" });
			row.setAttr("data-command-index", String(cmdIndex));
			row.draggable = true;
			row.addClass("ribbon-folder-draggable-row");

			const main = row.createDiv({ cls: "ribbon-folder-cmd-row-main" });
			if (isRibbonSeparatorEntry(entry)) {
				main.addClass("ribbon-folder-cmd-row-main--separator");
				main.createSpan({ cls: "ribbon-folder-cmd-row-label", text: displayName });
			} else {
				const iconWrap = main.createSpan({ cls: "ribbon-folder-cmd-row-icon" });
				const iconId = await resolveIconId(this.plugin.app, iconFolder, this.getEntryIconRaw(entry, allCommands));
				setIcon(iconWrap, iconId);
				const textWrap = main.createDiv({ cls: "ribbon-folder-cmd-row-text" });
				textWrap.createSpan({ cls: "ribbon-folder-cmd-row-label", text: displayName });
				textWrap.createSpan({ cls: "ribbon-folder-cmd-row-kind", text: this.entryKindLabel(entry) });
			}

			if (isRibbonSeparatorEntry(entry)) row.addClass("ribbon-folder-cmd-row-separator");
			const btnWrap = row.createSpan({ cls: "ribbon-folder-cmd-row-btns" });
			if (!isRibbonSeparatorEntry(entry)) {
				const editBtn = btnWrap.createEl("button", { text: t("commands.editBtn") });
				editBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					if (isRibbonNoteEntry(entry)) {
						new EditNoteModal(this.app, entry, this.plugin.settings.iconFolder ?? "", (result) => {
							entry.path = result.path;
							entry.displayName = result.displayName;
							entry.icon = result.icon;
							void this.plugin.saveSettings();
							metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
							this.display();
						}).open();
					} else {
						new EditCommandModal(this.app, entry, this.plugin.settings.iconFolder ?? "", (result) => {
							entry.id = result.id;
							entry.displayName = result.displayName;
							entry.icon = result.icon;
							void this.plugin.saveSettings();
							metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
							this.display();
						}).open();
					}
				});
			}
			const removeBtn = btnWrap.createEl("button", { text: t("commands.removeBtn") });
			removeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				void (async () => {
					folder.commands = folder.commands.filter((_, i) => i !== cmdIndex);
					await this.plugin.saveSettings();
					metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
					this.display();
				})();
			});

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
					cmdListEl.empty();
					await this.renderFolderCommandRows(cmdListEl, folder, metaEl);
				})();
			});
		}
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
		chevron.setText("▸");
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
			new ConfirmModal(
				this.app,
				t("folder.deleteConfirm", { name: folder.name || t("folder.unnamed") }),
				() => {
					this.plugin.settings.folders = this.plugin.settings.folders.filter((f) => f.id !== folder.id);
					this.plugin.removeRibbonForFolder(folder.id);
					void (async () => {
						await this.plugin.saveSettings();
						this.display();
					})();
				}
			).open();
		};

		header.onclick = (e) => {
			if (
				(e.target as HTMLElement).closest(".ribbon-folder-folder-delete") ||
				(e.target as HTMLElement).closest(".ribbon-folder-folder-drag-handle")
			)
				return;
			const next = !block.hasClass("is-expanded");
			block.toggleClass("is-expanded", next);
			chevron.setText(next ? "▾" : "▸");
		};
		header.onkeydown = (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				header.click();
			}
		};

		const body = block.createDiv({ cls: "ribbon-folder-folder-body" });

		new Setting(body)
			.setName(t("folder.name"))
			.addText((text) =>
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

		let folderIconInput: HTMLInputElement;
		new Setting(body)
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
							this.scheduleRefreshRibbonForFolder(folder);
						})();
					});
			})
			.addButton((btn) =>
				btn.setButtonText(t("folder.selectSvg")).onClick(() => {
					void (async () => {
						const iconFolder = this.plugin.settings.iconFolder ?? "";
						const items = await getSvgPathsInFolder(this.plugin.app, iconFolder || "");
						new SvgIconSuggestModal(this.plugin.app, items, (path) => {
							folderIconInput.value = path;
							folder.icon = path;
							void (async () => {
								await this.plugin.saveSettings();
								await this.refreshRibbonForFolder(folder);
							})();
						}).open();
					})();
				})
			);

		new Setting(body)
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

		new Setting(body)
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

		const cmdBlock = body.createDiv({ cls: "ribbon-folder-commands-block" });
		cmdBlock.createEl("strong", { text: t("folder.itemsSection") });
		cmdBlock.createSpan({ text: t("folder.commandsHint"), cls: "ribbon-folder-cmd-hint" });

		const cmdListEl = cmdBlock.createDiv({ cls: "ribbon-folder-cmd-list ribbon-folder-draggable-list" });
		void this.renderFolderCommandRows(cmdListEl, folder, metaEl);

		const addRow = cmdBlock.createDiv({ cls: "ribbon-folder-cmd-actions" });
		new Setting(addRow)
			.setName("")
			.addButton((btn) =>
				btn.setButtonText(t("folder.addCommand")).onClick(() => {
					new CommandPickerModal(this.app, (chosenId) => {
						if (!folder.commands.some((c) => !isRibbonNoteEntry(c) && !isRibbonSeparatorEntry(c) && c.id === chosenId)) {
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
				btn.setButtonText(t("folder.addSeparator")).onClick(() => {
					folder.commands.push({ kind: "separator" });
					void this.plugin.saveSettings();
					metaEl.setText(t("folder.itemsCount", { count: folder.commands.length }));
					this.display();
				})
			);

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
