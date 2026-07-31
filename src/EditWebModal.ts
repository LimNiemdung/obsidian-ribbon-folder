import { App, Modal, Setting } from "obsidian";
import type { RibbonFolderWebEntry } from "./types";
import { addSelectSvgExtraButton } from "./utils/selectSvgButton";
import { t } from "./i18n";
import { entryDisplayLabelKeys } from "./utils/editLabels";

export type EditWebResult = {
	url: string;
	displayName?: string;
	icon?: string;
};

export class EditWebModal extends Modal {
	constructor(
		app: App,
		private entry: RibbonFolderWebEntry,
		private iconFolder: string,
		private onConfirm: (result: EditWebResult) => void,
		private forPin = false
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: t("web.edit.title") });

		let urlInput: HTMLInputElement;
		new Setting(contentEl)
			.setName(t("web.edit.url"))
			.setDesc(t("web.edit.urlDescription"))
			.addText((text) => {
				urlInput = text.inputEl;
				text.setPlaceholder(t("web.edit.urlPlaceholder")).setValue(this.entry.url?.trim() ?? "");
			});

		const displayLabels = entryDisplayLabelKeys(this.forPin, "web");
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
			.setName(t("web.edit.icon"))
			.setDesc(t("web.edit.iconDescription"))
			.addText((text) => {
				iconInput = text.inputEl;
				text.setPlaceholder(t("web.edit.iconPlaceholder")).setValue(this.entry.icon?.trim() ?? "");
			});
		addSelectSvgExtraButton(iconSetting, this.app, () => this.iconFolder || "", (path) => {
			iconInput.value = path;
		});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText(t("commands.edit.confirm")).onClick(() => {
				const url = urlInput?.value?.trim() ?? "";
				if (!url) {
					return;
				}
				this.onConfirm({
					url,
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
