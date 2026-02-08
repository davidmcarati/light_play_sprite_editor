import { describe, it, expect } from "vitest";
import { Color, clamp } from "../src/sprite_editor/color.js";

describe("clamp", () => {
    it("returns value when within range", () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });
    it("clamps to min", () => {
        expect(clamp(-5, 0, 10)).toBe(0);
    });
    it("clamps to max", () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });
    it("handles equal min and max", () => {
        expect(clamp(5, 3, 3)).toBe(3);
    });
});

describe("Color constructor", () => {
    it("defaults to black opaque", () => {
        const c = new Color();
        expect(c.r).toBe(0);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });
    it("clamps values to 0-255", () => {
        const c = new Color(-10, 300, 128, 512);
        expect(c.r).toBe(0);
        expect(c.g).toBe(255);
        expect(c.b).toBe(128);
        expect(c.a).toBe(255);
    });
    it("rounds fractional values", () => {
        const c = new Color(1.7, 2.3, 3.5, 4.9);
        expect(c.r).toBe(2);
        expect(c.g).toBe(2);
        expect(c.b).toBe(4);
        expect(c.a).toBe(5);
    });
});

describe("Color.clone", () => {
    it("creates an identical but independent copy", () => {
        const a = new Color(10, 20, 30, 40);
        const b = a.clone();
        expect(b.r).toBe(10);
        expect(b.g).toBe(20);
        expect(b.b).toBe(30);
        expect(b.a).toBe(40);
        b.r = 99;
        expect(a.r).toBe(10);
    });
});

describe("Color.equals", () => {
    it("returns true for identical colors", () => {
        const a = new Color(10, 20, 30, 40);
        const b = new Color(10, 20, 30, 40);
        expect(a.equals(b)).toBe(true);
    });
    it("returns false for different colors", () => {
        const a = new Color(10, 20, 30, 40);
        const b = new Color(10, 20, 30, 41);
        expect(a.equals(b)).toBe(false);
    });
});

describe("Color.toHex", () => {
    it("returns #RRGGBB for fully opaque color", () => {
        const c = new Color(255, 0, 128, 255);
        expect(c.toHex()).toBe("#ff0080");
    });
    it("returns #RRGGBBAA for non-opaque color", () => {
        const c = new Color(255, 0, 128, 128);
        expect(c.toHex()).toBe("#ff008080");
    });
    it("returns #000000 for black", () => {
        const c = new Color(0, 0, 0, 255);
        expect(c.toHex()).toBe("#000000");
    });
    it("returns #ffffff for white", () => {
        const c = new Color(255, 255, 255, 255);
        expect(c.toHex()).toBe("#ffffff");
    });
});

describe("Color.toRGBA", () => {
    it("produces correct rgba string", () => {
        const c = new Color(10, 20, 30, 128);
        expect(c.toRGBA()).toBe("rgba(10, 20, 30, 0.502)");
    });
    it("produces 1.000 for full alpha", () => {
        const c = new Color(0, 0, 0, 255);
        expect(c.toRGBA()).toBe("rgba(0, 0, 0, 1.000)");
    });
});

describe("Color.toCSS", () => {
    it("produces rgb() string without alpha", () => {
        const c = new Color(100, 200, 50, 128);
        expect(c.toCSS()).toBe("rgb(100, 200, 50)");
    });
});

describe("Color.toHSV / Color.fromHSV round-trip", () => {
    it("pure red round-trips", () => {
        const c = new Color(255, 0, 0, 255);
        const hsv = c.toHSV();
        expect(hsv.h).toBeCloseTo(0, 0);
        expect(hsv.s).toBeCloseTo(1, 2);
        expect(hsv.v).toBeCloseTo(1, 2);

        const back = Color.fromHSV(hsv.h, hsv.s, hsv.v, 255);
        expect(back.r).toBe(255);
        expect(back.g).toBe(0);
        expect(back.b).toBe(0);
    });
    it("pure green round-trips", () => {
        const c = new Color(0, 255, 0, 255);
        const hsv = c.toHSV();
        expect(hsv.h).toBeCloseTo(120, 0);
        const back = Color.fromHSV(hsv.h, hsv.s, hsv.v, 255);
        expect(back.r).toBe(0);
        expect(back.g).toBe(255);
        expect(back.b).toBe(0);
    });
    it("pure blue round-trips", () => {
        const c = new Color(0, 0, 255, 255);
        const hsv = c.toHSV();
        expect(hsv.h).toBeCloseTo(240, 0);
        const back = Color.fromHSV(hsv.h, hsv.s, hsv.v, 255);
        expect(back.r).toBe(0);
        expect(back.g).toBe(0);
        expect(back.b).toBe(255);
    });
    it("gray has zero saturation", () => {
        const c = new Color(128, 128, 128, 255);
        const hsv = c.toHSV();
        expect(hsv.s).toBeCloseTo(0, 5);
    });
    it("black has zero value", () => {
        const c = new Color(0, 0, 0, 255);
        const hsv = c.toHSV();
        expect(hsv.v).toBe(0);
    });
    it("arbitrary color round-trips with minimal loss", () => {
        const c = new Color(173, 52, 200, 200);
        const hsv = c.toHSV();
        const back = Color.fromHSV(hsv.h, hsv.s, hsv.v, 200);
        expect(Math.abs(back.r - c.r)).toBeLessThanOrEqual(1);
        expect(Math.abs(back.g - c.g)).toBeLessThanOrEqual(1);
        expect(Math.abs(back.b - c.b)).toBeLessThanOrEqual(1);
    });
    it("negative hue wraps correctly", () => {
        const c = Color.fromHSV(-30, 1, 1, 255);
        const c2 = Color.fromHSV(330, 1, 1, 255);
        expect(c.r).toBe(c2.r);
        expect(c.g).toBe(c2.g);
        expect(c.b).toBe(c2.b);
    });
    it("hue > 360 wraps", () => {
        const c = Color.fromHSV(480, 1, 1, 255);
        const c2 = Color.fromHSV(120, 1, 1, 255);
        expect(c.r).toBe(c2.r);
        expect(c.g).toBe(c2.g);
        expect(c.b).toBe(c2.b);
    });
});

describe("Color.fromHex", () => {
    it("parses 6-digit hex", () => {
        const c = Color.fromHex("#ff8000");
        expect(c.r).toBe(255);
        expect(c.g).toBe(128);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });
    it("parses 3-digit hex shorthand", () => {
        const c = Color.fromHex("#f80");
        expect(c.r).toBe(255);
        expect(c.g).toBe(136);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });
    it("parses 8-digit hex with alpha", () => {
        const c = Color.fromHex("#ff800080");
        expect(c.r).toBe(255);
        expect(c.g).toBe(128);
        expect(c.b).toBe(0);
        expect(c.a).toBe(128);
    });
    it("handles missing # prefix", () => {
        const c = Color.fromHex("ff0000");
        expect(c.r).toBe(255);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
    });
    it("returns black for invalid hex (wrong length)", () => {
        // "xyz" expands to 3-digit path → "xxyyzz" + "ff" = 8 chars
        // parseInt("xx", 16) = NaN, so values are NaN.
        // Only truly-wrong-length inputs hit the early return for black:
        const c = Color.fromHex("#zz");
        expect(c.r).toBe(0);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });
    it("returns black for too-short hex", () => {
        const c = Color.fromHex("#ab");
        expect(c.r).toBe(0);
        expect(c.g).toBe(0);
        expect(c.b).toBe(0);
        expect(c.a).toBe(255);
    });
});
