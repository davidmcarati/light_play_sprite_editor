import { Color } from "./color.js";
import { SpriteState } from "./sprite_data.js";

class BaseTool {
    constructor(name, shortcut, icon) {
        this.name = name;
        this.shortcut = shortcut;
        this.icon = icon;
    }
    onDown() {}
    onMove() {}
    onUp()   {}
    getCursor()  { return "crosshair"; }
    getOptions() { return []; }
}

class PencilTool extends BaseTool {
    constructor() { super("Pencil", "B", "\u270F"); }

    onDown(px, py, editor) {
        editor.pushHistory();
        this._lastX = px;
        this._lastY = py;
        this._paint(px, py, editor);
    }

    onMove(px, py, editor) {
        if (this._lastX === undefined) return;
        drawLine(this._lastX, this._lastY, px, py, (x, y) => this._paint(x, y, editor));
        this._lastX = px;
        this._lastY = py;
    }

    onUp() { this._lastX = undefined; this._lastY = undefined; }

    _paint(cx, cy, editor) {
        const size = editor.brushSize;
        const half = Math.floor(size / 2);
        const c = editor.foregroundColor;
        for (let dy = 0; dy < size; dy++)
            for (let dx = 0; dx < size; dx++)
                editor.sprite.setPixel(cx - half + dx, cy - half + dy, c.r, c.g, c.b, c.a);
        editor.markDirty();
    }

    getOptions() { return ["brushSize"]; }
}

class EraserTool extends BaseTool {
    constructor() { super("Eraser", "E", "\u232B"); }

    onDown(px, py, editor) {
        editor.pushHistory();
        this._lastX = px;
        this._lastY = py;
        this._erase(px, py, editor);
    }

    onMove(px, py, editor) {
        if (this._lastX === undefined) return;
        drawLine(this._lastX, this._lastY, px, py, (x, y) => this._erase(x, y, editor));
        this._lastX = px;
        this._lastY = py;
    }

    onUp() { this._lastX = undefined; this._lastY = undefined; }

    _erase(cx, cy, editor) {
        const size = editor.brushSize;
        const half = Math.floor(size / 2);
        for (let dy = 0; dy < size; dy++)
            for (let dx = 0; dx < size; dx++)
                editor.sprite.setPixel(cx - half + dx, cy - half + dy, 0, 0, 0, 0);
        editor.markDirty();
    }

    getOptions() { return ["brushSize"]; }
}

class BucketFillTool extends BaseTool {
    constructor() { super("Fill", "G", "\u229E"); }

    onDown(px, py, editor) {
        const sprite = editor.sprite;
        const target = sprite.getPixel(px, py);
        if (!target) return;

        const fill = editor.foregroundColor;
        if (colorMatch(target, fill, 0)) return;

        editor.pushHistory();
        const w = sprite.width;
        const h = sprite.height;
        const pixels = sprite.pixels;
        const visited = new Uint8Array(w * h);
        const tol = editor.fillTolerance;
        const tr = target.r, tg = target.g, tb = target.b, ta = target.a;
        const fr = fill.r, fg = fill.g, fb = fill.b, fa = fill.a;

        // Scanline flood fill — much faster and lower memory than per-pixel stack
        const queue = [px, py];
        let qi = 0;

        while (qi < queue.length) {
            let x = queue[qi++];
            const y = queue[qi++];
            if (y < 0 || y >= h) continue;

            // Find left edge
            while (x > 0) {
                const li = (y * w + x - 1) * 4;
                if (Math.abs(pixels[li] - tr) > tol ||
                    Math.abs(pixels[li + 1] - tg) > tol ||
                    Math.abs(pixels[li + 2] - tb) > tol ||
                    Math.abs(pixels[li + 3] - ta) > tol) break;
                if (visited[y * w + x - 1]) break;
                x--;
            }

            let spanUp = false, spanDown = false;

            while (x < w) {
                const key = y * w + x;
                if (visited[key]) { x++; continue; }

                const i = key * 4;
                if (Math.abs(pixels[i] - tr) > tol ||
                    Math.abs(pixels[i + 1] - tg) > tol ||
                    Math.abs(pixels[i + 2] - tb) > tol ||
                    Math.abs(pixels[i + 3] - ta) > tol) break;

                visited[key] = 1;
                pixels[i] = fr;
                pixels[i + 1] = fg;
                pixels[i + 2] = fb;
                pixels[i + 3] = fa;

                // Check pixel above
                if (y > 0) {
                    const aboveKey = (y - 1) * w + x;
                    const ai = aboveKey * 4;
                    const aboveMatch = !visited[aboveKey] &&
                        Math.abs(pixels[ai] - tr) <= tol &&
                        Math.abs(pixels[ai + 1] - tg) <= tol &&
                        Math.abs(pixels[ai + 2] - tb) <= tol &&
                        Math.abs(pixels[ai + 3] - ta) <= tol;
                    if (aboveMatch && !spanUp) {
                        queue.push(x, y - 1);
                        spanUp = true;
                    } else if (!aboveMatch) {
                        spanUp = false;
                    }
                }

                // Check pixel below
                if (y < h - 1) {
                    const belowKey = (y + 1) * w + x;
                    const bi = belowKey * 4;
                    const belowMatch = !visited[belowKey] &&
                        Math.abs(pixels[bi] - tr) <= tol &&
                        Math.abs(pixels[bi + 1] - tg) <= tol &&
                        Math.abs(pixels[bi + 2] - tb) <= tol &&
                        Math.abs(pixels[bi + 3] - ta) <= tol;
                    if (belowMatch && !spanDown) {
                        queue.push(x, y + 1);
                        spanDown = true;
                    } else if (!belowMatch) {
                        spanDown = false;
                    }
                }

                x++;
            }
        }

        editor.markDirty();
    }

    getOptions() { return ["fillTolerance"]; }
}

class EyedropperTool extends BaseTool {
    constructor() { super("Eyedropper", "I", "\u2299"); }

    onDown(px, py, editor) {
        const p = editor.sprite.getPixel(px, py);
        if (p) editor.setForegroundColor(new Color(p.r, p.g, p.b, p.a));
    }
}

class LineTool extends BaseTool {
    constructor() { super("Line", "L", "\u2571"); }

    onDown(px, py, editor) {
        editor.pushHistory();
        this._startX = px;
        this._startY = py;
        this._snapshot = new Uint8ClampedArray(editor.sprite.pixels);
    }

    onMove(px, py, editor) {
        if (!this._snapshot) return;
        editor.sprite.pixels.set(this._snapshot);
        const c = editor.foregroundColor;
        const size = editor.brushSize;
        const half = Math.floor(size / 2);
        drawLine(this._startX, this._startY, px, py, (x, y) => {
            for (let dy = 0; dy < size; dy++)
                for (let dx = 0; dx < size; dx++)
                    editor.sprite.setPixel(x - half + dx, y - half + dy, c.r, c.g, c.b, c.a);
        });
        editor.markDirty();
    }

    onUp() { this._snapshot = null; }
    getOptions() { return ["brushSize"]; }
}

class RectangleTool extends BaseTool {
    constructor() { super("Rectangle", "U", "\u25AD"); }

    onDown(px, py, editor) {
        editor.pushHistory();
        this._startX = px;
        this._startY = py;
        this._snapshot = new Uint8ClampedArray(editor.sprite.pixels);
    }

    onMove(px, py, editor) {
        if (!this._snapshot) return;
        editor.sprite.pixels.set(this._snapshot);
        const c = editor.foregroundColor;

        const x1 = Math.min(this._startX, px), y1 = Math.min(this._startY, py);
        const x2 = Math.max(this._startX, px), y2 = Math.max(this._startY, py);

        if (editor.shapeFilled) {
            for (let y = y1; y <= y2; y++)
                for (let x = x1; x <= x2; x++)
                    editor.sprite.setPixel(x, y, c.r, c.g, c.b, c.a);
        } else {
            for (let x = x1; x <= x2; x++) {
                editor.sprite.setPixel(x, y1, c.r, c.g, c.b, c.a);
                editor.sprite.setPixel(x, y2, c.r, c.g, c.b, c.a);
            }
            for (let y = y1 + 1; y < y2; y++) {
                editor.sprite.setPixel(x1, y, c.r, c.g, c.b, c.a);
                editor.sprite.setPixel(x2, y, c.r, c.g, c.b, c.a);
            }
        }
        editor.markDirty();
    }

    onUp() { this._snapshot = null; }
    getOptions() { return ["shapeFilled"]; }
}

class EllipseTool extends BaseTool {
    constructor() { super("Ellipse", "O", "\u25EF"); }

    onDown(px, py, editor) {
        editor.pushHistory();
        this._startX = px;
        this._startY = py;
        this._snapshot = new Uint8ClampedArray(editor.sprite.pixels);
    }

    onMove(px, py, editor) {
        if (!this._snapshot) return;
        editor.sprite.pixels.set(this._snapshot);
        const c = editor.foregroundColor;

        const cx = (this._startX + px) / 2;
        const cy = (this._startY + py) / 2;
        const rx = Math.abs(px - this._startX) / 2;
        const ry = Math.abs(py - this._startY) / 2;
        if (rx < 0.5 && ry < 0.5) return;

        if (editor.shapeFilled) {
            const top = Math.floor(cy - ry), bot = Math.ceil(cy + ry);
            const left = Math.floor(cx - rx), right = Math.ceil(cx + rx);
            for (let y = top; y <= bot; y++) {
                for (let x = left; x <= right; x++) {
                    if (rx > 0 && ry > 0) {
                        const dx = (x - cx) / rx, dy = (y - cy) / ry;
                        if (dx * dx + dy * dy <= 1)
                            editor.sprite.setPixel(x, y, c.r, c.g, c.b, c.a);
                    }
                }
            }
        } else {
            drawEllipseOutline(Math.round(cx), Math.round(cy), Math.round(rx), Math.round(ry), (x, y) => {
                editor.sprite.setPixel(x, y, c.r, c.g, c.b, c.a);
            });
        }
        editor.markDirty();
    }

    onUp() { this._snapshot = null; }
    getOptions() { return ["shapeFilled"]; }
}

class SelectionTool extends BaseTool {
    constructor() { super("Selection", "M", "\u2B1A"); }

    onDown(px, py, editor) {
        editor.commitFloatingPaste();
        this._startX = px;
        this._startY = py;
        editor.selection = null;
    }

    onMove(px, py, editor) {
        if (this._startX === undefined) return;
        editor.selection = {
            x: Math.min(this._startX, px),
            y: Math.min(this._startY, py),
            width: Math.abs(px - this._startX) + 1,
            height: Math.abs(py - this._startY) + 1
        };
        editor.markDirty();
    }

    onUp(px, py, editor) {
        if (editor.selection && editor.selection.width <= 1 && editor.selection.height <= 1) {
            editor.selection = null;
        }
        this._startX = undefined;
        editor.markDirty();
    }
}

class MoveTool extends BaseTool {
    constructor() { super("Move", "V", "\u271D"); }
    getCursor() { return "move"; }

    onDown(px, py, editor, event) {
        this._lastX = px;
        this._lastY = py;
        this._movingPaste = false;

        if (editor.floatingPaste) {
            this._movingPaste = true;
            return;
        }

        if (editor.selection) {
            editor.pushHistory();
            const sel = editor.selection;
            const isCopy = event && event.shiftKey;
            const selData = new SpriteState(sel.width, sel.height);
            for (let y = 0; y < sel.height; y++) {
                for (let x = 0; x < sel.width; x++) {
                    const p = editor.sprite.getPixel(sel.x + x, sel.y + y);
                    if (p) {
                        selData.setPixel(x, y, p.r, p.g, p.b, p.a);
                        if (!isCopy) editor.sprite.setPixel(sel.x + x, sel.y + y, 0, 0, 0, 0);
                    }
                }
            }
            editor.floatingPaste = { x: sel.x, y: sel.y, data: selData };
            editor.selection = null;
            this._movingPaste = true;
        }
    }

    onMove(px, py, editor) {
        if (this._movingPaste && editor.floatingPaste) {
            const dx = px - this._lastX;
            const dy = py - this._lastY;
            editor.floatingPaste.x += dx;
            editor.floatingPaste.y += dy;
        }
        this._lastX = px;
        this._lastY = py;
        editor.markDirty();
    }

    onUp() {
        this._movingPaste = false;
    }
}

// Bresenham's line
function drawLine(x0, y0, x1, y1, cb) {
    x0 = Math.round(x0); y0 = Math.round(y0);
    x1 = Math.round(x1); y1 = Math.round(y1);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
        cb(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

function colorMatch(c1, c2, tol) {
    return Math.abs(c1.r - c2.r) <= tol &&
           Math.abs(c1.g - c2.g) <= tol &&
           Math.abs(c1.b - c2.b) <= tol &&
           Math.abs(c1.a - c2.a) <= tol;
}

function drawEllipseOutline(cx, cy, rx, ry, cb) {
    if (rx === 0 && ry === 0) { cb(cx, cy); return; }
    const steps = Math.max(Math.max(rx, ry) * 4, 16);
    const step = (2 * Math.PI) / steps;
    let prevX = null, prevY = null;

    for (let i = 0; i <= steps; i++) {
        const a = i * step;
        const x = Math.round(cx + rx * Math.cos(a));
        const y = Math.round(cy + ry * Math.sin(a));
        if (prevX !== null) drawLine(prevX, prevY, x, y, cb);
        prevX = x;
        prevY = y;
    }
}

const ALL_TOOLS = [
    new PencilTool(),
    new EraserTool(),
    new BucketFillTool(),
    new EyedropperTool(),
    new LineTool(),
    new RectangleTool(),
    new EllipseTool(),
    new SelectionTool(),
    new MoveTool()
];

// Keep "drawLinePixels" as the exported name for test compat
const drawLinePixels = drawLine;

export { ALL_TOOLS, BaseTool, drawLinePixels, colorMatch };
