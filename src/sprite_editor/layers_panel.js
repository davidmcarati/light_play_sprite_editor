class LayersPanel {
    constructor(container, callbacks = {}) {
        this._container = container;
        this._cb = callbacks;

        this._layers = [];
        this._activeIndex = 0;
        this._selectedIndices = new Set();

        this._dragState = null;
        this._boundDragMove = (e) => this._onDragMove(e);
        this._boundDragUp = (e) => this._onDragUp(e);

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

        this._mkBtn(actions, "+",      "Add layer",             () => { if (this._cb.onAdd) this._cb.onAdd(); });
        this._mkBtn(actions, "\u2750", "Duplicate layer",       () => { if (this._cb.onDuplicate) this._cb.onDuplicate(this._activeIndex); });
        this._mergeBtn = this._mkBtn(actions, "\u2B07", "Merge selected layers", () => this._doMerge());
        this._mergeBtn.disabled = true;
        this._mergeBtn.classList.add("disabled");
        this._mkBtn(actions, "\u2715", "Remove layer",          () => { if (this._cb.onRemove) this._cb.onRemove(this._activeIndex); });

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
        this._selectedIndices.forEach(idx => {
            if (idx >= layers.length) this._selectedIndices.delete(idx);
        });
        this._renderList();
        this._syncMergeBtn();
    }

    _renderList() {
        this._listEl.innerHTML = "";
        for (let i = this._layers.length - 1; i >= 0; i--) {
            this._listEl.appendChild(this._createLayerRow(this._layers[i], i));
        }
    }

    _createLayerRow(layer, idx) {
        const row = document.createElement("div");
        row.className = "se-layer-row";
        row.dataset.idx = idx;
        if (idx === this._activeIndex) row.classList.add("active");
        if (this._selectedIndices.has(idx)) row.classList.add("selected");

        row.addEventListener("mousedown", (e) => this._onRowMouseDown(e, row, idx));

        const visBtn = document.createElement("button");
        visBtn.className = "se-layer-vis-btn";
        visBtn.textContent = layer.visible ? "\uD83D\uDC41" : "\u2014";
        visBtn.title = layer.visible ? "Hide layer" : "Show layer";
        visBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this._cb.onVisibilityChange) this._cb.onVisibilityChange(idx, !layer.visible);
        });
        row.appendChild(visBtn);

        const nameEl = document.createElement("span");
        nameEl.className = "se-layer-name";
        nameEl.textContent = layer.name;
        nameEl.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            this._startRename(nameEl, idx);
        });
        row.appendChild(nameEl);

        row.appendChild(this._createOpacityControl(layer, idx));
        this._attachLayerClickHandler(row, idx);

        return row;
    }

    _onRowMouseDown(e, row, idx) {
        if (e.button !== 0) return;
        const tag = e.target.tagName;
        if (tag === "BUTTON" || tag === "INPUT") return;

        const startY = e.clientY;
        this._dragState = { idx, row, startY, started: false };

        window.addEventListener("mousemove", this._boundDragMove);
        window.addEventListener("mouseup", this._boundDragUp);
    }

    _onDragMove(e) {
        if (!this._dragState) return;
        const dy = Math.abs(e.clientY - this._dragState.startY);

        if (!this._dragState.started) {
            if (dy < 4) return;
            this._dragState.started = true;
            this._dragState.row.classList.add("dragging");
        }

        this._clearDropIndicators();
        const target = this._getRowAt(e.clientY);
        if (target && target.idx !== this._dragState.idx) {
            const fromIdx = this._dragState.idx;
            const cls = fromIdx < target.idx ? "drag-insert-above" : "drag-insert-below";
            target.row.classList.add(cls);
        }
    }

    _onDragUp(e) {
        window.removeEventListener("mousemove", this._boundDragMove);
        window.removeEventListener("mouseup", this._boundDragUp);

        if (!this._dragState) return;
        const state = this._dragState;
        this._dragState = null;

        state.row.classList.remove("dragging");
        this._clearDropIndicators();

        if (!state.started) return;

        const target = this._getRowAt(e.clientY);
        if (target && target.idx !== state.idx) {
            if (this._cb.onReorder) this._cb.onReorder(state.idx, target.idx);
        }
    }

    _getRowAt(clientY) {
        const rows = this._listEl.querySelectorAll(".se-layer-row");
        for (const row of rows) {
            const rect = row.getBoundingClientRect();
            if (clientY >= rect.top && clientY <= rect.bottom) {
                return { row, idx: parseInt(row.dataset.idx, 10) };
            }
        }
        return null;
    }

    _clearDropIndicators() {
        this._listEl.querySelectorAll(".se-layer-row").forEach(r => {
            r.classList.remove("drag-insert-above", "drag-insert-below");
        });
    }

    _createOpacityControl(layer, idx) {
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

        const opLabel = document.createElement("span");
        opLabel.className = "se-layer-opacity-label";
        opLabel.textContent = Math.round(layer.opacity * 100) + "%";

        opSlider.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            if (this._cb.onOpacityStart) this._cb.onOpacityStart(idx);
        });
        opSlider.addEventListener("input", (e) => {
            e.stopPropagation();
            opLabel.textContent = parseInt(opSlider.value) + "%";
            if (this._cb.onOpacityChange) this._cb.onOpacityChange(idx, parseInt(opSlider.value) / 100);
        });

        opWrap.appendChild(opSlider);
        opWrap.appendChild(opLabel);
        return opWrap;
    }

    _attachLayerClickHandler(row, idx) {
        row.addEventListener("click", (e) => {
            if (this._dragState && this._dragState.started) return;
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
                if (this._cb.onActiveChange) this._cb.onActiveChange(idx);
            }
        });
    }

    _doMerge() {
        if (this._selectedIndices.size < 2) return;
        const indices = Array.from(this._selectedIndices).sort((a, b) => a - b);
        this._selectedIndices.clear();
        if (this._cb.onMerge) this._cb.onMerge(indices);
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
            if (name && this._cb.onRename) this._cb.onRename(index, name);
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

    destroy() {
        window.removeEventListener("mousemove", this._boundDragMove);
        window.removeEventListener("mouseup", this._boundDragUp);
    }
}

export { LayersPanel };
