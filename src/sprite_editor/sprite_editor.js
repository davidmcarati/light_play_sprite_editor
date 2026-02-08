import { Color } from "./color.js";
import { SpriteState, SpriteHistory } from "./sprite_data.js";
import { LayerStack } from "./layer_data.js";
import { ALL_TOOLS } from "./tools.js";
import { SpriteCanvas } from "./sprite_canvas.js";
import { ColorPicker } from "./color_picker.js";
import { SpriteToolbar } from "./toolbar.js";
import { LayersPanel } from "./layers_panel.js";
import { serializeToBlob, deserializeFromBlob } from "./lsprite_format.js";
import { ModalDialog } from "./modal_dialog.js";

let _stylesInjected = false;

const FORMAT_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp"
};

const PIXEL_TOOLS_ON_MOVE = new Set(["Pencil", "Eraser", "Line", "Rectangle", "Ellipse"]);

function createSpriteEditor(container, options = {}) {
    injectStyles();
    return new SpriteEditorInstance(container, options);
}

class SpriteEditorInstance {
    constructor(container, options) {
        this._container = container;
        this._onSave = options.onSave || null;
        this._onSaveAs = options.onSaveAs || null;
        this._onExport = options.onExport || null;
        this._onDirtyChange = options.onDirtyChange || null;
        this._onTabChange = options.onTabChange || null;
        this._onTabClose = options.onTabClose || null;

        this._layerStack = new LayerStack(32, 32);
        this._history = new SpriteHistory();
        this._activeTool = ALL_TOOLS[0];
        this.foregroundColor = new Color(0, 0, 0, 255);
        this.backgroundColor = new Color(255, 255, 255, 255);
        this.brushSize = 1;
        this.shapeFilled = false;
        this.fillTolerance = 0;
        this.selection = null;
        this.floatingPaste = null;
        this._clipboard = null;
        this._fileName = "";
        this._dirty = false;
        this._hasImage = false;

        this._nextTabId = 1;
        this._tabs = [];
        this._activeTabId = null;
        this._dragTabId = null;

        this._buildLayout();
        this._setupKeyboard();

        const initialTab = {
            id: this._nextTabId++,
            layerStack: this._layerStack,
            history: this._history,
            selection: null,
            floatingPaste: null,
            fileName: "",
            dirty: false,
            hasImage: false,
            zoom: this._spriteCanvas.getZoom(),
            panX: 0, panY: 0
        };
        this._tabs.push(initialTab);
        this._activeTabId = initialTab.id;
        this._renderTabBar();
        this._showWelcome();
    }

    get sprite() {
        return this._layerStack.activeLayer.data;
    }

    _buildLayout() {
        this._container.innerHTML = "";

        const wrapper = document.createElement("div");
        wrapper.className = "se-container";
        wrapper.tabIndex = 0;
        this._wrapper = wrapper;

        const toolbarContainer = document.createElement("div");
        this._toolbar = new SpriteToolbar(toolbarContainer, {
            onToolChange: (name) => this._setTool(name),
            onAction: (action) => this._handleAction(action),
            onOptionChange: (key, val) => this._setOption(key, val),
            onViewToggle: (key, val) => this._onViewToggle(key, val)
        });
        wrapper.appendChild(toolbarContainer);

        this._tabBarEl = document.createElement("div");
        this._tabBarEl.className = "se-tab-bar";
        wrapper.appendChild(this._tabBarEl);

        const main = document.createElement("div");
        main.className = "se-main";

        const canvasArea = document.createElement("div");
        canvasArea.className = "se-canvas-area";

        this._spriteCanvas = new SpriteCanvas(canvasArea, {
            onMouseDown: (px, py, e) => this._onToolDown(px, py, e),
            onMouseMove: (px, py, e) => this._onToolMove(px, py, e),
            onMouseUp: (px, py, e) => this._onToolUp(px, py, e),
            onZoomChange: (z) => this._toolbar.setZoom(z),
            onCursorMove: (px, py) => {
                this._updateStatus(px, py);
                this._spriteCanvas.setCursorPreview(px, py, this.brushSize, this._activeTool.name);
            }
        });

        main.appendChild(canvasArea);

        const sidebar = document.createElement("div");
        sidebar.className = "se-sidebar";

        const cpContainer = document.createElement("div");
        this._colorPicker = new ColorPicker(cpContainer, {
            onChange: (color) => { this.foregroundColor = color; }
        });
        sidebar.appendChild(cpContainer);

        const lpContainer = document.createElement("div");
        this._layersPanel = new LayersPanel(lpContainer, {
            onActiveChange: (idx) => this._setActiveLayer(idx),
            onVisibilityChange: (idx, vis) => this._setLayerVisibility(idx, vis),
            onOpacityStart: (idx) => this._startLayerOpacityChange(idx),
            onOpacityChange: (idx, opacity) => this._setLayerOpacity(idx, opacity),
            onAdd: () => this._addLayer(),
            onRemove: (idx) => this._removeLayer(idx),
            onMoveUp: (idx) => this._moveLayerUp(idx),
            onMoveDown: (idx) => this._moveLayerDown(idx),
            onDuplicate: (idx) => this._duplicateLayer(idx),
            onMergeDown: (idx) => this._mergeLayerDown(idx),
            onMerge: (indices) => this._mergeLayers(indices),
            onRename: (idx, name) => this._renameLayer(idx, name),
            onReorder: (from, to) => this._reorderLayer(from, to)
        });
        sidebar.appendChild(lpContainer);

        main.appendChild(sidebar);
        wrapper.appendChild(main);

        const status = document.createElement("div");
        status.className = "se-status";
        this._statusEl = status;
        this._statusPos = document.createElement("span");
        this._statusPos.textContent = "0, 0";
        status.appendChild(this._statusPos);
        this._statusLayer = document.createElement("span");
        this._statusLayer.className = "se-status-layer";
        status.appendChild(this._statusLayer);
        wrapper.appendChild(status);

        this._container.appendChild(wrapper);

        this._toolbar.setTools(ALL_TOOLS);
        this._toolbar.setActiveTool(this._activeTool.name);
        this._toolbar.updateOptions(this._activeTool.getOptions());
        this._toolbar.setCanvasSize(this._layerStack.width, this._layerStack.height);
        this._toolbar.setZoom(this._spriteCanvas.getZoom());
        this._toolbar.setFileName(this._fileName);

        this._spriteCanvas.setLayerStack(this._layerStack, true);
        this._updateLayersPanel();
        this._updateStatusLayer();

        this._rulersVisible = false;
        try {
            if (localStorage.getItem("se-rulers-visible") === "true") {
                this._rulersVisible = true;
                this._spriteCanvas.setRulersVisible(true);
                this._toolbar.setRulersVisible(true);
            }
        } catch (_) {}

        wrapper.focus();
    }

    _onViewToggle(key, value) {
        if (key === "rulers") {
            this._rulersVisible = value;
            this._spriteCanvas.setRulersVisible(value);
            try { localStorage.setItem("se-rulers-visible", String(value)); } catch (_) {}
        }
    }

    _showWelcome() {
        this._welcomeOverlay = document.createElement("div");
        this._welcomeOverlay.className = "se-welcome-overlay";

        const dialog = document.createElement("div");
        dialog.className = "se-welcome-dialog";

        const title = document.createElement("div");
        title.className = "se-welcome-title";
        title.textContent = "Light Play — Sprite Editor";
        dialog.appendChild(title);

        const subtitle = document.createElement("div");
        subtitle.className = "se-welcome-subtitle";
        subtitle.textContent = "Create a new sprite or open an existing file.";
        dialog.appendChild(subtitle);

        const btns = document.createElement("div");
        btns.className = "se-welcome-actions";

        const newBtn = document.createElement("button");
        newBtn.className = "se-welcome-btn se-welcome-btn-primary";
        newBtn.textContent = "New";
        newBtn.addEventListener("click", () => this._showNewDialog());
        btns.appendChild(newBtn);

        const openBtn = document.createElement("button");
        openBtn.className = "se-welcome-btn";
        openBtn.textContent = "Open";
        openBtn.addEventListener("click", () => this._openFile());
        btns.appendChild(openBtn);

        dialog.appendChild(btns);
        this._welcomeOverlay.appendChild(dialog);
        this._wrapper.appendChild(this._welcomeOverlay);
    }

    _hideWelcome() {
        if (this._welcomeOverlay) {
            this._welcomeOverlay.remove();
            this._welcomeOverlay = null;
        }
    }

    _renderTabBar() {
        this._tabBarEl.innerHTML = "";

        for (const tab of this._tabs) {
            const tabEl = document.createElement("div");
            tabEl.className = "se-tab";
            if (tab.id === this._activeTabId) tabEl.classList.add("active");

            tabEl.draggable = true;
            const tabId = tab.id;

            tabEl.addEventListener("dragstart", (e) => {
                this._dragTabId = tabId;
                tabEl.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(tabId));
            });
            tabEl.addEventListener("dragend", () => {
                tabEl.classList.remove("dragging");
                this._dragTabId = null;
                this._tabBarEl.querySelectorAll(".se-tab").forEach(t => t.classList.remove("drag-over-tab"));
            });
            tabEl.addEventListener("dragover", (e) => {
                if (this._dragTabId == null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                this._tabBarEl.querySelectorAll(".se-tab").forEach(t => t.classList.remove("drag-over-tab"));
                tabEl.classList.add("drag-over-tab");
            });
            tabEl.addEventListener("dragleave", () => tabEl.classList.remove("drag-over-tab"));
            tabEl.addEventListener("drop", (e) => {
                e.preventDefault();
                tabEl.classList.remove("drag-over-tab");
                if (this._dragTabId != null && this._dragTabId !== tabId) {
                    const fromIdx = this._tabs.findIndex(t => t.id === this._dragTabId);
                    const toIdx = this._tabs.findIndex(t => t.id === tabId);
                    if (fromIdx !== -1 && toIdx !== -1) {
                        const [moved] = this._tabs.splice(fromIdx, 1);
                        this._tabs.splice(toIdx, 0, moved);
                        this._renderTabBar();
                    }
                }
                this._dragTabId = null;
            });

            const nameSpan = document.createElement("span");
            nameSpan.className = "se-tab-name";
            const rawName = tab.id === this._activeTabId ? this._fileName : tab.fileName;
            const isDirty = tab.id === this._activeTabId ? this._dirty : tab.dirty;
            let displayName = rawName || "Untitled";
            const dot = displayName.lastIndexOf(".");
            if (dot > 0) displayName = displayName.substring(0, dot);
            nameSpan.textContent = (isDirty ? "● " : "") + displayName;

            nameSpan.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                this._startTabRename(nameSpan, tabId);
            });
            tabEl.appendChild(nameSpan);

            const closeBtn = document.createElement("button");
            closeBtn.className = "se-tab-close";
            closeBtn.textContent = "×";
            closeBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this._closeTab(tabId);
            });
            tabEl.appendChild(closeBtn);

            tabEl.addEventListener("click", () => this._switchToTab(tabId));
            this._tabBarEl.appendChild(tabEl);
        }

        const addBtn = document.createElement("button");
        addBtn.className = "se-tab-add";
        addBtn.textContent = "+";
        addBtn.title = "New tab";
        addBtn.addEventListener("click", () => this._createNewTab());
        this._tabBarEl.appendChild(addBtn);
    }

    _startTabRename(nameSpan, tabId) {
        const tab = this._tabs.find(t => t.id === tabId);
        if (!tab) return;

        const current = tabId === this._activeTabId ? this._fileName : tab.fileName;
        let displayName = current || "Untitled";
        const dot = displayName.lastIndexOf(".");
        if (dot > 0) displayName = displayName.substring(0, dot);

        const input = document.createElement("input");
        input.type = "text";
        input.className = "se-tab-rename-input";
        input.value = displayName;

        const commit = () => {
            const name = input.value.trim();
            if (name) {
                if (tabId === this._activeTabId) {
                    this._fileName = name;
                    this._toolbar.setFileName(name);
                } else {
                    tab.fileName = name;
                }
            }
            this._renderTabBar();
        };

        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); input.blur(); }
            if (e.key === "Escape") { input.removeEventListener("blur", commit); this._renderTabBar(); }
            e.stopPropagation();
        });
        input.addEventListener("click", (e) => e.stopPropagation());
        input.addEventListener("dblclick", (e) => e.stopPropagation());

        nameSpan.textContent = "";
        nameSpan.appendChild(input);
        input.focus();
        input.select();
    }

    _saveCurrentTabState() {
        const tab = this._tabs.find(t => t.id === this._activeTabId);
        if (!tab) return;
        tab.layerStack = this._layerStack;
        tab.history = this._history;
        tab.selection = this.selection;
        tab.floatingPaste = this.floatingPaste;
        tab.fileName = this._fileName;
        tab.dirty = this._dirty;
        tab.hasImage = this._hasImage;
        tab.zoom = this._spriteCanvas.getZoom();
        tab.panX = this._spriteCanvas._panX;
        tab.panY = this._spriteCanvas._panY;
    }

    _loadTabState(tab) {
        this._layerStack = tab.layerStack;
        this._history = tab.history;
        this.selection = tab.selection;
        this.floatingPaste = tab.floatingPaste;
        this._fileName = tab.fileName;
        this._dirty = tab.dirty;
        this._hasImage = tab.hasImage;

        this._spriteCanvas.setSelection(this.selection);
        this._spriteCanvas.setFloatingPaste(this.floatingPaste);
        this._spriteCanvas.setLayerStack(this._layerStack, true);
        this._spriteCanvas._panX = tab.panX;
        this._spriteCanvas._panY = tab.panY;
        this._spriteCanvas.setZoom(tab.zoom);

        this._toolbar.setCanvasSize(this._layerStack.width, this._layerStack.height);
        this._toolbar.setFileName(this._fileName);
        this._updateLayersPanel();

        if (!this._hasImage) this._showWelcome();
    }

    _switchToTab(tabId) {
        if (tabId === this._activeTabId) return;

        this._hideWelcome();
        this._saveCurrentTabState();
        this._activeTabId = tabId;

        const tab = this._tabs.find(t => t.id === tabId);
        if (!tab) return;
        this._loadTabState(tab);

        this._renderTabBar();
        if (this._onDirtyChange) this._onDirtyChange(this._dirty);
        if (this._onTabChange) this._onTabChange(tabId);
    }

    _createNewTab() {
        this._saveCurrentTabState();
        this._hideWelcome();

        const newStack = new LayerStack(32, 32);
        const tab = {
            id: this._nextTabId++,
            layerStack: newStack,
            history: new SpriteHistory(),
            selection: null,
            floatingPaste: null,
            fileName: "",
            dirty: false,
            hasImage: false,
            zoom: 8,
            panX: 0, panY: 0
        };
        this._tabs.push(tab);
        this._activeTabId = tab.id;

        this._layerStack = tab.layerStack;
        this._history = tab.history;
        this.selection = null;
        this.floatingPaste = null;
        this._fileName = "";
        this._dirty = false;
        this._hasImage = false;

        this._spriteCanvas.setSelection(null);
        this._spriteCanvas.setFloatingPaste(null);
        this._spriteCanvas.setLayerStack(this._layerStack, true);
        this._spriteCanvas._panX = 0;
        this._spriteCanvas._panY = 0;
        this._spriteCanvas.setZoom(8);

        this._toolbar.setCanvasSize(32, 32);
        this._toolbar.setFileName("");
        this._updateLayersPanel();

        this._showWelcome();
        this._renderTabBar();

        if (this._onDirtyChange) this._onDirtyChange(false);
        if (this._onTabChange) this._onTabChange(tab.id);
    }

    _closeTab(tabId) {
        const idx = this._tabs.findIndex(t => t.id === tabId);
        if (idx === -1) return;

        if (this._onTabClose) this._onTabClose(tabId);
        this._tabs.splice(idx, 1);

        if (this._tabs.length === 0) {
            this._createNewTab();
            return;
        }

        if (tabId === this._activeTabId) {
            this._hideWelcome();

            const newIdx = Math.min(idx, this._tabs.length - 1);
            const newTab = this._tabs[newIdx];
            this._activeTabId = newTab.id;
            this._loadTabState(newTab);

            if (this._onDirtyChange) this._onDirtyChange(this._dirty);
            if (this._onTabChange) this._onTabChange(this._activeTabId);
        }

        this._renderTabBar();
    }

    _openInTab(layerStack, fileName) {
        if (this._hasImage) {
            this._saveCurrentTabState();
            const tab = {
                id: this._nextTabId++,
                layerStack,
                history: new SpriteHistory(),
                selection: null,
                floatingPaste: null,
                fileName,
                dirty: false,
                hasImage: true,
                zoom: 8,
                panX: 0, panY: 0
            };
            this._tabs.push(tab);
            this._activeTabId = tab.id;
        }

        this._hideWelcome();
        this._hasImage = true;
        this._layerStack = layerStack;
        this._history = new SpriteHistory();
        this.selection = null;
        this.floatingPaste = null;
        this._fileName = fileName;
        this._dirty = false;
        this._spriteCanvas.setZoom(8);

        this._toolbar.setCanvasSize(this._layerStack.width, this._layerStack.height);
        this._toolbar.setFileName(this._fileName);
        this._spriteCanvas.setSelection(null);
        this._spriteCanvas.setFloatingPaste(null);
        this._spriteCanvas.setLayerStack(this._layerStack, true);

        // Auto-fit for large images that won't fit at default zoom
        const cw = this._container.clientWidth || 800;
        const ch = this._container.clientHeight || 600;
        if (this._layerStack.width * 8 > cw || this._layerStack.height * 8 > ch) {
            requestAnimationFrame(() => this._spriteCanvas.zoomToFit());
        }

        this._updateLayersPanel();
        this._renderTabBar();

        if (this._onDirtyChange) this._onDirtyChange(false);
        if (this._onTabChange) this._onTabChange(this._activeTabId);
    }

    getActiveTabId() {
        return this._activeTabId;
    }

    _setupKeyboard() {
        this._boundKeyDown = (e) => this._onKeyDown(e);
        this._wrapper.addEventListener("keydown", this._boundKeyDown);
    }

    _onKeyDown(e) {
        const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";

        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case "z":
                    if (!e.shiftKey) {
                        e.preventDefault(); e.stopPropagation();
                        this.undo();
                    }
                    return;
                case "y":
                    e.preventDefault(); e.stopPropagation();
                    this.redo();
                    return;
                case "c":
                    e.preventDefault(); e.stopPropagation();
                    this.copySelection();
                    return;
                case "x":
                    e.preventDefault(); e.stopPropagation();
                    this.cutSelection();
                    return;
                case "v":
                    e.preventDefault(); e.stopPropagation();
                    this.paste();
                    return;
                case "a":
                    e.preventDefault(); e.stopPropagation();
                    this.selectAll();
                    return;
                case "d":
                    e.preventDefault(); e.stopPropagation();
                    this.deselect();
                    return;
                case "s":
                    e.preventDefault(); e.stopPropagation();
                    this._handleAction(e.shiftKey ? "saveAs" : "save");
                    return;
                case "0":
                    e.preventDefault(); e.stopPropagation();
                    this._spriteCanvas.zoomToFit();
                    return;
            }
            return;
        }

        if (e.key === "Delete") {
            e.preventDefault();
            this.deleteSelection();
            return;
        }

        if (e.key === "Escape") {
            this.deselect();
            return;
        }

        if (isInput) return;

        const toolKey = e.key.toUpperCase();
        const tool = ALL_TOOLS.find(t => t.shortcut === toolKey);
        if (tool) {
            e.stopPropagation();
            this._setTool(tool.name);
            return;
        }

        if (e.key === "x" || e.key === "X") {
            e.stopPropagation();
            this.swapColors();
            return;
        }

        if (e.key === "[") {
            this.brushSize = Math.max(1, this.brushSize - 1);
            this._toolbar.updateOptions(this._activeTool.getOptions());
        }
        if (e.key === "]") {
            this.brushSize = Math.min(32, this.brushSize + 1);
            this._toolbar.updateOptions(this._activeTool.getOptions());
        }
    }

    _setTool(name) {
        const tool = ALL_TOOLS.find(t => t.name === name);
        if (tool) {
            this.commitFloatingPaste();
            this._activeTool = tool;
            this._toolbar.setActiveTool(name);
            this._toolbar.updateOptions(tool.getOptions());
        }
    }

    _setOption(key, value) {
        if (key === "brushSize") this.brushSize = value;
        if (key === "shapeFilled") this.shapeFilled = value;
        if (key === "fillTolerance") this.fillTolerance = value;
    }

    _onToolDown(px, py, e) {
        this._activeTool.onDown(px, py, this, e);
        this._spriteCanvas.setSelection(this.selection);
        this._spriteCanvas.setFloatingPaste(this.floatingPaste);
        this._spriteCanvas.redraw();
    }

    _onToolMove(px, py) {
        this._activeTool.onMove(px, py, this);
        this._spriteCanvas.setSelection(this.selection);
        this._spriteCanvas.setFloatingPaste(this.floatingPaste);
        if (PIXEL_TOOLS_ON_MOVE.has(this._activeTool.name)) {
            this._spriteCanvas.redraw();
        } else {
            this._spriteCanvas._redrawOverlaysOnly();
        }
    }

    _onToolUp(px, py) {
        this._activeTool.onUp(px, py, this);
        this._spriteCanvas.setSelection(this.selection);
        this._spriteCanvas.setFloatingPaste(this.floatingPaste);
        this._spriteCanvas.redraw();
    }

    async _handleAction(action) {
        if (action === "new")         this._showNewDialog();
        else if (action === "open")   await this._openFile();
        else if (action === "save")   await this._save();
        else if (action === "saveAs") await this._saveAs();
        else if (action === "export") await this._export();
    }

    async _showNewDialog() {
        const modal = new ModalDialog();
        const result = await modal.show({
            title: "New Sprite",
            okText: "Create",
            fields: [
                { key: "width",  label: "Width (px)",  type: "number", value: 32, min: 1, max: 4096 },
                { key: "height", label: "Height (px)", type: "number", value: 32, min: 1, max: 4096 },
                {
                    key: "colorDepth", label: "Color Depth", type: "select", value: "32",
                    options: [
                        { value: "8",  label: "8-bit (256 colors)" },
                        { value: "16", label: "16-bit (65,536 colors)" },
                        { value: "32", label: "32-bit (full RGBA)" }
                    ]
                }
            ]
        });

        if (!result) return;
        const w = Math.max(1, Math.min(4096, result.width));
        const h = Math.max(1, Math.min(4096, result.height));
        this.createNew(w, h, parseInt(result.colorDepth));
    }

    async _save() {
        if (!this._onSave) return;
        try {
            const blob = serializeToBlob(this._layerStack);
            const newName = await this._onSave(blob, this._fileName || "Untitled", this._activeTabId);
            if (newName == null) return;
            this._fileName = newName;
            this._toolbar.setFileName(newName);
            this._dirty = false;
            if (this._onDirtyChange) this._onDirtyChange(false);
            this._renderTabBar();
        } catch (err) {
            console.error("Save failed:", err);
        }
    }

    async _saveAs() {
        if (!this._onSaveAs) return;
        try {
            const blob = serializeToBlob(this._layerStack);
            const newName = await this._onSaveAs(blob, this._fileName || "Untitled", this._activeTabId);
            if (newName == null) return;
            this._fileName = newName;
            this._toolbar.setFileName(newName);
            this._dirty = false;
            if (this._onDirtyChange) this._onDirtyChange(false);
            this._renderTabBar();
        } catch (err) {
            console.error("Save as failed:", err);
        }
    }

    async _export() {
        if (!this._onExport) return;

        let lastSettings = {};
        try { lastSettings = JSON.parse(localStorage.getItem("se-export-settings") || "{}"); } catch (_) {}

        const modal = new ModalDialog();
        const result = await modal.show({
            title: "Export Image",
            okText: "Export",
            fields: [
                {
                    key: "format", label: "Format", type: "select",
                    value: lastSettings.format || "image/png",
                    options: [
                        { value: "image/png",  label: "PNG" },
                        { value: "image/jpeg", label: "JPEG" },
                        { value: "image/webp", label: "WebP" }
                    ]
                },
                {
                    key: "quality", label: "Quality (%)", type: "number",
                    value: lastSettings.quality != null ? lastSettings.quality : 92,
                    min: 1, max: 100
                },
                {
                    key: "scale", label: "Scale", type: "select",
                    value: lastSettings.scale || "1",
                    options: [
                        { value: "1", label: "1×" },
                        { value: "2", label: "2×" },
                        { value: "4", label: "4×" },
                        { value: "8", label: "8×" },
                        { value: "16", label: "16×" }
                    ]
                }
            ]
        });

        if (!result) return;

        try {
            localStorage.setItem("se-export-settings", JSON.stringify({
                format: result.format,
                quality: result.quality,
                scale: result.scale
            }));
        } catch (_) {}

        try {
            const scale = parseInt(result.scale) || 1;
            const quality = Math.max(1, Math.min(100, result.quality)) / 100;

            const flat = this._layerStack.flatten();
            const srcCanvas = document.createElement("canvas");
            srcCanvas.width = this._layerStack.width;
            srcCanvas.height = this._layerStack.height;
            const srcCtx = srcCanvas.getContext("2d");
            srcCtx.putImageData(flat.toImageData(), 0, 0);

            let outCanvas = srcCanvas;
            if (scale > 1) {
                outCanvas = document.createElement("canvas");
                outCanvas.width = srcCanvas.width * scale;
                outCanvas.height = srcCanvas.height * scale;
                const outCtx = outCanvas.getContext("2d");
                outCtx.imageSmoothingEnabled = false;
                outCtx.drawImage(srcCanvas, 0, 0, outCanvas.width, outCanvas.height);
            }

            const blob = await new Promise((resolve, reject) => {
                outCanvas.toBlob((b) => {
                    if (b) resolve(b);
                    else reject(new Error("Export blob failed"));
                }, result.format, quality);
            });

            const ext = FORMAT_EXTENSIONS[result.format] || ".png";
            await this._onExport(blob, this._fileName || "Untitled", ext);
        } catch (err) {
            console.error("Export failed:", err);
        }
    }

    async _openFile() {
        try {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".lsprite,.png,.jpg,.jpeg,.gif,.webp,.bmp";
            input.addEventListener("change", async () => {
                const file = input.files[0];
                if (!file) return;
                if (file.name.endsWith(".lsprite")) {
                    await this.loadFromLsprite(file);
                } else {
                    await this.loadFromBlob(file, file.name);
                }
            });
            input.click();
        } catch (err) {
            console.error("Open failed:", err);
        }
    }

    async loadFromLsprite(blob) {
        const stack = await deserializeFromBlob(blob);
        this._openInTab(stack, blob.name || "");
    }

    _updateStatus(px, py) {
        if (this._statusPos) {
            const inBounds = this._layerStack.inBounds(px, py);
            this._statusPos.textContent = inBounds ? `${px}, ${py}` : "";
        }
    }

    _updateStatusLayer() {
        if (this._statusLayer) {
            this._statusLayer.textContent = `Layer: ${this._layerStack.activeLayer.name}`;
        }
    }

    _updateLayersPanel() {
        if (this._layersPanel) {
            this._layersPanel.update(this._layerStack.layers, this._layerStack.activeIndex);
        }
        this._updateStatusLayer();
    }

    pushHistory() {
        this._history.push(this._layerStack);
    }

    markDirty() {
        if (!this._dirty) {
            this._dirty = true;
            if (this._onDirtyChange) this._onDirtyChange(true);
            this._renderTabBar();
        }
    }

    undo() {
        const prev = this._history.undo(this._layerStack);
        if (prev) {
            this._discardFloatingPaste();
            this._layerStack = prev;
            this._spriteCanvas.setLayerStack(this._layerStack);
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    }

    redo() {
        const next = this._history.redo(this._layerStack);
        if (next) {
            this._discardFloatingPaste();
            this._layerStack = next;
            this._spriteCanvas.setLayerStack(this._layerStack);
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    }

    _discardFloatingPaste() {
        if (!this.floatingPaste) return;
        this.floatingPaste = null;
        this.selection = null;
        this._spriteCanvas.setFloatingPaste(null);
        this._spriteCanvas.setSelection(null);
    }

    setForegroundColor(color) {
        this.foregroundColor = color;
        this._colorPicker.setForeground(color);
    }

    swapColors() {
        const tmp = this.foregroundColor;
        this.foregroundColor = this.backgroundColor;
        this.backgroundColor = tmp;
        this._colorPicker.swapColors();
    }

    copySelection() {
        if (!this.selection) return;
        const sel = this.selection;
        this._clipboard = new SpriteState(sel.width, sel.height);
        for (let y = 0; y < sel.height; y++) {
            for (let x = 0; x < sel.width; x++) {
                const pixel = this.sprite.getPixel(sel.x + x, sel.y + y);
                if (pixel) {
                    this._clipboard.setPixel(x, y, pixel.r, pixel.g, pixel.b, pixel.a);
                }
            }
        }
    }

    cutSelection() {
        if (!this.selection) return;
        this.copySelection();
        this.pushHistory();
        const sel = this.selection;
        for (let y = 0; y < sel.height; y++) {
            for (let x = 0; x < sel.width; x++) {
                this.sprite.setPixel(sel.x + x, sel.y + y, 0, 0, 0, 0);
            }
        }
        this.markDirty();
        this._spriteCanvas.redraw();
    }

    paste() {
        if (!this._clipboard) return;
        this.commitFloatingPaste();
        this.pushHistory();
        this._setTool("Move");
        this.floatingPaste = {
            x: 0, y: 0,
            data: this._clipboard.clone()
        };
        this.selection = null;
        this._spriteCanvas.setFloatingPaste(this.floatingPaste);
        this._spriteCanvas.setSelection(null);
        this._spriteCanvas.redraw();
    }

    commitFloatingPaste() {
        if (!this.floatingPaste) return;
        const fp = this.floatingPaste;
        for (let y = 0; y < fp.data.height; y++) {
            for (let x = 0; x < fp.data.width; x++) {
                const pixel = fp.data.getPixel(x, y);
                if (pixel && pixel.a > 0) {
                    this.sprite.setPixel(fp.x + x, fp.y + y, pixel.r, pixel.g, pixel.b, pixel.a);
                }
            }
        }
        this.floatingPaste = null;
        this._spriteCanvas.setFloatingPaste(null);
        this.markDirty();
        this._spriteCanvas.redraw();
    }

    selectAll() {
        this.selection = {
            x: 0, y: 0,
            width: this._layerStack.width,
            height: this._layerStack.height
        };
        this._spriteCanvas.setSelection(this.selection);
        this._spriteCanvas.redraw();
    }

    deselect() {
        this.commitFloatingPaste();
        this.selection = null;
        this._spriteCanvas.setSelection(null);
        this._spriteCanvas.redraw();
    }

    deleteSelection() {
        if (!this.selection) return;
        this.pushHistory();
        const sel = this.selection;
        for (let y = 0; y < sel.height; y++) {
            for (let x = 0; x < sel.width; x++) {
                this.sprite.setPixel(sel.x + x, sel.y + y, 0, 0, 0, 0);
            }
        }
        this.markDirty();
        this._spriteCanvas.redraw();
    }

    createNew(width, height, colorDepth = 32) {
        this._openInTab(new LayerStack(width, height, colorDepth), "");
    }

    async loadFromBlob(blob, fileName) {
        const img = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);

        const spriteState = SpriteState.fromImageData(imageData);
        const stack = LayerStack.fromSpriteState(spriteState);
        this._openInTab(stack, fileName || "");
    }

    async getBlob()   { return this._layerStack.toBlob(); }
    getImageData()    { return this._layerStack.toImageData(); }
    setFileName(name) { this._fileName = name; this._toolbar.setFileName(name); }
    getFileName()     { return this._fileName; }
    isDirty()         { return this._dirty; }

    resizeCanvas(newWidth, newHeight, offsetX = 0, offsetY = 0) {
        this.pushHistory();
        this._layerStack = this._layerStack.resize(newWidth, newHeight, offsetX, offsetY);
        this._toolbar.setCanvasSize(newWidth, newHeight);
        this._spriteCanvas.setLayerStack(this._layerStack, true);
        this._updateLayersPanel();
        this.markDirty();
    }

    getState() {
        return {
            layerStackClone: this._layerStack.clone(),
            fileName: this._fileName
        };
    }

    restoreState(state) {
        if (state.layerStackClone) {
            this._layerStack = state.layerStackClone;
            this._spriteCanvas.setLayerStack(this._layerStack, true);
            this._toolbar.setCanvasSize(this._layerStack.width, this._layerStack.height);
            this._updateLayersPanel();
        }
        if (state.fileName !== undefined) {
            this.setFileName(state.fileName);
        }
    }

    getLayerStack() { return this._layerStack; }

    _setActiveLayer(index) {
        if (index < 0 || index >= this._layerStack.layers.length) return;
        if (index === this._layerStack.activeIndex) return;
        this.commitFloatingPaste();
        this._layerStack.activeIndex = index;
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
    }

    _setLayerVisibility(index, visible) {
        this.pushHistory();
        this._layerStack.layers[index].visible = visible;
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
        this.markDirty();
    }

    _startLayerOpacityChange(index) {
        this.pushHistory();
    }

    _setLayerOpacity(index, opacity) {
        this._layerStack.layers[index].opacity = opacity;
        this._spriteCanvas.invalidateComposite();
        this._spriteCanvas.redraw();
        this.markDirty();
    }

    _addLayer() {
        this.pushHistory();
        this._layerStack.addLayer();
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
        this.markDirty();
    }

    _removeLayer(index) {
        if (this._layerStack.layers.length <= 1) return;
        this.pushHistory();
        this._layerStack.removeLayer(index);
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
        this.markDirty();
    }

    _moveLayerUp(index) {
        this.pushHistory();
        if (this._layerStack.moveLayerUp(index)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    }

    _moveLayerDown(index) {
        this.pushHistory();
        if (this._layerStack.moveLayerDown(index)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    }

    _duplicateLayer(index) {
        this.pushHistory();
        this._layerStack.duplicateLayer(index);
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
        this.markDirty();
    }

    _mergeLayerDown(index) {
        if (index <= 0) return;
        this.pushHistory();
        if (this._layerStack.mergeDown(index)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    }

    _reorderLayer(fromIndex, toIndex) {
        this.pushHistory();
        if (this._layerStack.reorderLayer(fromIndex, toIndex)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    }

    _mergeLayers(indices) {
        if (!indices || indices.length < 2) return;
        this.pushHistory();
        if (this._layerStack.mergeLayers(indices)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    }

    _renameLayer(index, name) {
        this._layerStack.layers[index].name = name;
        this._updateLayersPanel();
    }

    destroy() {
        if (this._spriteCanvas) this._spriteCanvas.destroy();
        if (this._colorPicker) this._colorPicker.destroy();
        if (this._toolbar) this._toolbar.destroy();
        if (this._layersPanel) this._layersPanel.destroy();
        if (this._wrapper) this._wrapper.removeEventListener("keydown", this._boundKeyDown);
        this._container.innerHTML = "";
    }
}

function injectStyles() {
    if (_stylesInjected) return;
    _stylesInjected = true;

    const style = document.createElement("style");
    style.id = "sprite-editor-styles";
    style.textContent = SPRITE_EDITOR_CSS;
    document.head.appendChild(style);
}

const SPRITE_EDITOR_CSS = `
.se-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: #1e1e1e;
    color: #e0e0e0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    outline: none;
    overflow: hidden;
    position: relative;
}

.se-toolbar {
    display: flex;
    align-items: center;
    height: 32px;
    background: #252526;
    border-bottom: 1px solid #3c3c3c;
    padding: 0 4px;
    flex-shrink: 0;
    gap: 2px;
    overflow-x: auto;
}

.se-toolbar-group {
    display: flex;
    align-items: center;
    gap: 2px;
}

.se-toolbar-sep {
    width: 1px;
    height: 18px;
    background: #3c3c3c;
    margin: 0 4px;
    flex-shrink: 0;
}

.se-toolbar-btn {
    padding: 2px 8px;
    font-size: 0.72rem;
    background: #333;
    color: #ccc;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
}

.se-toolbar-btn:hover {
    background: #444;
    color: #fff;
}

.se-toolbar-btn.active {
    background: #e94560;
    color: #fff;
    border-color: #e94560;
}

.se-toolbar-filename {
    font-size: 0.72rem;
    color: #9e9e9e;
    margin-left: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
}

.se-toolbar-label {
    font-size: 0.72rem;
    color: #9e9e9e;
    padding: 0 4px;
    white-space: nowrap;
}

.se-tool-btn {
    width: 28px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    background: transparent;
    color: #9e9e9e;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
}

.se-tool-btn:hover {
    background: #333;
    border-color: #555;
    color: #fff;
}

.se-tool-btn.active {
    background: #e94560;
    color: #fff;
    border-color: #e94560;
}

.se-toolbar-opt-label {
    font-size: 0.72rem;
    color: #9e9e9e;
    display: flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
}

.se-toolbar-opt-input {
    width: 42px;
    padding: 1px 4px;
    font-size: 0.72rem;
    background: #1e1e1e;
    color: #e0e0e0;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    outline: none;
}

.se-toolbar-opt-input:focus {
    border-color: #e94560;
}

.se-toolbar-opt-slider {
    width: 80px;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #3c3c3c;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
    vertical-align: middle;
}

.se-toolbar-opt-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #e94560;
    cursor: pointer;
}

.se-toolbar-opt-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #e94560;
    cursor: pointer;
    border: none;
}

.se-toolbar-opt-value {
    font-size: 0.72rem;
    color: #9e9e9e;
    min-width: 18px;
    text-align: center;
}

.se-toolbar-opt-checkbox {
    cursor: pointer;
}

.se-toolbar-spacer {
    flex: 1;
}

.se-tab-bar {
    display: flex;
    align-items: flex-end;
    height: 28px;
    background: #1e1e1e;
    border-bottom: 1px solid #3c3c3c;
    overflow-x: auto;
    flex-shrink: 0;
    padding: 0 4px;
    gap: 1px;
}

.se-tab-bar::-webkit-scrollbar { height: 3px; }
.se-tab-bar::-webkit-scrollbar-thumb { background: #555; border-radius: 2px; }

.se-tab {
    display: flex;
    align-items: center;
    padding: 4px 6px 4px 10px;
    font-size: 0.72rem;
    color: #9e9e9e;
    background: #2d2d30;
    border: 1px solid #3c3c3c;
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
    white-space: nowrap;
    gap: 6px;
    max-width: 160px;
    min-width: 60px;
    height: 24px;
    box-sizing: border-box;
}

.se-tab:hover { background: #37373d; color: #ccc; }
.se-tab.active { background: #252526; color: #e0e0e0; border-bottom-color: #252526; }
.se-tab.dragging { opacity: 0.4; }
.se-tab.drag-over-tab { border-left: 2px solid #e94560; }

.se-tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    pointer-events: none;
}

.se-tab-rename-input {
    background: #1e1e1e;
    border: 1px solid #e94560;
    color: #e0e0e0;
    font-size: 0.72rem;
    padding: 1px 4px;
    outline: none;
    border-radius: 2px;
    width: 80px;
    pointer-events: auto;
}

.se-tab-close {
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
    line-height: 1;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    flex-shrink: 0;
}

.se-tab-close:hover { background: rgba(233, 69, 96, 0.6); color: #fff; }

.se-tab-add {
    background: none;
    border: 1px solid transparent;
    color: #666;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 2px 8px;
    border-radius: 3px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-bottom: 1px;
}

.se-tab-add:hover { background: #333; color: #ccc; border-color: #555; }

.se-about-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.se-about-dialog {
    background: #2d2d30;
    border: 1px solid #555;
    border-radius: 8px;
    padding: 24px 32px;
    min-width: 280px;
    max-width: 360px;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.se-about-title { font-size: 1.1rem; font-weight: bold; color: #e0e0e0; margin-bottom: 12px; }
.se-about-body { font-size: 0.85rem; color: #b0b0b0; line-height: 1.6; margin-bottom: 18px; }
.se-about-body a { color: #e94560; text-decoration: none; }
.se-about-body a:hover { text-decoration: underline; }

.se-about-close {
    padding: 4px 18px;
    font-size: 0.78rem;
    background: #333;
    color: #ccc;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    cursor: pointer;
}

.se-about-close:hover { background: #e94560; color: #fff; border-color: #e94560; }

.se-welcome-overlay {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(30, 30, 30, 0.97);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 500;
}

.se-welcome-dialog {
    background: #252526;
    border: 1px solid #3c3c3c;
    border-radius: 10px;
    padding: 36px 44px;
    text-align: center;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
    min-width: 320px;
}

.se-welcome-title { font-size: 1.3rem; font-weight: bold; color: #e0e0e0; margin-bottom: 8px; }
.se-welcome-subtitle { font-size: 0.85rem; color: #9e9e9e; margin-bottom: 28px; }
.se-welcome-actions { display: flex; gap: 14px; justify-content: center; }

.se-welcome-btn {
    padding: 10px 32px;
    font-size: 0.9rem;
    border-radius: 5px;
    cursor: pointer;
    border: 1px solid #3c3c3c;
    background: #333;
    color: #ccc;
    transition: background 0.15s, color 0.15s;
}

.se-welcome-btn:hover { background: #444; color: #fff; }
.se-welcome-btn-primary { background: #e94560; color: #fff; border-color: #e94560; }
.se-welcome-btn-primary:hover { background: #d13550; }

.se-main {
    display: flex;
    flex: 1;
    overflow: hidden;
}

.se-canvas-area {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: #1a1a1a;
}

.se-drawing-canvas { display: block; width: 100%; height: 100%; }

.se-sidebar {
    width: 200px;
    min-width: 200px;
    border-left: 1px solid #3c3c3c;
    background: #1e1e1e;
    overflow-y: auto;
    flex-shrink: 0;
}

.se-color-picker { padding: 8px; }

.se-cp-sv-row { display: flex; gap: 4px; margin-bottom: 8px; }

.se-cp-sv {
    cursor: crosshair;
    border: 1px solid #3c3c3c;
    border-radius: 2px;
    width: 140px;
    height: 140px;
}

.se-cp-hue, .se-cp-alpha {
    cursor: pointer;
    border: 1px solid #3c3c3c;
    border-radius: 2px;
    width: 18px;
    height: 140px;
    flex-shrink: 0;
}

.se-cp-swatch-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
    flex-wrap: wrap;
}

.se-cp-swatch {
    width: 24px; height: 24px;
    border: 2px solid #555;
    border-radius: 3px;
    cursor: pointer;
}

.se-cp-fg { border-color: #e94560; z-index: 1; }

.se-cp-swap {
    background: none; border: none;
    color: #9e9e9e; cursor: pointer;
    font-size: 0.9rem; padding: 0 2px;
}
.se-cp-swap:hover { color: #fff; }

.se-cp-hex {
    flex: 1;
    min-width: 60px;
    padding: 2px 6px;
    font-size: 0.75rem;
    background: #1e1e1e;
    color: #e0e0e0;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    outline: none;
    font-family: monospace;
}
.se-cp-hex:focus { border-color: #e94560; }

.se-cp-label {
    font-size: 0.68rem;
    color: #5c5c5c;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
}

.se-cp-palette-section, .se-cp-recent-section { margin-top: 8px; }
.se-cp-palette, .se-cp-recent { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }

.se-cp-color-swatch {
    width: 16px; height: 16px;
    border: 1px solid #555;
    border-radius: 2px;
    cursor: pointer;
}
.se-cp-color-swatch:hover { border-color: #e94560; transform: scale(1.2); }

.se-cp-add-btn {
    margin-top: 4px;
    padding: 1px 8px;
    font-size: 0.72rem;
    background: #333;
    color: #ccc;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    cursor: pointer;
}
.se-cp-add-btn:hover { background: #444; }

.se-status {
    height: 20px;
    background: #252526;
    border-top: 1px solid #3c3c3c;
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-size: 0.68rem;
    color: #9e9e9e;
    flex-shrink: 0;
    gap: 16px;
}

.se-status-layer { color: #7a7a7a; }

.se-layers-panel {
    border-top: 1px solid #3c3c3c;
    display: flex;
    flex-direction: column;
}

.se-layers-header {
    font-size: 0.68rem;
    color: #5c5c5c;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 8px 4px;
}

.se-layers-list {
    overflow-y: auto;
    min-height: 40px;
    max-height: 200px;
}

.se-layer-row {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    cursor: pointer;
    gap: 4px;
    font-size: 0.75rem;
    border-bottom: 1px solid #2a2a2a;
    border-left: 2px solid transparent;
}

.se-layer-row:hover { background: #2a2d2e; }
.se-layer-row.active { background: #37373d; border-left-color: #e94560; }
.se-layer-row.selected { background: #2a3a4a; border-left-color: #61afef; }
.se-layer-row.active.selected { background: #37373d; border-left-color: #e94560; box-shadow: inset 0 0 0 1px #61afef; }
.se-layer-row.dragging { opacity: 0.4; }
.se-layer-row.drag-over { border-top: 2px solid #e94560; }

.se-layer-vis-btn {
    background: none; border: none;
    color: #9e9e9e; cursor: pointer;
    font-size: 0.72rem; padding: 0;
    width: 20px; text-align: center; flex-shrink: 0;
}
.se-layer-vis-btn:hover { color: #fff; }

.se-layer-name {
    flex: 1;
    color: #d4d4d4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.se-layer-opacity-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
}

.se-layer-opacity-slider {
    width: 50px; height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #3c3c3c;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}

.se-layer-opacity-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px; height: 10px;
    border-radius: 50%;
    background: #e94560;
    cursor: pointer;
}

.se-layer-opacity-slider::-moz-range-thumb {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: #e94560;
    cursor: pointer;
    border: none;
}

.se-layer-opacity-label {
    color: #7a7a7a;
    font-size: 0.62rem;
    min-width: 28px;
    text-align: right;
}

.se-layer-rename-input {
    background: #1e1e1e;
    border: 1px solid #e94560;
    color: #e0e0e0;
    font-size: 0.72rem;
    padding: 1px 4px;
    outline: none;
    border-radius: 2px;
    width: 100%;
}

.se-layers-actions {
    display: flex;
    gap: 2px;
    padding: 4px 8px;
    flex-wrap: wrap;
}

.se-layers-action-btn {
    padding: 2px 6px;
    font-size: 0.68rem;
    background: #333;
    color: #ccc;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    cursor: pointer;
}
.se-layers-action-btn:hover { background: #444; color: #fff; }
.se-layers-action-btn.disabled { opacity: 0.35; cursor: default; pointer-events: none; }

.se-modal-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100%; height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
}

.se-modal-dialog {
    background: #252526;
    border: 1px solid #3c3c3c;
    border-radius: 6px;
    min-width: 300px;
    max-width: 420px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.se-modal-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #e0e0e0;
    padding: 14px 16px 8px;
    border-bottom: 1px solid #3c3c3c;
}

.se-modal-body { padding: 14px 16px; }

.se-modal-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 12px;
}

.se-modal-label { font-size: 0.78rem; color: #ccc; white-space: nowrap; }

.se-modal-input, .se-modal-select {
    flex: 1;
    padding: 4px 8px;
    font-size: 0.78rem;
    background: #1e1e1e;
    color: #e0e0e0;
    border: 1px solid #3c3c3c;
    border-radius: 3px;
    outline: none;
}

.se-modal-input:focus, .se-modal-select:focus { border-color: #e94560; }
.se-modal-select { cursor: pointer; }
.se-modal-select option { background: #1e1e1e; color: #e0e0e0; }

.se-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 16px 14px;
}

.se-modal-btn {
    padding: 5px 16px;
    font-size: 0.78rem;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid #3c3c3c;
}

.se-modal-btn-cancel { background: #333; color: #ccc; }
.se-modal-btn-cancel:hover { background: #444; color: #fff; }
.se-modal-btn-ok { background: #e94560; color: #fff; border-color: #e94560; }
.se-modal-btn-ok:hover { background: #d13550; }
`;

export { createSpriteEditor };
