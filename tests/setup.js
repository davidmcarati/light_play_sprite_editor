// Polyfills for running tests in jsdom

if (typeof globalThis.ImageData === "undefined") {
    globalThis.ImageData = class ImageData {
        constructor(dataOrWidth, widthOrHeight, height) {
            if (dataOrWidth instanceof Uint8ClampedArray) {
                this.data = dataOrWidth;
                this.width = widthOrHeight;
                this.height = height;
            } else {
                this.width = dataOrWidth;
                this.height = widthOrHeight;
                this.data = new Uint8ClampedArray(this.width * this.height * 4);
            }
        }
    };
}

if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserver {
        constructor(callback) { this._callback = callback; }
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

const _origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type) {
    try {
        const ctx = _origGetContext.call(this, type);
        if (ctx) return ctx;
    } catch { /* fall through to mock */ }

    if (type === "2d") {
        return {
            canvas: this,
            fillStyle: "",
            strokeStyle: "",
            lineWidth: 1,
            lineDashOffset: 0,
            imageSmoothingEnabled: true,
            font: "10px sans-serif",
            textBaseline: "alphabetic",
            textAlign: "start",
            globalAlpha: 1,
            clearRect() {},
            fillRect() {},
            strokeRect() {},
            beginPath() {},
            closePath() {},
            moveTo() {},
            lineTo() {},
            arc() {},
            rect() {},
            clip() {},
            stroke() {},
            fill() {},
            save() {},
            restore() {},
            setLineDash() {},
            getLineDash() { return []; },
            drawImage() {},
            putImageData() {},
            getImageData(x, y, w, h) { return new ImageData(w, h); },
            createLinearGradient() { return { addColorStop() {} }; },
            createRadialGradient() { return { addColorStop() {} }; },
            measureText(text) { return { width: text.length * 8 }; },
            fillText() {},
            strokeText() {},
            setTransform() {},
            resetTransform() {},
            translate() {},
            scale() {},
            rotate() {},
            transform() {}
        };
    }
    return null;
};

if (!HTMLCanvasElement.prototype._origToBlob) {
    HTMLCanvasElement.prototype._origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type) {
        const data = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
        const blob = new Blob([data], { type: type || "image/png" });
        setTimeout(() => callback(blob), 0);
    };
}

if (typeof Blob.prototype.text !== "function") {
    Blob.prototype.text = function () {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsText(this);
        });
    };
}
