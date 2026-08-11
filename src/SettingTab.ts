import {
	App,
	Menu,
	Plugin,
	PluginSettingTab,
	Setting,
	setIcon,
	type SettingDefinition,
	type SettingDefinitionItem,
	type SettingDefinitionPage,
} from "obsidian";
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

function showMenuAtEl(menu: Menu, el: HTMLElement): void {
	const rect = el.getBoundingClientRect();
	menu.showAtPosition({ x: rect.left, y: rect.bottom });
}

export class RibbonFolderSettingTab extends PluginSettingTab {
	plugin: IRibbonFolderPlugin;
	private rebuildRibbonsTimer: number | null = null;
	private refreshFolderTimers = new Map<string, number>();

	constructor(app: App, plugin: Plugin) {
		super(app, plugin);
		this.plugin = plugin as unknown as IRibbonFolderPlugin;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
		if (key === "iconFolder") this.scheduleRebuildRibbons();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: t("settings.iconFolder.name"),
				desc: t("settings.iconFolder.description"),
				control: {
					type: "text",
					key: "iconFolder",
					placeholder: t("settings.iconFolder.placeholder"),
				},
			},
			{
				name: t("settings.noteOpenLocation.name"),
				desc: t("settings.noteOpenLocation.description"),
				control: {
					type: "dropdown",
					key: "noteOpenLocation",
					defaultValue: "tab",
					options: NOTE_OPEN_OPTIONS,
				},
			},
			this.pinsPage(),
			this.groupsPage(),
		];
	}

	private get pins(): RibbonPin[] {
		if (!this.plugin.settings.pins) {
			this.plugin.settings.pins = [];
		}
		return this.plugin.settings.pins;
	}

	private scheduleRebuildRibbons(): void {
		if (this.rebuildRibbonsTimer != null) window.clearTimeout(this.rebuildRibbonsTimer);
		this.rebuildRibbonsTimer = window.setTimeout(() => {
			this.rebuildRibbonsTimer = null;
			void this.plugin.rebuildRibbons();
		}, REBUILD_DEBOUNCE_MS);
	}

	private scheduleRefreshRibbonForFolder(folder: RibbonFolder): void {
		const id = folder.id;
		const existing = this.refreshFolderTimers.get(id);
		if (existing != null) window.clearTimeout(existing);
		this.refreshFolderTimers.set(
			id,
			window.setTimeout(() => {
				this.refreshFolderTimers.delete(id);
				void this.refreshRibbonForFolder(folder);
			}, REBUILD_DEBOUNCE_MS)
		);
	}

	private async refreshRibbonForFolder(folder: RibbonFolder): Promise<void> {
		this.plugin.removeRibbonForFolder(folder.id);
		await this.plugin.addRibbonForFolder(folder);
	}

	private scheduleRefreshRibbonForPin(pin: RibbonPin): void {
		const id = pin.id;
		const existing = this.refreshFolderTimers.get(id);
		if (existing != null) window.clearTimeout(existing);
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

	private async saveAndUpdate(): Promise<void> {
		await this.plugin.saveSettings();
		this.update();
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

	private openEditEntryModal(
		entry: RibbonFolderCommandEntry | RibbonFolderNoteEntry | RibbonFolderWebEntry,
		onSaved: () => void,
		forPin = false
	): void {
		const iconFolder = this.plugin.settings.iconFolder ?? "";
		if (isRibbonNoteEntry(entry)) {
			new EditNoteModal(
				this.app,
				entry,
				iconFolder,
				(result) => {
					entry.path = result.path;
					entry.displayName = result.displayName;
					entry.icon = result.icon;
					onSaved();
				},
				forPin
			).open();
		} else if (isRibbonWebEntry(entry)) {
			new EditWebModal(
				this.app,
				entry,
				iconFolder,
				(result) => {
					entry.url = result.url;
					entry.displayName = result.displayName;
					entry.icon = result.icon;
					onSaved();
				},
				forPin
			).open();
		} else {
			new EditCommandModal(
				this.app,
				entry,
				iconFolder,
				(result) => {
					entry.id = result.id;
					entry.displayName = result.displayName;
					entry.icon = result.icon;
					onSaved();
				},
				forPin
			).open();
		}
	}

	private pinsPage(): SettingDefinitionPage {
		return {
			type: "page",
			name: t("settings.pinsPage.name"),
			desc: t("settings.pinsPage.description"),
			displayValue: () => t("folder.itemsCount", { count: this.pins.length }),
			items: [
				{
					type: "list",
					emptyState: t("settings.pinsPage.empty"),
					addItem: {
						name: t("settings.pinsPage.add"),
						action: (el) => this.showAddPinMenu(el),
					},
					onReorder: (oldIndex, newIndex) => {
						const [moved] = this.pins.splice(oldIndex, 1);
						this.pins.splice(newIndex, 0, moved);
						void (async () => {
							await this.plugin.saveSettings();
							await this.plugin.rebuildRibbons();
						})();
					},
					onDelete: (index) => {
						const pin = this.pins[index];
						if (!pin) return;
						this.plugin.settings.pins = this.pins.filter((_, i) => i !== index);
						this.plugin.removeRibbonForPin(pin.id);
						void this.saveAndUpdate();
					},
					items: this.pins.map((pin) => this.pinRow(pin)),
				},
			],
		};
	}

	private pinRow(pin: RibbonPin): SettingDefinition {
		const entry = pin.entry;
		const label = getEntryLabel(entry, this.plugin.app);
		return {
			name: label,
			searchable: false,
			render: (setting) => {
				this.renderEntryLeading(setting, entry);
				setting.nameEl.createSpan({
					cls: "ribbon-folder-setting-kind",
					text: this.entryKindLabel(entry),
				});
				setting.addExtraButton((btn) =>
					btn
						.setIcon("pencil")
						.setTooltip(t("commands.editBtn"))
						.onClick(() => {
							this.openEditEntryModal(
								entry,
								() => {
									void (async () => {
										await this.plugin.saveSettings();
										this.plugin.updatePinRibbonDisplay(pin);
										this.scheduleRefreshRibbonForPin(pin);
										this.update();
									})();
								},
								true
							);
						})
				);
			},
		};
	}

	private showAddPinMenu(el: HTMLElement): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(t("folder.addCommand"))
				.setIcon("terminal")
				.onClick(() => {
					new CommandPickerModal(this.app, (chosenId) => {
						if (this.pins.some((p) => isRibbonCommandEntry(p.entry) && p.entry.id === chosenId)) {
							return;
						}
						const pin: RibbonPin = { id: "pin-" + Date.now(), entry: { id: chosenId } };
						this.pins.push(pin);
						void (async () => {
							await this.plugin.addRibbonForPin(pin);
							await this.saveAndUpdate();
						})();
					}).open();
				})
		);
		menu.addItem((item) =>
			item
				.setTitle(t("folder.addNote"))
				.setIcon("file")
				.onClick(() => {
					new NotePickerModal(this.app, (file) => {
						if (this.pins.some((p) => isRibbonNoteEntry(p.entry) && p.entry.path === file.path)) {
							return;
						}
						const pin: RibbonPin = { id: "pin-" + Date.now(), entry: { kind: "note", path: file.path } };
						this.pins.push(pin);
						void (async () => {
							await this.plugin.addRibbonForPin(pin);
							await this.saveAndUpdate();
						})();
					}).open();
				})
		);
		menu.addItem((item) =>
			item
				.setTitle(t("folder.addWeb"))
				.setIcon("globe")
				.onClick(() => {
					const draft: RibbonFolderWebEntry = { kind: "web", url: "" };
					new EditWebModal(
						this.app,
						draft,
						this.plugin.settings.iconFolder ?? "",
						(result) => {
							const normalized = normalizeExternalUrl(result.url);
							if (!normalized) return;
							if (
								this.pins.some(
									(p) => isRibbonWebEntry(p.entry) && normalizeExternalUrl(p.entry.url) === normalized
								)
							) {
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
								await this.saveAndUpdate();
							})();
						},
						true
					).open();
				})
		);
		showMenuAtEl(menu, el);
	}

	private groupsPage(): SettingDefinitionPage {
		return {
			type: "page",
			name: t("settings.groupsPage.name"),
			desc: t("settings.groupsPage.description"),
			displayValue: () => t("folder.itemsCount", { count: this.plugin.settings.folders.length }),
			items: [
				{
					type: "list",
					emptyState: t("settings.groupsPage.empty"),
					addItem: {
						name: t("settings.groupsPage.add"),
						action: () => void this.addNewFolder(),
					},
					onReorder: (oldIndex, newIndex) => {
						const folders = this.plugin.settings.folders;
						const [moved] = folders.splice(oldIndex, 1);
						folders.splice(newIndex, 0, moved);
						void (async () => {
							await this.plugin.saveSettings();
							await this.plugin.rebuildRibbons();
						})();
					},
					// page 项不会渲染列表自带的删除按钮，删除入口在各分组子页内
					items: this.plugin.settings.folders.map((folder, index) => this.folderPage(folder, index)),
				},
			],
		};
	}

	private folderPageName(folder: RibbonFolder, index: number): string {
		const base = folder.name || t("folder.unnamed");
		const same = this.plugin.settings.folders.filter((f) => (f.name || t("folder.unnamed")) === base);
		if (same.length <= 1) return base;
		return `${base} (${index + 1})`;
	}

	private confirmDeleteFolder(folder: RibbonFolder): void {
		openDeleteConfirm(this.app, {
			title: t("folder.deleteConfirmTitle"),
			message: t("folder.deleteConfirm", { name: folder.name || t("folder.unnamed") }),
			onConfirm: () => {
				this.plugin.settings.folders = this.plugin.settings.folders.filter((f) => f.id !== folder.id);
				this.plugin.removeRibbonForFolder(folder.id);
				void (async () => {
					await this.plugin.saveSettings();
					this.clickSettingsBack();
					this.update();
				})();
			},
		});
	}

	/** 点击设置子页标题栏返回，避免删除后停在空页面 */
	private clickSettingsBack(): void {
		const scope =
			this.containerEl.closest(".vertical-tab-content") ??
			this.containerEl.closest(".modal") ??
			this.containerEl.parentElement;
		if (!scope) return;
		const back =
			scope.querySelector<HTMLElement>(".vertical-tab-content-header .clickable-icon") ??
			scope.querySelector<HTMLElement>(".setting-item-heading .clickable-icon") ??
			scope.querySelector<HTMLElement>("button.clickable-icon");
		back?.click();
	}

	private folderPage(folder: RibbonFolder, index: number): SettingDefinitionPage {
		return {
			type: "page",
			name: this.folderPageName(folder, index),
			displayValue: () => t("folder.itemsCount", { count: folder.commands.length }),
			items: [
				{
					name: t("folder.name"),
					render: (setting) => {
						setting.addText((text) => {
							text
								.setPlaceholder(t("folder.namePlaceholder"))
								.setValue(folder.name)
								.onChange((value) => {
									folder.name = value || t("folder.unnamed");
									void (async () => {
										await this.plugin.saveSettings();
										this.plugin.updateRibbonDisplay(folder);
									})();
								});
							// 避免每键 update() 重建子页路径；失焦后再刷新父级列表名称
							text.inputEl.addEventListener("blur", () => this.update());
						});
					},
				},
				{
					name: t("folder.icon"),
					desc: t("folder.iconDescription"),
					render: (setting) => {
						let iconInput: HTMLInputElement;
						addSelectSvgExtraButton(
							setting,
							this.plugin.app,
							() => this.plugin.settings.iconFolder ?? "",
							(path) => {
								iconInput.value = path;
								folder.icon = path;
								void (async () => {
									await this.plugin.saveSettings();
									await this.refreshRibbonForFolder(folder);
								})();
							}
						);
						setting.addText((text) => {
							iconInput = text.inputEl;
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
						});
					},
				},
				{
					name: t("folder.menuDisplay"),
					desc: t("folder.menuDisplayDescription"),
					render: (setting) => {
						setting.addDropdown((dropdown) => {
							(Object.keys(MENU_DISPLAY_OPTIONS) as MenuDisplayMode[]).forEach((k) => {
								void dropdown.addOption(k, MENU_DISPLAY_OPTIONS[k]);
							});
							dropdown.setValue(folder.menuDisplay ?? "both");
							dropdown.onChange((value) => {
								folder.menuDisplay = value as MenuDisplayMode;
								void this.plugin.saveSettings();
							});
						});
					},
				},
				{
					name: t("folder.triggerMode"),
					desc: t("folder.triggerModeDescription"),
					render: (setting) => {
						setting.addDropdown((dropdown) => {
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
					},
				},
				{
					name: t("folder.delete"),
					desc: t("folder.deleteDescription"),
					render: (setting) => {
						setting.addButton((btn) =>
							btn
								.setButtonText(t("folder.deleteConfirmDelete"))
								.setDestructive()
								.onClick(() => this.confirmDeleteFolder(folder))
						);
					},
				},
				{
					type: "list",
					heading: t("folder.itemsSection"),
					emptyState: t("folder.noItems"),
					addItem: {
						name: t("settings.folderItems.add"),
						action: (el) => this.showAddFolderEntryMenu(el, folder),
					},
					onReorder: (oldIndex, newIndex) => {
						const [moved] = folder.commands.splice(oldIndex, 1);
						folder.commands.splice(newIndex, 0, moved);
						void this.plugin.saveSettings();
					},
					onDelete: (cmdIndex) => {
						folder.commands = folder.commands.filter((_, i) => i !== cmdIndex);
						void this.saveAndUpdate();
					},
					items: folder.commands.map((entry) => this.folderEntryRow(folder, entry)),
				},
			],
		};
	}

	private folderEntryRow(folder: RibbonFolder, entry: RibbonFolderEntry): SettingDefinition {
		const label = this.entryLabel(entry);
		return {
			name: label,
			searchable: false,
			render: (setting) => {
				if (isRibbonSeparatorEntry(entry)) {
					setting.settingEl.addClass("ribbon-folder-setting-separator");
				} else {
					this.renderEntryLeading(setting, entry);
					setting.nameEl.createSpan({
						cls: "ribbon-folder-setting-kind",
						text: this.entryKindLabel(entry),
					});
					setting.addExtraButton((btn) =>
						btn
							.setIcon("pencil")
							.setTooltip(t("commands.editBtn"))
							.onClick(() => {
								this.openEditEntryModal(entry, () => {
									void this.saveAndUpdate();
								});
							})
					);
				}

				setting.addToggle((toggle) =>
					toggle.setValue(!entry.hidden).onChange((visible) => {
						entry.hidden = !visible;
						void this.saveAndUpdate();
					})
				);
			},
		};
	}

	private renderEntryLeading(
		setting: Setting,
		entry: RibbonFolderCommandEntry | RibbonFolderNoteEntry | RibbonFolderWebEntry
	): void {
		setting.nameEl.addClass("ribbon-folder-entry-row");
		const iconWrap = setting.nameEl.createSpan({ cls: "ribbon-folder-entry-row-icon" });
		setting.nameEl.prepend(iconWrap);
		const iconFolder = this.plugin.settings.iconFolder ?? "";
		void (async () => {
			const iconId = await resolveIconId(this.plugin.app, iconFolder, getEntryIconRaw(entry, this.plugin.app));
			setIcon(iconWrap, iconId);
			applyWideIconSize(iconWrap, iconId);
		})();
	}

	private showAddFolderEntryMenu(el: HTMLElement, folder: RibbonFolder): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(t("folder.addCommand"))
				.setIcon("terminal")
				.onClick(() => {
					new CommandPickerModal(this.app, (chosenId) => {
						if (!folder.commands.some((c) => isRibbonCommandEntry(c) && c.id === chosenId)) {
							folder.commands.push({ id: chosenId });
							void this.saveAndUpdate();
						}
					}).open();
				})
		);
		menu.addItem((item) =>
			item
				.setTitle(t("folder.addNote"))
				.setIcon("file")
				.onClick(() => {
					new NotePickerModal(this.app, (file) => {
						if (!folder.commands.some((c) => isRibbonNoteEntry(c) && c.path === file.path)) {
							folder.commands.push({ kind: "note", path: file.path });
							void this.saveAndUpdate();
						}
					}).open();
				})
		);
		menu.addItem((item) =>
			item
				.setTitle(t("folder.addWeb"))
				.setIcon("globe")
				.onClick(() => {
					const draft: RibbonFolderWebEntry = { kind: "web", url: "" };
					new EditWebModal(this.app, draft, this.plugin.settings.iconFolder ?? "", (result) => {
						const normalized = normalizeExternalUrl(result.url);
						if (!normalized) return;
						if (
							folder.commands.some(
								(c) => isRibbonWebEntry(c) && normalizeExternalUrl(c.url) === normalized
							)
						) {
							return;
						}
						folder.commands.push({
							kind: "web",
							url: result.url.trim(),
							displayName: result.displayName,
							icon: result.icon,
						});
						void this.saveAndUpdate();
					}).open();
				})
		);
		menu.addItem((item) =>
			item
				.setTitle(t("folder.addSeparator"))
				.setIcon("minus")
				.onClick(() => {
					folder.commands.push({ kind: "separator" });
					void this.saveAndUpdate();
				})
		);
		showMenuAtEl(menu, el);
	}

	private async addNewFolder(): Promise<void> {
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
		await this.saveAndUpdate();
	}
}
