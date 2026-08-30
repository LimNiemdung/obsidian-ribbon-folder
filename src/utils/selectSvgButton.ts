import { App, Notice, Setting } from "obsidian";
import { SvgIconSuggestModal } from "../SvgIconSuggestModal";
import { getSvgPathsInFolder } from "./icon";
import { t } from "../i18n";

/** 在 Setting 行上添加「选择 SVG」图标按钮 */
export function addSelectSvgExtraButton(
	setting: Setting,
	app: App,
	getIconFolder: () => string,
	onPick: (path: string) => void
): void {
	setting.addExtraButton((btn) => {
		btn
			.setIcon("image")
			.setTooltip(t("folder.selectSvg"))
			.onClick(() => {
				const iconFolder = getIconFolder().trim();
				if (!iconFolder) {
					new Notice(t("modal.svgIcon.iconFolderRequired"));
					return;
				}

				void (async () => {
					const items = await getSvgPathsInFolder(app, iconFolder);
					new SvgIconSuggestModal(app, items, onPick).open();
				})();
			});
	});
}
