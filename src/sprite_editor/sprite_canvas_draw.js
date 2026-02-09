const CHECKER_SIZE = 8;
const GRID_THRESHOLD = 4;
const RULER_SIZE = 20;

const CanvasDrawMixin = {
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
    },

    _drawCheckerboard(ctx, ox, oy, spriteW, spriteH) {
        this._ensureCheckerPattern(ctx);
        ctx.save();
        ctx.fillStyle = this._checkerPattern;
        ctx.fillRect(ox, oy, spriteW, spriteH);
        ctx.restore();
    },

    _drawGrid(ctx, ox, oy, spriteW, spriteH) {
        const z = this._zoom;
        const w = this._canvas.width;
        const h = this._canvas.height;

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
    },

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
    },

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
    },

    _getRulerInterval(z) {
        if (z >= 16) return 1;
        if (z >= 8)  return 4;
        if (z >= 4)  return 8;
        if (z >= 2)  return 16;
        if (z >= 1)  return 32;
        if (z >= 0.5) return 64;
        if (z >= 0.25) return 128;
        if (z >= 0.1) return 256;
        return 512;
    },

    _drawRulers(ctx, ox, oy, spriteW, spriteH) {
        const w = this._canvas.width;
        const h = this._canvas.height;
        const z = this._zoom;

        ctx.save();

        ctx.fillStyle = "#2d2d30";
        ctx.fillRect(0, 0, w, RULER_SIZE);
        ctx.fillRect(0, 0, RULER_SIZE, h);
        ctx.fillStyle = "#252526";
        ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);

        const majorInterval = this._getRulerInterval(z);
        ctx.fillStyle = "#9e9e9e";
        ctx.strokeStyle = "#555";
        ctx.lineWidth = 0.5;
        ctx.font = "9px monospace";

        this._drawHRulerTicks(ctx, z, ox, w, majorInterval);
        this._drawVRulerTicks(ctx, z, oy, h, majorInterval);
        this._drawRulerHighlight(ctx, z, ox, oy, w, h);
        this._drawRulerBorders(ctx, w, h);

        ctx.restore();
    },

    _drawHRulerTicks(ctx, z, ox, w, majorInterval) {
        const sw = this._layerStack.width;
        ctx.textBaseline = "top";
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
    },

    _drawVRulerTicks(ctx, z, oy, h, majorInterval) {
        const sh = this._layerStack.height;
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
    },

    _drawRulerHighlight(ctx, z, ox, oy, w, h) {
        if (!this._cursorPixel) return;
        const cx = ox + this._cursorPixel.x * z + z / 2;
        const cy = oy + this._cursorPixel.y * z + z / 2;
        ctx.fillStyle = "rgba(233, 69, 96, 0.4)";
        if (cx >= RULER_SIZE && cx <= w) ctx.fillRect(cx - z / 2, 0, z, RULER_SIZE);
        if (cy >= RULER_SIZE && cy <= h) ctx.fillRect(0, cy - z / 2, RULER_SIZE, z);
    },

    _drawRulerBorders(ctx, w, h) {
        ctx.strokeStyle = "#3c3c3c";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(RULER_SIZE, RULER_SIZE + 0.5);
        ctx.lineTo(w, RULER_SIZE + 0.5);
        ctx.moveTo(RULER_SIZE + 0.5, RULER_SIZE);
        ctx.lineTo(RULER_SIZE + 0.5, h);
        ctx.stroke();
    },

    _drawCursorPreview(ctx, ox, oy) {
        const cp = this._cursorPixel;
        const z = this._zoom;
        const tool = this._cursorToolName;
        const isBrush = tool === "Pencil" || tool === "Eraser" || tool === "Line";

        if (isBrush) {
            this._drawBrushCursor(ctx, ox, oy, cp, z);
        } else {
            this._drawCrosshairCursor(ctx, ox, oy, cp, z);
        }
    },

    _drawBrushCursor(ctx, ox, oy, cp, z) {
        const size = this._cursorBrushSize;
        const half = Math.floor(size / 2);
        const startX = cp.x - half;
        const startY = cp.y - half;

        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = this._cursorToolName === "Eraser" ? "#ff4444" : "#ffffff";
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
    },

    _drawCrosshairCursor(ctx, ox, oy, cp, z) {
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
};

export { CanvasDrawMixin, GRID_THRESHOLD, RULER_SIZE };
