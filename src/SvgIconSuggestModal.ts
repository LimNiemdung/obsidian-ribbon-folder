import { App, FuzzySuggestModal } from "obsidian";
import { t } from "./i18n";

export class SvgIconSuggestModal extends FuzzySuggestModal<string> {
	constructor(
		app: App,
		private items: string[],
		private onChoose: (path: string) => void
	) {
		super(app);
		this.setPlaceholder(t("modal.svgIcon.searchPlaceholder"));
		this.emptyStateText = t("modal.svgIcon.emptyState");
	}

	getItems(): string[] {
		return this.items;
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string): void {
		this.onChoose(item);
	}
}
