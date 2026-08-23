# Living Mindmap

A polished, directly editable mindmap view for ordinary Obsidian Markdown notes.

## Usage

Open a Markdown note and run **Living Mindmap: Open editable mind map**.

- Double-click or press `F2` on a selected node to edit it.
- Press `Tab` on a selected node to add a child; press `Enter` to add a sibling at the same level.
- While editing, plain `Enter` or `Tab` saves the edit without creating another node.
- While editing, `Shift+Enter` saves and creates a sibling; `Shift+Tab` saves and creates a child.
- While editing, use `Ctrl/Cmd+B` for bold and `Ctrl/Cmd+I` for italic.
- With nodes selected, use `Ctrl+B` on Linux/Windows or `Cmd+B` on macOS to bold entire nodes; use `Ctrl/Cmd+I` for italic.
- Shift-click nodes or left-drag an empty area to select multiple nodes. Right-drag the empty canvas to pan.
- Drag a node onto another node's center to reparent it. Drop at the upper or lower edge to reorder siblings.
- Right-click a node to convert it between a heading and regular list content.
- Press `Delete` or `Backspace` to remove the selected node and its descendants.
- Press `Ctrl/Cmd+Z` and `Ctrl/Cmd+Y` to undo and redo mind-map changes.
- Right-drag the empty canvas to pan; scroll to zoom.

## Settings

Mind-map preferences are global and stored in the plugin's `data.json`, not in note frontmatter. Toolbar changes update the same global settings immediately.

The settings page exposes layout, maximum node width, spacing mode, branch colors, parent-to-child distance, horizontal hierarchy distance, and sibling distance.

Node text always wraps at the configured maximum width. Shorter nodes keep their natural compact width.

Enable **Compact branches** in the toolbar to keep parent-to-child gaps fixed within each branch. Disable it to align every depth into global columns.

Enable **Branch colors** in the toolbar to give each top-level branch its own node and connector color.
