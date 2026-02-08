import { SpriteState } from "./sprite_data.js";
import { Layer, LayerStack } from "./layer_data.js";

const LSPRITE_VERSION = 1;

function serialize(layerStack) {
    const layers = layerStack.layers.map(layer => ({
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        locked: layer.locked,
        pixels: uint8ToBase64(layer.data.pixels)
    }));

    const doc = {
        version: LSPRITE_VERSION,
        width: layerStack.width,
        height: layerStack.height,
        colorDepth: layerStack.colorDepth || 32,
        activeLayerIndex: layerStack.activeIndex,
        layers
    };

    return JSON.stringify(doc);
}

function deserialize(jsonString) {
    const doc = JSON.parse(jsonString);

    if (!doc.version || !doc.width || !doc.height || !Array.isArray(doc.layers)) {
        throw new Error("Invalid .lsprite file format.");
    }

    const stack = new LayerStack(doc.width, doc.height, doc.colorDepth || 32);
    stack.layers = doc.layers.map(layerData => {
        const spriteState = new SpriteState(doc.width, doc.height);
        const decoded = base64ToUint8(layerData.pixels);
        spriteState.pixels.set(decoded);

        const layer = new Layer(layerData.name || "Layer", spriteState);
        layer.visible = layerData.visible !== false;
        layer.opacity = typeof layerData.opacity === "number" ? layerData.opacity : 1.0;
        layer.locked = layerData.locked === true;
        return layer;
    });

    stack.activeIndex = Math.min(
        doc.activeLayerIndex || 0,
        stack.layers.length - 1
    );

    return stack;
}

function serializeToBlob(layerStack) {
    const json = serialize(layerStack);
    return new Blob([json], { type: "application/json" });
}

async function deserializeFromBlob(blob) {
    const text = await blob.text();
    return deserialize(text);
}

function uint8ToBase64(uint8Array) {
    const chunkSize = 8192;
    let binary = "";
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

function base64ToUint8(base64) {
    const binary = atob(base64);
    const bytes = new Uint8ClampedArray(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export {
    serialize,
    deserialize,
    serializeToBlob,
    deserializeFromBlob,
    LSPRITE_VERSION
};
