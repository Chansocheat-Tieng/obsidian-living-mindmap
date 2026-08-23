const {
  ItemView,
  MarkdownRenderer,
  Menu,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  setIcon,
} = require("obsidian");

const VIEW_TYPE = "living-mindmap-view";

function primaryModifier(event) {
  return Platform.isMacOS ? event.metaKey : event.ctrlKey;
}

function isMobileRuntime() {
  return Boolean(Platform.isMobile || Platform.isMobileApp || document.body?.classList.contains("is-mobile"));
}

function shortcutLetter(event) {
  if (event.code === "KeyB") return "b";
  if (event.code === "KeyI") return "i";
  return event.key?.toLowerCase?.();
}

const DEFAULT_SETTINGS = {
  layout: "horizontal",
  direction: "right",
  nodeWidth: 280,
  horizontalGap: 110,
  verticalGap: 30,
  parentChildGap: 80,
  spacing: "level",
  branchColors: false,
};

function frontmatterEnd(lines) {
  if (lines[0]?.trim() !== "---") return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "---") return index + 1;
  }
  return 0;
}

function readMindmapProperties(markdown, defaults = DEFAULT_SETTINGS) {
  return {
    layout: defaults.layout === "vertical" ? "vertical" : "horizontal",
    direction: defaults.direction,
    wrap: true,
    nodeWidth: Math.max(120, Number(defaults.nodeWidth) || DEFAULT_SETTINGS.nodeWidth),
    spacing: defaults.spacing === "branch" ? "branch" : "level",
    branchColors: defaults.branchColors === true,
  };
}

function stripInlineMarkdown(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^(?:\[[ xX]\]\s*)/, "")
    .replace(/[*_~`]/g, "")
    .trim();
}

function parseMarkdownTree(markdown, fileName = "Mind map") {
  const lines = markdown.split("\n");
  const start = frontmatterEnd(lines);
  const root = {
    id: "root",
    text: fileName,
    rawText: fileName,
    kind: "root",
    line: -1,
    depth: 0,
    children: [],
  };
  const headingStack = [];
  const listStack = [];
  const flat = [root];
  let currentHeading = root;
  let serial = 0;

  for (let line = start; line < lines.length; line += 1) {
    const source = lines[line];
    const heading = source.match(/^(\s{0,3})(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/);
    if (heading) {
      const level = heading[2].length;
      while (headingStack.length && headingStack.at(-1).level >= level) headingStack.pop();
      const parent = headingStack.at(-1)?.node || root;
      const rawText = heading[3].trim();
      const node = {
        id: `node-${line}-${serial++}`,
        text: stripInlineMarkdown(rawText), rawText,
        kind: "heading", line, level, depth: parent.depth + 1,
        prefix: `${heading[1]}${heading[2]} `,
        children: [], parent,
      };
      parent.children.push(node);
      headingStack.push({ level, node });
      currentHeading = node;
      listStack.length = 0;
      flat.push(node);
      continue;
    }

    const list = source.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
    if (!list) continue;
    const indent = list[1].replace(/\t/g, "    ").length;
    while (listStack.length && listStack.at(-1).indent >= indent) listStack.pop();
    const parent = listStack.at(-1)?.node || currentHeading || root;
    const rawText = list[3].trim();
    const node = {
      id: `node-${line}-${serial++}`,
      text: stripInlineMarkdown(rawText), rawText,
      kind: "list", line, indent, marker: list[2],
      depth: parent.depth + 1,
      prefix: `${list[1]}${list[2]} `,
      children: [], parent,
    };
    parent.children.push(node);
    listStack.push({ indent, node });
    flat.push(node);
  }

  if (!root.children.length) {
    root.empty = true;
    root.text = "Double-click to create the first topic";
  } else if (root.children.length === 1 && root.children[0].kind === "heading") {
    const only = root.children[0];
    root.text = only.text;
    root.rawText = only.rawText;
    root.kind = only.kind;
    root.line = only.line;
    root.level = only.level;
    root.prefix = only.prefix;
    root.children = only.children;
    for (const child of root.children) child.parent = root;
    flat.splice(flat.indexOf(only), 1);
  }
  return { root, flat, lines };
}

function visibleTree(root, collapsed) {
  const nodes = [];
  const walk = (node, depth, parent = null) => {
    const entry = { ...node, depth, parent, children: [] };
    nodes.push(entry);
    if (!collapsed.has(node.id)) {
      entry.children = node.children.map((child) => walk(child, depth + 1, entry));
    }
    return entry;
  };
  return { root: walk(root, 0), nodes };
}

function assignLeafCoordinates(node, axis, leafGap, state) {
  if (!node.children.length) {
    node[axis] = state.next;
    state.next += leafGap;
    return node[axis];
  }
  const positions = node.children.map((child) => assignLeafCoordinates(child, axis, leafGap, state));
  node[axis] = (positions[0] + positions.at(-1)) / 2;
  return node[axis];
}

function layoutTree(root, options) {
  const { layout, direction, horizontalGap, verticalGap } = options;
  const boxWidth = options.wrap && options.nodeWidth !== "auto" ? options.nodeWidth : 220;
  const depthGap = boxWidth + horizontalGap;
  assignLeafCoordinates(root, "cross", 76 + verticalGap, { next: 0 });
  const all = [];
  const walk = (node, branch = 1) => {
    if (layout === "vertical") {
      node.x = node.cross;
      node.y = node.depth * 130 * (direction === "up" ? -1 : 1);
    } else {
      let side = direction === "left" ? -1 : 1;
      if (direction === "both" && node.depth > 0) side = branch;
      node.x = node.depth * depthGap * side;
      node.y = node.cross;
    }
    all.push(node);
    node.children.forEach((child, index) => {
      const childBranch = node.depth === 0 && direction === "both" ? (index % 2 ? -1 : 1) : branch;
      walk(child, childBranch);
    });
  };
  walk(root);
  return all;
}

function countLeaves(node) {
  return node.children.length ? node.children.reduce((sum, child) => sum + countLeaves(child), 0) : 1;
}

class EditableMindMapView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.file = null;
    this.markdown = "";
    this.tree = null;
    this.collapsed = new Set();
    this.selectedId = null;
    this.selectedIds = new Set();
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.renderToken = 0;
    this.loadSequence = 0;
    this.modifyTimer = null;
    this.undoStack = [];
    this.redoStack = [];
    this.mobileActions = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file ? `${this.file.basename} — Mindmap` : "Living Mindmap"; }
  getIcon() { return "brain-circuit"; }

  async onOpen() {
    this.contentEl.addClass("living-mindmap-view");
    this.contentEl.toggleClass("is-tablet-layout", Boolean(isMobileRuntime() && !Platform.isPhone));
    this.registerDomEvent(window, "keydown", (event) => {
      if (this.app.workspace.getActiveViewOfType(EditableMindMapView) !== this) return;
      if (!primaryModifier(event)) return;
      const editor = event.target?.closest?.(".emm-editor");
      const key = shortcutLetter(event);
      if (editor && ["b", "i"].includes(key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        this.handledFormatKey = key;
        this.toggleInlineFormat(editor, key === "b" ? "**" : "*");
        return;
      }
      if (editor) return;
      if (["b", "i"].includes(key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        this.handledFormatKey = key;
        this.formatSelectedNodes(key === "b" ? "**" : "*");
        return;
      }
      if (key === "z") {
        event.preventDefault(); event.stopImmediatePropagation();
        event.shiftKey ? this.redo() : this.undo();
      } else if (key === "y") {
        event.preventDefault(); event.stopImmediatePropagation(); this.redo();
      }
    }, { capture: true });
    this.registerDomEvent(window, "keyup", (event) => {
      if (!primaryModifier(event)) return;
      const key = shortcutLetter(event);
      if (!["b", "i"].includes(key)) return;
      if (this.handledFormatKey === key) { this.handledFormatKey = null; return; }
      if (this.app.workspace.getActiveViewOfType(EditableMindMapView) !== this) return;
      const editor = event.target?.closest?.(".emm-editor");
      event.preventDefault(); event.stopImmediatePropagation();
      if (editor) this.toggleInlineFormat(editor, key === "b" ? "**" : "*");
      else this.formatSelectedNodes(key === "b" ? "**" : "*");
    }, { capture: true });
    this.registerDomEvent(window, "beforeinput", (event) => {
      const editor = event.target?.closest?.(".emm-editor");
      if (!editor || this.app.workspace.getActiveViewOfType(EditableMindMapView) !== this) return;
      if (event.inputType !== "formatBold" && event.inputType !== "formatItalic") return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.toggleInlineFormat(editor, event.inputType === "formatBold" ? "**" : "*");
    }, { capture: true });
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (file?.extension === "md") this.loadFile(file);
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!this.file || file.path !== this.file.path) return;
      window.clearTimeout(this.modifyTimer);
      this.modifyTimer = window.setTimeout(() => this.loadFile(file, false), 60);
    }));
    const active = this.app.workspace.getActiveFile();
    if (active?.extension === "md") await this.loadFile(active);
    else this.renderEmpty();
  }

  async loadFile(file, fit = true) {
    const sequence = ++this.loadSequence;
    if (this.file?.path !== file.path) {
      this.undoStack.length = 0;
      this.redoStack.length = 0;
    }
    this.file = file;
    const markdown = await this.app.vault.read(file);
    if (sequence !== this.loadSequence) return;
    this.markdown = markdown;
    this.tree = parseMarkdownTree(this.markdown, file.basename);
    this.leaf.updateHeader();
    this.render(fit);
  }

  renderEmpty() {
    this.contentEl.empty();
    this.contentEl.createDiv({ cls: "living-mindmap-empty", text: "Open a Markdown note to view its mindmap." });
  }

  render(fit = false) {
    if (!this.tree || !this.file) return this.renderEmpty();
    const token = ++this.renderToken;
    this.contentEl.empty();
    const props = readMindmapProperties(this.markdown, this.plugin.settings);
    const shell = this.contentEl.createDiv({ cls: "emm-shell" });
    this.renderToolbar(shell, props);
    this.renderMobileActions(shell);
    const viewport = shell.createDiv({ cls: "emm-viewport", attr: { tabindex: "0" } });
    const canvas = viewport.createDiv({ cls: "emm-canvas" });
    canvas.toggleClass("is-horizontal-layout", props.layout === "horizontal");
    canvas.toggleClass("is-vertical-layout", props.layout === "vertical");
    const svg = canvas.createSvg("svg", { cls: "emm-edges" });
    const { root, nodes } = visibleTree(this.tree.root, this.collapsed);
    // Per-note properties must win over global plugin defaults.
    const laidOut = layoutTree(root, { ...this.plugin.settings, ...props });
    for (const node of laidOut) {
      let branch = node;
      while (branch.parent && branch.parent.id !== "root") branch = branch.parent;
      node.branchIndex = branch.parent?.id === "root" ? branch.parent.children.findIndex((child) => child.id === branch.id) : -1;
      node.branchColor = node.branchIndex >= 0 ? `hsl(${(node.branchIndex * 67 + 205) % 360} 62% 56%)` : null;
    }
    const nodeElements = new Map();
    const renderTasks = [];

    for (const node of laidOut) {
      const roleClass = node.id === "root"
        ? "is-title"
        : node.kind === "heading" ? `is-heading heading-level-${node.level || 2}` : "is-content";
      const el = canvas.createDiv({ cls: `emm-node ${roleClass}` });
      el.dataset.nodeId = node.id;
      const isSelected = this.selectedIds.has(node.id);
      if (isSelected) el.addClass("is-selected");
      el.setAttr("aria-selected", String(isSelected));
      el.addClass("is-wrapped");
      el.style.maxWidth = `${props.nodeWidth}px`;
      el.style.left = `${node.x}px`;
      el.style.top = `${node.y}px`;
      if (props.branchColors && node.branchColor) el.style.setProperty("--emm-branch-color", node.branchColor);
      const content = el.createDiv({ cls: "emm-node-content" });
      renderTasks.push(MarkdownRenderer.render(this.app, node.rawText || node.text, content, this.file.path, this).catch(() => {
        content.setText(node.text);
      }));
      if (node.children.length || this.collapsed.has(node.id)) {
        const toggle = el.createEl("button", { cls: "emm-collapse", text: this.collapsed.has(node.id) ? "+" : "−" });
        toggle.addEventListener("click", (event) => {
          event.stopPropagation();
          this.collapsed.has(node.id) ? this.collapsed.delete(node.id) : this.collapsed.add(node.id);
          this.render(false);
        });
      }
      let lastPointerWasTouch = false;
      let lastTouchTap = 0;
      el.addEventListener("pointerdown", (event) => {
        lastPointerWasTouch = event.pointerType === "touch" && !event.target.closest(".emm-collapse, .emm-editor");
      });
      el.addEventListener("click", (event) => {
        if (event.shiftKey) {
          this.selectedIds.has(node.id) ? this.selectedIds.delete(node.id) : this.selectedIds.add(node.id);
        } else {
          this.selectedIds.clear(); this.selectedIds.add(node.id);
        }
        this.selectedId = node.id;
        this.updateSelection(canvas); viewport.focus();
        if (lastPointerWasTouch) {
          const now = Date.now();
          if (now - lastTouchTap < 350) {
            lastTouchTap = 0;
            window.setTimeout(() => this.beginEdit(node, el), 0);
          } else lastTouchTap = now;
        }
        lastPointerWasTouch = false;
      });
      el.addEventListener("dblclick", (event) => { event.preventDefault(); this.beginEdit(node, el); });
      el.addEventListener("contextmenu", (event) => {
        if (node.id === "root") return;
        event.preventDefault();
        const menu = new Menu();
        if (node.kind === "heading") {
          menu.addItem((item) => item.setTitle("Make item non-header").setIcon("list").onClick(() => this.setNodeHeader(node, false)));
        } else {
          menu.addItem((item) => item.setTitle("Make item a header").setIcon("heading").onClick(() => this.setNodeHeader(node, true)));
        }
        menu.showAtMouseEvent(event);
      });
      if (node.id !== "root") {
        el.draggable = true;
        el.addEventListener("dragstart", (event) => {
          if (!this.selectedIds.has(node.id)) {
            this.selectedIds.clear(); this.selectedIds.add(node.id); this.selectedId = node.id;
            this.updateSelection(canvas);
          }
          this.draggedNodeId = node.id;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.id);
          requestAnimationFrame(() => el.addClass("is-dragging"));
        });
        el.addEventListener("dragend", () => {
          this.draggedNodeId = null;
          canvas.querySelectorAll(".emm-node").forEach((item) => item.removeClass("is-dragging", "drop-before", "drop-child", "drop-after"));
        });
      }
      el.addEventListener("dragover", (event) => {
        if (!this.draggedNodeId || this.draggedNodeId === node.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        this.showDropZone(el, event, props.layout);
      });
      el.addEventListener("dragleave", (event) => {
        if (!el.contains(event.relatedTarget)) el.removeClass("drop-before", "drop-child", "drop-after");
      });
      el.addEventListener("drop", (event) => {
        event.preventDefault(); event.stopPropagation();
        const sourceId = this.draggedNodeId || event.dataTransfer.getData("text/plain");
        const mode = this.dropMode(el, event, props.layout);
        el.removeClass("drop-before", "drop-child", "drop-after");
        if (sourceId && sourceId !== node.id) this.moveNodes([...this.selectedIds], node.id, mode);
      });
      nodeElements.set(node.id, el);
    }

    Promise.all(renderTasks).then(() => requestAnimationFrame(() => {
        if (token !== this.renderToken) return;
        if (props.layout === "horizontal") {
          if (props.spacing === "branch") this.alignHorizontalBranches(laidOut, nodeElements);
          else this.alignHorizontalLevels(laidOut, nodeElements, "right");
        } else if (props.layout === "vertical") {
          this.alignVerticalLayout(laidOut, nodeElements, props.spacing);
        }
        this.drawEdges(svg, laidOut, nodeElements, props.layout, props.branchColors);
        if (fit) this.fitView(viewport, canvas, laidOut, nodeElements);
        else this.applyTransform(canvas);
      }));
    this.bindViewport(viewport, canvas);
    viewport.addEventListener("keydown", (event) => this.handleKeydown(event, nodes, nodeElements));
  }

  renderToolbar(shell, props) {
    const toolbar = shell.createDiv({ cls: "emm-toolbar" });
    const button = (icon, title, action) => {
      const el = toolbar.createEl("button", { cls: "emm-tool", attr: { "aria-label": title } });
      setIcon(el, icon); el.addEventListener("click", action); return el;
    };
    button("maximize", "Fit map", () => this.render(true));
    const collapsible = this.tree.flat.filter((node) => node.children.length);
    const allCollapsed = collapsible.length > 0 && collapsible.every((node) => this.collapsed.has(node.id));
    button(allCollapsed ? "unfold-horizontal" : "fold-horizontal", allCollapsed ? "Expand all branches" : "Collapse all branches", () => {
      if (allCollapsed) this.collapsed.clear();
      else collapsible.forEach((node) => this.collapsed.add(node.id));
      this.render(true);
    });
    const spacing = button("git-branch", props.spacing === "branch" ? "Compact branches: on" : "Compact branches: off", () => {
      this.updateSetting("spacing", props.spacing === "branch" ? "level" : "branch");
    });
    spacing.toggleClass("is-active", props.spacing === "branch");
    spacing.setAttr("aria-pressed", String(props.spacing === "branch"));
    const colors = button("palette", props.branchColors ? "Branch colors: on" : "Branch colors: off", () => {
      this.updateSetting("branchColors", !props.branchColors);
    });
    colors.toggleClass("is-active", props.branchColors);
    colors.setAttr("aria-pressed", String(props.branchColors));
    const nextLayout = props.layout === "horizontal" ? "vertical" : "horizontal";
    button(
      props.layout === "horizontal" ? "arrow-right" : "arrow-down",
      `Layout: ${props.layout === "horizontal" ? "Horizontal" : "Vertical"}. Click for ${nextLayout}.`,
      () => this.updateSetting("layout", nextLayout),
    );
    const dimensions = button("sliders-horizontal", "Dimensions", (event) => {
      event.stopPropagation();
      sliderMenu.hidden = !sliderMenu.hidden;
      dimensions.toggleClass("is-active", !sliderMenu.hidden);
    });
    const sliderMenu = toolbar.createDiv({ cls: "emm-slider-menu" });
    sliderMenu.hidden = true;
    sliderMenu.addEventListener("click", (event) => event.stopPropagation());
    const addSlider = (label, key, value, min, max, step) => {
      const row = sliderMenu.createEl("label", { cls: "emm-slider-row" });
      const heading = row.createDiv({ cls: "emm-slider-heading" });
      heading.createSpan({ text: label });
      const output = heading.createSpan({ cls: "emm-slider-value", text: `${value}px` });
      const input = row.createEl("input", { type: "range", attr: { min, max, step, "aria-label": label } });
      input.value = String(value);
      input.addEventListener("input", () => output.setText(`${input.value}px`));
      input.addEventListener("change", () => this.updateSetting(key, Number(input.value)));
    };
    addSlider("Maximum node width", "nodeWidth", props.nodeWidth, 140, 600, 10);
    addSlider("Horizontal hierarchy gap", "horizontalGap", this.plugin.settings.horizontalGap, 40, 240, 5);
    addSlider("Vertical hierarchy gap", "parentChildGap", this.plugin.settings.parentChildGap, 30, 180, 5);
    addSlider("Sibling gap", "verticalGap", this.plugin.settings.verticalGap, 10, 120, 5);
  }

  renderMobileActions(shell) {
    const actions = shell.createDiv({ cls: "emm-mobile-actions", attr: { "aria-label": "Selected node actions" } });
    const button = (icon, title, action, cls = "") => {
      const el = actions.createEl("button", { cls: `emm-mobile-action ${cls}`, attr: { "aria-label": title, title } });
      setIcon(el, icon);
      el.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); action(); });
      return el;
    };
    button("pencil", "Edit", () => this.editSelectedNode());
    button("list-tree", "Add child", () => this.addFromMobile(true));
    button("list-plus", "Add sibling", () => this.addFromMobile(false));
    button("trash-2", "Delete", () => this.deleteFromMobile(), "is-danger");
    button("undo-2", "Undo", () => this.undo());
    button("redo-2", "Redo", () => this.redo());
    this.mobileActions = actions;
    this.updateMobileActions();
  }

  selectedNode() {
    return this.tree?.flat.find((node) => node.id === this.selectedId) || null;
  }

  editSelectedNode() {
    const node = this.selectedNode();
    const element = this.contentEl.querySelector(`.emm-node[data-node-id="${node?.id || ""}"]`);
    if (node && element) this.beginEdit(node, element);
  }

  async addFromMobile(child) {
    const node = this.selectedNode();
    if (!node) return;
    await this.insertRelative(node, child);
    requestAnimationFrame(() => this.editSelectedNode());
  }

  async deleteFromMobile() {
    const roots = this.selectedRoots();
    if (!roots.length) return;
    const descendants = roots.reduce((total, node) => total + Math.max(0, this.subtreeNodeCount(node) - 1), 0);
    if (descendants > 0 && !window.confirm(`Delete ${roots.length === 1 ? "this node" : `${roots.length} nodes`} and ${descendants} descendant${descendants === 1 ? "" : "s"}?`)) return;
    await this.deleteSelectedNodes();
    new Notice("Node deleted. Use Undo to restore it.");
  }

  subtreeNodeCount(node) {
    return 1 + (node.children || []).reduce((sum, child) => sum + this.subtreeNodeCount(child), 0);
  }

  updateMobileActions() {
    if (!this.mobileActions) return;
    const node = this.selectedNode();
    this.mobileActions.toggleClass("is-visible", Boolean(node));
    const sibling = this.mobileActions.querySelector('[aria-label="Add sibling"]');
    const remove = this.mobileActions.querySelector('[aria-label="Delete"]');
    const undo = this.mobileActions.querySelector('[aria-label="Undo"]');
    const redo = this.mobileActions.querySelector('[aria-label="Redo"]');
    if (sibling) sibling.disabled = !node || node.id === "root";
    if (remove) remove.disabled = !node || node.id === "root";
    if (undo) undo.disabled = this.undoStack.length === 0;
    if (redo) redo.disabled = this.redoStack.length === 0;
  }

  async onClose() {
    window.clearTimeout(this.modifyTimer);
    this.loadSequence += 1;
  }

  alignHorizontalLevels(nodes, elements, direction) {
    const widths = new Map();
    const maxDepth = Math.max(...nodes.map((node) => node.depth));
    for (const node of nodes) {
      const width = elements.get(node.id)?.getBoundingClientRect().width || 0;
      widths.set(node.depth, Math.max(widths.get(node.depth) || 0, width));
    }
    const right = [0];
    const left = [0];
    for (let depth = 1; depth <= maxDepth; depth += 1) {
      right[depth] = right[depth - 1] + (widths.get(depth - 1) || 0) + this.plugin.settings.horizontalGap;
      left[depth] = left[depth - 1] - (widths.get(depth) || 0) - this.plugin.settings.horizontalGap;
    }
    for (const node of nodes) {
      let x = direction === "right" ? right[node.depth] : left[node.depth];
      if (direction === "both" && node.depth > 0) {
        let branch = node;
        while (branch.parent && branch.parent.depth > 0) branch = branch.parent;
        const rootIndex = branch.parent?.children.findIndex((child) => child.id === branch.id) || 0;
        x = rootIndex % 2 ? left[node.depth] : right[node.depth];
      }
      node.x = x;
      const element = elements.get(node.id);
      if (element) element.style.left = `${x}px`;
    }
  }

  alignHorizontalBranches(nodes, elements) {
    const byDepth = [...nodes].sort((a, b) => a.depth - b.depth);
    const widths = new Map(nodes.map((node) => [node.id, elements.get(node.id)?.getBoundingClientRect().width || 0]));
    for (const node of byDepth) {
      node.x = node.parent
        ? node.parent.x + (widths.get(node.parent.id) || 0) + this.plugin.settings.horizontalGap
        : 0;
      const element = elements.get(node.id);
      if (element) element.style.left = `${node.x}px`;
    }
  }

  alignVerticalLayout(nodes, elements, spacingMode = "level") {
    const root = nodes.find((node) => !node.parent);
    if (!root) return;
    const siblingGap = Math.max(24, this.plugin.settings.verticalGap);
    const rowGap = this.plugin.settings.parentChildGap;
    const widths = new Map();
    const heights = new Map();
    const rowHeights = new Map();
    for (const node of nodes) {
      const rect = elements.get(node.id)?.getBoundingClientRect();
      widths.set(node.id, rect?.width || 80);
      heights.set(node.id, rect?.height || 38);
      rowHeights.set(node.depth, Math.max(rowHeights.get(node.depth) || 0, rect?.height || 38));
    }

    const subtreeWidths = new Map();
    const measure = (node) => {
      const childrenWidth = node.children.reduce((sum, child, index) =>
        sum + measure(child) + (index ? siblingGap : 0), 0);
      const width = Math.max(widths.get(node.id) || 0, childrenWidth);
      subtreeWidths.set(node.id, width);
      return width;
    };
    measure(root);

    const rowTops = [0];
    const maxDepth = Math.max(...nodes.map((node) => node.depth));
    for (let depth = 1; depth <= maxDepth; depth += 1) {
      rowTops[depth] = rowTops[depth - 1] + (rowHeights.get(depth - 1) || 38) + rowGap;
    }

    const place = (node, left, localTop = 0) => {
      const subtreeWidth = subtreeWidths.get(node.id);
      node.x = left + subtreeWidth / 2;
      node.y = spacingMode === "branch" ? localTop : rowTops[node.depth];
      const element = elements.get(node.id);
      if (element) { element.style.left = `${node.x}px`; element.style.top = `${node.y}px`; }
      const totalChildrenWidth = node.children.reduce((sum, child, index) =>
        sum + subtreeWidths.get(child.id) + (index ? siblingGap : 0), 0);
      let childLeft = left + (subtreeWidth - totalChildrenWidth) / 2;
      const childTop = node.y + (heights.get(node.id) || 38) + rowGap;
      for (const child of node.children) {
        place(child, childLeft, childTop);
        childLeft += subtreeWidths.get(child.id) + siblingGap;
      }
    };
    place(root, -subtreeWidths.get(root.id) / 2);
  }

  drawEdges(svg, nodes, elements, layout, branchColors) {
    const canvasRect = svg.parentElement.getBoundingClientRect();
    svg.setAttrs({ width: "100%", height: "100%", viewBox: "-5000 -5000 10000 10000" });
    // SVG uses paint order: later paths appear on top. Use geometric distance,
    // rather than depth alone, so overlapping sibling connectors near the title
    // are also painted from farthest (behind) to nearest (in front).
    const title = nodes.find((node) => !node.parent) || { x: 0, y: 0 };
    const distanceFromTitle = (node) => Math.hypot(node.x - title.x, node.y - title.y);
    const edgeNodes = nodes.filter((node) => node.parent).sort((a, b) =>
      distanceFromTitle(b) - distanceFromTitle(a) || b.depth - a.depth);
    for (const node of edgeNodes) {
      const parentEl = elements.get(node.parent.id);
      const nodeEl = elements.get(node.id);
      if (!parentEl || !nodeEl) continue;
      const a = parentEl.getBoundingClientRect();
      const b = nodeEl.getBoundingClientRect();
      const horizontal = layout === "horizontal"
        ? true
        : layout === "vertical" ? false : Math.abs(node.x - node.parent.x) >= Math.abs(node.y - node.parent.y);
      const childIsRight = node.x >= node.parent.x;
      const childIsBelow = node.y >= node.parent.y;
      const x1 = a.left - canvasRect.left + (horizontal ? (childIsRight ? a.width : 0) : a.width / 2);
      const y1 = a.top - canvasRect.top + (horizontal ? a.height / 2 : (childIsBelow ? a.height : 0));
      const x2 = b.left - canvasRect.left + (horizontal ? (childIsRight ? 0 : b.width) : b.width / 2);
      const y2 = b.top - canvasRect.top + (horizontal ? b.height / 2 : (childIsBelow ? 0 : b.height));
      // Bracket-like orthogonal connectors are easier to scan than long Bézier curves.
      const path = horizontal
        ? orthogonalPath(x1, y1, x2, y2, true)
        : orthogonalPath(x1, y1, x2, y2, false);
      const edge = svg.createSvg("path", { attr: { d: path, class: "emm-edge" } });
      if (branchColors && node.branchColor) edge.style.stroke = node.branchColor;
    }
  }

  bindViewport(viewport, canvas) {
    let panning = false, selecting = false, startX = 0, startY = 0, originX = 0, originY = 0, marquee = null;
    const touches = new Map();
    let pinchDistance = 0, pinchScale = 1, pinchPanX = 0, pinchPanY = 0, pinchCenterX = 0, pinchCenterY = 0;
    viewport.addEventListener("contextmenu", (event) => {
      if (!event.target.closest(".emm-node, .emm-toolbar")) event.preventDefault();
    });
    // Keep horizontal map gestures inside the view instead of opening Obsidian's mobile sidebars.
    viewport.addEventListener("touchstart", (event) => {
      if (!event.target.closest(".emm-editor")) event.stopPropagation();
    }, { passive: true });
    viewport.addEventListener("touchmove", (event) => {
      if (event.target.closest(".emm-editor")) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });
    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        viewport.setPointerCapture(event.pointerId);
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          const rect = viewport.getBoundingClientRect();
          pinchDistance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          pinchScale = this.scale; pinchPanX = this.panX; pinchPanY = this.panY;
          pinchCenterX = (a.x + b.x) / 2 - rect.left - rect.width / 2;
          pinchCenterY = (a.y + b.y) / 2 - rect.top - rect.height / 2;
          panning = false;
        }
        if (event.target.closest(".emm-node, .emm-toolbar, .emm-mobile-actions, .emm-mobile-edit-actions")) return;
      } else if (event.target.closest(".emm-node, .emm-toolbar, .emm-mobile-actions, .emm-mobile-edit-actions")) return;
      startX = event.clientX; startY = event.clientY;
      if (event.pointerType === "touch" || event.button === 2) {
        panning = true; originX = this.panX; originY = this.panY;
        viewport.addClass("is-panning");
      } else if (event.button === 0) {
        selecting = true;
        if (!event.shiftKey) this.selectedIds.clear();
        marquee = viewport.createDiv({ cls: "emm-selection-rectangle" });
        marquee.style.left = `${event.offsetX}px`; marquee.style.top = `${event.offsetY}px`;
      } else return;
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" && touches.has(event.pointerId)) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size >= 2) {
          const [a, b] = [...touches.values()];
          const rect = viewport.getBoundingClientRect();
          const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const centerX = (a.x + b.x) / 2 - rect.left - rect.width / 2;
          const centerY = (a.y + b.y) / 2 - rect.top - rect.height / 2;
          const nextScale = Math.min(2.5, Math.max(0.25, pinchScale * distance / pinchDistance));
          const ratio = nextScale / pinchScale;
          this.panX = centerX - pinchCenterX + pinchCenterX - (pinchCenterX - pinchPanX) * ratio;
          this.panY = centerY - pinchCenterY + pinchCenterY - (pinchCenterY - pinchPanY) * ratio;
          this.scale = nextScale;
          this.applyTransform(canvas);
          return;
        }
      }
      if (panning) {
        this.panX = originX + event.clientX - startX;
        this.panY = originY + event.clientY - startY;
        this.applyTransform(canvas);
      } else if (selecting && marquee) {
        const rect = viewport.getBoundingClientRect();
        const x1 = startX - rect.left, y1 = startY - rect.top;
        const x2 = event.clientX - rect.left, y2 = event.clientY - rect.top;
        marquee.style.left = `${Math.min(x1, x2)}px`; marquee.style.top = `${Math.min(y1, y2)}px`;
        marquee.style.width = `${Math.abs(x2 - x1)}px`; marquee.style.height = `${Math.abs(y2 - y1)}px`;
      }
    });
    const stop = (event) => {
      if (event?.pointerType === "touch") touches.delete(event.pointerId);
      if (selecting && marquee) {
        const selectionRect = marquee.getBoundingClientRect();
        canvas.querySelectorAll(".emm-node").forEach((element) => {
          const rect = element.getBoundingClientRect();
          const intersects = rect.left < selectionRect.right && rect.right > selectionRect.left
            && rect.top < selectionRect.bottom && rect.bottom > selectionRect.top;
          if (intersects) this.selectedIds.add(element.dataset.nodeId);
        });
        this.selectedId = [...this.selectedIds].at(-1) || null;
        this.updateSelection(canvas); marquee.remove(); marquee = null;
      }
      panning = false; selecting = false; viewport.removeClass("is-panning");
      if (touches.size < 2) pinchDistance = 0;
    };
    viewport.addEventListener("pointerup", stop);
    viewport.addEventListener("pointercancel", stop);
    viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.scale = Math.min(2.5, Math.max(0.25, this.scale * (event.deltaY > 0 ? 0.9 : 1.1)));
      this.applyTransform(canvas);
    }, { passive: false });
  }

  applyTransform(canvas) {
    canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
  }

  fitView(viewport, canvas, nodes, elements) {
    if (!nodes.length) return;
    const rects = nodes.map((node) => elements.get(node.id)?.getBoundingClientRect()).filter(Boolean);
    const minX = Math.min(...rects.map((r) => r.left));
    const maxX = Math.max(...rects.map((r) => r.right));
    const minY = Math.min(...rects.map((r) => r.top));
    const maxY = Math.max(...rects.map((r) => r.bottom));
    const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY);
    this.scale = Math.min(1.25, Math.max(0.25, Math.min((viewport.clientWidth - 100) / width, (viewport.clientHeight - 100) / height)));
    const viewportRect = viewport.getBoundingClientRect();
    const viewportCenterX = viewportRect.left + viewportRect.width / 2;
    const viewportCenterY = viewportRect.top + viewportRect.height / 2;
    this.panX = (viewportCenterX - (minX + maxX) / 2) * this.scale;
    this.panY = (viewportCenterY - (minY + maxY) / 2) * this.scale;
    this.applyTransform(canvas);
  }

  updateSelection(canvas) {
    canvas.querySelectorAll(".emm-node").forEach((el) => {
      const isSelected = this.selectedIds.has(el.dataset.nodeId);
      el.toggleClass("is-selected", isSelected);
      el.setAttr("aria-selected", String(isSelected));
    });
    this.updateMobileActions();
  }

  dropMode(element, event, layout) {
    const rect = element.getBoundingClientRect();
    const ratio = layout === "vertical"
      ? (event.clientX - rect.left) / Math.max(1, rect.width)
      : (event.clientY - rect.top) / Math.max(1, rect.height);
    return ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "child";
  }

  showDropZone(element, event, layout) {
    const mode = this.dropMode(element, event, layout);
    element.removeClass("drop-before", "drop-child", "drop-after");
    element.addClass(`drop-${mode}`);
  }

  async beginEdit(node, element) {
    if (node.empty) return this.createFirstTopic();
    if (!element || element.hasClass("is-editing")) return;
    const shell = this.contentEl.querySelector(".emm-shell");
    shell?.addClass("is-editing-node");
    element.addClass("is-editing");
    const input = element.createEl("textarea", { cls: "emm-editor" });
    input.value = node.rawText || node.text;
    input.rows = 1;
    input.focus(); input.select();
    const editActions = this.contentEl.querySelector(".emm-shell")?.createDiv({ cls: "emm-mobile-edit-actions" });
    let toolbarInteractionUntil = 0;
    const preserveEditorForToolbar = (event) => {
      toolbarInteractionUntil = Date.now() + 700;
      event.preventDefault();
    };
    editActions?.addEventListener("touchstart", preserveEditorForToolbar, { capture: true, passive: false });
    editActions?.addEventListener("pointerdown", preserveEditorForToolbar, { capture: true });
    const editButton = (label, icon, action) => {
      const button = editActions?.createEl("button", { cls: "emm-mobile-edit-action", attr: { "aria-label": label, title: label, type: "button", tabindex: "-1" } });
      if (button) {
        setIcon(button, icon);
        let lastActivation = 0;
        const activate = (event) => {
          event.preventDefault();
          event.stopPropagation();
          const now = Date.now();
          if (now - lastActivation < 400) return;
          lastActivation = now;
          toolbarInteractionUntil = now + 700;
          action();
          if (input.isConnected) input.focus({ preventScroll: true });
        };
        // Mobile browsers blur the textarea before dispatching click. Run the
        // action at gesture start and suppress the later synthetic click.
        button.addEventListener("touchstart", activate, { passive: false });
        button.addEventListener("pointerdown", activate);
        button.addEventListener("click", activate);
      }
    };
    let done = false;
    const commit = async (createMode = null) => {
      if (done) return; done = true;
      const value = input.value.trim();
      shell?.removeClass("is-editing-node");
      element.removeClass("is-editing");
      input.remove();
      editActions?.remove();
      if (!value && !node.children.length) await this.deleteNode(node);
      else if (value && value !== node.rawText) await this.renameNode(node, value);
      if (createMode && value) await this.insertRelative(node, createMode === "child");
    };
    editButton("Bold", "bold", () => this.toggleInlineFormat(input, "**"));
    editButton("Italic", "italic", () => this.toggleInlineFormat(input, "*"));
    editButton("Add child", "list-tree", () => commit("child"));
    editButton("Add sibling", "list-plus", () => commit("sibling"));
    editButton("Done", "check", () => commit());
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (primaryModifier(event) && ["b", "i"].includes(shortcutLetter(event))) {
        event.preventDefault();
        this.toggleInlineFormat(input, shortcutLetter(event) === "b" ? "**" : "*");
        return;
      }
      if (primaryModifier(event) && event.key.toLowerCase() === "z") {
        event.preventDefault(); done = true; element.removeClass("is-editing"); input.remove();
        event.shiftKey ? this.redo() : this.undo(); return;
      }
      if (primaryModifier(event) && event.key.toLowerCase() === "y") {
        event.preventDefault(); done = true; element.removeClass("is-editing"); input.remove();
        this.redo(); return;
      }
      if (event.key === "Enter") { event.preventDefault(); commit(event.shiftKey ? "sibling" : null); }
      if (event.key === "Tab") { event.preventDefault(); commit(event.shiftKey ? "child" : null); }
      if (event.key === "Escape") { done = true; shell?.removeClass("is-editing-node"); element.removeClass("is-editing"); input.remove(); editActions?.remove(); }
    });
    // Keep node selection and canvas panning handlers from capturing text-edit gestures.
    ["pointerdown", "pointermove", "pointerup", "click", "dblclick"].forEach((type) => {
      input.addEventListener(type, (event) => event.stopPropagation());
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (done) return;
        // Mobile focus transitions are inconsistent and can happen before a
        // toolbar click. Keep the editor alive until an explicit action ends it.
        if (isMobileRuntime() || Date.now() < toolbarInteractionUntil) {
          input.focus({ preventScroll: true });
          return;
        }
        commit();
      }, 0);
    });
  }

  toggleInlineFormat(input, marker) {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const value = input.value;
    const selected = value.slice(start, end);
    const selectionIsWrapped = selected.startsWith(marker)
      && selected.endsWith(marker)
      && selected.length >= marker.length * 2;
    if (selectionIsWrapped) {
      const unwrapped = selected.slice(marker.length, -marker.length);
      input.value = value.slice(0, start) + unwrapped + value.slice(end);
      input.setSelectionRange(start, start + unwrapped.length);
      return;
    }
    const wrapped = value.slice(Math.max(0, start - marker.length), start) === marker
      && value.slice(end, end + marker.length) === marker;
    if (wrapped) {
      input.value = value.slice(0, start - marker.length) + selected + value.slice(end + marker.length);
      input.setSelectionRange(start - marker.length, end - marker.length);
    } else {
      input.value = value.slice(0, start) + marker + selected + marker + value.slice(end);
      input.setSelectionRange(start + marker.length, end + marker.length);
    }
  }

  async renameNode(node, value) {
    const lines = this.markdown.split("\n");
    if (node.line < 0 || node.line >= lines.length) return;
    lines[node.line] = `${node.prefix}${value}`;
    await this.writeMarkdown(lines.join("\n"));
  }

  async createFirstTopic() {
    const lines = this.markdown.split("\n");
    const insertAt = frontmatterEnd(lines);
    lines.splice(insertAt, 0, "# Main topic", "");
    await this.writeMarkdown(lines.join("\n"));
  }

  async insertRelative(node, child) {
    if (!node || node.empty) return this.createFirstTopic();
    const sourceNode = this.tree.flat.find((item) => item.id === node.id) || node;
    const lines = this.markdown.split("\n");
    let insertAt = sourceNode.line + 1;
    if (!child) {
      const following = this.tree.flat.filter((item) => item.line > sourceNode.line && item.depth <= sourceNode.depth);
      insertAt = following.length ? Math.min(...following.map((item) => item.line)) : lines.length;
    }
    let source;
    if (sourceNode.kind === "list") {
      const indent = " ".repeat(sourceNode.indent + (child ? 2 : 0));
      source = `${indent}- New topic`;
    } else if (child && sourceNode.level < 6) source = `${"#".repeat(sourceNode.level + 1)} New topic`;
    else if (!child) source = `${"#".repeat(sourceNode.level)} New topic`;
    else source = "- New topic";
    lines.splice(insertAt, 0, source);
    await this.writeMarkdown(lines.join("\n"));
    const created = this.tree.flat.find((item) => item.line === insertAt);
    if (created) this.selectedId = created.id;
  }

  async indentNode(node, outdent) {
    if (node.kind !== "list") return new Notice("Indent and outdent currently apply to list nodes.");
    const lines = this.markdown.split("\n");
    if (outdent) lines[node.line] = lines[node.line].replace(/^ {1,2}/, "");
    else lines[node.line] = `  ${lines[node.line]}`;
    await this.writeMarkdown(lines.join("\n"));
  }

  async deleteNode(node) {
    const sourceNode = this.tree.flat.find((item) => item.id === node?.id) || node;
    if (!sourceNode || sourceNode.line < 0) return;
    const lines = this.markdown.split("\n");
    const next = this.tree.flat
      .filter((item) => item.line > sourceNode.line && item.depth <= sourceNode.depth)
      .sort((a, b) => a.line - b.line)[0];
    const end = next ? next.line : lines.length;
    lines.splice(sourceNode.line, end - sourceNode.line);
    this.selectedIds.clear(); this.selectedId = null;
    await this.writeMarkdown(lines.join("\n"));
  }

  selectedRoots(ids = [...this.selectedIds]) {
    const selected = new Set(ids);
    return this.tree.flat.filter((node) => {
      if (!selected.has(node.id)) return false;
      let parent = node.parent;
      while (parent) {
        if (selected.has(parent.id)) return false;
        parent = parent.parent;
      }
      return true;
    });
  }

  async deleteSelectedNodes() {
    const bounds = this.selectedRoots().map((node) => this.subtreeBounds(node)).filter(Boolean)
      .sort((a, b) => b.start - a.start);
    if (!bounds.length) return;
    const lines = this.markdown.split("\n");
    for (const range of bounds) lines.splice(range.start, range.end - range.start);
    this.selectedIds.clear(); this.selectedId = null;
    await this.writeMarkdown(lines.join("\n"));
  }

  async formatSelectedNodes(marker) {
    const selected = this.tree.flat.filter((node) => this.selectedIds.has(node.id) && node.line >= 0);
    if (!selected.length) return;
    const lines = this.markdown.split("\n");
    for (const node of selected) {
      const raw = node.rawText || node.text;
      const formatted = raw.startsWith(marker) && raw.endsWith(marker) && raw.length >= marker.length * 2
        ? raw.slice(marker.length, -marker.length)
        : `${marker}${raw}${marker}`;
      lines[node.line] = `${node.prefix}${formatted}`;
    }
    await this.writeMarkdown(lines.join("\n"));
  }

  subtreeBounds(node) {
    const sourceNode = this.tree.flat.find((item) => item.id === node?.id) || node;
    if (!sourceNode || sourceNode.line < 0) return null;
    const next = this.tree.flat
      .filter((item) => item.line > sourceNode.line && item.depth <= sourceNode.depth)
      .sort((a, b) => a.line - b.line)[0];
    return { node: sourceNode, start: sourceNode.line, end: next ? next.line : this.markdown.split("\n").length };
  }

  async moveNode(sourceId, targetId, mode) {
    const source = this.tree.flat.find((node) => node.id === sourceId);
    const target = this.tree.flat.find((node) => node.id === targetId);
    const bounds = this.subtreeBounds(source);
    if (!source || !target || !bounds) return;
    if (target.line >= bounds.start && target.line < bounds.end) {
      new Notice("A node cannot be moved inside its own branch."); return;
    }
    if (target.id === "root" && mode !== "child") mode = "child";
    if (mode !== "child" && source.kind !== target.kind) {
      new Notice("Reordering requires nodes of the same Markdown type. Drop in the center to make it a child."); return;
    }

    let desiredLevel = source.level;
    let desiredIndent = source.indent;
    if (source.kind === "heading") {
      if (target.kind !== "heading" && target.kind !== "root") {
        new Notice("A heading can only be moved relative to another heading."); return;
      }
      desiredLevel = target.kind === "root"
        ? 1
        : mode === "child" ? Math.min(6, target.level + 1) : target.level;
    } else if (source.kind === "list") {
      if (mode === "child") desiredIndent = target.kind === "list" ? target.indent + 2 : 0;
      else desiredIndent = target.indent;
    }

    const lines = this.markdown.split("\n");
    const block = lines.slice(bounds.start, bounds.end);
    if (source.kind === "heading") {
      const delta = desiredLevel - source.level;
      for (let index = 0; index < block.length; index += 1) {
        block[index] = block[index].replace(/^(\s{0,3})(#{1,6})(\s+)/, (match, spaces, hashes, gap) => {
          const level = Math.max(1, Math.min(6, hashes.length + delta));
          return `${spaces}${"#".repeat(level)}${gap}`;
        });
      }
    } else {
      const delta = desiredIndent - source.indent;
      for (let index = 0; index < block.length; index += 1) {
        block[index] = block[index].replace(/^(\s*)(?=[-+*]|\d+[.)]\s)/, (indent) => {
          const width = Math.max(0, indent.replace(/\t/g, "    ").length + delta);
          return " ".repeat(width);
        });
      }
    }

    let insertion;
    if (mode === "before") insertion = target.line;
    else if (mode === "child") {
      insertion = target.line < 0
        ? frontmatterEnd(lines)
        : this.subtreeBounds(target)?.end ?? target.line + 1;
    }
    else insertion = this.subtreeBounds(target)?.end ?? target.line + 1;
    lines.splice(bounds.start, bounds.end - bounds.start);
    if (bounds.start < insertion) insertion -= bounds.end - bounds.start;
    lines.splice(insertion, 0, ...block);
    this.selectedIds.clear(); this.selectedId = null;
    await this.writeMarkdown(lines.join("\n"));
  }

  async moveNodes(sourceIds, targetId, mode) {
    const movableIds = sourceIds.filter((id) => id !== "root");
    const sources = this.selectedRoots(movableIds).sort((a, b) => a.line - b.line);
    if (sources.length <= 1) return this.moveNode(sources[0]?.id || sourceIds[0], targetId, mode);
    const target = this.tree.flat.find((node) => node.id === targetId);
    if (!target) return;
    const parentIds = new Set(sources.map((node) => node.parent?.id || "root"));
    const kinds = new Set(sources.map((node) => node.kind));
    if (parentIds.size > 1 || kinds.size > 1) {
      new Notice("Move multiple nodes together by selecting siblings of the same type."); return;
    }
    const ranges = sources.map((node) => this.subtreeBounds(node));
    if (ranges.some((range) => target.line >= range.start && target.line < range.end)) {
      new Notice("Selected branches cannot be moved inside themselves."); return;
    }
    if (target.id === "root" && mode !== "child") mode = "child";
    if (mode !== "child" && sources[0].kind !== target.kind) {
      new Notice("Reordering requires nodes of the same Markdown type."); return;
    }
    if (sources[0].kind === "heading" && target.kind !== "heading" && target.kind !== "root") {
      new Notice("Headings can only be moved relative to another heading."); return;
    }

    const lines = this.markdown.split("\n");
    const blocks = ranges.map((range, index) => {
      const source = sources[index];
      const block = lines.slice(range.start, range.end);
      if (source.kind === "heading") {
        const desired = target.kind === "root" ? 1 : mode === "child" ? Math.min(6, target.level + 1) : target.level;
        const delta = desired - source.level;
        return block.map((line) => line.replace(/^(\s{0,3})(#{1,6})(\s+)/, (match, spaces, hashes, gap) =>
          `${spaces}${"#".repeat(Math.max(1, Math.min(6, hashes.length + delta)))}${gap}`));
      }
      const desired = mode === "child" ? (target.kind === "list" ? target.indent + 2 : 0) : target.indent;
      const delta = desired - source.indent;
      return block.map((line) => line.replace(/^(\s*)(?=[-+*]|\d+[.)]\s)/, (indent) =>
        " ".repeat(Math.max(0, indent.replace(/\t/g, "    ").length + delta))));
    });

    let insertion = mode === "before" ? target.line
      : mode === "child"
        ? (target.line < 0 ? frontmatterEnd(lines) : this.subtreeBounds(target)?.end ?? target.line + 1)
        : this.subtreeBounds(target)?.end ?? target.line + 1;
    for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
      lines.splice(range.start, range.end - range.start);
      if (range.start < insertion) insertion -= range.end - range.start;
    }
    lines.splice(insertion, 0, ...blocks.flat());
    this.selectedIds.clear(); this.selectedId = null;
    await this.writeMarkdown(lines.join("\n"));
  }

  async setNodeHeader(node, makeHeader) {
    const source = this.tree.flat.find((item) => item.id === node.id) || node;
    const bounds = this.subtreeBounds(source);
    if (!bounds || source.id === "root") return;
    const lines = this.markdown.split("\n");
    if (makeHeader && source.kind === "list") {
      let ancestor = source.parent;
      while (ancestor && ancestor.kind !== "heading" && ancestor.id !== "root") ancestor = ancestor.parent;
      const level = ancestor?.kind === "heading" ? Math.min(6, ancestor.level + 1) : Math.min(6, source.depth + 1);
      const match = lines[source.line].match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/);
      if (!match) return;
      lines[source.line] = `${"#".repeat(level)} ${match[1]}`;
      const removeIndent = source.indent + 2;
      for (let index = source.line + 1; index < bounds.end; index += 1) {
        lines[index] = lines[index].replace(/^(\s*)(?=[-+*]|\d+[.)]\s)/, (indent) => {
          return " ".repeat(Math.max(0, indent.replace(/\t/g, "    ").length - removeIndent));
        });
      }
    } else if (!makeHeader && source.kind === "heading") {
      const baseIndent = source.parent?.kind === "list" ? source.parent.indent + 2 : 0;
      for (let index = source.line; index < bounds.end; index += 1) {
        const heading = lines[index].match(/^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/);
        if (heading) {
          const relative = Math.max(0, heading[1].length - source.level);
          lines[index] = `${" ".repeat(baseIndent + relative * 2)}- ${heading[2]}`;
        } else if (index > source.line) {
          lines[index] = lines[index].replace(/^(\s*)(?=[-+*]|\d+[.)]\s)/, (indent) => {
            return `${" ".repeat(baseIndent + 2)}${indent}`;
          });
        }
      }
    }
    await this.writeMarkdown(lines.join("\n"));
  }

  handleKeydown(event, visibleNodes, elements) {
    if (primaryModifier(event) && ["b", "i"].includes(shortcutLetter(event))) {
      event.preventDefault(); this.formatSelectedNodes(shortcutLetter(event) === "b" ? "**" : "*"); return;
    }
    const node = visibleNodes.find((item) => item.id === this.selectedId);
    if (!node) return;
    if (event.key === "Tab") { event.preventDefault(); this.insertRelative(node, true); }
    else if (event.key === "Enter") { event.preventDefault(); this.insertRelative(node, false); }
    else if (event.key === "F2") { event.preventDefault(); this.beginEdit(node, elements.get(node.id)); }
    else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault(); this.deleteSelectedNodes();
    }
  }

  async updateSetting(key, value) {
    this.plugin.settings[key] = value;
    await this.plugin.saveSettings();
  }

  async undo() {
    const previous = this.undoStack.pop();
    if (previous === undefined) return;
    this.redoStack.push(this.markdown);
    await this.writeMarkdown(previous, false);
  }

  async redo() {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(this.markdown);
    await this.writeMarkdown(next, false);
  }

  async writeMarkdown(markdown, recordHistory = true) {
    if (!this.file || markdown === this.markdown) return;
    if (recordHistory) {
      this.undoStack.push(this.markdown);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.markdown = markdown;
    await this.app.vault.modify(this.file, markdown);
    this.tree = parseMarkdownTree(markdown, this.file.basename);
    this.render(false);
  }
}

function orthogonalPath(x1, y1, x2, y2, horizontal, radius = 8) {
  if (horizontal) {
    const middle = (x1 + x2) / 2;
    const directionX = Math.sign(x2 - x1) || 1;
    const directionY = Math.sign(y2 - y1) || 1;
    const corner = Math.min(radius, Math.abs(x2 - x1) / 4, Math.abs(y2 - y1) / 4);
    if (!corner) return `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`;
    return `M ${x1} ${y1} H ${middle - directionX * corner} Q ${middle} ${y1} ${middle} ${y1 + directionY * corner} V ${y2 - directionY * corner} Q ${middle} ${y2} ${middle + directionX * corner} ${y2} H ${x2}`;
  }
  const middle = (y1 + y2) / 2;
  const directionX = Math.sign(x2 - x1) || 1;
  const directionY = Math.sign(y2 - y1) || 1;
  const corner = Math.min(radius, Math.abs(x2 - x1) / 4, Math.abs(y2 - y1) / 4);
  if (!corner) return `M ${x1} ${y1} V ${middle} H ${x2} V ${y2}`;
  return `M ${x1} ${y1} V ${middle - directionY * corner} Q ${x1} ${middle} ${x1 + directionX * corner} ${middle} H ${x2 - directionX * corner} Q ${x2} ${middle} ${x2} ${middle + directionY * corner} V ${y2}`;
}

class EditableMindMapSettingTab extends PluginSettingTab {
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Living Mindmap" });
    new Setting(containerEl).setName("Reset settings").setDesc("Restore every Living Mindmap preference to its default value.")
      .addButton((button) => button.setButtonText("Reset to defaults").setWarning().onClick(async () => {
        this.plugin.settings = { ...DEFAULT_SETTINGS };
        await this.plugin.saveSettings();
        this.display();
        new Notice("Living Mindmap settings restored to defaults.");
      }));
    new Setting(containerEl).setName("Layout").setDesc("Default layout for every mind map.")
      .addDropdown((dropdown) => dropdown.addOptions({ horizontal: "Horizontal", vertical: "Vertical" })
        .setValue(this.plugin.settings.layout).onChange(async (value) => { this.plugin.settings.layout = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Maximum node width").setDesc("Text wraps when a node reaches this width.")
      .addSlider((slider) => slider.setLimits(140, 600, 10).setDynamicTooltip().setValue(this.plugin.settings.nodeWidth)
        .onChange(async (value) => { this.plugin.settings.nodeWidth = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Spacing mode").setDesc("Align all depth levels globally or keep fixed gaps within each branch.")
      .addDropdown((dropdown) => dropdown.addOptions({ level: "Align levels", branch: "Compact branches" })
        .setValue(this.plugin.settings.spacing).onChange(async (value) => { this.plugin.settings.spacing = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Branch colors").setDesc("Give every top-level branch a distinct color.")
      .addToggle((toggle) => toggle.setValue(this.plugin.settings.branchColors).onChange(async (value) => {
        this.plugin.settings.branchColors = value; await this.plugin.saveSettings();
      }));
    new Setting(containerEl).setName("Vertical hierarchy gap").setDesc("Distance between hierarchy rows in Vertical layout.")
      .addSlider((slider) => slider.setLimits(30, 180, 5).setDynamicTooltip().setValue(this.plugin.settings.parentChildGap)
        .onChange(async (value) => { this.plugin.settings.parentChildGap = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Horizontal hierarchy gap").setDesc("Distance between hierarchy columns in Horizontal layout.")
      .addSlider((slider) => slider.setLimits(40, 240, 5).setDynamicTooltip().setValue(this.plugin.settings.horizontalGap)
        .onChange(async (value) => { this.plugin.settings.horizontalGap = value; await this.plugin.saveSettings(); }));
    new Setting(containerEl).setName("Sibling gap").setDesc("Minimum space between neighboring sibling subtrees.")
      .addSlider((slider) => slider.setLimits(10, 120, 5).setDynamicTooltip().setValue(this.plugin.settings.verticalGap)
        .onChange(async (value) => { this.plugin.settings.verticalGap = value; await this.plugin.saveSettings(); }));
  }
}

class EditableMindMapPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (this.settings.layout === "radial") this.settings.layout = "horizontal";
    this.registerView(VIEW_TYPE, (leaf) => new EditableMindMapView(leaf, this));
    this.addRibbonIcon("brain-circuit", "Open as Mindmap", () => this.openMindMap());
    this.addCommand({ id: "open-editable-mind-map", name: "Open as Mindmap", callback: () => this.openMindMap() });
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source) => {
      if (file?.extension !== "md" || !["more-options", "pane-more-options", "tab-header"].includes(source)) return;
      menu.addItem((item) => item
        .setTitle("Open as Mindmap")
        .setIcon("brain-circuit")
        .setSection("pane")
        .onClick(() => this.openMindMap(file)));
    }));
    this.addSettingTab(new EditableMindMapSettingTab(this.app, this));
  }

  async openMindMap(file = this.app.workspace.getActiveFile()) {
    if (!file || file.extension !== "md") return new Notice("Open a Markdown note first.");
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    const view = leaf.view;
    if (view instanceof EditableMindMapView) await view.loadFile(file, true);
    this.app.workspace.revealLeaf(leaf);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) leaf.view?.render?.(false);
  }
  onunload() { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }
}

module.exports = EditableMindMapPlugin;
module.exports.__test = { parseMarkdownTree, readMindmapProperties, layoutTree, visibleTree, orthogonalPath };
