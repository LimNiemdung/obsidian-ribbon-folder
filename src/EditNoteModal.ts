import { App, Modal, Setting } from "obsidian";
import type { RibbonFolderNoteEntry } from "./types";
import { NotePickerModal } from "./NotePickerModal";
import { addSelectSvgExtraButton } from "./utils/selectSvgButton";
import { t } from "./i18n";
import { entryDisplayLabelKeys } from "./utils/editLabels";

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
		private onConfirm: (result: EditNoteResult) => void,
		private forPin = false
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

		const displayLabels = entryDisplayLabelKeys(this.forPin, "notes");
		let displayNameInput: HTMLInputElement;
		new Setting(contentEl)
			.setName(t(displayLabels.name))
			.setDesc(t(displayLabels.description))
			.addText((text) => {
				displayNameInput = text.inputEl;
				text.setPlaceholder(t(displayLabels.placeholder)).setValue(this.entry.displayName?.trim() ?? "");
			});

		let iconInput: HTMLInputElement;
		const iconSetting = new Setting(contentEl)
			.setName(t("notes.edit.icon"))
			.setDesc(t("notes.edit.iconDescription"))
			.addText((text) => {
				iconInput = text.inputEl;
				text.setPlaceholder(t("notes.edit.iconPlaceholder")).setValue(this.entry.icon?.trim() ?? "");
			});
		addSelectSvgExtraButton(iconSetting, this.app, () => this.iconFolder || "", (path) => {
			iconInput.value = path;
		});

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
