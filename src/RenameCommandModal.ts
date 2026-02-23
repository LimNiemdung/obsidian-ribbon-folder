import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";

export class RenameCommandModal extends Modal {
	constructor(
		app: App,
		private currentName: string,
		private onConfirm: (newName: string) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: t("commands.rename.title") });
		let input: HTMLInputElement;
		new Setting(contentEl)
			.setName(t("commands.rename.displayAs"))
			.addText((text) => {
				input = text.inputEl;
				text.setValue(this.currentName);
			});
		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText(t("commands.edit.confirm")).onClick(() => {
				const value = input?.value?.trim() ?? "";
				this.onConfirm(value);
				this.close();
			})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}
