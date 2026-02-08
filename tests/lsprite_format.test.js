import { describe, it, expect } from "vitest";
import { serialize, deserialize, serializeToBlob, deserializeFromBlob, LSPRITE_VERSION } from "../src/sprite_editor/lsprite_format.js";
import { LayerStack } from "../src/sprite_editor/layer_data.js";

describe("lsprite_format", () => {
    describe("serialize / deserialize round-trip", () => {
        it("preserves a single-layer stack", () => {
            const stack = new LayerStack(4, 4);
            stack.layers[0].data.setPixel(0, 0, 255, 0, 0, 255);
            stack.layers[0].data.setPixel(3, 3, 0, 255, 0, 128);

            const json = serialize(stack);
            const parsed = JSON.parse(json);
            expect(parsed.version).toBe(LSPRITE_VERSION);
            expect(parsed.width).toBe(4);
            expect(parsed.height).toBe(4);
            expect(parsed.layers.length).toBe(1);

            const restored = deserialize(json);
            expect(restored.width).toBe(4);
            expect(restored.height).toBe(4);
            expect(restored.layers.length).toBe(1);
            expect(restored.layers[0].data.getPixel(0, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
            expect(restored.layers[0].data.getPixel(3, 3)).toEqual({ r: 0, g: 255, b: 0, a: 128 });
        });

        it("preserves multi-layer stack with properties", () => {
            const stack = new LayerStack(8, 8, 16);
            stack.layers[0].data.setPixel(0, 0, 100, 100, 100, 255);
            stack.layers[0].visible = true;
            stack.layers[0].opacity = 0.75;
            stack.layers[0].locked = true;

            stack.addLayer("Overlay");
            stack.layers[1].data.setPixel(1, 1, 200, 50, 50, 200);
            stack.layers[1].visible = false;
            stack.layers[1].opacity = 0.5;
            stack.layers[1].locked = false;

            stack.activeIndex = 1;

            const json = serialize(stack);
            const restored = deserialize(json);

            expect(restored.layers.length).toBe(2);
            expect(restored.colorDepth).toBe(16);
            expect(restored.activeIndex).toBe(1);

            expect(restored.layers[0].name).toBe("Background");
            expect(restored.layers[0].visible).toBe(true);
            expect(restored.layers[0].opacity).toBe(0.75);
            expect(restored.layers[0].locked).toBe(true);
            expect(restored.layers[0].data.getPixel(0, 0)).toEqual({ r: 100, g: 100, b: 100, a: 255 });

            expect(restored.layers[1].name).toBe("Overlay");
            expect(restored.layers[1].visible).toBe(false);
            expect(restored.layers[1].opacity).toBe(0.5);
            expect(restored.layers[1].locked).toBe(false);
            expect(restored.layers[1].data.getPixel(1, 1)).toEqual({ r: 200, g: 50, b: 50, a: 200 });
        });

        it("preserves all pixels in a fully painted layer", () => {
            const stack = new LayerStack(3, 3);
            for (let y = 0; y < 3; y++) {
                for (let x = 0; x < 3; x++) {
                    stack.layers[0].data.setPixel(x, y, x * 80, y * 80, 128, 255);
                }
            }

            const json = serialize(stack);
            const restored = deserialize(json);

            for (let y = 0; y < 3; y++) {
                for (let x = 0; x < 3; x++) {
                    expect(restored.layers[0].data.getPixel(x, y)).toEqual(
                        stack.layers[0].data.getPixel(x, y)
                    );
                }
            }
        });
    });

    describe("serializeToBlob / deserializeFromBlob round-trip", () => {
        it("serializes to blob and deserializes back", async () => {
            const stack = new LayerStack(4, 4);
            stack.layers[0].data.setPixel(2, 2, 42, 84, 126, 255);

            const blob = serializeToBlob(stack);
            expect(blob).toBeInstanceOf(Blob);
            expect(blob.type).toBe("application/json");

            const restored = await deserializeFromBlob(blob);
            expect(restored.width).toBe(4);
            expect(restored.height).toBe(4);
            expect(restored.layers[0].data.getPixel(2, 2)).toEqual({ r: 42, g: 84, b: 126, a: 255 });
        });
    });

    describe("deserialize validation", () => {
        it("throws on invalid JSON structure", () => {
            expect(() => deserialize('{"foo":"bar"}')).toThrow("Invalid .lsprite file format");
        });
        it("throws on missing layers", () => {
            expect(() => deserialize('{"version":1,"width":4,"height":4}')).toThrow();
        });
        it("throws on invalid JSON", () => {
            expect(() => deserialize("not json at all")).toThrow();
        });
    });

    describe("activeLayerIndex clamping", () => {
        it("clamps activeLayerIndex to layer count", () => {
            const stack = new LayerStack(2, 2);
            const json = serialize(stack);
            const doc = JSON.parse(json);
            doc.activeLayerIndex = 999;
            const restored = deserialize(JSON.stringify(doc));
            expect(restored.activeIndex).toBe(0);
        });
    });

    describe("version constant", () => {
        it("exports LSPRITE_VERSION = 1", () => {
            expect(LSPRITE_VERSION).toBe(1);
        });
    });
});
