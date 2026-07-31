import { App, Modal, Setting } from "obsidian";
import type { RibbonFolderCommandEntry } from "./types";
import { CommandPickerModal } from "./CommandPickerModal";
import { listCommandsWithIcons } from "./utils/commands";
import { addSelectSvgExtraButton } from "./utils/selectSvgButton";
import { t } from "./i18n";
import { entryDisplayLabelKeys } from "./utils/editLabels";

export type EditCommandResult = {
	id: string;
	displayName?: string;
	icon?: string;
};

export class EditCommandModal extends Modal {
	constructor(
		app: App,
		private entry: RibbonFolderCommandEntry,
		private iconFolder: string,
		private onConfirm: (result: EditCommandResult) => void,
		private forPin = false
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: t("commands.edit.title") });

		let currentId = this.entry.id;
		const displayName = this.entry.displayName?.trim() ?? "";
		const icon = this.entry.icon?.trim() ?? "";

		const cmdSetting = new Setting(contentEl).setName(t("commands.edit.command"));
		const updateCommandDesc = () => {
			const all = listCommandsWithIcons(this.app);
			const cmd = all.find((c) => c.id === currentId);
			cmdSetting.setDesc("Current: " + (cmd ? cmd.name : currentId));
		};
		updateCommandDesc();
		cmdSetting.addButton((btn) =>
			btn.setButtonText(t("commands.edit.change")).onClick(() => {
				new CommandPickerModal(this.app, (chosenId) => {
					currentId = chosenId;
					updateCommandDesc();
				}).open();
			})
		);

		const displayLabels = entryDisplayLabelKeys(this.forPin, "commands");
		let displayNameInput: HTMLInputElement;
		new Setting(contentEl)
			.setName(t(displayLabels.name))
			.setDesc(t(displayLabels.description))
			.addText((text) => {
				displayNameInput = text.inputEl;
				text.setPlaceholder(t(displayLabels.placeholder)).setValue(displayName);
			});

		let iconInput: HTMLInputElement;
		const iconSetting = new Setting(contentEl)
			.setName(t("commands.edit.icon"))
			.setDesc(t("commands.edit.iconDescription"))
			.addText((text) => {
				iconInput = text.inputEl;
				text.setPlaceholder(t("commands.edit.iconPlaceholder")).setValue(icon);
			});
		addSelectSvgExtraButton(iconSetting, this.app, () => this.iconFolder || "", (path) => {
			iconInput.value = path;
		});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText(t("commands.edit.confirm")).onClick(() => {
				this.onConfirm({
					id: currentId,
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
