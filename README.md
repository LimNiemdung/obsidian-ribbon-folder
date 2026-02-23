# Ribbon Folder Plugin for Obsidian

Organize multiple commands into grouped buttons on the Obsidian Ribbon, click to expand and execute commands from a menu for a cleaner interface.

**This plugin was developed by AI.**

## Features

- **Create Groups**: Create custom command groups as buttons on the Obsidian Ribbon (left sidebar)
- **Menu Display**: Click group buttons to show all commands in that group as a menu
- **Icon Support**: Supports Lucide icon library or custom SVG icons
- **Menu Configuration**: Configure how commands are displayed (icons only/labels only/both)
- **Trigger Methods**: Support click or hover to display menus

## Installation

### Method 1: Direct Installation (Recommended)

1. Open Obsidian Settings
2. Click "Community Plugins"
3. Click "Browse"
4. Search for "Ribbon Folder"
5. Click "Install"
6. After installation, click "Enable"

### Method 2: Manual Installation

1. Download plugin files (main.js, manifest.json, styles.css)
2. Create a folder `VaultFolder/.obsidian/plugins/ribbon-folder/` in your Obsidian vault
3. Place the downloaded files in this folder
4. Open Obsidian Settings → Community Plugins → Enable "Ribbon Folder"

## Usage

### 1. Configure the Plugin

After installation, a "Ribbon Folder Settings" tab will be added to Obsidian Settings:

#### Global Settings
- **Icon Folder**: Set the path for custom SVG icons (optional)

#### Create and Manage Groups
1. Click "New Group" to create a new command group
2. Configure each group:
   - Group name (displayed on the Ribbon)
   - Icon (Lucide icon name or custom SVG path)
   - Menu display mode (icons only/labels only/both)
   - Menu trigger method (click or hover to display)

#### Add Commands to Groups
1. Expand group settings
2. Click "Add Command" button
3. Search for and select the command you want to add in the command picker
4. Optionally set a custom display name and icon for commands

### 2. Use Group Menus

- Created groups will appear on the Obsidian Ribbon (left sidebar)
- Click a group button to show all commands in that group
- Click any command to execute it directly

## Supported Languages

- English - Default language
- Chinese (Simplified)

## Supported Obsidian Versions

Requires Obsidian version 1.8.7 or higher.

## Feedback

If you encounter any issues or have improvement suggestions, please submit an issue on the GitHub repository.
