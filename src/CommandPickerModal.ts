import { App, Modal } from "obsidian";
import type { AppCommands } from "./types";
import { t } from "./i18n";

export class CommandPickerModal extends Modal {
	onChoose: (commandId: string) => void;
	private filter = "";

	constructor(app: App, onChoose: (commandId: string) => void) {
		super(app);
		this.onChoose = onChoose;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("ribbon-folder-modal");
		contentEl.createEl("h2", { text: t("commands.add.title") });

		const input = contentEl.createEl("input", {
			type: "text",
			attr: { placeholder: t("modal.searchPlaceholder") },
		});
		input.addEventListener("input", () => {
			this.filter = input.value.trim().toLowerCase();
			this.renderList();
		});

		const listEl = contentEl.createDiv({ cls: "ribbon-folder-command-list" });
		this.renderList(listEl);
	}

	private renderList(container?: HTMLDivElement) {
		const wrap = container || this.contentEl.querySelector(".ribbon-folder-command-list");
		if (!wrap) return;
		wrap.empty();

		const commands = (this.app as App & { commands: AppCommands }).commands.listCommands();
		const f = this.filter.toLowerCase();
		const filtered = f
			? commands.filter((c) => c.name.toLowerCase().includes(f) || c.id.toLowerCase().includes(f))
			: commands;

		for (const cmd of filtered) {
			const row = wrap.createDiv({ cls: "ribbon-folder-command-row" });
			row.createSpan({ text: cmd.name, cls: "ribbon-folder-command-name" });
			row.createSpan({ text: cmd.id, cls: "ribbon-folder-command-id" });
			row.addEventListener("click", () => {
				this.onChoose(cmd.id);
				this.close();
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
