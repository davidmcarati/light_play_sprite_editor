const CHECKER_SIZE = 8;
const MIN_ZOOM = 0.01;
const MAX_ZOOM = 64;
const GRID_THRESHOLD = 4;
const RULER_SIZE = 20;

class SpriteCanvas {
    constructor(container, callbacks) {
        this._container = container;
        this._callbacks = callbacks;

        this._canvas = document.createElement("canvas");
        this._canvas.className = "se-drawing-canvas";
        container.appendChild(this._canvas);

        this._ctx = this._canvas.getContext("2d");
        this._zoom = 8;
        this._panX = 0;
        this._panY = 0;
        this._layerStack = null;
        this._selection = null;
        this._floatingPaste = null;
        this._marchOffset = 0;
        this._marchInterval = null;
        this._isPanning = false;
        this._panStartMouse = null;
        this._panStartOffset = null;
        this._isDrawing = false;
        this._offscreen = null;
        this._offCtx = null;
        this._compositeCache = null;
        this._compositeDirty = true;
        this._checkerPattern = null;
        this._fpCanvas = null;
        this._fpCanvasKey = "";
        this._rafPending = false;
        this._cursorPixel = null;
        this._cursorBrushSize = 1;
        this._cursorToolName = "Pencil";
        this._showCursorPreview = true;
        this._showRulers = false;

        this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
        this._resizeObserver.observe(container);

        this._canvas.addEventListener("mousedown", (e) => this._onMouseDown(e));
        this._boundMouseMove = (e) => this._onMouseMove(e);
        this._boundMouseUp = (e) => this._onMouseUp(e);
        window.addEventListener("mousemove", this._boundMouseMove);
        window.addEventListener("mouseup", this._boundMouseUp);
        this._canvas.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
        this._canvas.addEventListener("contextmenu", (e) => e.preventDefault());

        this._canvas.style.cursor = "none";
        this._canvas.addEventListener("mouseenter", () => { this._canvas.style.cursor = "none"; });
        this._canvas.addEventListener("mouseleave", () => {
            this._cursorPixel = null;
            this._scheduleRedraw();
        });

        this._marchInterval = setInterval(() => {
            this._marchOffset = (this._marchOffset + 1) % 16;
            if (this._selection || this._floatingPaste) this._redrawOverlaysOnly();
        }, 150);

        requestAnimationFrame(() => this._resizeCanvas());
    }

    setLayerStack(stack, resetView = false) {
        this._layerStack = stack;
        this._compositeDirty = true;
        if (resetView) {
            this._offscreen = null;
            this._centerView();
        }
        this.redraw();
    }

    setSprite(sprite) {
        if (this._layerStack) {
            this._layerStack.activeLayer.data = sprite;
            this._offscreen = null;
            this._compositeDirty = true;
            this._centerView();
            this.redraw();
        }
    }

    setSelection(sel)       { this._selection = sel; }
    setFloatingPaste(fp)    { this._floatingPaste = fp; }
    setRulersVisible(v)     { this._showRulers = v; this._scheduleRedraw(); }
    getZoom()               { return this._zoom; }

    invalidateComposite() { this._compositeDirty = true; }

    setCursorPreview(px, py, brushSize, toolName) {
        this._cursorPixel = (px != null && py != null) ? { x: px, y: py } : null;
        this._cursorBrushSize = brushSize || 1;
        this._cursorToolName = toolName || "";
    }

    setZoom(z) {
        this._zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
        this._scheduleRedraw();
    }

    zoomToFit() {
        if (!this._layerStack || !this._canvas.width) return;
        const cw = this._canvas.width - (this._showRulers ? RULER_SIZE : 0);
        const ch = this._canvas.height - (this._showRulers ? RULER_SIZE : 0);
        const fitZoom = Math.min(cw / this._layerStack.width, ch / this._layerStack.height);
        this._zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom * 0.95));
        this._panX = 0;
        this._panY = 0;
        if (this._callbacks.onZoomChange) this._callbacks.onZoomChange(this._zoom);
        this._scheduleRedraw();
    }

    _centerView() {
        this._panX = 0;
        this._panY = 0;
    }

    _resizeCanvas() {
        if (!this._container) return;
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        if (w === 0 || h === 0) return;
        this._canvas.width = w;
        this._canvas.height = h;
        this._scheduleRedraw();
    }

    _ensureOffscreen() {
        if (!this._layerStack) return;
        if (!this._offscreen ||
            this._offscreen.width !== this._layerStack.width ||
            this._offscreen.height !== this._layerStack.height) {
            this._offscreen = document.createElement("canvas");
            this._offscreen.width = this._layerStack.width;
            this._offscreen.height = this._layerStack.height;
            this._offCtx = this._offscreen.getContext("2d");
            this._compositeDirty = true;
        }
    }

    _updateCompositeCache() {
        if (!this._compositeDirty || !this._layerStack) return;
        this._compositeCache = this._layerStack.flatten(this._compositeCache);
        if (this._offCtx) {
            this._offCtx.putImageData(this._compositeCache.toImageData(), 0, 0);
        }
        this._compositeDirty = false;
    }

    redraw() {
        this._compositeDirty = true;
        this._scheduleRedraw();
    }

    _redrawOverlaysOnly() {
        this._scheduleRedraw();
    }

    _scheduleRedraw() {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => {
            this._rafPending = false;
            this._redrawInternal();
        });
    }

    redrawNow() {
        this._compositeDirty = true;
        this._rafPending = false;
        this._redrawInternal();
    }

    _redrawInternal() {
        if (!this._ctx || !this._canvas || !this._layerStack) return;
        const ctx = this._ctx;
        const w = this._canvas.width;
        const h = this._canvas.height;
        if (w === 0 || h === 0) return;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, w, h);

        const z = this._zoom;
        const spriteW = this._layerStack.width * z;
        const spriteH = this._layerStack.height * z;
        const { x: ox, y: oy } = this._getSpriteOrigin();

        this._drawCheckerboard(ctx, ox, oy, spriteW, spriteH);
        this._drawPixels(ctx, ox, oy, spriteW, spriteH);

        if (z >= GRID_THRESHOLD)
            this._drawGrid(ctx, ox, oy, spriteW, spriteH);

        if (this._floatingPaste) this._drawFloatingPaste(ctx, ox, oy);
        if (this._selection)     this._drawSelection(ctx, ox, oy);

        if (this._cursorPixel && this._showCursorPreview)
            this._drawCursorPreview(ctx, ox, oy);

        if (this._showRulers)
            this._drawRulers(ctx, ox, oy, spriteW, spriteH);
    }

    _ensureCheckerPattern(ctx) {
        if (this._checkerPattern) return;
        const sz = CHECKER_SIZE * 2;
        const pc = document.createElement("canvas");
        pc.width = sz;
        pc.height = sz;
        const pctx = pc.getContext("2d");
        pctx.fillStyle = "#cccccc";
        pctx.fillRect(0, 0, sz, sz);
        pctx.fillStyle = "#999999";
        pctx.fillRect(CHECKER_SIZE, 0, CHECKER_SIZE, CHECKER_SIZE);
        pctx.fillRect(0, CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE);
        this._checkerPattern = ctx.createPattern(pc, "repeat");
    }

    _drawCheckerboard(ctx, ox, oy, spriteW, spriteH) {
        this._ensureCheckerPattern(ctx);
        ctx.save();
        ctx.fillStyle = this._checkerPattern;
        ctx.fillRect(ox, oy, spriteW, spriteH);
        ctx.restore();
    }

    _drawPixels(ctx, ox, oy, spriteW, spriteH) {
        this._ensureOffscreen();
        if (!this._offCtx) return;
        this._updateCompositeCache();
        if (!this._offscreen) return;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._offscreen, ox, oy, spriteW, spriteH);
    }

    _drawGrid(ctx, ox, oy, spriteW, spriteH) {
        const z = this._zoom;
        const w = this._canvas.width;
        const h = this._canvas.height;

        // Only draw grid lines visible on screen
        const startCol = Math.max(0, Math.floor(-ox / z));
        const endCol = Math.min(this._layerStack.width, Math.ceil((w - ox) / z));
        const startRow = Math.max(0, Math.floor(-oy / z));
        const endRow = Math.min(this._layerStack.height, Math.ceil((h - oy) / z));

        ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();

        const top = Math.max(oy, 0);
        const bottom = Math.min(oy + spriteH, h);
        const left = Math.max(ox, 0);
        const right = Math.min(ox + spriteW, w);

        for (let x = startCol; x <= endCol; x++) {
            const px = ox + x * z;
            ctx.moveTo(px + 0.5, top);
            ctx.lineTo(px + 0.5, bottom);
        }
        for (let y = startRow; y <= endRow; y++) {
            const py = oy + y * z;
            ctx.moveTo(left, py + 0.5);
            ctx.lineTo(right, py + 0.5);
        }
        ctx.stroke();
    }

    _drawSelection(ctx, ox, oy) {
        const sel = this._selection;
        const z = this._zoom;
        const x = ox + sel.x * z;
        const y = oy + sel.y * z;
        const w = sel.width * z;
        const h = sel.height * z;

        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -this._marchOffset;
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);

        ctx.strokeStyle = "#000";
        ctx.lineDashOffset = -(this._marchOffset + 4);
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);

        ctx.setLineDash([]);
    }

    _drawFloatingPaste(ctx, ox, oy) {
        const fp = this._floatingPaste;
        const z = this._zoom;
        const fpKey = `${fp.data.width}:${fp.data.height}`;

        if (this._fpCanvasKey !== fpKey || !this._fpCanvas) {
            this._fpCanvas = document.createElement("canvas");
            this._fpCanvas.width = fp.data.width;
            this._fpCanvas.height = fp.data.height;
            this._fpCanvasKey = fpKey;
        }
        this._fpCanvas.getContext("2d").putImageData(fp.data.toImageData(), 0, 0);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._fpCanvas,
            ox + fp.x * z, oy + fp.y * z,
            fp.data.width * z, fp.data.height * z);

        const rx = ox + fp.x * z + 0.5;
        const ry = oy + fp.y * z + 0.5;
        const rw = fp.data.width * z;
        const rh = fp.data.height * z;

        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#fff";
        ctx.lineDashOffset = -this._marchOffset;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.strokeStyle = "#000";
        ctx.lineDashOffset = -(this._marchOffset + 4);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
    }

    _drawRulers(ctx, ox, oy, spriteW, spriteH) {
        const w = this._canvas.width;
        const h = this._canvas.height;
        const z = this._zoom;
        const sw = this._layerStack.width;
        const sh = this._layerStack.height;

        ctx.save();

        ctx.fillStyle = "#2d2d30";
        ctx.fillRect(0, 0, w, RULER_SIZE);
        ctx.fillRect(0, 0, RULER_SIZE, h);
        ctx.fillStyle = "#252526";
        ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);

        ctx.fillStyle = "#9e9e9e";
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 0.5;
        ctx.font = "9px monospace";
        ctx.textBaseline = "top";

        // Determine tick interval based on pixel density on screen
        let majorInterval;
        const pixelsPerTick = z; // screen pixels per sprite pixel
        if      (pixelsPerTick >= 16) majorInterval = 1;
        else if (pixelsPerTick >= 8)  majorInterval = 4;
        else if (pixelsPerTick >= 4)  majorInterval = 8;
        else if (pixelsPerTick >= 2)  majorInterval = 16;
        else if (pixelsPerTick >= 1)  majorInterval = 32;
        else if (pixelsPerTick >= 0.5) majorInterval = 64;
        else if (pixelsPerTick >= 0.25) majorInterval = 128;
        else if (pixelsPerTick >= 0.1) majorInterval = 256;
        else majorInterval = 512;

        // Only iterate over ruler ticks visible on screen
        const hStart = Math.max(0, Math.floor((RULER_SIZE - ox) / z / majorInterval) * majorInterval);
        const hEnd = Math.min(sw, Math.ceil((w - ox) / z));

        for (let px = hStart; px <= hEnd; px += majorInterval) {
            const sx = ox + px * z;
            if (sx < RULER_SIZE || sx > w) continue;

            ctx.beginPath();
            ctx.moveTo(sx + 0.5, RULER_SIZE - 8);
            ctx.lineTo(sx + 0.5, RULER_SIZE);
            ctx.stroke();
            ctx.fillText(String(px), sx + 2, 2);
        }

        // Minor ticks only when zoomed in enough
        if (z >= 8) {
            const minorStart = Math.max(0, Math.floor((RULER_SIZE - ox) / z));
            const minorEnd = Math.min(sw, Math.ceil((w - ox) / z));
            for (let px = minorStart; px <= minorEnd; px++) {
                if (px % majorInterval === 0) continue;
                const sx = ox + px * z;
                if (sx < RULER_SIZE || sx > w) continue;
                ctx.beginPath();
                ctx.moveTo(sx + 0.5, RULER_SIZE - 4);
                ctx.lineTo(sx + 0.5, RULER_SIZE);
                ctx.stroke();
            }
        }

        ctx.textBaseline = "middle";
        const vStart = Math.max(0, Math.floor((RULER_SIZE - oy) / z / majorInterval) * majorInterval);
        const vEnd = Math.min(sh, Math.ceil((h - oy) / z));

        for (let py = vStart; py <= vEnd; py += majorInterval) {
            const sy = oy + py * z;
            if (sy < RULER_SIZE || sy > h) continue;

            ctx.beginPath();
            ctx.moveTo(RULER_SIZE - 8, sy + 0.5);
            ctx.lineTo(RULER_SIZE, sy + 0.5);
            ctx.stroke();
            ctx.save();
            ctx.translate(2, sy + 2);
            ctx.fillText(String(py), 0, 0);
            ctx.restore();
        }

        if (z >= 8) {
            const minorStartV = Math.max(0, Math.floor((RULER_SIZE - oy) / z));
            const minorEndV = Math.min(sh, Math.ceil((h - oy) / z));
            for (let py = minorStartV; py <= minorEndV; py++) {
                if (py % majorInterval === 0) continue;
                const sy = oy + py * z;
                if (sy < RULER_SIZE || sy > h) continue;
                ctx.beginPath();
                ctx.moveTo(RULER_SIZE - 4, sy + 0.5);
                ctx.lineTo(RULER_SIZE, sy + 0.5);
                ctx.stroke();
            }
        }

        if (this._cursorPixel) {
            const cx = ox + this._cursorPixel.x * z + z / 2;
            const cy = oy + this._cursorPixel.y * z + z / 2;
            ctx.fillStyle = "rgba(233, 69, 96, 0.4)";
            if (cx >= RULER_SIZE && cx <= w) ctx.fillRect(cx - z / 2, 0, z, RULER_SIZE);
            if (cy >= RULER_SIZE && cy <= h) ctx.fillRect(0, cy - z / 2, RULER_SIZE, z);
        }

        ctx.strokeStyle = "#3c3c3c";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(RULER_SIZE, RULER_SIZE + 0.5);
        ctx.lineTo(w, RULER_SIZE + 0.5);
        ctx.moveTo(RULER_SIZE + 0.5, RULER_SIZE);
        ctx.lineTo(RULER_SIZE + 0.5, h);
        ctx.stroke();

        ctx.restore();
    }

    _drawCursorPreview(ctx, ox, oy) {
        const cp = this._cursorPixel;
        const z = this._zoom;
        const size = this._cursorBrushSize;
        const tool = this._cursorToolName;
        const isBrush = tool === "Pencil" || tool === "Eraser" || tool === "Line";

        if (isBrush) {
            const half = Math.floor(size / 2);
            const startX = cp.x - half;
            const startY = cp.y - half;

            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = tool === "Eraser" ? "#ff4444" : "#ffffff";
            for (let dy = 0; dy < size; dy++) {
                for (let dx = 0; dx < size; dx++) {
                    const px = startX + dx;
                    const py = startY + dy;
                    if (this._layerStack && this._layerStack.inBounds(px, py)) {
                        ctx.fillRect(ox + px * z, oy + py * z, z, z);
                    }
                }
            }
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
            ctx.lineWidth = 1;
            ctx.strokeRect(
                ox + startX * z + 0.5, oy + startY * z + 0.5,
                size * z, size * z);
            ctx.restore();
        } else {
            const cx = ox + cp.x * z + z / 2;
            const cy = oy + cp.y * z + z / 2;
            const arm = Math.max(6, z * 0.6);

            ctx.save();

            ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx - arm, cy + 0.5);
            ctx.lineTo(cx + arm, cy + 0.5);
            ctx.moveTo(cx + 0.5, cy - arm);
            ctx.lineTo(cx + 0.5, cy + arm);
            ctx.stroke();

            ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - arm, cy + 0.5);
            ctx.lineTo(cx + arm, cy + 0.5);
            ctx.moveTo(cx + 0.5, cy - arm);
            ctx.lineTo(cx + 0.5, cy + arm);
            ctx.stroke();

            ctx.restore();
        }
    }

    _getSpriteOrigin() {
        const w = this._canvas.width;
        const h = this._canvas.height;
        const spriteW = this._layerStack.width * this._zoom;
        const spriteH = this._layerStack.height * this._zoom;
        return {
            x: Math.floor((w - spriteW) / 2 + this._panX),
            y: Math.floor((h - spriteH) / 2 + this._panY)
        };
    }

    screenToPixel(sx, sy) {
        if (!this._layerStack) return null;
        const origin = this._getSpriteOrigin();
        return {
            x: Math.floor((sx - origin.x) / this._zoom),
            y: Math.floor((sy - origin.y) / this._zoom)
        };
    }

    _onMouseDown(e) {
        const rect = this._canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (e.button === 2 || e.button === 1 || (e.button === 0 && e.altKey)) {
            this._isPanning = true;
            this._panStartMouse = { x: mx, y: my };
            this._panStartOffset = { x: this._panX, y: this._panY };
            this._canvas.style.cursor = "grabbing";
            return;
        }

        if (e.button !== 0) return;

        this._isDrawing = true;
        const pixel = this.screenToPixel(mx, my);
        if (pixel && this._callbacks.onMouseDown) {
            this._callbacks.onMouseDown(pixel.x, pixel.y, e);
        }
    }

    _onMouseMove(e) {
        const rect = this._canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (this._isPanning) {
            this._panX = this._panStartOffset.x + (mx - this._panStartMouse.x);
            this._panY = this._panStartOffset.y + (my - this._panStartMouse.y);
            this._scheduleRedraw();
            return;
        }

        const pixel = this.screenToPixel(mx, my);

        if (pixel) {
            const prevPx = this._cursorPixel;
            const pixelChanged = !prevPx || prevPx.x !== pixel.x || prevPx.y !== pixel.y;
            this._cursorPixel = pixel;

            if (this._callbacks.onCursorMove) {
                this._callbacks.onCursorMove(pixel.x, pixel.y);
            }

            if (this._isDrawing && this._callbacks.onMouseMove) {
                this._callbacks.onMouseMove(pixel.x, pixel.y, e);
            }

            if (pixelChanged) {
                this._redrawOverlaysOnly();
            }
        }
    }

    _onMouseUp(e) {
        if (this._isPanning) {
            this._isPanning = false;
            this._canvas.style.cursor = "none";
            return;
        }

        if (this._isDrawing) {
            this._isDrawing = false;
            const rect = this._canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const pixel = this.screenToPixel(mx, my);
            if (pixel && this._callbacks.onMouseUp) {
                this._callbacks.onMouseUp(pixel.x, pixel.y, e);
            }
        }
    }

    _onWheel(e) {
        e.preventDefault();
        const oldZoom = this._zoom;
        let newZoom;

        if (e.deltaY < 0) {
            // Zoom in
            if (oldZoom < 1) {
                newZoom = oldZoom * 1.5;
                if (newZoom > 0.95) newZoom = 1;
            } else {
                newZoom = Math.round(oldZoom * 1.25);
                if (newZoom === oldZoom) newZoom = oldZoom + 1;
            }
        } else {
            // Zoom out
            if (oldZoom <= 1) {
                newZoom = oldZoom / 1.5;
            } else {
                newZoom = Math.round(oldZoom / 1.25);
                if (newZoom === oldZoom) newZoom = oldZoom - 1;
                if (newZoom < 1) newZoom = oldZoom < 2 ? 0.67 : 1;
            }
        }

        this._zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
        if (this._callbacks.onZoomChange) this._callbacks.onZoomChange(this._zoom);
        this._scheduleRedraw();
    }

    destroy() {
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (this._marchInterval) clearInterval(this._marchInterval);
        window.removeEventListener("mousemove", this._boundMouseMove);
        window.removeEventListener("mouseup", this._boundMouseUp);
        if (this._canvas.parentElement) this._canvas.remove();
    }
}

export { SpriteCanvas };
