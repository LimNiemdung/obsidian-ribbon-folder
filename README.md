# Ribbon Folder

Organize Obsidian’s left Ribbon: pin commands, files, and web links as one-click shortcuts, or tuck them into group buttons with pop-up menus.

## Features

### Shortcuts
- Pin **commands**, **vault files**, or **web links** directly on the Ribbon
- Each pin is a single button that runs immediately (no menu)
- Drag to reorder; customize tooltip and icon

### Groups
- Create group buttons that open a pop-up menu
- Menu items can be commands, files, web links
- Per-group options:
  - **Menu display**: icon only / label only / both
  - **Trigger**: click or hover
- Custom display names and icons per item

### Icons
- Lucide icon names (e.g. `folder`, `globe`)
- Custom `.svg` files via an icon folder, relative path, or full vault path

### Other
- Global setting for where files open: new tab / current tab / split

## Installation

### Community plugins (recommended)

1. Settings → Community plugins → Browse
2. Search for **Ribbon Folder**
3. Install → Enable

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/LimNiemdung/obsidian-ribbon-folder/releases)
2. Put them in `VaultFolder/.obsidian/plugins/ribbon-folder/`
3. Enable **Ribbon Folder** under Community plugins

Requires Obsidian **1.13.0** or newer.

## Usage

### Shortcuts

1. Open **Settings → Ribbon Folder → Shortcuts**
2. Add a command, file, or web link
3. Optionally set a tooltip and icon
4. The button appears on the Ribbon; click to run / open

### Groups

1. Open **Settings → Ribbon Folder → Groups**
2. Create a group; set name, icon, menu display, and trigger
3. Add menu items (command / file / web link / separator)
4. Click (or hover) the Ribbon group button to open the menu

### Custom icons

1. Set **Icon folder** (e.g. `.obsidian/icons` or `scripts/icons`)
2. In any icon field, use a Lucide name, a file under that folder (e.g. `add.svg`), or a full vault path

## Feedback

Issues and suggestions: [GitHub Issues](https://github.com/LimNiemdung/obsidian-ribbon-folder/issues)
