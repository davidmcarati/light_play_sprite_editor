import { describe, it, expect } from "vitest";
import { SpriteState, SpriteHistory } from "../src/sprite_editor/sprite_data.js";

describe("SpriteState", () => {
    it("creates with correct dimensions", () => {
        const s = new SpriteState(4, 4);
        expect(s.width).toBe(4);
        expect(s.height).toBe(4);
        expect(s.pixels.length).toBe(4 * 4 * 4);
    });

    it("initializes all pixels to zero", () => {
        const s = new SpriteState(2, 2);
        for (let i = 0; i < s.pixels.length; i++) {
            expect(s.pixels[i]).toBe(0);
        }
    });

    describe("inBounds", () => {
        const s = new SpriteState(4, 4);
        it("returns true for valid coords", () => {
            expect(s.inBounds(0, 0)).toBe(true);
            expect(s.inBounds(3, 3)).toBe(true);
        });
        it("returns false for out-of-bounds coords", () => {
            expect(s.inBounds(-1, 0)).toBe(false);
            expect(s.inBounds(4, 0)).toBe(false);
            expect(s.inBounds(0, -1)).toBe(false);
            expect(s.inBounds(0, 4)).toBe(false);
        });
    });

    describe("getPixel / setPixel", () => {
        it("writes and reads back a pixel", () => {
            const s = new SpriteState(4, 4);
            s.setPixel(1, 2, 10, 20, 30, 40);
            const p = s.getPixel(1, 2);
            expect(p).toEqual({ r: 10, g: 20, b: 30, a: 40 });
        });
        it("returns null for out-of-bounds get", () => {
            const s = new SpriteState(4, 4);
            expect(s.getPixel(-1, 0)).toBeNull();
            expect(s.getPixel(4, 0)).toBeNull();
        });
        it("ignores out-of-bounds set", () => {
            const s = new SpriteState(4, 4);
            s.setPixel(-1, 0, 255, 0, 0, 255);
            // No crash, pixel at 0,0 is still zero
            expect(s.getPixel(0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
        });
    });

    describe("clone", () => {
        it("creates an independent copy", () => {
            const s = new SpriteState(2, 2);
            s.setPixel(0, 0, 100, 200, 150, 255);
            const copy = s.clone();

            expect(copy.getPixel(0, 0)).toEqual({ r: 100, g: 200, b: 150, a: 255 });
            expect(copy.width).toBe(s.width);
            expect(copy.height).toBe(s.height);

            copy.setPixel(0, 0, 1, 2, 3, 4);
            expect(s.getPixel(0, 0)).toEqual({ r: 100, g: 200, b: 150, a: 255 });
        });
    });

    describe("clear", () => {
        it("sets all pixels to zero", () => {
            const s = new SpriteState(2, 2);
            s.setPixel(0, 0, 255, 255, 255, 255);
            s.setPixel(1, 1, 128, 128, 128, 128);
            s.clear();
            for (let i = 0; i < s.pixels.length; i++) {
                expect(s.pixels[i]).toBe(0);
            }
        });
    });

    describe("toImageData", () => {
        it("returns an ImageData with matching dimensions", () => {
            const s = new SpriteState(3, 5);
            const imgData = s.toImageData();
            expect(imgData.width).toBe(3);
            expect(imgData.height).toBe(5);
            expect(imgData.data.length).toBe(3 * 5 * 4);
        });
        it("copies pixel data into ImageData", () => {
            const s = new SpriteState(1, 1);
            s.setPixel(0, 0, 11, 22, 33, 44);
            const imgData = s.toImageData();
            expect(imgData.data[0]).toBe(11);
            expect(imgData.data[1]).toBe(22);
            expect(imgData.data[2]).toBe(33);
            expect(imgData.data[3]).toBe(44);
        });
    });

    describe("fromImageData", () => {
        it("creates SpriteState from ImageData", () => {
            const imgData = new ImageData(2, 2);
            imgData.data[0] = 10; imgData.data[1] = 20;
            imgData.data[2] = 30; imgData.data[3] = 40;
            const s = SpriteState.fromImageData(imgData);
            expect(s.width).toBe(2);
            expect(s.height).toBe(2);
            expect(s.getPixel(0, 0)).toEqual({ r: 10, g: 20, b: 30, a: 40 });
        });
    });

    describe("resize", () => {
        it("copies pixels into larger canvas", () => {
            const s = new SpriteState(2, 2);
            s.setPixel(0, 0, 100, 0, 0, 255);
            s.setPixel(1, 1, 0, 100, 0, 255);

            const resized = s.resize(4, 4, 0, 0);
            expect(resized.width).toBe(4);
            expect(resized.height).toBe(4);
            expect(resized.getPixel(0, 0)).toEqual({ r: 100, g: 0, b: 0, a: 255 });
            expect(resized.getPixel(1, 1)).toEqual({ r: 0, g: 100, b: 0, a: 255 });
            expect(resized.getPixel(3, 3)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
        });
        it("applies offset", () => {
            const s = new SpriteState(2, 2);
            s.setPixel(0, 0, 255, 0, 0, 255);

            const resized = s.resize(4, 4, 1, 1);
            expect(resized.getPixel(0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
            expect(resized.getPixel(1, 1)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
        });
        it("clips pixels when shrinking", () => {
            const s = new SpriteState(4, 4);
            s.setPixel(3, 3, 255, 255, 0, 255);

            const resized = s.resize(2, 2, 0, 0);
            expect(resized.getPixel(0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
            // pixel at 3,3 is outside the new 2x2 area
        });
    });
});

describe("SpriteHistory", () => {
    function makeState(r) {
        const s = new SpriteState(1, 1);
        s.setPixel(0, 0, r, 0, 0, 255);
        return s;
    }

    it("starts empty", () => {
        const h = new SpriteHistory();
        expect(h.canUndo()).toBe(false);
        expect(h.canRedo()).toBe(false);
    });

    it("push enables undo", () => {
        const h = new SpriteHistory();
        h.push(makeState(10));
        expect(h.canUndo()).toBe(true);
        expect(h.canRedo()).toBe(false);
    });

    it("undo returns the pushed state", () => {
        const h = new SpriteHistory();
        const s1 = makeState(10);
        h.push(s1);

        const current = makeState(20);
        const restored = h.undo(current);
        expect(restored.getPixel(0, 0).r).toBe(10);
    });

    it("redo returns the state before undo", () => {
        const h = new SpriteHistory();
        const s1 = makeState(10);
        h.push(s1);

        const current = makeState(20);
        const undone = h.undo(current);
        expect(undone).not.toBeNull();
        expect(h.canRedo()).toBe(true);

        const redone = h.redo(undone);
        expect(redone.getPixel(0, 0).r).toBe(20);
    });

    it("push after undo clears redo stack", () => {
        const h = new SpriteHistory();
        h.push(makeState(10));
        h.push(makeState(20));

        const current = makeState(30);
        h.undo(current);
        expect(h.canRedo()).toBe(true);

        h.push(makeState(40));
        expect(h.canRedo()).toBe(false);
    });

    it("undo returns null when empty", () => {
        const h = new SpriteHistory();
        const result = h.undo(makeState(1));
        expect(result).toBeNull();
    });

    it("redo returns null when empty", () => {
        const h = new SpriteHistory();
        const result = h.redo(makeState(1));
        expect(result).toBeNull();
    });

    it("limits history to MAX_HISTORY_STEPS", () => {
        const h = new SpriteHistory();
        for (let i = 0; i < 60; i++) {
            h.push(makeState(i));
        }
        // Should have at most 50 undo steps
        let count = 0;
        let current = makeState(99);
        while (h.canUndo()) {
            current = h.undo(current);
            count++;
        }
        expect(count).toBe(50);
    });

    it("clear removes all history", () => {
        const h = new SpriteHistory();
        h.push(makeState(10));
        h.push(makeState(20));
        h.clear();
        expect(h.canUndo()).toBe(false);
        expect(h.canRedo()).toBe(false);
    });
});
