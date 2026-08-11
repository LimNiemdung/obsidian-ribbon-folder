import {
	App,
	SuggestModal,
	TFile,
	TFolder,
	prepareFuzzySearch,
	setIcon,
	sortSearchResults,
	type SearchResultContainer,
} from "obsidian";
import { t } from "./i18n";

type NotePickerItem =
	| { kind: "parent"; folder: TFolder }
	| { kind: "folder"; folder: TFolder }
	| { kind: "file"; file: TFile; showPath?: boolean };

interface FileSearchResult extends SearchResultContainer {
	file: TFile;
}

export class NotePickerModal extends SuggestModal<NotePickerItem> {
	private currentFolder: TFolder;
	private allFiles: TFile[] | null = null;

	constructor(
		app: App,
		private onPick: (file: TFile) => void
	) {
		super(app);
		this.currentFolder = app.vault.getRoot();
		this.setPlaceholder(t("modal.notePickerPlaceholder"));
	}

	getSuggestions(query: string): NotePickerItem[] {
		const normalizedQuery = query.trim();
		if (normalizedQuery) {
			return this.getGlobalFileSuggestions(normalizedQuery);
		}

		const children = this.currentFolder.children
			.filter((file): file is TFile | TFolder => file instanceof TFile || file instanceof TFolder)
			.sort((a, b) => {
				if (a instanceof TFolder && b instanceof TFile) return -1;
				if (a instanceof TFile && b instanceof TFolder) return 1;
				return a.name.localeCompare(b.name);
			})
			.map<NotePickerItem>((file) =>
				file instanceof TFolder
					? { kind: "folder", folder: file }
					: { kind: "file", file }
			);

		const parent = this.currentFolder.parent;
		return parent ? [{ kind: "parent", folder: parent }, ...children] : children;
	}

	private getGlobalFileSuggestions(query: string): NotePickerItem[] {
		// Enumerate lazily only after the user starts a global search, then reuse the
		// snapshot for the rest of this modal session instead of scanning per keystroke.
		this.allFiles ??= this.app.vault.getFiles();
		const fuzzySearch = prepareFuzzySearch(query);
		const results: FileSearchResult[] = [];

		for (const file of this.allFiles) {
			const match = fuzzySearch(file.path);
			if (match) results.push({ file, match });
		}

		sortSearchResults(results);
		return results
			.slice(0, this.limit)
			.map(({ file }) => ({ kind: "file", file, showPath: true }));
	}

	renderSuggestion(item: NotePickerItem, el: HTMLElement): void {
		const iconEl = el.createSpan({ cls: "suggestion-flair" });
		setIcon(iconEl, item.kind === "file" ? "file" : item.kind === "parent" ? "undo-2" : "folder");

		if (item.kind === "parent") {
			el.createSpan({ text: "../" });
			return;
		}

		el.createSpan({
			text: item.kind === "file"
				? item.showPath
					? item.file.path
					: item.file.name
				: item.folder.name,
		});
	}

	selectSuggestion(item: NotePickerItem, evt: MouseEvent | KeyboardEvent): void {
		if (item.kind === "file") {
			super.selectSuggestion(item, evt);
			return;
		}

		this.onChooseSuggestion(item);
	}

	onChooseSuggestion(item: NotePickerItem): void {
		if (item.kind === "file") {
			this.onPick(item.file);
			return;
		}

		this.currentFolder = item.folder;
		this.inputEl.value = "";
		this.inputEl.dispatchEvent(new Event("input"));
	}
}
