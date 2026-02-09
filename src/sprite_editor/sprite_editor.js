import { Color } from "./color.js";
import { SpriteState, SpriteHistory } from "./sprite_data.js";
import { LayerStack } from "./layer_data.js";
import { ALL_TOOLS } from "./tools.js";
import { SpriteCanvas } from "./sprite_canvas.js";
import { ColorPicker } from "./color_picker.js";
import { SpriteToolbar } from "./toolbar.js";
import { LayersPanel } from "./layers_panel.js";
import { EditorActions } from "./sprite_editor_actions.js";
import { EditorTabMethods } from "./sprite_editor_tabs.js";

const PIXEL_TOOLS_ON_MOVE = new Set(["Pencil", "Eraser", "Line", "Rectangle", "Ellipse"]);

function createSpriteEditor(container, options = {}) {
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

        this._buildToolbarAndTabs(wrapper);
        this._buildMainArea(wrapper);
        this._buildStatusBar(wrapper);

        this._container.appendChild(wrapper);
        this._initToolbarState();
        wrapper.focus();
    }

    _buildToolbarAndTabs(wrapper) {
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
    }

    _buildMainArea(wrapper) {
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
    }

    _buildStatusBar(wrapper) {
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
    }

    _initToolbarState() {
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
        title.textContent = "Light Play \u2014 Sprite Editor";
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

    _setupKeyboard() {
        this._boundKeyDown = (e) => this._onKeyDown(e);
        this._wrapper.addEventListener("keydown", this._boundKeyDown);
    }

    _onKeyDown(e) {
        const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA";

        if (e.ctrlKey || e.metaKey) {
            this._handleCtrlShortcut(e);
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

    _handleCtrlShortcut(e) {
        switch (e.key.toLowerCase()) {
            case "z":
                if (!e.shiftKey) { e.preventDefault(); e.stopPropagation(); this.undo(); }
                return;
            case "y":
                e.preventDefault(); e.stopPropagation(); this.redo(); return;
            case "c":
                e.preventDefault(); e.stopPropagation(); this.copySelection(); return;
            case "x":
                e.preventDefault(); e.stopPropagation(); this.cutSelection(); return;
            case "v":
                e.preventDefault(); e.stopPropagation(); this.paste(); return;
            case "a":
                e.preventDefault(); e.stopPropagation(); this.selectAll(); return;
            case "d":
                e.preventDefault(); e.stopPropagation(); this.deselect(); return;
            case "s":
                e.preventDefault(); e.stopPropagation();
                this._handleAction(e.shiftKey ? "saveAs" : "save");
                return;
            case "0":
                e.preventDefault(); e.stopPropagation();
                this._spriteCanvas.zoomToFit();
                return;
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

    destroy() {
        if (this._spriteCanvas) this._spriteCanvas.destroy();
        if (this._colorPicker) this._colorPicker.destroy();
        if (this._toolbar) this._toolbar.destroy();
        if (this._layersPanel) this._layersPanel.destroy();
        if (this._wrapper) this._wrapper.removeEventListener("keydown", this._boundKeyDown);
        this._container.innerHTML = "";
    }
}

Object.assign(SpriteEditorInstance.prototype, EditorActions);
Object.assign(SpriteEditorInstance.prototype, EditorTabMethods);

export { createSpriteEditor };
