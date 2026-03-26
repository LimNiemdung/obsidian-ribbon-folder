import { App, FuzzySuggestModal, TFile } from "obsidian";
import { t } from "./i18n";

export class NotePickerModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private onPick: (file: TFile) => void
	) {
		super(app);
		this.setPlaceholder(t("modal.notePickerPlaceholder"));
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onPick(item);
		this.close();
	}
}
