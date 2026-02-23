import { App, Modal, Setting } from "obsidian";
import type { RibbonFolderCommand } from "./types";
import { CommandPickerModal } from "./CommandPickerModal";
import { SvgIconSuggestModal } from "./SvgIconSuggestModal";
import { getSvgPathsInFolder } from "./utils/icon";
import { t } from "./i18n";

export type EditCommandResult = {
	id: string;
	displayName?: string;
	icon?: string;
};

export class EditCommandModal extends Modal {
	constructor(
		app: App,
		private entry: RibbonFolderCommand,
		private iconFolder: string,
		private onConfirm: (result: EditCommandResult) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: t("commands.edit.title") });

		let currentId = this.entry.id;
		let displayName = this.entry.displayName?.trim() ?? "";
		let icon = this.entry.icon?.trim() ?? "";

		const cmdSetting = new Setting(contentEl).setName(t("commands.edit.command"));
		const updateCommandDesc = () => {
			const all = (this.app as { commands?: { listCommands(): { id: string; name: string }[] } }).commands?.listCommands?.();
			const cmd = all?.find((c) => c.id === currentId);
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

		let displayNameInput: HTMLInputElement;
		new Setting(contentEl)
			.setName(t("commands.edit.display"))
			.setDesc(t("commands.edit.displayDescription"))
			.addText((text) => {
				displayNameInput = text.inputEl;
				text.setPlaceholder(t("commands.edit.displayPlaceholder")).setValue(displayName);
			});

		let iconInput: HTMLInputElement;
		new Setting(contentEl)
			.setName(t("commands.edit.icon"))
			.setDesc(t("commands.edit.iconDescription"))
			.addText((text) => {
				iconInput = text.inputEl;
				text.setPlaceholder(t("commands.edit.iconPlaceholder")).setValue(icon);
			})
			.addButton((btn) =>
				btn.setButtonText(t("folder.selectSvg")).onClick(async () => {
					const items = await getSvgPathsInFolder(this.app, this.iconFolder || "");
					new SvgIconSuggestModal(this.app, items, (path) => {
						iconInput.value = path;
					}).open();
				})
			);

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
