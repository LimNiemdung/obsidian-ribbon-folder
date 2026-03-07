import js from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{ ignores: ["node_modules/", "main.js", "eslint.config.mjs", "*.config.mjs", "*.mjs"] },
	js.configs.recommended,
	...tseslint.configs.recommended.map((c) => ({
		...c,
		files: ["**/*.ts"],
	})),
	{
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: { project: "./tsconfig.json" },
		},
		plugins: { obsidianmd },
		rules: {
			"obsidianmd/commands/no-command-in-command-id": "error",
			"obsidianmd/commands/no-command-in-command-name": "error",
			"obsidianmd/commands/no-default-hotkeys": "error",
			"obsidianmd/commands/no-plugin-id-in-command-id": "error",
			"obsidianmd/commands/no-plugin-name-in-command-name": "error",
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
			"obsidianmd/vault/iterate": "error",
			"obsidianmd/detach-leaves": "error",
			"obsidianmd/no-forbidden-elements": "error",
			"obsidianmd/no-plugin-as-component": "off",
			"obsidianmd/no-sample-code": "error",
			"obsidianmd/no-tfile-tfolder-cast": "error",
			"obsidianmd/no-view-references-in-plugin": "error",
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/object-assign": "error",
			"obsidianmd/platform": "error",
			"obsidianmd/prefer-file-manager-trash-file": "warn",
			"obsidianmd/prefer-abstract-input-suggest": "error",
			"obsidianmd/regex-lookbehind": "error",
			"obsidianmd/sample-names": "off",
			"obsidianmd/validate-manifest": "off",
			"obsidianmd/validate-license": "off",
			"obsidianmd/hardcoded-config-path": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
		},
	},
];
