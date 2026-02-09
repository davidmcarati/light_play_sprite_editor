import { CanvasDrawMixin, GRID_THRESHOLD, RULER_SIZE } from "./sprite_canvas_draw.js";

const MIN_ZOOM = 0.01;
const MAX_ZOOM = 64;

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

    _drawPixels(ctx, ox, oy, spriteW, spriteH) {
        this._ensureOffscreen();
        if (!this._offCtx) return;
        this._updateCompositeCache();
        if (!this._offscreen) return;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this._offscreen, ox, oy, spriteW, spriteH);
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
            if (oldZoom < 1) {
                newZoom = oldZoom * 1.5;
                if (newZoom > 0.95) newZoom = 1;
            } else {
                newZoom = Math.round(oldZoom * 1.25);
                if (newZoom === oldZoom) newZoom = oldZoom + 1;
            }
        } else {
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

Object.assign(SpriteCanvas.prototype, CanvasDrawMixin);

export { SpriteCanvas };
