import { Color, clamp } from "./color.js";

const SV_SIZE = 140;
const STRIP_WIDTH = 18;
const STRIP_HEIGHT = 140;

class ColorPicker {
    constructor(container, options = {}) {
        this._container = container;
        this._onChange = options.onChange;

        this._foreground = new Color(0, 0, 0, 255);
        this._background = new Color(255, 255, 255, 255);
        this._hue = 0;
        this._sat = 0;
        this._val = 0;
        this._alpha = 255;
        this._recentColors = [];
        this._palette = this._loadPalette();

        this._pickingSV = false;
        this._pickingHue = false;
        this._pickingAlpha = false;

        this._buildUI();
        this._syncFromColor(this._foreground);
    }

    _buildUI() {
        this._container.innerHTML = "";
        this._container.className = "se-color-picker";

        this._container.appendChild(this._buildSVRow());
        this._container.appendChild(this._buildSwatchRow());
        this._container.appendChild(this._buildPaletteSection());
        this._container.appendChild(this._buildRecentSection());
        this._attachPickerListeners();

        this._drawHueStrip();
        this._drawSV();
        this._drawAlphaStrip();
        this._updateSwatches();
        this._renderPalette();
        this._renderRecent();
    }

    _buildSVRow() {
        const svRow = document.createElement("div");
        svRow.className = "se-cp-sv-row";

        this._svCanvas = document.createElement("canvas");
        this._svCanvas.className = "se-cp-sv";
        this._svCanvas.width = SV_SIZE;
        this._svCanvas.height = SV_SIZE;
        svRow.appendChild(this._svCanvas);

        this._hueCanvas = document.createElement("canvas");
        this._hueCanvas.className = "se-cp-hue";
        this._hueCanvas.width = STRIP_WIDTH;
        this._hueCanvas.height = STRIP_HEIGHT;
        svRow.appendChild(this._hueCanvas);

        this._alphaCanvas = document.createElement("canvas");
        this._alphaCanvas.className = "se-cp-alpha";
        this._alphaCanvas.width = STRIP_WIDTH;
        this._alphaCanvas.height = STRIP_HEIGHT;
        svRow.appendChild(this._alphaCanvas);

        return svRow;
    }

    _buildSwatchRow() {
        const swatchRow = document.createElement("div");
        swatchRow.className = "se-cp-swatch-row";

        this._fgSwatch = document.createElement("div");
        this._fgSwatch.className = "se-cp-swatch se-cp-fg";
        this._fgSwatch.title = "Foreground color";

        this._bgSwatch = document.createElement("div");
        this._bgSwatch.className = "se-cp-swatch se-cp-bg";
        this._bgSwatch.title = "Background color (click to swap)";

        const swapBtn = document.createElement("button");
        swapBtn.className = "se-cp-swap";
        swapBtn.textContent = "\u21C4";
        swapBtn.title = "Swap colors (X)";
        swapBtn.addEventListener("click", () => this.swapColors());

        swatchRow.appendChild(this._fgSwatch);
        swatchRow.appendChild(swapBtn);
        swatchRow.appendChild(this._bgSwatch);

        this._hexInput = document.createElement("input");
        this._hexInput.className = "se-cp-hex";
        this._hexInput.type = "text";
        this._hexInput.placeholder = "#RRGGBB";
        this._hexInput.maxLength = 9;
        this._hexInput.addEventListener("change", () => {
            const c = Color.fromHex(this._hexInput.value);
            this._foreground = c;
            this._syncFromColor(c);
            this._fireChange();
        });
        swatchRow.appendChild(this._hexInput);

        this._bgSwatch.addEventListener("click", () => this.swapColors());

        return swatchRow;
    }

    _buildPaletteSection() {
        const section = document.createElement("div");
        section.className = "se-cp-palette-section";

        const label = document.createElement("div");
        label.className = "se-cp-label";
        label.textContent = "Palette";
        section.appendChild(label);

        this._paletteContainer = document.createElement("div");
        this._paletteContainer.className = "se-cp-palette";
        section.appendChild(this._paletteContainer);

        const addBtn = document.createElement("button");
        addBtn.className = "se-cp-add-btn";
        addBtn.textContent = "+";
        addBtn.title = "Add current color to palette";
        addBtn.addEventListener("click", () => this._addToPalette());
        section.appendChild(addBtn);

        return section;
    }

    _buildRecentSection() {
        const section = document.createElement("div");
        section.className = "se-cp-recent-section";

        const label = document.createElement("div");
        label.className = "se-cp-label";
        label.textContent = "Recent";
        section.appendChild(label);

        this._recentContainer = document.createElement("div");
        this._recentContainer.className = "se-cp-recent";
        section.appendChild(this._recentContainer);

        return section;
    }

    _attachPickerListeners() {
        this._svCanvas.addEventListener("mousedown", (e) => {
            this._pickingSV = true;
            this._pickSV(e);
        });
        this._hueCanvas.addEventListener("mousedown", (e) => {
            this._pickingHue = true;
            this._pickHue(e);
        });
        this._alphaCanvas.addEventListener("mousedown", (e) => {
            this._pickingAlpha = true;
            this._pickAlpha(e);
        });

        this._boundMove = (e) => this._onMouseMove(e);
        this._boundUp = () => this._onMouseUp();
        window.addEventListener("mousemove", this._boundMove);
        window.addEventListener("mouseup", this._boundUp);
    }

    _pickSV(e) {
        const rect = this._svCanvas.getBoundingClientRect();
        const x = clamp(e.clientX - rect.left, 0, rect.width);
        const y = clamp(e.clientY - rect.top, 0, rect.height);
        this._sat = x / rect.width;
        this._val = 1 - y / rect.height;
        this._updateColorFromHSV();
    }

    _pickHue(e) {
        const rect = this._hueCanvas.getBoundingClientRect();
        const y = clamp(e.clientY - rect.top, 0, rect.height);
        this._hue = (y / rect.height) * 360;
        this._drawSV();
        this._updateColorFromHSV();
    }

    _pickAlpha(e) {
        const rect = this._alphaCanvas.getBoundingClientRect();
        const y = clamp(e.clientY - rect.top, 0, rect.height);
        this._alpha = Math.round((1 - y / rect.height) * 255);
        this._updateColorFromHSV();
    }

    _onMouseMove(e) {
        if (this._pickingSV) this._pickSV(e);
        if (this._pickingHue) this._pickHue(e);
        if (this._pickingAlpha) this._pickAlpha(e);
    }

    _onMouseUp() {
        if (this._pickingSV || this._pickingHue || this._pickingAlpha) {
            this._addToRecent(this._foreground);
        }
        this._pickingSV = false;
        this._pickingHue = false;
        this._pickingAlpha = false;
    }

    _updateColorFromHSV() {
        this._foreground = Color.fromHSV(this._hue, this._sat, this._val, this._alpha);
        this._drawSV();
        this._drawAlphaStrip();
        this._drawHueStrip();
        this._updateSwatches();
        this._hexInput.value = this._foreground.toHex();
        this._fireChange();
    }

    _syncFromColor(color) {
        const hsv = color.toHSV();
        this._hue = hsv.h;
        this._sat = hsv.s;
        this._val = hsv.v;
        this._alpha = color.a;
        this._drawHueStrip();
        this._drawSV();
        this._drawAlphaStrip();
        this._updateSwatches();
        this._hexInput.value = color.toHex();
    }

    _drawHueStrip() {
        const ctx = this._hueCanvas.getContext("2d");
        const w = this._hueCanvas.width;
        const h = this._hueCanvas.height;

        for (let y = 0; y < h; y++) {
            const hue = (y / h) * 360;
            const c = Color.fromHSV(hue, 1, 1);
            ctx.fillStyle = c.toCSS();
            ctx.fillRect(0, y, w, 1);
        }

        const indicatorY = (this._hue / 360) * h;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, indicatorY - 2, w, 4);
    }

    _drawSV() {
        const ctx = this._svCanvas.getContext("2d");
        const w = this._svCanvas.width;
        const h = this._svCanvas.height;

        const baseColor = Color.fromHSV(this._hue, 1, 1);

        const hGrad = ctx.createLinearGradient(0, 0, w, 0);
        hGrad.addColorStop(0, "#ffffff");
        hGrad.addColorStop(1, baseColor.toCSS());
        ctx.fillStyle = hGrad;
        ctx.fillRect(0, 0, w, h);

        const vGrad = ctx.createLinearGradient(0, 0, 0, h);
        vGrad.addColorStop(0, "rgba(0,0,0,0)");
        vGrad.addColorStop(1, "rgba(0,0,0,1)");
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, w, h);

        const ix = this._sat * w;
        const iy = (1 - this._val) * h;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ix, iy, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ix, iy, 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    _drawAlphaStrip() {
        const ctx = this._alphaCanvas.getContext("2d");
        const w = this._alphaCanvas.width;
        const h = this._alphaCanvas.height;

        const cellSize = 5;
        for (let y = 0; y < h; y += cellSize) {
            for (let x = 0; x < w; x += cellSize) {
                const row = Math.floor(y / cellSize);
                const col = Math.floor(x / cellSize);
                ctx.fillStyle = (row + col) % 2 === 0 ? "#ccc" : "#999";
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        }

        const c = Color.fromHSV(this._hue, this._sat, this._val);
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, `rgba(${c.r},${c.g},${c.b},1)`);
        gradient.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        const indicatorY = (1 - this._alpha / 255) * h;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.strokeRect(0, indicatorY - 2, w, 4);
    }

    _updateSwatches() {
        this._fgSwatch.style.backgroundColor = this._foreground.toRGBA();
        this._bgSwatch.style.backgroundColor = this._background.toRGBA();
    }

    _addToRecent(color) {
        const hex = color.toHex();
        this._recentColors = this._recentColors.filter(c => c.toHex() !== hex);
        this._recentColors.unshift(color.clone());
        if (this._recentColors.length > 16) this._recentColors.pop();
        this._renderRecent();
    }

    _addToPalette() {
        const c = this._foreground.clone();
        const hex = c.toHex();
        if (!this._palette.some(p => p.toHex() === hex)) {
            this._palette.push(c);
            this._savePalette();
            this._renderPalette();
        }
    }

    _renderPalette() {
        this._paletteContainer.innerHTML = "";
        this._palette.forEach((color, idx) => {
            const swatch = document.createElement("div");
            swatch.className = "se-cp-color-swatch";
            swatch.style.backgroundColor = color.toRGBA();
            swatch.title = color.toHex();
            swatch.addEventListener("click", () => {
                this._foreground = color.clone();
                this._syncFromColor(this._foreground);
                this._fireChange();
            });
            swatch.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                this._palette.splice(idx, 1);
                this._savePalette();
                this._renderPalette();
            });
            this._paletteContainer.appendChild(swatch);
        });
    }

    _renderRecent() {
        this._recentContainer.innerHTML = "";
        this._recentColors.forEach(color => {
            const swatch = document.createElement("div");
            swatch.className = "se-cp-color-swatch";
            swatch.style.backgroundColor = color.toRGBA();
            swatch.title = color.toHex();
            swatch.addEventListener("click", () => {
                this._foreground = color.clone();
                this._syncFromColor(this._foreground);
                this._fireChange();
            });
            this._recentContainer.appendChild(swatch);
        });
    }

    _savePalette() {
        try {
            const data = this._palette.map(c => c.toHex());
            localStorage.setItem("se_palette", JSON.stringify(data));
        } catch { /* storage unavailable */ }
    }

    _loadPalette() {
        try {
            const data = localStorage.getItem("se_palette");
            if (data) {
                return JSON.parse(data).map(hex => Color.fromHex(hex));
            }
        } catch { /* storage unavailable */ }
        return [
            new Color(0, 0, 0), new Color(255, 255, 255),
            new Color(255, 0, 0), new Color(0, 255, 0),
            new Color(0, 0, 255), new Color(255, 255, 0),
            new Color(255, 0, 255), new Color(0, 255, 255),
            new Color(128, 128, 128), new Color(128, 0, 0),
            new Color(0, 128, 0), new Color(0, 0, 128)
        ];
    }

    getForeground() { return this._foreground.clone(); }
    getBackground() { return this._background.clone(); }

    setForeground(color) {
        this._foreground = color.clone();
        this._syncFromColor(this._foreground);
        this._addToRecent(color);
    }

    setBackground(color) {
        this._background = color.clone();
        this._updateSwatches();
    }

    swapColors() {
        const tmp = this._foreground.clone();
        this._foreground = this._background.clone();
        this._background = tmp;
        this._syncFromColor(this._foreground);
        this._fireChange();
    }

    _fireChange() {
        if (this._onChange) this._onChange(this._foreground);
    }

    destroy() {
        window.removeEventListener("mousemove", this._boundMove);
        window.removeEventListener("mouseup", this._boundUp);
    }
}

export { ColorPicker };
