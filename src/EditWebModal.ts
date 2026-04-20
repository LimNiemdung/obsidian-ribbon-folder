import { App, Modal, Setting } from "obsidian";
import type { RibbonFolderWebEntry } from "./types";
import { SvgIconSuggestModal } from "./SvgIconSuggestModal";
import { getSvgPathsInFolder } from "./utils/icon";
import { t } from "./i18n";

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
		private onConfirm: (result: EditWebResult) => void
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

		let displayNameInput: HTMLInputElement;
		new Setting(contentEl)
			.setName(t("web.edit.display"))
			.setDesc(t("web.edit.displayDescription"))
			.addText((text) => {
				displayNameInput = text.inputEl;
				text.setPlaceholder(t("web.edit.displayPlaceholder")).setValue(this.entry.displayName?.trim() ?? "");
			});

		let iconInput: HTMLInputElement;
		new Setting(contentEl)
			.setName(t("web.edit.icon"))
			.setDesc(t("web.edit.iconDescription"))
			.addText((text) => {
				iconInput = text.inputEl;
				text.setPlaceholder(t("web.edit.iconPlaceholder")).setValue(this.entry.icon?.trim() ?? "");
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
