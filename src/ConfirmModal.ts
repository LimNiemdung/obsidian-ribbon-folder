import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private message: string,
		private onConfirm: () => void,
		private confirmText = t("folder.deleteConfirmDelete"),
		private cancelText = t("folder.deleteConfirmCancel")
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message, cls: "setting-item-description" });

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText(this.cancelText).onClick(() => {
					this.close();
				})
			)
			.addButton((btn) =>
				btn.setButtonText(this.confirmText).setWarning().onClick(() => {
					this.onConfirm();
					this.close();
				})
			);
	}
}
