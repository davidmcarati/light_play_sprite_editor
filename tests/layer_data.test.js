import { describe, it, expect } from "vitest";
import { Layer, LayerStack } from "../src/sprite_editor/layer_data.js";
import { SpriteState } from "../src/sprite_editor/sprite_data.js";

describe("Layer", () => {
    it("creates with name and data", () => {
        const data = new SpriteState(2, 2);
        const layer = new Layer("Test", data);
        expect(layer.name).toBe("Test");
        expect(layer.data).toBe(data);
        expect(layer.visible).toBe(true);
        expect(layer.opacity).toBe(1.0);
        expect(layer.locked).toBe(false);
        expect(typeof layer.id).toBe("number");
    });

    it("clone creates independent copy", () => {
        const data = new SpriteState(2, 2);
        data.setPixel(0, 0, 255, 0, 0, 255);
        const layer = new Layer("Original", data);
        layer.visible = false;
        layer.opacity = 0.5;
        layer.locked = true;

        const copy = layer.clone();
        expect(copy.name).toBe("Original");
        expect(copy.visible).toBe(false);
        expect(copy.opacity).toBe(0.5);
        expect(copy.locked).toBe(true);
        expect(copy.data.getPixel(0, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
        expect(copy.id).not.toBe(layer.id);

        copy.data.setPixel(0, 0, 0, 0, 0, 0);
        expect(layer.data.getPixel(0, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    });
});

describe("LayerStack", () => {
    it("creates with one Background layer", () => {
        const stack = new LayerStack(4, 4);
        expect(stack.layers.length).toBe(1);
        expect(stack.layers[0].name).toBe("Background");
        expect(stack.activeIndex).toBe(0);
        expect(stack.width).toBe(4);
        expect(stack.height).toBe(4);
    });

    it("activeLayer returns the active layer", () => {
        const stack = new LayerStack(4, 4);
        expect(stack.activeLayer).toBe(stack.layers[0]);
    });

    describe("addLayer", () => {
        it("adds a layer after the active index", () => {
            const stack = new LayerStack(4, 4);
            const added = stack.addLayer("Layer 2");
            expect(stack.layers.length).toBe(2);
            expect(stack.activeIndex).toBe(1);
            expect(added.name).toBe("Layer 2");
        });
        it("auto-names when no name given", () => {
            const stack = new LayerStack(4, 4);
            const added = stack.addLayer();
            expect(added.name).toBe("Layer 2");
        });
        it("inserts after active", () => {
            const stack = new LayerStack(4, 4);
            stack.addLayer("A");
            stack.activeIndex = 0;
            stack.addLayer("B");
            // B should be at index 1, A at index 2
            expect(stack.layers[1].name).toBe("B");
            expect(stack.layers[2].name).toBe("A");
            expect(stack.activeIndex).toBe(1);
        });
    });

    describe("removeLayer", () => {
        it("removes a layer", () => {
            const stack = new LayerStack(4, 4);
            stack.addLayer("Layer 2");
            const result = stack.removeLayer(1);
            expect(result).toBe(true);
            expect(stack.layers.length).toBe(1);
        });
        it("cannot remove the last layer", () => {
            const stack = new LayerStack(4, 4);
            const result = stack.removeLayer(0);
            expect(result).toBe(false);
            expect(stack.layers.length).toBe(1);
        });
        it("adjusts activeIndex when removing above it", () => {
            const stack = new LayerStack(4, 4);
            stack.addLayer("A"); // idx 1, active = 1
            stack.addLayer("B"); // idx 2, active = 2
            stack.activeIndex = 2;
            stack.removeLayer(1); // remove A
            expect(stack.activeIndex).toBe(1);
        });
        it("adjusts activeIndex when removing at end", () => {
            const stack = new LayerStack(4, 4);
            stack.addLayer("A");
            stack.activeIndex = 1;
            stack.removeLayer(1);
            expect(stack.activeIndex).toBe(0);
        });
    });

    describe("moveLayerUp / moveLayerDown", () => {
        it("moveLayerUp swaps layers", () => {
            const stack = new LayerStack(4, 4);
            stack.addLayer("A");
            expect(stack.layers[0].name).toBe("Background");
            expect(stack.layers[1].name).toBe("A");

            const result = stack.moveLayerUp(0);
            expect(result).toBe(true);
            expect(stack.layers[0].name).toBe("A");
            expect(stack.layers[1].name).toBe("Background");
        });
        it("moveLayerUp returns false at top", () => {
            const stack = new LayerStack(4, 4);
            stack.addLayer("A");
            const result = stack.moveLayerUp(1);
            expect(result).toBe(false);
        });
        it("moveLayerDown swaps layers", () => {
            const stack = new LayerStack(4, 4);
            stack.addLayer("A");
            const result = stack.moveLayerDown(1);
            expect(result).toBe(true);
            expect(stack.layers[0].name).toBe("A");
            expect(stack.layers[1].name).toBe("Background");
        });
        it("moveLayerDown returns false at bottom", () => {
            const stack = new LayerStack(4, 4);
            const result = stack.moveLayerDown(0);
            expect(result).toBe(false);
        });
    });

    describe("duplicateLayer", () => {
        it("duplicates with ' copy' suffix", () => {
            const stack = new LayerStack(4, 4);
            stack.layers[0].data.setPixel(0, 0, 255, 0, 0, 255);

            const copy = stack.duplicateLayer(0);
            expect(stack.layers.length).toBe(2);
            expect(copy.name).toBe("Background copy");
            expect(copy.data.getPixel(0, 0)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
            expect(stack.activeIndex).toBe(1);
        });
    });

    describe("mergeDown", () => {
        it("merges upper layer onto lower", () => {
            const stack = new LayerStack(2, 2);
            // Background: red pixel
            stack.layers[0].data.setPixel(0, 0, 255, 0, 0, 255);
            // Add layer with green pixel at different position
            stack.addLayer("Top");
            stack.layers[1].data.setPixel(1, 0, 0, 255, 0, 255);

            const result = stack.mergeDown(1);
            expect(result).toBe(true);
            expect(stack.layers.length).toBe(1);
            // Both pixels should be present
            expect(stack.layers[0].data.getPixel(0, 0).r).toBe(255);
            expect(stack.layers[0].data.getPixel(1, 0).g).toBe(255);
        });
        it("returns false for index 0", () => {
            const stack = new LayerStack(2, 2);
            expect(stack.mergeDown(0)).toBe(false);
        });
    });

    describe("flatten", () => {
        it("composites visible layers", () => {
            const stack = new LayerStack(2, 2);
            stack.layers[0].data.setPixel(0, 0, 255, 0, 0, 255);
            stack.addLayer("Top");
            stack.layers[1].data.setPixel(1, 0, 0, 255, 0, 255);

            const flat = stack.flatten();
            expect(flat.width).toBe(2);
            expect(flat.height).toBe(2);
            expect(flat.getPixel(0, 0).r).toBe(255);
            expect(flat.getPixel(1, 0).g).toBe(255);
        });
        it("skips hidden layers", () => {
            const stack = new LayerStack(2, 2);
            stack.layers[0].data.setPixel(0, 0, 255, 0, 0, 255);
            stack.addLayer("Hidden");
            stack.layers[1].data.setPixel(0, 0, 0, 255, 0, 255);
            stack.layers[1].visible = false;

            const flat = stack.flatten();
            // Only background should be visible (red)
            expect(flat.getPixel(0, 0).r).toBe(255);
            expect(flat.getPixel(0, 0).g).toBe(0);
        });
    });

    describe("flattenToLayer", () => {
        it("collapses all layers into one", () => {
            const stack = new LayerStack(2, 2);
            stack.addLayer("A");
            stack.addLayer("B");
            expect(stack.layers.length).toBe(3);

            stack.flattenToLayer();
            expect(stack.layers.length).toBe(1);
            expect(stack.layers[0].name).toBe("Background");
            expect(stack.activeIndex).toBe(0);
        });
    });

    describe("inBounds", () => {
        it("checks bounds correctly", () => {
            const stack = new LayerStack(4, 4);
            expect(stack.inBounds(0, 0)).toBe(true);
            expect(stack.inBounds(3, 3)).toBe(true);
            expect(stack.inBounds(4, 0)).toBe(false);
            expect(stack.inBounds(-1, 0)).toBe(false);
        });
    });

    describe("clone", () => {
        it("creates independent deep copy", () => {
            const stack = new LayerStack(2, 2);
            stack.layers[0].data.setPixel(0, 0, 100, 0, 0, 255);
            stack.addLayer("A");
            stack.activeIndex = 1;

            const copy = stack.clone();
            expect(copy.layers.length).toBe(2);
            expect(copy.activeIndex).toBe(1);
            expect(copy.layers[0].data.getPixel(0, 0).r).toBe(100);

            copy.layers[0].data.setPixel(0, 0, 0, 0, 0, 0);
            expect(stack.layers[0].data.getPixel(0, 0).r).toBe(100);
        });
    });

    describe("resize", () => {
        it("resizes all layers", () => {
            const stack = new LayerStack(2, 2);
            stack.layers[0].data.setPixel(0, 0, 255, 0, 0, 255);
            stack.addLayer("A");
            stack.layers[1].data.setPixel(1, 1, 0, 255, 0, 255);

            const resized = stack.resize(4, 4, 1, 1);
            expect(resized.width).toBe(4);
            expect(resized.height).toBe(4);
            expect(resized.layers.length).toBe(2);
            expect(resized.layers[0].data.getPixel(1, 1)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
            expect(resized.layers[1].data.getPixel(2, 2)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
        });
    });

    describe("fromSpriteState", () => {
        it("wraps a SpriteState in a single-layer stack", () => {
            const s = new SpriteState(4, 4);
            s.setPixel(0, 0, 128, 64, 32, 255);

            const stack = LayerStack.fromSpriteState(s);
            expect(stack.layers.length).toBe(1);
            expect(stack.width).toBe(4);
            expect(stack.height).toBe(4);
            expect(stack.layers[0].data.getPixel(0, 0)).toEqual({ r: 128, g: 64, b: 32, a: 255 });

            // Should be a clone, not same reference
            s.setPixel(0, 0, 0, 0, 0, 0);
            expect(stack.layers[0].data.getPixel(0, 0)).toEqual({ r: 128, g: 64, b: 32, a: 255 });
        });
    });

    describe("reorderLayer", () => {
        it("moves a layer from one position to another", () => {
            const stack = new LayerStack(2, 2);
            stack.addLayer("A"); // idx 1
            stack.addLayer("B"); // idx 2

            // Move Background (0) to position 2
            const result = stack.reorderLayer(0, 2);
            expect(result).toBe(true);
            expect(stack.layers[0].name).toBe("A");
            expect(stack.layers[1].name).toBe("B");
            expect(stack.layers[2].name).toBe("Background");
        });

        it("returns false for same index", () => {
            const stack = new LayerStack(2, 2);
            expect(stack.reorderLayer(0, 0)).toBe(false);
        });

        it("returns false for out-of-bounds indices", () => {
            const stack = new LayerStack(2, 2);
            expect(stack.reorderLayer(-1, 0)).toBe(false);
            expect(stack.reorderLayer(0, 5)).toBe(false);
        });

        it("updates activeIndex to follow the moved layer", () => {
            const stack = new LayerStack(2, 2);
            stack.addLayer("A");
            stack.addLayer("B");
            stack.activeIndex = 0; // Background is active
            stack.reorderLayer(0, 2);
            expect(stack.activeIndex).toBe(2);
        });
    });

    describe("mergeLayers", () => {
        it("merges multiple selected layers into the lowest", () => {
            const stack = new LayerStack(2, 2);
            stack.layers[0].data.setPixel(0, 0, 255, 0, 0, 255);
            stack.addLayer("Middle");
            stack.layers[1].data.setPixel(1, 0, 0, 255, 0, 255);
            stack.addLayer("Top");
            stack.layers[2].data.setPixel(0, 1, 0, 0, 255, 255);

            // Merge all 3 layers
            const result = stack.mergeLayers([0, 1, 2]);
            expect(result).toBe(true);
            expect(stack.layers.length).toBe(1);
            // All pixels should be present on the merged layer
            expect(stack.layers[0].data.getPixel(0, 0).r).toBe(255);
            expect(stack.layers[0].data.getPixel(1, 0).g).toBe(255);
            expect(stack.layers[0].data.getPixel(0, 1).b).toBe(255);
        });

        it("returns false for less than 2 indices", () => {
            const stack = new LayerStack(2, 2);
            expect(stack.mergeLayers([0])).toBe(false);
            expect(stack.mergeLayers([])).toBe(false);
        });

        it("merges only the specified layers", () => {
            const stack = new LayerStack(2, 2);
            stack.addLayer("A");
            stack.addLayer("B");
            expect(stack.layers.length).toBe(3);

            // Merge only layers 1 and 2 (A and B)
            const result = stack.mergeLayers([1, 2]);
            expect(result).toBe(true);
            expect(stack.layers.length).toBe(2); // Background + merged
            expect(stack.layers[0].name).toBe("Background");
        });
    });
});
