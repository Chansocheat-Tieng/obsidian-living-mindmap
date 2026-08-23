const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function mockObsidian(request, parent, isMain) {
  if (request === "obsidian") {
    class Base {}
    return {
      ItemView: Base,
      MarkdownRenderer: {},
      Notice: class {},
      Plugin: Base,
      PluginSettingTab: Base,
      Setting: Base,
      setIcon() {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { parseMarkdownTree, readMindmapProperties, visibleTree, layoutTree, orthogonalPath } = require("./main.js").__test;

const markdown = `---
mindmap-layout: radial
mindmap-wrap: false
mindmap-node-width: auto
---
# Project
## Research
- Sources
  - Papers
## Build
- Prototype`;

const parsed = parseMarkdownTree(markdown, "Example");
assert.equal(parsed.root.text, "Project");
assert.deepEqual(parsed.root.children.map((node) => node.text), ["Research", "Build"]);
assert.equal(parsed.root.children[0].children[0].text, "Sources");
assert.equal(parsed.root.children[0].children[0].children[0].text, "Papers");

const properties = readMindmapProperties(markdown);
assert.equal(properties.layout, "horizontal");
assert.equal(properties.wrap, true);
assert.equal(properties.nodeWidth, 280);
assert.equal(properties.spacing, "level");
assert.equal(properties.branchColors, false);

const branchProperties = readMindmapProperties(markdown, { ...properties, spacing: "branch" });
assert.equal(branchProperties.spacing, "branch");
const coloredProperties = readMindmapProperties(markdown, { ...properties, branchColors: true });
assert.equal(coloredProperties.branchColors, true);
const verticalProperties = readMindmapProperties(markdown, { ...properties, layout: "vertical", nodeWidth: 330 });
assert.equal(verticalProperties.layout, "vertical");
assert.equal(verticalProperties.nodeWidth, 330);

const visible = visibleTree(parsed.root, new Set());
const nodes = layoutTree(visible.root, { layout: "horizontal", direction: "right", wrap: false, nodeWidth: "auto", horizontalGap: 110, verticalGap: 30 });
assert.equal(nodes.length, parsed.flat.length);
assert.ok(nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));

const vertical = layoutTree(visibleTree(parsed.root, new Set()).root, { layout: "vertical", direction: "down", wrap: false, nodeWidth: "auto", horizontalGap: 110, verticalGap: 30 });
assert.ok(vertical.some((node) => node.depth > 0 && node.y > 0));
assert.match(orthogonalPath(0, 0, 100, 50, true), /^M .* H .* Q .* V .* Q .* H/);
assert.match(orthogonalPath(0, 0, 50, 100, false), /^M .* V .* Q .* H .* Q .* V/);

console.log("Living Mindmap tests passed");
