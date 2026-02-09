class SpriteToolbar {
    constructor(container, options = {}) {
        this._container = container;
        this._onToolChange = options.onToolChange;
        this._onAction = options.onAction;
        this._onOptionChange = options.onOptionChange;
        this._onViewToggle = options.onViewToggle;

        this._activeTool = "Pencil";
        this._brushSize = 1;
        this._shapeFilled = false;
        this._fillTolerance = 0;
        this._zoomLevel = 8;
        this._canvasWidth = 0;
        this._canvasHeight = 0;
        this._fileName = "";
        this._toolButtons = {};
        this._rulersVisible = false;

        this._buildUI();
    }

    _buildUI() {
        this._container.innerHTML = "";
        this._container.className = "se-toolbar";

        this._buildFileGroup();
        this._container.appendChild(this._mkSep());
        this._buildViewGroup();
        this._container.appendChild(this._mkSep());
        this._buildInfoGroup();
        this._container.appendChild(this._mkSep());

        this._toolGroup = this._mkGroup("se-toolbar-tools");
        this._container.appendChild(this._toolGroup);

        this._container.appendChild(this._mkSep());

        this._optionsGroup = this._mkGroup("se-toolbar-options");
        this._container.appendChild(this._optionsGroup);

        const spacer = document.createElement("div");
        spacer.className = "se-toolbar-spacer";
        this._container.appendChild(spacer);

        const aboutGroup = this._mkGroup("se-toolbar-about");
        this._mkBtn(aboutGroup, "About", () => this._showAbout());
        this._container.appendChild(aboutGroup);

        this._updateLabels();
    }

    _buildFileGroup() {
        const fileGroup = this._mkGroup("se-toolbar-file");
        this._mkBtn(fileGroup, "New",     () => { if (this._onAction) this._onAction("new"); });
        this._mkBtn(fileGroup, "Open",    () => { if (this._onAction) this._onAction("open"); });
        this._mkBtn(fileGroup, "Save",    () => { if (this._onAction) this._onAction("save"); });
        this._mkBtn(fileGroup, "Save As", () => { if (this._onAction) this._onAction("saveAs"); });
        this._mkBtn(fileGroup, "Export",  () => { if (this._onAction) this._onAction("export"); });

        this._fileNameEl = document.createElement("span");
        this._fileNameEl.className = "se-toolbar-filename";
        fileGroup.appendChild(this._fileNameEl);
        this._container.appendChild(fileGroup);
    }

    _buildViewGroup() {
        const viewGroup = this._mkGroup("se-toolbar-view");
        this._rulersBtn = this._mkBtn(viewGroup, "Rulers", () => {
            this._rulersVisible = !this._rulersVisible;
            this._rulersBtn.classList.toggle("active", this._rulersVisible);
            if (this._onViewToggle) this._onViewToggle("rulers", this._rulersVisible);
        });
        this._container.appendChild(viewGroup);
    }

    _buildInfoGroup() {
        const infoGroup = this._mkGroup("se-toolbar-info");
        this._sizeLabel = document.createElement("span");
        this._sizeLabel.className = "se-toolbar-label";
        infoGroup.appendChild(this._sizeLabel);
        this._zoomLabel = document.createElement("span");
        this._zoomLabel.className = "se-toolbar-label";
        infoGroup.appendChild(this._zoomLabel);
        this._container.appendChild(infoGroup);
    }

    _showAbout() {
        const existing = document.querySelector(".se-about-overlay");
        if (existing) { existing.remove(); return; }

        const overlay = document.createElement("div");
        overlay.className = "se-about-overlay";

        const dialog = document.createElement("div");
        dialog.className = "se-about-dialog";

        const title = document.createElement("div");
        title.className = "se-about-title";
        title.textContent = "Light Play Sprite Editor";
        dialog.appendChild(title);

        const body = document.createElement("div");
        body.className = "se-about-body";
        body.innerHTML =
            'Split from a larger engine and made public \u2014 feel free to use and enjoy!<br><br>' +
            'Made by <strong>David Mkrtchian</strong><br>' +
            '<a href="https://www.davidmcarati.info" target="_blank" rel="noopener">www.davidmcarati.info</a><br><br>' +
            '<em>Coming soon: pixel-art bone animation tool & texture packer</em>';
        dialog.appendChild(body);

        const closeBtn = document.createElement("button");
        closeBtn.className = "se-about-close";
        closeBtn.textContent = "Close";
        closeBtn.addEventListener("click", () => overlay.remove());
        dialog.appendChild(closeBtn);

        overlay.appendChild(dialog);
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.remove();
        });
        document.body.appendChild(overlay);
    }

    setTools(tools) {
        this._toolGroup.innerHTML = "";
        this._toolButtons = {};

        tools.forEach(tool => {
            const btn = document.createElement("button");
            btn.className = "se-tool-btn";
            btn.title = `${tool.name} (${tool.shortcut})`;
            btn.textContent = tool.icon;
            btn.dataset.tool = tool.name;
            btn.addEventListener("click", () => {
                this.setActiveTool(tool.name);
                if (this._onToolChange) this._onToolChange(tool.name);
            });
            this._toolGroup.appendChild(btn);
            this._toolButtons[tool.name] = btn;
        });

        this._highlightActiveTool();
    }

    setActiveTool(name) {
        this._activeTool = name;
        this._highlightActiveTool();
    }

    updateOptions(toolOptions) {
        this._optionsGroup.innerHTML = "";

        if (toolOptions.includes("brushSize")) {
            const label = document.createElement("label");
            label.className = "se-toolbar-opt-label";
            label.textContent = "Size:";
            this._optionsGroup.appendChild(label);

            const slider = document.createElement("input");
            slider.type = "range";
            slider.className = "se-toolbar-opt-slider";
            slider.min = "1";
            slider.max = "32";
            slider.value = this._brushSize;

            const valLabel = document.createElement("span");
            valLabel.className = "se-toolbar-opt-value";
            valLabel.textContent = this._brushSize;

            slider.addEventListener("input", () => {
                this._brushSize = parseInt(slider.value) || 1;
                valLabel.textContent = this._brushSize;
                if (this._onOptionChange) this._onOptionChange("brushSize", this._brushSize);
            });
            this._optionsGroup.appendChild(slider);
            this._optionsGroup.appendChild(valLabel);
        }

        if (toolOptions.includes("shapeFilled")) {
            const label = document.createElement("label");
            label.className = "se-toolbar-opt-label se-toolbar-opt-checkbox";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = this._shapeFilled;
            cb.addEventListener("change", () => {
                this._shapeFilled = cb.checked;
                if (this._onOptionChange) this._onOptionChange("shapeFilled", this._shapeFilled);
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(" Filled"));
            this._optionsGroup.appendChild(label);
        }

        if (toolOptions.includes("fillTolerance")) {
            const label = document.createElement("label");
            label.className = "se-toolbar-opt-label";
            label.textContent = "Tol:";
            this._optionsGroup.appendChild(label);

            const input = document.createElement("input");
            input.type = "number";
            input.className = "se-toolbar-opt-input";
            input.min = "0";
            input.max = "255";
            input.value = this._fillTolerance;
            input.addEventListener("change", () => {
                this._fillTolerance = parseInt(input.value) || 0;
                if (this._onOptionChange) this._onOptionChange("fillTolerance", this._fillTolerance);
            });
            this._optionsGroup.appendChild(input);
        }
    }

    setCanvasSize(w, h) {
        this._canvasWidth = w;
        this._canvasHeight = h;
        this._updateLabels();
    }

    setZoom(z)          { this._zoomLevel = z; this._updateLabels(); }
    setFileName(name)   { this._fileName = name; if (this._fileNameEl) this._fileNameEl.textContent = name || "Untitled"; }

    setRulersVisible(visible) {
        this._rulersVisible = visible;
        if (this._rulersBtn) this._rulersBtn.classList.toggle("active", visible);
    }

    _highlightActiveTool() {
        for (const name in this._toolButtons) {
            this._toolButtons[name].classList.toggle("active", name === this._activeTool);
        }
    }

    _updateLabels() {
        if (this._sizeLabel) this._sizeLabel.textContent = `${this._canvasWidth}\u00D7${this._canvasHeight}`;
        if (this._zoomLabel) {
            if (this._zoomLevel >= 1) {
                this._zoomLabel.textContent = `${Math.round(this._zoomLevel)}x`;
            } else {
                this._zoomLabel.textContent = `${Math.round(this._zoomLevel * 100)}%`;
            }
        }
    }

    _mkGroup(className) {
        const g = document.createElement("div");
        g.className = `se-toolbar-group ${className}`;
        return g;
    }

    _mkSep() {
        const s = document.createElement("div");
        s.className = "se-toolbar-sep";
        return s;
    }

    _mkBtn(parent, text, onClick) {
        const btn = document.createElement("button");
        btn.className = "se-toolbar-btn";
        btn.textContent = text;
        btn.addEventListener("click", onClick);
        parent.appendChild(btn);
        return btn;
    }

    destroy() {}
}

export { SpriteToolbar };
