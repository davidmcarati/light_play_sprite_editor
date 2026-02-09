import { SpriteState } from "./sprite_data.js";

let _nextLayerId = 1;

class Layer {
    constructor(name, data) {
        this.id = _nextLayerId++;
        this.name = name;
        this.data = data;
        this.visible = true;
        this.opacity = 1.0;
        this.locked = false;
    }

    clone() {
        const copy = new Layer(this.name, this.data.clone());
        copy.visible = this.visible;
        copy.opacity = this.opacity;
        copy.locked = this.locked;
        return copy;
    }
}

class LayerStack {
    constructor(width, height, colorDepth = 32) {
        this.width = width;
        this.height = height;
        this.colorDepth = colorDepth;
        this.layers = [new Layer("Background", new SpriteState(width, height))];
        this.activeIndex = 0;
    }

    get activeLayer() {
        return this.layers[this.activeIndex];
    }

    addLayer(name) {
        const layer = new Layer(
            name || `Layer ${this.layers.length + 1}`,
            new SpriteState(this.width, this.height)
        );
        this.layers.splice(this.activeIndex + 1, 0, layer);
        this.activeIndex = this.activeIndex + 1;
        return layer;
    }

    removeLayer(index) {
        if (this.layers.length <= 1) return false;
        this.layers.splice(index, 1);
        if (this.activeIndex >= this.layers.length) {
            this.activeIndex = this.layers.length - 1;
        } else if (this.activeIndex > index) {
            this.activeIndex--;
        }
        return true;
    }

    moveLayerUp(index) {
        if (index >= this.layers.length - 1) return false;
        const tmp = this.layers[index];
        this.layers[index] = this.layers[index + 1];
        this.layers[index + 1] = tmp;
        if (this.activeIndex === index) this.activeIndex = index + 1;
        else if (this.activeIndex === index + 1) this.activeIndex = index;
        return true;
    }

    moveLayerDown(index) {
        if (index <= 0) return false;
        const tmp = this.layers[index];
        this.layers[index] = this.layers[index - 1];
        this.layers[index - 1] = tmp;
        if (this.activeIndex === index) this.activeIndex = index - 1;
        else if (this.activeIndex === index - 1) this.activeIndex = index;
        return true;
    }

    duplicateLayer(index) {
        const original = this.layers[index];
        const copy = original.clone();
        copy.name = original.name + " copy";
        this.layers.splice(index + 1, 0, copy);
        this.activeIndex = index + 1;
        return copy;
    }

    mergeDown(index) {
        if (index <= 0) return false;
        const upper = this.layers[index];
        const lower = this.layers[index - 1];

        compositeLayer(upper, lower, this.width, this.height);

        this.layers.splice(index, 1);
        if (this.activeIndex >= index) {
            this.activeIndex = Math.max(0, this.activeIndex - 1);
        }
        return true;
    }

    reorderLayer(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.layers.length) return false;
        if (toIndex < 0 || toIndex >= this.layers.length) return false;
        if (fromIndex === toIndex) return false;
        const [layer] = this.layers.splice(fromIndex, 1);
        this.layers.splice(toIndex, 0, layer);
        if (this.activeIndex === fromIndex) {
            this.activeIndex = toIndex;
        } else if (fromIndex < this.activeIndex && toIndex >= this.activeIndex) {
            this.activeIndex--;
        } else if (fromIndex > this.activeIndex && toIndex <= this.activeIndex) {
            this.activeIndex++;
        }
        return true;
    }

    mergeLayers(indices) {
        if (!indices || indices.length < 2) return false;
        const sorted = [...indices].sort((a, b) => a - b);
        const targetIdx = sorted[0];
        const target = this.layers[targetIdx];

        for (let i = 1; i < sorted.length; i++) {
            compositeLayer(this.layers[sorted[i]], target, this.width, this.height);
        }

        for (let i = sorted.length - 1; i >= 1; i--) {
            this.layers.splice(sorted[i], 1);
        }

        if (this.activeIndex >= this.layers.length) {
            this.activeIndex = this.layers.length - 1;
        }
        if (sorted.includes(this.activeIndex)) {
            this.activeIndex = targetIdx;
        } else {
            let removedBelow = 0;
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i] < this.activeIndex) removedBelow++;
            }
            this.activeIndex -= removedBelow;
        }

        return true;
    }

    flatten(target = null) {
        const result = target && target.width === this.width && target.height === this.height
            ? target : new SpriteState(this.width, this.height);
        const dst = result.pixels;

        let visibleCount = 0;
        let singleLayer = null;
        for (let i = 0; i < this.layers.length; i++) {
            if (this.layers[i].visible) {
                visibleCount++;
                singleLayer = this.layers[i];
            }
        }

        if (visibleCount === 1 && singleLayer.opacity === 1) {
            dst.set(singleLayer.data.pixels);
            return result;
        }

        if (target) dst.fill(0);

        const totalPixels = this.width * this.height;

        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.layers[i];
            if (!layer.visible) continue;

            const src = layer.data.pixels;
            const opacity = layer.opacity;

            if (opacity === 1 && i === 0) {
                dst.set(src);
                continue;
            }

            for (let p = 0; p < totalPixels; p++) {
                const si = p * 4;
                const sa = src[si + 3];
                if (sa === 0) continue;

                const srcA = (sa / 255) * opacity;
                if (srcA === 0) continue;

                const da = dst[si + 3] / 255;
                const outA = srcA + da * (1 - srcA);

                if (outA > 0) {
                    const inv = 1 / outA;
                    const oneMinusSrcA = da * (1 - srcA);
                    dst[si]     = (src[si]     * srcA + dst[si]     * oneMinusSrcA) * inv + 0.5 | 0;
                    dst[si + 1] = (src[si + 1] * srcA + dst[si + 1] * oneMinusSrcA) * inv + 0.5 | 0;
                    dst[si + 2] = (src[si + 2] * srcA + dst[si + 2] * oneMinusSrcA) * inv + 0.5 | 0;
                    dst[si + 3] = outA * 255 + 0.5 | 0;
                }
            }
        }
        return result;
    }

    flattenToLayer() {
        const flat = this.flatten();
        this.layers = [new Layer("Background", flat)];
        this.activeIndex = 0;
    }

    inBounds(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    clone() {
        const copy = new LayerStack(this.width, this.height, this.colorDepth);
        copy.layers = this.layers.map(l => l.clone());
        copy.activeIndex = this.activeIndex;
        return copy;
    }

    resize(newWidth, newHeight, offsetX = 0, offsetY = 0) {
        const resized = new LayerStack(newWidth, newHeight, this.colorDepth);
        resized.layers = this.layers.map(layer => {
            const newLayer = layer.clone();
            newLayer.data = layer.data.resize(newWidth, newHeight, offsetX, offsetY);
            return newLayer;
        });
        resized.activeIndex = this.activeIndex;
        return resized;
    }

    async toBlob(format = "image/png", quality = 0.92) {
        const flat = this.flatten();
        const canvas = document.createElement("canvas");
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext("2d");
        ctx.putImageData(flat.toImageData(), 0, 0);
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Failed to create blob from layer data."));
            }, format, quality);
        });
    }

    toImageData() {
        return this.flatten().toImageData();
    }

    static fromSpriteState(spriteState) {
        const stack = new LayerStack(spriteState.width, spriteState.height);
        stack.layers[0].data = spriteState.clone();
        return stack;
    }
}

function compositeLayer(upper, lower, width, height) {
    const src = upper.data.pixels;
    const dst = lower.data.pixels;
    const opacity = upper.opacity;
    const total = width * height;

    for (let p = 0; p < total; p++) {
        const i = p * 4;
        const sa = src[i + 3];
        if (sa === 0) continue;

        const srcA = (sa / 255) * opacity;
        if (srcA === 0) continue;

        const da = dst[i + 3] / 255;
        const outA = srcA + da * (1 - srcA);

        if (outA > 0) {
            const inv = 1 / outA;
            const oneMinusSrcA = da * (1 - srcA);
            dst[i]     = (src[i]     * srcA + dst[i]     * oneMinusSrcA) * inv + 0.5 | 0;
            dst[i + 1] = (src[i + 1] * srcA + dst[i + 1] * oneMinusSrcA) * inv + 0.5 | 0;
            dst[i + 2] = (src[i + 2] * srcA + dst[i + 2] * oneMinusSrcA) * inv + 0.5 | 0;
            dst[i + 3] = outA * 255 + 0.5 | 0;
        }
    }
}

export { Layer, LayerStack };
