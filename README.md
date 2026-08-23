# Living Mindmap

A polished, directly editable mindmap view for ordinary Obsidian Markdown notes.

## Usage

Open a Markdown note and run **Living Mindmap: Open editable mind map**.

## Commands and controls

| Context | Input | Action |
| --- | --- | --- |
| Node | Double-click or `F2` | Edit the node text |
| Selected node | `Tab` | Create a child |
| Selected node | `Enter` | Create a sibling at the same level |
| Editing | `Enter` or `Tab` | Save without creating another node |
| Editing | `Shift+Enter` | Save and create a sibling |
| Editing | `Shift+Tab` | Save and create a child |
| Editing or selected nodes | `Ctrl+B` / `Cmd+B` | Toggle bold formatting |
| Editing or selected nodes | `Ctrl+I` / `Cmd+I` | Toggle italic formatting |
| Selected nodes | `Delete` or `Backspace` | Delete the nodes and their descendants |
| Mindmap view | `Ctrl+Z` / `Cmd+Z` | Undo |
| Mindmap view | `Ctrl+Y` / `Cmd+Y` | Redo |
| Selection | Shift-click | Add or remove an individual node from the selection |
| Empty canvas | Left-drag | Select multiple nodes with a selection rectangle |
| Empty canvas | Right-drag | Pan the view |
| Empty canvas | Mouse wheel | Zoom in or out |
| Node drag | Drop in the center | Move the selected branch beneath a new parent |
| Node drag, horizontal layout | Drop near the top or bottom | Reorder siblings |
| Node drag, vertical layout | Drop near the left or right | Reorder siblings |
| Node | Right-click | Convert between a heading and regular list content |

## Settings

Mind-map preferences are global and stored in the plugin's `data.json`, not in note frontmatter. Toolbar changes update the same global settings immediately.

The settings page exposes layout, maximum node width, spacing mode, branch colors, parent-to-child distance, horizontal hierarchy distance, and sibling distance.

Node text always wraps at the configured maximum width. Shorter nodes keep their natural compact width.

Enable **Compact branches** in the toolbar to keep parent-to-child gaps fixed within each branch. Disable it to align every depth into global columns.

Enable **Branch colors** in the toolbar to give each top-level branch its own node and connector color.

## Author

Created by [Chansocheat Tieng](https://github.com/Chansocheat-Tieng).
