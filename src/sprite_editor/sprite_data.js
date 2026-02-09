const MAX_HISTORY_BYTES = 512 * 1024 * 1024;
const MAX_HISTORY_STEPS = 50;

class SpriteState {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.pixels = new Uint8ClampedArray(width * height * 4);
    }

    inBounds(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    getPixel(x, y) {
        if (!this.inBounds(x, y)) return null;
        const i = (y * this.width + x) * 4;
        return {
            r: this.pixels[i],
            g: this.pixels[i + 1],
            b: this.pixels[i + 2],
            a: this.pixels[i + 3]
        };
    }

    setPixel(x, y, r, g, b, a) {
        if (!this.inBounds(x, y)) return;
        const i = (y * this.width + x) * 4;
        this.pixels[i] = r;
        this.pixels[i + 1] = g;
        this.pixels[i + 2] = b;
        this.pixels[i + 3] = a;
    }

    clone() {
        const copy = new SpriteState(this.width, this.height);
        copy.pixels.set(this.pixels);
        return copy;
    }

    clear() {
        this.pixels.fill(0);
    }

    toImageData() {
        if (!this._cachedImageData ||
            this._cachedImageData.width !== this.width ||
            this._cachedImageData.height !== this.height) {
            this._cachedImageData = new ImageData(this.width, this.height);
        }
        this._cachedImageData.data.set(this.pixels);
        return this._cachedImageData;
    }

    static fromImageData(imageData) {
        const state = new SpriteState(imageData.width, imageData.height);
        state.pixels.set(imageData.data);
        return state;
    }

    resize(newWidth, newHeight, offsetX = 0, offsetY = 0) {
        const resized = new SpriteState(newWidth, newHeight);
        const src = this.pixels;
        const dst = resized.pixels;
        const sw = this.width;

        for (let y = 0; y < this.height; y++) {
            const dy = y + offsetY;
            if (dy < 0 || dy >= newHeight) continue;
            for (let x = 0; x < this.width; x++) {
                const dx = x + offsetX;
                if (dx < 0 || dx >= newWidth) continue;
                const si = (y * sw + x) * 4;
                const di = (dy * newWidth + dx) * 4;
                dst[di]     = src[si];
                dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si + 2];
                dst[di + 3] = src[si + 3];
            }
        }
        return resized;
    }

    async toBlob() {
        const canvas = document.createElement("canvas");
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to create canvas context for export.");
        ctx.putImageData(this.toImageData(), 0, 0);
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Failed to create PNG blob from sprite data."));
            }, "image/png");
        });
    }
}

function _stackBytes(state) {
    if (state.layers) {
        let bytes = 0;
        for (const layer of state.layers) {
            bytes += layer.data.pixels.byteLength;
        }
        return bytes;
    }
    return state.pixels ? state.pixels.byteLength : 0;
}

class SpriteHistory {
    constructor() {
        this._undoStack = [];
        this._redoStack = [];
        this._undoBytes = 0;
        this._redoBytes = 0;
    }

    push(layerStack) {
        const snapshot = layerStack.clone();
        const bytes = _stackBytes(snapshot);

        this._undoStack.push({ snapshot, bytes });
        this._undoBytes += bytes;

        this._redoStack.length = 0;
        this._redoBytes = 0;

        while (this._undoStack.length > MAX_HISTORY_STEPS ||
               (this._undoBytes > MAX_HISTORY_BYTES && this._undoStack.length > 1)) {
            const evicted = this._undoStack.shift();
            this._undoBytes -= evicted.bytes;
        }
    }

    undo(currentState) {
        if (this._undoStack.length === 0) return null;
        const currentBytes = _stackBytes(currentState);
        this._redoStack.push({ snapshot: currentState.clone(), bytes: currentBytes });
        this._redoBytes += currentBytes;

        const entry = this._undoStack.pop();
        this._undoBytes -= entry.bytes;
        return entry.snapshot;
    }

    redo(currentState) {
        if (this._redoStack.length === 0) return null;
        const currentBytes = _stackBytes(currentState);
        this._undoStack.push({ snapshot: currentState.clone(), bytes: currentBytes });
        this._undoBytes += currentBytes;

        const entry = this._redoStack.pop();
        this._redoBytes -= entry.bytes;
        return entry.snapshot;
    }

    canUndo() { return this._undoStack.length > 0; }
    canRedo() { return this._redoStack.length > 0; }

    clear() {
        this._undoStack.length = 0;
        this._redoStack.length = 0;
        this._undoBytes = 0;
        this._redoBytes = 0;
    }
}

export { SpriteState, SpriteHistory };
