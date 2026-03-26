import type { App } from "obsidian";
import type { CommandListItem } from "../types";

type InternalCommand = { icon?: string; name?: string };

/** Obsidian 运行时存在，公开 d.ts 未完整声明 */
type AppWithCommands = App & {
	commands: {
		listCommands(): CommandListItem[];
		commands?: Record<string, InternalCommand> | Map<string, InternalCommand>;
		findCommand?: (commandId: string) => InternalCommand | undefined;
	};
};

function getInternalCommand(app: App, id: string): InternalCommand | undefined {
	const cmds = (app as AppWithCommands).commands as unknown as {
		commands?: Record<string, InternalCommand> | Map<string, InternalCommand>;
		findCommand?: (commandId: string) => InternalCommand | undefined;
	};
	if (typeof cmds.findCommand === "function") {
		try {
			const c = cmds.findCommand(id);
			if (c) return c;
		} catch {
			/* ignore */
		}
	}
	const reg = cmds.commands;
	if (!reg) return undefined;
	if (reg instanceof Map) return reg.get(id);
	if (typeof reg === "object" && reg !== null) return reg[id];
	return undefined;
}

/**
 * `listCommands()` 有时不返回 `icon`；从内部 Command 表合并（与 `addCommand({ icon })` 一致）。
 * 若某插件仅用 `addRibbonIcon` 而未在 `addCommand` 中设置 `icon`，则无法从 API 推断 Ribbon 专用图标。
 */
export function listCommandsWithIcons(app: App): CommandListItem[] {
	const list = (app as AppWithCommands).commands.listCommands();
	return list.map((item) => {
		const fromList = (item as { icon?: string }).icon;
		const internal = getInternalCommand(app, item.id)?.icon;
		return {
			id: item.id,
			name: item.name,
			icon: fromList ?? internal,
		};
	});
}
