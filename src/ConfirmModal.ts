import { App, ConfirmationModal } from "obsidian";
import { t } from "./i18n";

/** 使用官方 ConfirmationModal（Obsidian ≥ 1.13）打开删除确认 */
export function openDeleteConfirm(
	app: App,
	options: {
		title: string;
		message: string;
		onConfirm: () => void | Promise<void>;
		confirmText?: string;
		cancelText?: string;
	}
): void {
	const modal = new ConfirmationModal(app);
	modal.setTitle(options.title);
	modal.contentEl.createEl("p", { text: options.message });
	modal
		.addButton((btn) =>
			btn
				.setButtonText(options.confirmText ?? t("folder.deleteConfirmDelete"))
				.setDestructive()
				.setCta()
				.onClick(() => options.onConfirm())
		)
		.addCancelButton(options.cancelText ?? t("folder.deleteConfirmCancel"))
		.open();
}
