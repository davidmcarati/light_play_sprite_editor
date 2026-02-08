class LayersPanel {
    constructor(container, callbacks = {}) {
        this._container = container;
        this._cb = callbacks;

        this._layers = [];
        this._activeIndex = 0;
        this._selectedIndices = new Set();
        this._dragSourceIndex = null;

        this._buildUI();
    }

    _buildUI() {
        this._container.innerHTML = "";
        this._container.className = "se-layers-panel";

        const header = document.createElement("div");
        header.className = "se-layers-header";
        header.textContent = "Layers";
        this._container.appendChild(header);

        this._listEl = document.createElement("div");
        this._listEl.className = "se-layers-list";
        this._container.appendChild(this._listEl);

        const actions = document.createElement("div");
        actions.className = "se-layers-actions";

        this._mkBtn(actions, "+",      "Add layer",             () => (this._cb.onAdd || (() => {}))());
        this._mkBtn(actions, "\u2750", "Duplicate layer",       () => (this._cb.onDuplicate || (() => {}))(this._activeIndex));
        this._mergeBtn = this._mkBtn(actions, "\u2B07", "Merge selected layers", () => this._doMerge());
        this._mergeBtn.disabled = true;
        this._mergeBtn.classList.add("disabled");
        this._mkBtn(actions, "\u2715", "Remove layer",          () => (this._cb.onRemove || (() => {}))(this._activeIndex));

        this._container.appendChild(actions);
    }

    _mkBtn(parent, text, title, onClick) {
        const btn = document.createElement("button");
        btn.className = "se-layers-action-btn";
        btn.textContent = text;
        btn.title = title;
        btn.addEventListener("click", onClick);
        parent.appendChild(btn);
        return btn;
    }

    update(layers, activeIndex) {
        this._layers = layers;
        this._activeIndex = activeIndex;
        // Purge stale indices
        this._selectedIndices.forEach(idx => {
            if (idx >= layers.length) this._selectedIndices.delete(idx);
        });
        this._renderList();
        this._syncMergeBtn();
    }

    _renderList() {
        this._listEl.innerHTML = "";

        for (let i = this._layers.length - 1; i >= 0; i--) {
            const layer = this._layers[i];
            const row = document.createElement("div");
            row.className = "se-layer-row";
            if (i === this._activeIndex) row.classList.add("active");
            if (this._selectedIndices.has(i)) row.classList.add("selected");

            // Drag-and-drop reorder
            row.draggable = true;
            const idx = i;
            row.addEventListener("dragstart", (e) => {
                this._dragSourceIndex = idx;
                row.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(idx));
            });
            row.addEventListener("dragend", () => {
                row.classList.remove("dragging");
                this._dragSourceIndex = null;
                this._listEl.querySelectorAll(".se-layer-row").forEach(r => r.classList.remove("drag-over"));
            });
            row.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                this._listEl.querySelectorAll(".se-layer-row").forEach(r => r.classList.remove("drag-over"));
                row.classList.add("drag-over");
            });
            row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
            row.addEventListener("drop", (e) => {
                e.preventDefault();
                row.classList.remove("drag-over");
                if (this._dragSourceIndex !== null && this._dragSourceIndex !== idx) {
                    (this._cb.onReorder || (() => {}))(this._dragSourceIndex, idx);
                }
                this._dragSourceIndex = null;
            });

            // Visibility toggle
            const visBtn = document.createElement("button");
            visBtn.className = "se-layer-vis-btn";
            visBtn.textContent = layer.visible ? "\uD83D\uDC41" : "\u2014";
            visBtn.title = layer.visible ? "Hide layer" : "Show layer";
            visBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                (this._cb.onVisibilityChange || (() => {}))(idx, !layer.visible);
            });
            row.appendChild(visBtn);

            // Name (double-click to rename)
            const nameEl = document.createElement("span");
            nameEl.className = "se-layer-name";
            nameEl.textContent = layer.name;
            nameEl.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                this._startRename(nameEl, idx);
            });
            row.appendChild(nameEl);

            // Opacity slider
            const opWrap = document.createElement("div");
            opWrap.className = "se-layer-opacity-wrap";
            opWrap.addEventListener("click", (e) => e.stopPropagation());

            const opSlider = document.createElement("input");
            opSlider.type = "range";
            opSlider.className = "se-layer-opacity-slider";
            opSlider.min = "0";
            opSlider.max = "100";
            opSlider.value = Math.round(layer.opacity * 100);
            opSlider.title = "Layer opacity";
            opSlider.addEventListener("mousedown", (e) => {
                e.stopPropagation();
                row.draggable = false;
                (this._cb.onOpacityStart || (() => {}))(idx);
            });
            opSlider.addEventListener("mouseup", () => { row.draggable = true; });
            opSlider.addEventListener("input", (e) => {
                e.stopPropagation();
                opLabel.textContent = parseInt(opSlider.value) + "%";
                (this._cb.onOpacityChange || (() => {}))(idx, parseInt(opSlider.value) / 100);
            });
            opSlider.addEventListener("change", (e) => {
                e.stopPropagation();
                row.draggable = true;
            });
            opWrap.appendChild(opSlider);

            const opLabel = document.createElement("span");
            opLabel.className = "se-layer-opacity-label";
            opLabel.textContent = Math.round(layer.opacity * 100) + "%";
            opWrap.appendChild(opLabel);

            row.appendChild(opWrap);

            // Click = select; shift+click = multi-select for merge
            row.addEventListener("click", (e) => {
                if (e.shiftKey) {
                    if (this._selectedIndices.has(idx)) {
                        this._selectedIndices.delete(idx);
                        row.classList.remove("selected");
                    } else {
                        this._selectedIndices.add(idx);
                        row.classList.add("selected");
                    }
                    this._syncMergeBtn();
                } else {
                    this._selectedIndices.clear();
                    (this._cb.onActiveChange || (() => {}))(idx);
                }
            });

            this._listEl.appendChild(row);
        }
    }

    _doMerge() {
        if (this._selectedIndices.size < 2) return;
        const indices = Array.from(this._selectedIndices).sort((a, b) => a - b);
        this._selectedIndices.clear();
        (this._cb.onMerge || (() => {}))(indices);
        this._syncMergeBtn();
    }

    _syncMergeBtn() {
        if (!this._mergeBtn) return;
        const on = this._selectedIndices.size >= 2;
        this._mergeBtn.disabled = !on;
        this._mergeBtn.classList.toggle("disabled", !on);
    }

    _startRename(nameEl, index) {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "se-layer-rename-input";
        input.value = this._layers[index].name;

        const commit = () => {
            const name = input.value.trim();
            if (name) (this._cb.onRename || (() => {}))(index, name);
        };

        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); input.blur(); }
            if (e.key === "Escape") { input.removeEventListener("blur", commit); this._renderList(); }
            e.stopPropagation();
        });

        nameEl.textContent = "";
        nameEl.appendChild(input);
        input.focus();
        input.select();
    }

    destroy() {}
}

export { LayersPanel };
