import type { CommandListItem } from "../types";
import type {
	RibbonFolderCommandEntry,
	RibbonFolderNoteEntry,
	RibbonFolderWebEntry,
} from "../types";
import {
	DEFAULT_COMMAND_MENU_ICON,
	DEFAULT_NOTE_MENU_ICON,
	DEFAULT_WEB_MENU_ICON,
	isRibbonNoteEntry,
	isRibbonWebEntry,
} from "../types";

export type RibbonActionEntry =
	| RibbonFolderCommandEntry
	| RibbonFolderNoteEntry
	| RibbonFolderWebEntry;

export function getEntryLabel(entry: RibbonActionEntry, allCommands: CommandListItem[]): string {
	if (isRibbonNoteEntry(entry)) {
		const base = entry.path.split("/").pop() ?? entry.path;
		return entry.displayName?.trim() || base;
	}
	if (isRibbonWebEntry(entry)) {
		return entry.displayName?.trim() || entry.url.trim();
	}
	const cmd = allCommands.find((c) => c.id === entry.id);
	return entry.displayName?.trim() || (cmd ? cmd.name : entry.id);
}

export function getEntryIconRaw(entry: RibbonActionEntry, allCommands: CommandListItem[]): string {
	if (isRibbonNoteEntry(entry)) {
		return entry.icon?.trim() || DEFAULT_NOTE_MENU_ICON;
	}
	if (isRibbonWebEntry(entry)) {
		return entry.icon?.trim() || DEFAULT_WEB_MENU_ICON;
	}
	const cmd = allCommands.find((c) => c.id === entry.id);
	return entry.icon?.trim() || cmd?.icon?.trim() || DEFAULT_COMMAND_MENU_ICON;
}
