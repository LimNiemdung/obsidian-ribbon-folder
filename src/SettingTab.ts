import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { IRibbonFolderPlugin, RibbonFolder, MenuDisplayMode, MenuTriggerMode } from "./types";
import { CommandPickerModal } from "./CommandPickerModal";
import { EditCommandModal } from "./EditCommandModal";
import { SvgIconSuggestModal } from "./SvgIconSuggestModal";
import { getSvgPathsInFolder } from "./utils/icon";
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
		this.rebuildRibbonsTimer = window.setTimeout(async () => {
			this.rebuildRibbonsTimer = null;
			await this.plugin.rebuildRibbons();
		}, REBUILD_DEBOUNCE_MS);
	}

	/** 防抖后只刷新该分组按钮（停止输入约 300ms 后再执行先删后加） */
	private scheduleRefreshRibbonForFolder(folder: RibbonFolder): void {
		const id = folder.id;
		const existing = this.refreshFolderTimers.get(id);
		if (existing != null) clearTimeout(existing);
		this.refreshFolderTimers.set(
			id,
			window.setTimeout(async () => {
				this.refreshFolderTimers.delete(id);
				await this.refreshRibbonForFolder(folder);
			}, REBUILD_DEBOUNCE_MS)
		);
	}

	/** 立即刷新该分组在 Ribbon 上的按钮（用于下拉、选择 SVG 等单次操作） */
	private async refreshRibbonForFolder(folder: RibbonFolder): Promise<void> {
		this.plugin.removeRibbonForFolder(folder.id);
		await this.plugin.addRibbonForFolder(folder);
	}

	display(): void {
		const { containerEl } = this;
		// 重绘前保存已展开的分组索引，重绘后恢复，避免命令拖拽等操作后折叠
		const expandedIndices = new Set<number>();
		containerEl.querySelectorAll(".ribbon-folder-folder-block.is-expanded").forEach((el) => {
			const idx = el.getAttribute("data-folder-index");
			if (idx !== null) expandedIndices.add(parseInt(idx, 10));
		});
		containerEl.empty();

		containerEl.createEl("h2", { text: t("settings.title") });
		containerEl.createEl("p", {
			text: t("settings.description"),
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName(t("settings.iconFolder.name"))
			.setDesc(t("settings.iconFolder.description"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.iconFolder.placeholder"))
					.setValue(this.plugin.settings.iconFolder ?? "")
					.onChange(async (value) => {
						this.plugin.settings.iconFolder = (value ?? "").trim();
						await this.plugin.saveSettings();
						this.scheduleRebuildRibbons();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.addFolder.name"))
			.setDesc(t("settings.addFolder.description"))
			.addButton((btn) =>
				btn.setButtonText(t("settings.addFolder.name")).onClick(async () => {
					await this.addNewFolder();
				})
			);

		containerEl.createEl("h3", { text: t("settings.groupsList") });
		containerEl.createEl("p", {
			text: t("settings.groupsListDescription"),
			cls: "setting-item-description",
		});

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
	}

	/** 仅渲染某分组的命令行列表（用于初次渲染或命令拖拽后局部刷新，避免整页 display 导致滚动跳顶） */
	private renderFolderCommandRows(cmdListEl: HTMLElement, folder: RibbonFolder, metaEl: HTMLElement): void {
		cmdListEl.empty();
		const allCommands = this.plugin.getAllCommands();
		folder.commands.forEach((entry, cmdIndex) => {
			const cmd = allCommands.find((c) => c.id === entry.id);
			const displayName = entry.displayName?.trim() || (cmd ? cmd.name : entry.id);
			const row = cmdListEl.createDiv({ cls: "ribbon-folder-cmd-row" });
			row.setAttr("data-command-index", String(cmdIndex));
			row.draggable = true;
			row.addClass("ribbon-folder-draggable-row");

			row.createSpan({ cls: "ribbon-folder-cmd-row-label", text: displayName });
			const btnWrap = row.createSpan({ cls: "ribbon-folder-cmd-row-btns" });
			const editBtn = btnWrap.createEl("button", { text: t("commands.editBtn") });
			editBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				new EditCommandModal(this.app, entry, this.plugin.settings.iconFolder ?? "", (result) => {
					entry.id = result.id;
					entry.displayName = result.displayName;
					entry.icon = result.icon;
					this.plugin.saveSettings();
					metaEl.setText(t("folder.commandsCount", { count: folder.commands.length }));
					this.display();
				}).open();
			});
			const removeBtn = btnWrap.createEl("button", { text: t("commands.removeBtn") });
			removeBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				folder.commands = folder.commands.filter((c) => c.id !== entry.id);
				await this.plugin.saveSettings();
				metaEl.setText(t("folder.commandsCount", { count: folder.commands.length }));
				this.display();
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
			row.addEventListener("drop", async (e: DragEvent) => {
				e.preventDefault();
				e.stopPropagation();
				row.removeClass("ribbon-folder-drag-over");
				const fromIndex = parseInt(e.dataTransfer?.getData("text/plain") ?? "", 10);
				const toIndex = cmdIndex;
				if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
				const item = folder.commands[fromIndex];
				folder.commands.splice(fromIndex, 1);
				folder.commands.splice(toIndex, 0, item);
				await this.plugin.saveSettings();
				cmdListEl.empty();
				this.renderFolderCommandRows(cmdListEl, folder, metaEl);
			});
		});
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
		dragHandle.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>';
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
			text: t("folder.commandsCount", { count: folder.commands.length }),
		});

		const deleteBtn = header.createEl("button", { cls: "clickable-icon ribbon-folder-folder-delete" });
		deleteBtn.setAttribute("aria-label", t("folder.delete"));
		deleteBtn.innerHTML =
			'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
		deleteBtn.onclick = async (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (!confirm(t("folder.deleteConfirm", { name: folder.name || t("folder.unnamed") }))) return;
			this.plugin.settings.folders = this.plugin.settings.folders.filter((f) => f.id !== folder.id);
			this.plugin.removeRibbonForFolder(folder.id);
			await this.plugin.saveSettings();
			this.display();
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
					.onChange(async (value) => {
						folder.name = value || t("folder.unnamed");
						await this.plugin.saveSettings();
						titleEl.setText(folder.name || t("folder.unnamed"));
						this.plugin.updateRibbonDisplay(folder);
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
					.onChange(async (value) => {
						folder.icon = value || "folder";
						await this.plugin.saveSettings();
						this.scheduleRefreshRibbonForFolder(folder);
					});
			})
			.addButton((btn) =>
				btn.setButtonText(t("folder.selectSvg")).onClick(async () => {
					const iconFolder = this.plugin.settings.iconFolder ?? "";
					const items = await getSvgPathsInFolder(this.plugin.app, iconFolder || "");
					new SvgIconSuggestModal(this.plugin.app, items, async (path) => {
						folderIconInput.value = path;
						folder.icon = path;
						await this.plugin.saveSettings();
						await this.refreshRibbonForFolder(folder);
					}).open();
				})
			);

		new Setting(body)
			.setName(t("folder.menuDisplay"))
			.setDesc(t("folder.menuDisplayDescription"))
			.addDropdown((dropdown) => {
				(Object.keys(MENU_DISPLAY_OPTIONS) as MenuDisplayMode[]).forEach((k) =>
					dropdown.addOption(k, MENU_DISPLAY_OPTIONS[k])
				);
				dropdown.setValue(folder.menuDisplay ?? "both");
				dropdown.onChange(async (value) => {
					folder.menuDisplay = value as MenuDisplayMode;
					await this.plugin.saveSettings();
				});
			});

		new Setting(body)
			.setName(t("folder.triggerMode"))
			.setDesc(t("folder.triggerModeDescription"))
			.addDropdown((dropdown) => {
				(Object.keys(TRIGGER_MODE_OPTIONS) as MenuTriggerMode[]).forEach((k) =>
					dropdown.addOption(k, TRIGGER_MODE_OPTIONS[k])
				);
				dropdown.setValue(folder.triggerMode ?? "click");
				dropdown.onChange(async (value) => {
					folder.triggerMode = value as MenuTriggerMode;
					await this.plugin.saveSettings();
					await this.refreshRibbonForFolder(folder);
				});
			});

		const cmdBlock = body.createDiv({ cls: "ribbon-folder-commands-block" });
		cmdBlock.createEl("strong", { text: t("folder.commands") });
		cmdBlock.createSpan({ text: t("folder.commandsHint"), cls: "ribbon-folder-cmd-hint" });

		const cmdListEl = cmdBlock.createDiv({ cls: "ribbon-folder-cmd-list ribbon-folder-draggable-list" });
		this.renderFolderCommandRows(cmdListEl, folder, metaEl);

		const addRow = cmdBlock.createDiv({ cls: "ribbon-folder-cmd-actions" });
		new Setting(addRow)
			.setName("")
			.addButton((btn) =>
				btn.setButtonText(t("folder.addCommand")).onClick(() => {
					new CommandPickerModal(this.app, (chosenId) => {
						if (!folder.commands.some((c) => c.id === chosenId)) {
							folder.commands.push({ id: chosenId });
							this.plugin.saveSettings();
							metaEl.setText(t("folder.commandsCount", { count: folder.commands.length }));
							this.display();
						}
					}).open();
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
		block.ondrop = async (e) => {
			e.preventDefault();
			block.removeClass("is-drag-over");
			const fromIndex = parseInt(e.dataTransfer?.getData("application/x-ribbon-folder-index") ?? "", 10);
			const toIndex = parseInt(block.getAttribute("data-folder-index") ?? "", 10);
			if (fromIndex === toIndex || Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return;
			const arr = this.plugin.settings.folders;
			const [item] = arr.splice(fromIndex, 1);
			const insertAt = fromIndex < toIndex ? toIndex - 1 : toIndex;
			arr.splice(insertAt, 0, item);
			await this.plugin.saveSettings();
			await this.plugin.rebuildRibbons();
			this.display();
		};
	}
}
