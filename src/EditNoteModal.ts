import { App, Modal, Setting } from "obsidian";
import type { RibbonFolderNoteEntry } from "./types";
import { NotePickerModal } from "./NotePickerModal";
import { SvgIconSuggestModal } from "./SvgIconSuggestModal";
import { getSvgPathsInFolder } from "./utils/icon";
import { t } from "./i18n";

export type EditNoteResult = {
	path: string;
	displayName?: string;
	icon?: string;
};

export class EditNoteModal extends Modal {
	constructor(
		app: App,
		private entry: RibbonFolderNoteEntry,
		private iconFolder: string,
		private onConfirm: (result: EditNoteResult) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: t("notes.edit.title") });

		let pathValue = this.entry.path;

		const pathSetting = new Setting(contentEl).setName(t("notes.edit.path"));
		pathSetting.setDesc(t("notes.edit.pathDescription"));
		let pathInput: HTMLInputElement;
		pathSetting.addText((text) => {
			pathInput = text.inputEl;
			text.setPlaceholder(t("notes.edit.pathPlaceholder")).setValue(pathValue);
			text.onChange((v) => {
				pathValue = v.trim();
			});
		});
		pathSetting.addButton((btn) =>
			btn.setButtonText(t("notes.edit.browse")).onClick(() => {
				new NotePickerModal(this.app, (file) => {
					pathValue = file.path;
					pathInput.value = pathValue;
				}).open();
			})
		);

		let displayNameInput: HTMLInputElement;
		new Setting(contentEl)
			.setName(t("notes.edit.display"))
			.setDesc(t("notes.edit.displayDescription"))
			.addText((text) => {
				displayNameInput = text.inputEl;
				text.setPlaceholder(t("notes.edit.displayPlaceholder")).setValue(this.entry.displayName?.trim() ?? "");
			});

		let iconInput: HTMLInputElement;
		new Setting(contentEl)
			.setName(t("notes.edit.icon"))
			.setDesc(t("notes.edit.iconDescription"))
			.addText((text) => {
				iconInput = text.inputEl;
				text.setPlaceholder(t("notes.edit.iconPlaceholder")).setValue(this.entry.icon?.trim() ?? "");
			})
			.addButton((btn) =>
				btn.setButtonText(t("folder.selectSvg")).onClick(() => {
					void (async () => {
						const items = await getSvgPathsInFolder(this.app, this.iconFolder || "");
						new SvgIconSuggestModal(this.app, items, (path) => {
							iconInput.value = path;
						}).open();
					})();
				})
			);

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText(t("commands.edit.confirm")).onClick(() => {
				const path = pathInput?.value?.trim() ?? pathValue;
				if (!path) {
					return;
				}
				this.onConfirm({
					path,
					displayName: displayNameInput?.value?.trim() || undefined,
					icon: iconInput?.value?.trim() || undefined,
				});
				this.close();
			})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
