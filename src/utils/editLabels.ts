/** 分组菜单项 vs Ribbon 快捷项：displayName 字段文案不同 */
export function entryDisplayLabelKeys(
	forPin: boolean,
	section: "commands" | "notes" | "web"
): { name: string; description: string; placeholder: string } {
	if (forPin) {
		const descriptionBySection: Record<typeof section, string> = {
			commands: "pinEdit.displayDescriptionCommand",
			notes: "pinEdit.displayDescriptionNote",
			web: "pinEdit.displayDescriptionWeb",
		};
		return {
			name: "pinEdit.display",
			description: descriptionBySection[section],
			placeholder: "pinEdit.displayPlaceholder",
		};
	}
	const base = `${section}.edit`;
	return {
		name: `${base}.display`,
		description: `${base}.displayDescription`,
		placeholder: `${base}.displayPlaceholder`,
	};
}
