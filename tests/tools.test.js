import { describe, it, expect } from "vitest";
import { drawLinePixels, colorMatch, ALL_TOOLS } from "../src/sprite_editor/tools.js";

describe("drawLinePixels", () => {
    it("calls callback for a single point", () => {
        const points = [];
        drawLinePixels(3, 3, 3, 3, (x, y) => points.push([x, y]));
        expect(points).toEqual([[3, 3]]);
    });

    it("draws a horizontal line", () => {
        const points = [];
        drawLinePixels(0, 0, 4, 0, (x, y) => points.push([x, y]));
        expect(points.length).toBe(5);
        expect(points[0]).toEqual([0, 0]);
        expect(points[4]).toEqual([4, 0]);
        // All y should be 0
        points.forEach(([, y]) => expect(y).toBe(0));
    });

    it("draws a vertical line", () => {
        const points = [];
        drawLinePixels(0, 0, 0, 4, (x, y) => points.push([x, y]));
        expect(points.length).toBe(5);
        expect(points[0]).toEqual([0, 0]);
        expect(points[4]).toEqual([0, 4]);
        points.forEach(([x]) => expect(x).toBe(0));
    });

    it("draws a diagonal line", () => {
        const points = [];
        drawLinePixels(0, 0, 3, 3, (x, y) => points.push([x, y]));
        expect(points.length).toBe(4);
        expect(points[0]).toEqual([0, 0]);
        expect(points[3]).toEqual([3, 3]);
    });

    it("handles reversed direction", () => {
        const points = [];
        drawLinePixels(4, 4, 0, 0, (x, y) => points.push([x, y]));
        expect(points[0]).toEqual([4, 4]);
        expect(points[points.length - 1]).toEqual([0, 0]);
    });

    it("handles fractional inputs by rounding", () => {
        const points = [];
        drawLinePixels(0.7, 0.3, 2.8, 0.1, (x, y) => points.push([x, y]));
        // Should round to (1,0) -> (3,0)
        expect(points[0]).toEqual([1, 0]);
        expect(points[points.length - 1]).toEqual([3, 0]);
    });
});

describe("colorMatch", () => {
    it("matches identical colors with zero tolerance", () => {
        const c1 = { r: 100, g: 200, b: 50, a: 255 };
        const c2 = { r: 100, g: 200, b: 50, a: 255 };
        expect(colorMatch(c1, c2, 0)).toBe(true);
    });

    it("does not match different colors with zero tolerance", () => {
        const c1 = { r: 100, g: 200, b: 50, a: 255 };
        const c2 = { r: 101, g: 200, b: 50, a: 255 };
        expect(colorMatch(c1, c2, 0)).toBe(false);
    });

    it("matches within tolerance", () => {
        const c1 = { r: 100, g: 200, b: 50, a: 255 };
        const c2 = { r: 105, g: 195, b: 55, a: 250 };
        expect(colorMatch(c1, c2, 5)).toBe(true);
    });

    it("does not match outside tolerance", () => {
        const c1 = { r: 100, g: 200, b: 50, a: 255 };
        const c2 = { r: 106, g: 200, b: 50, a: 255 };
        expect(colorMatch(c1, c2, 5)).toBe(false);
    });

    it("checks alpha channel too", () => {
        const c1 = { r: 100, g: 100, b: 100, a: 255 };
        const c2 = { r: 100, g: 100, b: 100, a: 200 };
        expect(colorMatch(c1, c2, 0)).toBe(false);
        expect(colorMatch(c1, c2, 55)).toBe(true);
    });
});

describe("ALL_TOOLS", () => {
    it("exports an array of tools", () => {
        expect(Array.isArray(ALL_TOOLS)).toBe(true);
        expect(ALL_TOOLS.length).toBeGreaterThan(0);
    });

    it("each tool has name, shortcut, and icon", () => {
        ALL_TOOLS.forEach(tool => {
            expect(typeof tool.name).toBe("string");
            expect(tool.name.length).toBeGreaterThan(0);
            expect(typeof tool.shortcut).toBe("string");
            expect(typeof tool.icon).toBe("string");
        });
    });

    it("contains expected tool names", () => {
        const names = ALL_TOOLS.map(t => t.name);
        expect(names).toContain("Pencil");
        expect(names).toContain("Eraser");
        expect(names).toContain("Fill");
        expect(names).toContain("Eyedropper");
        expect(names).toContain("Line");
        expect(names).toContain("Rectangle");
        expect(names).toContain("Ellipse");
        expect(names).toContain("Selection");
        expect(names).toContain("Move");
    });

    it("each tool has standard methods", () => {
        ALL_TOOLS.forEach(tool => {
            expect(typeof tool.onDown).toBe("function");
            expect(typeof tool.onMove).toBe("function");
            expect(typeof tool.onUp).toBe("function");
            expect(typeof tool.getCursor).toBe("function");
            expect(typeof tool.getOptions).toBe("function");
        });
    });

    it("tools return valid options arrays", () => {
        ALL_TOOLS.forEach(tool => {
            const opts = tool.getOptions();
            expect(Array.isArray(opts)).toBe(true);
            opts.forEach(opt => {
                expect(["brushSize", "shapeFilled", "fillTolerance"]).toContain(opt);
            });
        });
    });
});
