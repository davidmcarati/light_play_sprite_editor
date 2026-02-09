import { SpriteState } from "./sprite_data.js";
import { LayerStack } from "./layer_data.js";
import { serializeToBlob, deserializeFromBlob } from "./lsprite_format.js";
import { ModalDialog } from "./modal_dialog.js";

const FORMAT_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp"
};

const EditorActions = {
    async _handleAction(action) {
        if (action === "new")         this._showNewDialog();
        else if (action === "open")   await this._openFile();
        else if (action === "save")   await this._save();
        else if (action === "saveAs") await this._saveAs();
        else if (action === "export") await this._export();
    },

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
    },

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
    },

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
    },

    async _export() {
        if (!this._onExport) return;
        const result = await this._showExportDialog();
        if (!result) return;
        await this._executeExport(result);
    },

    async _showExportDialog() {
        let lastSettings = {};
        try { lastSettings = JSON.parse(localStorage.getItem("se-export-settings") || "{}"); } catch (_) {}

        const modal = new ModalDialog();
        return modal.show({
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
                        { value: "1", label: "1\u00D7" },
                        { value: "2", label: "2\u00D7" },
                        { value: "4", label: "4\u00D7" },
                        { value: "8", label: "8\u00D7" },
                        { value: "16", label: "16\u00D7" }
                    ]
                }
            ]
        });
    },

    async _executeExport(result) {
        try {
            localStorage.setItem("se-export-settings", JSON.stringify({
                format: result.format, quality: result.quality, scale: result.scale
            }));
        } catch (_) {}

        try {
            const scale = parseInt(result.scale) || 1;
            const quality = Math.max(1, Math.min(100, result.quality)) / 100;

            const flat = this._layerStack.flatten();
            const srcCanvas = document.createElement("canvas");
            srcCanvas.width = this._layerStack.width;
            srcCanvas.height = this._layerStack.height;
            srcCanvas.getContext("2d").putImageData(flat.toImageData(), 0, 0);

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
    },

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
    },

    async loadFromLsprite(blob) {
        const stack = await deserializeFromBlob(blob);
        this._openInTab(stack, blob.name || "");
    },

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
    },

    pushHistory() {
        this._history.push(this._layerStack);
    },

    markDirty() {
        if (!this._dirty) {
            this._dirty = true;
            if (this._onDirtyChange) this._onDirtyChange(true);
            this._renderTabBar();
        }
    },

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
    },

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
    },

    _discardFloatingPaste() {
        if (!this.floatingPaste) return;
        this.floatingPaste = null;
        this.selection = null;
        this._spriteCanvas.setFloatingPaste(null);
        this._spriteCanvas.setSelection(null);
    },

    setForegroundColor(color) {
        this.foregroundColor = color;
        this._colorPicker.setForeground(color);
    },

    swapColors() {
        const tmp = this.foregroundColor;
        this.foregroundColor = this.backgroundColor;
        this.backgroundColor = tmp;
        this._colorPicker.swapColors();
    },

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
    },

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
    },

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
    },

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
    },

    selectAll() {
        this.selection = {
            x: 0, y: 0,
            width: this._layerStack.width,
            height: this._layerStack.height
        };
        this._spriteCanvas.setSelection(this.selection);
        this._spriteCanvas.redraw();
    },

    deselect() {
        this.commitFloatingPaste();
        this.selection = null;
        this._spriteCanvas.setSelection(null);
        this._spriteCanvas.redraw();
    },

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
    },

    createNew(width, height, colorDepth = 32) {
        this._openInTab(new LayerStack(width, height, colorDepth), "");
    },

    resizeCanvas(newWidth, newHeight, offsetX = 0, offsetY = 0) {
        this.pushHistory();
        this._layerStack = this._layerStack.resize(newWidth, newHeight, offsetX, offsetY);
        this._toolbar.setCanvasSize(newWidth, newHeight);
        this._spriteCanvas.setLayerStack(this._layerStack, true);
        this._updateLayersPanel();
        this.markDirty();
    },

    getState() {
        return {
            layerStackClone: this._layerStack.clone(),
            fileName: this._fileName
        };
    },

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
    },

    async getBlob()   { return this._layerStack.toBlob(); },
    getImageData()    { return this._layerStack.toImageData(); },
    setFileName(name) { this._fileName = name; this._toolbar.setFileName(name); },
    getFileName()     { return this._fileName; },
    isDirty()         { return this._dirty; },
    getLayerStack()   { return this._layerStack; },

    _setActiveLayer(index) {
        if (index < 0 || index >= this._layerStack.layers.length) return;
        if (index === this._layerStack.activeIndex) return;
        this.commitFloatingPaste();
        this._layerStack.activeIndex = index;
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
    },

    _setLayerVisibility(index, visible) {
        this.pushHistory();
        this._layerStack.layers[index].visible = visible;
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
        this.markDirty();
    },

    _startLayerOpacityChange(index) {
        this.pushHistory();
    },

    _setLayerOpacity(index, opacity) {
        this._layerStack.layers[index].opacity = opacity;
        this._spriteCanvas.invalidateComposite();
        this._spriteCanvas.redraw();
        this.markDirty();
    },

    _addLayer() {
        this.pushHistory();
        this._layerStack.addLayer();
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
        this.markDirty();
    },

    _removeLayer(index) {
        if (this._layerStack.layers.length <= 1) return;
        this.pushHistory();
        this._layerStack.removeLayer(index);
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
        this.markDirty();
    },

    _moveLayerUp(index) {
        this.pushHistory();
        if (this._layerStack.moveLayerUp(index)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    },

    _moveLayerDown(index) {
        this.pushHistory();
        if (this._layerStack.moveLayerDown(index)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    },

    _duplicateLayer(index) {
        this.pushHistory();
        this._layerStack.duplicateLayer(index);
        this._updateLayersPanel();
        this._spriteCanvas.redraw();
        this.markDirty();
    },

    _mergeLayerDown(index) {
        if (index <= 0) return;
        this.pushHistory();
        if (this._layerStack.mergeDown(index)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    },

    _reorderLayer(fromIndex, toIndex) {
        this.pushHistory();
        if (this._layerStack.reorderLayer(fromIndex, toIndex)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    },

    _mergeLayers(indices) {
        if (!indices || indices.length < 2) return;
        this.pushHistory();
        if (this._layerStack.mergeLayers(indices)) {
            this._updateLayersPanel();
            this._spriteCanvas.redraw();
            this.markDirty();
        }
    },

    _renameLayer(index, name) {
        this._layerStack.layers[index].name = name;
        this._updateLayersPanel();
    }
};

export { EditorActions };
