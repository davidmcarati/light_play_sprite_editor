function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

class Color {
    constructor(r = 0, g = 0, b = 0, a = 255) {
        this.r = clamp(Math.round(r), 0, 255);
        this.g = clamp(Math.round(g), 0, 255);
        this.b = clamp(Math.round(b), 0, 255);
        this.a = clamp(Math.round(a), 0, 255);
    }

    clone() {
        return new Color(this.r, this.g, this.b, this.a);
    }

    equals(other) {
        return this.r === other.r && this.g === other.g &&
               this.b === other.b && this.a === other.a;
    }

    toHex() {
        const hex = (v) => v.toString(16).padStart(2, "0");
        if (this.a === 255) {
            return "#" + hex(this.r) + hex(this.g) + hex(this.b);
        }
        return "#" + hex(this.r) + hex(this.g) + hex(this.b) + hex(this.a);
    }

    toRGBA() {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${(this.a / 255).toFixed(3)})`;
    }

    toCSS() {
        return `rgb(${this.r}, ${this.g}, ${this.b})`;
    }

    toHSV() {
        const r = this.r / 255;
        const g = this.g / 255;
        const b = this.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let h = 0;
        if (delta !== 0) {
            if (max === r) {
                h = 60 * (((g - b) / delta) % 6);
            } else if (max === g) {
                h = 60 * ((b - r) / delta + 2);
            } else {
                h = 60 * ((r - g) / delta + 4);
            }
        }
        if (h < 0) h += 360;

        const s = max === 0 ? 0 : delta / max;
        const v = max;

        return { h, s, v };
    }

    static fromHSV(h, s, v, a = 255) {
        h = ((h % 360) + 360) % 360;
        s = clamp(s, 0, 1);
        v = clamp(v, 0, 1);

        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;

        let r1, g1, b1;
        if (h < 60)       { r1 = c; g1 = x; b1 = 0; }
        else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
        else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
        else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
        else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
        else              { r1 = c; g1 = 0; b1 = x; }

        return new Color(
            Math.round((r1 + m) * 255),
            Math.round((g1 + m) * 255),
            Math.round((b1 + m) * 255),
            Math.round(a)
        );
    }

    static fromHex(hex) {
        if (hex.charAt(0) === "#") hex = hex.substring(1);
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + "ff";
        }
        if (hex.length === 6) {
            hex += "ff";
        }
        if (hex.length !== 8) {
            return new Color(0, 0, 0, 255);
        }
        return new Color(
            parseInt(hex.substring(0, 2), 16),
            parseInt(hex.substring(2, 4), 16),
            parseInt(hex.substring(4, 6), 16),
            parseInt(hex.substring(6, 8), 16)
        );
    }
}

export { Color, clamp };
