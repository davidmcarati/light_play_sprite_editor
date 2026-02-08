import { createSpriteEditor } from "./sprite_editor/sprite_editor.js";

const container = document.getElementById("editor-root");

const tabFileHandles = new Map();

const editor = createSpriteEditor(container, {
    onSave:  (blob, fileName, tabId) => saveLsprite(blob, fileName, tabId),
    onSaveAs: (blob, fileName, tabId) => saveLspriteAs(blob, fileName, tabId),
    onExport: (blob, fileName, ext) => exportImage(blob, fileName, ext),
    onDirtyChange: (dirty) => {
        document.title = dirty
            ? "\u25CF Light Play \u2014 Sprite Editor"
            : "Light Play \u2014 Sprite Editor";
    },
    onTabClose: (tabId) => { tabFileHandles.delete(tabId); }
});

async function saveLsprite(blob, fileName, tabId) {
    const handle = tabFileHandles.get(tabId);
    if (handle) {
        try {
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return handle.name;
        } catch (err) {
            console.error("Auto-save failed:", err);
            return null;
        }
    }

    if (window.showSaveFilePicker) {
        return await saveViaFilePicker(blob, fileName, tabId);
    }

    // No file picker available. If already named, just re-download silently.
    if (fileName && fileName !== "Untitled") {
        const baseName = stripExtension(fileName) + ".lsprite";
        downloadBlob(blob, baseName);
        return baseName;
    }

    // First save: ask for a name
    return promptAndDownload(blob, fileName);
}

async function saveLspriteAs(blob, fileName, tabId) {
    if (window.showSaveFilePicker) {
        return await saveViaFilePicker(blob, fileName, tabId);
    }

    // No file picker: always prompt for name on Save As
    return promptAndDownload(blob, fileName);
}

async function saveViaFilePicker(blob, fileName, tabId) {
    try {
        const baseName = stripExtension(fileName || "Untitled") + ".lsprite";
        const handle = await window.showSaveFilePicker({
            suggestedName: baseName,
            types: [{
                description: "Light Play Sprite",
                accept: { "application/json": [".lsprite"] }
            }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        tabFileHandles.set(tabId, handle);
        return handle.name;
    } catch (err) {
        if (err.name !== "AbortError") console.error("Save failed:", err);
        return null;
    }
}

function promptAndDownload(blob, fileName) {
    const defaultName = stripExtension(fileName || "Untitled");
    const name = prompt("Enter file name:", defaultName);
    if (!name) return null;
    const baseName = name.endsWith(".lsprite") ? name : name + ".lsprite";
    downloadBlob(blob, baseName);
    return baseName;
}

const FORMAT_TYPES = {
    ".png":  { description: "PNG Image",  accept: { "image/png":  [".png"] } },
    ".jpg":  { description: "JPEG Image", accept: { "image/jpeg": [".jpg", ".jpeg"] } },
    ".webp": { description: "WebP Image", accept: { "image/webp": [".webp"] } }
};

async function exportImage(blob, fileName, ext = ".png") {
    const baseName = stripExtension(fileName || "Untitled") + ext;

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: baseName,
                types: [FORMAT_TYPES[ext] || FORMAT_TYPES[".png"]]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
        } catch (err) {
            if (err.name !== "AbortError") console.error("Export failed:", err);
        }
    } else {
        downloadBlob(blob, baseName);
    }
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function stripExtension(name) {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.substring(0, dot) : name;
}

setupDragAndDrop(container);

function setupDragAndDrop(target) {
    target.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    });

    target.addEventListener("drop", async (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;

        if (file.name.endsWith(".lsprite")) {
            await editor.loadFromLsprite(file);
        } else if (file.type.startsWith("image/")) {
            await editor.loadFromBlob(file, file.name);
        }
    });
}
