import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createSpriteEditor } from "../src/sprite_editor/sprite_editor.js";

describe("SpriteEditor integration (jsdom)", () => {
    let container;
    let editor;

    beforeEach(() => {
        container = document.createElement("div");
        container.id = "test-editor";
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (editor && editor.destroy) editor.destroy();
        container.remove();
    });

    it("creates the editor and renders DOM elements", () => {
        editor = createSpriteEditor(container);

        expect(container.querySelector(".se-container")).not.toBeNull();
        expect(container.querySelector(".se-toolbar")).not.toBeNull();
        expect(container.querySelector(".se-canvas-area")).not.toBeNull();
        expect(container.querySelector(".se-drawing-canvas")).not.toBeNull();
        expect(container.querySelector(".se-color-picker")).not.toBeNull();
        expect(container.querySelector(".se-layers-panel")).not.toBeNull();
        expect(container.querySelector(".se-status")).not.toBeNull();
    });

    it("creates with default 32x32 canvas", () => {
        editor = createSpriteEditor(container);
        const sizeLabel = container.querySelector(".se-toolbar-label");
        expect(sizeLabel.textContent).toContain("32");
    });

    it("toolbar has tool buttons", () => {
        editor = createSpriteEditor(container);
        expect(container.querySelectorAll(".se-tool-btn").length).toBeGreaterThanOrEqual(9);
    });

    it("toolbar has file action buttons", () => {
        editor = createSpriteEditor(container);
        const texts = Array.from(container.querySelectorAll(".se-toolbar-btn")).map(b => b.textContent);
        expect(texts).toContain("New");
        expect(texts).toContain("Open");
        expect(texts).toContain("Save");
        expect(texts).toContain("Save As");
        expect(texts).toContain("Export");
        expect(texts).toContain("Rulers");
        expect(texts).toContain("About");
    });

    it("layers panel shows Background layer", () => {
        editor = createSpriteEditor(container);
        const names = container.querySelectorAll(".se-layer-name");
        expect(names.length).toBe(1);
        expect(names[0].textContent).toBe("Background");
    });

    it("layers panel has action buttons", () => {
        editor = createSpriteEditor(container);
        expect(container.querySelectorAll(".se-layers-action-btn").length).toBeGreaterThanOrEqual(4);
    });

    it("getFileName returns the current file name", () => {
        editor = createSpriteEditor(container);
        expect(editor.getFileName()).toBe("");
        editor.setFileName("test.lsprite");
        expect(editor.getFileName()).toBe("test.lsprite");
    });

    it("calls onDirtyChange callback when marking dirty", () => {
        const cb = vi.fn();
        editor = createSpriteEditor(container, { onDirtyChange: cb });
        editor.markDirty();
        expect(cb).toHaveBeenCalledWith(true);
    });

    it("createNew resets the editor with new dimensions", () => {
        editor = createSpriteEditor(container);
        editor.createNew(16, 16, 32);
        const sizeLabel = container.querySelector(".se-toolbar-label");
        expect(sizeLabel.textContent).toContain("16");
    });

    it("undo/redo with no history does nothing", () => {
        editor = createSpriteEditor(container);
        editor.undo();
        editor.redo();
    });

    it("swapColors changes foreground and background", () => {
        editor = createSpriteEditor(container);
        const fgBefore = editor.foregroundColor.clone();
        const bgBefore = editor.backgroundColor.clone();

        editor.swapColors();

        expect(editor.foregroundColor.r).toBe(bgBefore.r);
        expect(editor.foregroundColor.g).toBe(bgBefore.g);
        expect(editor.foregroundColor.b).toBe(bgBefore.b);
        expect(editor.backgroundColor.r).toBe(fgBefore.r);
        expect(editor.backgroundColor.g).toBe(fgBefore.g);
        expect(editor.backgroundColor.b).toBe(fgBefore.b);
    });

    it("selectAll creates a full selection", () => {
        editor = createSpriteEditor(container);
        editor.selectAll();
        expect(editor.selection).not.toBeNull();
        expect(editor.selection.x).toBe(0);
        expect(editor.selection.y).toBe(0);
        expect(editor.selection.width).toBe(32);
        expect(editor.selection.height).toBe(32);
    });

    it("deselect clears selection", () => {
        editor = createSpriteEditor(container);
        editor.selectAll();
        expect(editor.selection).not.toBeNull();
        editor.deselect();
        expect(editor.selection).toBeNull();
    });

    it("save calls onSave callback with blob, fileName, and tabId", async () => {
        const saveCb = vi.fn().mockResolvedValue("saved.lsprite");
        editor = createSpriteEditor(container, { onSave: saveCb });
        editor.setFileName("test.lsprite");
        await editor._handleAction("save");

        expect(saveCb).toHaveBeenCalledTimes(1);
        const [blob, fileName, tabId] = saveCb.mock.calls[0];
        expect(blob).toBeInstanceOf(Blob);
        expect(fileName).toBe("test.lsprite");
        expect(tabId).toBe(editor.getActiveTabId());
    });

    it("save updates fileName when callback returns a new name", async () => {
        const saveCb = vi.fn().mockResolvedValue("renamed.lsprite");
        editor = createSpriteEditor(container, { onSave: saveCb });
        editor.setFileName("original.lsprite");
        await editor._handleAction("save");
        expect(editor.getFileName()).toBe("renamed.lsprite");
    });

    it("save updates tab name in tab bar after rename", async () => {
        const saveCb = vi.fn().mockResolvedValue("project_x.lsprite");
        editor = createSpriteEditor(container, { onSave: saveCb });
        editor.createNew(8, 8);

        expect(container.querySelector(".se-tab-name").textContent).toContain("Untitled");

        await editor._handleAction("save");
        expect(container.querySelector(".se-tab-name").textContent).toContain("project_x");
        expect(container.querySelector(".se-tab-name").textContent).not.toContain("Untitled");
    });

    it("second save uses updated fileName, not Untitled", async () => {
        const saveCb = vi.fn().mockResolvedValue("myfile.lsprite");
        editor = createSpriteEditor(container, { onSave: saveCb });
        editor.createNew(8, 8);

        await editor._handleAction("save");
        expect(editor.getFileName()).toBe("myfile.lsprite");
        expect(saveCb.mock.calls[0][1]).toBe("Untitled");

        editor.markDirty();
        await editor._handleAction("save");
        expect(saveCb.mock.calls[1][1]).toBe("myfile.lsprite");
    });

    it("second save passes same tabId", async () => {
        const saveCb = vi.fn().mockResolvedValue("myfile.lsprite");
        editor = createSpriteEditor(container, { onSave: saveCb });
        editor.createNew(8, 8);

        await editor._handleAction("save");
        const firstTabId = saveCb.mock.calls[0][2];

        editor.markDirty();
        await editor._handleAction("save");
        expect(saveCb.mock.calls[1][2]).toBe(firstTabId);
    });

    it("saveAs calls onSaveAs callback with tabId", async () => {
        const saveAsCb = vi.fn().mockResolvedValue("new_file.lsprite");
        editor = createSpriteEditor(container, { onSaveAs: saveAsCb });
        editor.setFileName("old.lsprite");
        await editor._handleAction("saveAs");

        expect(saveAsCb).toHaveBeenCalledTimes(1);
        const [blob, fileName, tabId] = saveAsCb.mock.calls[0];
        expect(blob).toBeInstanceOf(Blob);
        expect(fileName).toBe("old.lsprite");
        expect(tabId).toBe(editor.getActiveTabId());
        expect(editor.getFileName()).toBe("new_file.lsprite");
    });

    it("saveAs does not update fileName when cancelled", async () => {
        const saveAsCb = vi.fn().mockResolvedValue(null);
        editor = createSpriteEditor(container, { onSaveAs: saveAsCb });
        editor.setFileName("keep_this.lsprite");
        await editor._handleAction("saveAs");
        expect(editor.getFileName()).toBe("keep_this.lsprite");
    });

    it("save clears dirty flag after successful save", async () => {
        const dirtyCb = vi.fn();
        const saveCb = vi.fn().mockResolvedValue("file.lsprite");
        editor = createSpriteEditor(container, { onSave: saveCb, onDirtyChange: dirtyCb });

        editor.markDirty();
        expect(dirtyCb).toHaveBeenCalledWith(true);

        await editor._handleAction("save");
        expect(dirtyCb).toHaveBeenCalledWith(false);
    });

    it("cancelled save does not clear dirty flag", async () => {
        const dirtyCb = vi.fn();
        const saveCb = vi.fn().mockResolvedValue(null);
        editor = createSpriteEditor(container, { onSave: saveCb, onDirtyChange: dirtyCb });

        editor.markDirty();
        expect(editor.isDirty()).toBe(true);
        dirtyCb.mockClear();

        await editor._handleAction("save");
        expect(editor.isDirty()).toBe(true);
        expect(dirtyCb).not.toHaveBeenCalledWith(false);
    });

    it("full save flow: create, first save names tab, second save reuses name", async () => {
        let savedTabId = null;
        const saveCb = vi.fn(async (blob, fileName, tabId) => {
            savedTabId = tabId;
            if (fileName === "Untitled") return "ashot.lsprite";
            return fileName;
        });
        editor = createSpriteEditor(container, { onSave: saveCb });
        editor.createNew(8, 8);

        // First save: fileName is empty → "Untitled" is passed
        await editor._handleAction("save");
        expect(saveCb).toHaveBeenCalledTimes(1);
        expect(saveCb.mock.calls[0][1]).toBe("Untitled");
        expect(editor.getFileName()).toBe("ashot.lsprite");
        expect(container.querySelector(".se-tab-name").textContent).toContain("ashot");
        expect(savedTabId).toBe(editor.getActiveTabId());

        // Second save: should pass updated name, not "Untitled"
        editor.markDirty();
        await editor._handleAction("save");
        expect(saveCb).toHaveBeenCalledTimes(2);
        expect(saveCb.mock.calls[1][1]).toBe("ashot.lsprite");
        expect(saveCb.mock.calls[1][2]).toBe(savedTabId);
    });

    it("save with multiple tabs keeps correct tabId per tab", async () => {
        const saveCb = vi.fn().mockResolvedValue("file.lsprite");
        editor = createSpriteEditor(container, { onSave: saveCb });

        editor.createNew(8, 8);
        const firstTabId = editor.getActiveTabId();

        editor.createNew(16, 16);
        const secondTabId = editor.getActiveTabId();
        expect(secondTabId).not.toBe(firstTabId);

        await editor._handleAction("save");
        expect(saveCb.mock.calls[0][2]).toBe(secondTabId);

        // Switch to first tab
        container.querySelectorAll(".se-tab")[0].click();
        expect(editor.getActiveTabId()).toBe(firstTabId);

        await editor._handleAction("save");
        expect(saveCb.mock.calls[1][2]).toBe(firstTabId);
    });

    it("main.js-pattern: first save names tab via file handle, second auto-saves", async () => {
        // Exactly replicate main.js wiring: tabFileHandles, saveLsprite, saveLspriteAs
        const tabFileHandles = new Map();

        async function saveLsprite(blob, fileName, tabId) {
            const handle = tabFileHandles.get(tabId);
            if (handle) {
                // Simulate auto-save to existing handle
                return handle.name;
            }
            return await saveLspriteAs(blob, fileName, tabId);
        }

        async function saveLspriteAs(blob, fileName, tabId) {
            // Simulate showSaveFilePicker returning a handle named "ashot.lsprite"
            const mockHandle = { name: "ashot.lsprite" };
            tabFileHandles.set(tabId, mockHandle);
            return mockHandle.name;
        }

        editor = createSpriteEditor(container, {
            onSave: (blob, fileName, tabId) => saveLsprite(blob, fileName, tabId),
            onSaveAs: (blob, fileName, tabId) => saveLspriteAs(blob, fileName, tabId),
        });
        editor.createNew(8, 8);

        // Verify initial state
        expect(editor.getFileName()).toBe("");
        expect(container.querySelector(".se-tab-name").textContent).toContain("Untitled");

        // First Ctrl+S: no handle exists → saveLspriteAs → returns "ashot.lsprite"
        await editor._handleAction("save");

        expect(editor.getFileName()).toBe("ashot.lsprite");
        expect(container.querySelector(".se-tab-name").textContent).toContain("ashot");
        expect(container.querySelector(".se-tab-name").textContent).not.toContain("Untitled");

        // Second Ctrl+S: handle exists → auto-save → returns "ashot.lsprite"
        editor.markDirty();
        await editor._handleAction("save");

        expect(editor.getFileName()).toBe("ashot.lsprite");
        expect(editor.isDirty()).toBe(false);
    });

    it("main.js-pattern: download fallback still returns baseName", async () => {
        // Simulate environment where showSaveFilePicker is NOT available
        async function saveLsprite(blob, fileName, tabId) {
            // No handle, no file picker → fallback download
            const dot = fileName.lastIndexOf(".");
            const base = dot > 0 ? fileName.substring(0, dot) : fileName;
            return base + ".lsprite";
        }

        editor = createSpriteEditor(container, {
            onSave: (blob, fileName, tabId) => saveLsprite(blob, fileName, tabId),
        });
        editor.createNew(8, 8);

        // First save passes "Untitled" → returns "Untitled.lsprite"
        await editor._handleAction("save");
        expect(editor.getFileName()).toBe("Untitled.lsprite");

        // Second save passes "Untitled.lsprite" → returns "Untitled.lsprite" (stripping & re-adding ext)
        editor.markDirty();
        await editor._handleAction("save");
        expect(editor.getFileName()).toBe("Untitled.lsprite");
    });

    it("main.js-pattern: multi-tab save with independent file handles", async () => {
        const tabFileHandles = new Map();

        async function saveLsprite(blob, fileName, tabId) {
            const handle = tabFileHandles.get(tabId);
            if (handle) return handle.name;
            return await saveLspriteAs(blob, fileName, tabId);
        }

        async function saveLspriteAs(blob, fileName, tabId) {
            const dot = fileName.lastIndexOf(".");
            const base = dot > 0 ? fileName.substring(0, dot) : fileName;
            const savedName = (base || "Untitled") + ".lsprite";
            tabFileHandles.set(tabId, { name: savedName });
            return savedName;
        }

        editor = createSpriteEditor(container, {
            onSave: (blob, fn, tid) => saveLsprite(blob, fn, tid),
            onSaveAs: (blob, fn, tid) => saveLspriteAs(blob, fn, tid),
        });
        editor.createNew(8, 8);
        const tab1Id = editor.getActiveTabId();

        // Save tab 1 as "alpha.lsprite"
        editor.setFileName("alpha");
        await editor._handleAction("save");
        expect(editor.getFileName()).toBe("alpha.lsprite");
        expect(tabFileHandles.has(tab1Id)).toBe(true);

        // Create tab 2, save as "beta.lsprite"
        editor.createNew(16, 16);
        const tab2Id = editor.getActiveTabId();
        expect(tab2Id).not.toBe(tab1Id);

        editor.setFileName("beta");
        await editor._handleAction("save");
        expect(editor.getFileName()).toBe("beta.lsprite");
        expect(tabFileHandles.has(tab2Id)).toBe(true);

        // Switch back to tab 1: auto-save should use tab1's handle
        container.querySelectorAll(".se-tab")[0].click();
        expect(editor.getActiveTabId()).toBe(tab1Id);
        expect(editor.getFileName()).toBe("alpha.lsprite");

        editor.markDirty();
        await editor._handleAction("save");
        // Should auto-save (handle exists for tab1), name stays "alpha.lsprite"
        expect(editor.getFileName()).toBe("alpha.lsprite");
    });

    it("color picker is present with swatches and hex input", () => {
        editor = createSpriteEditor(container);
        expect(container.querySelector(".se-cp-fg")).not.toBeNull();
        expect(container.querySelector(".se-cp-bg")).not.toBeNull();
        expect(container.querySelector(".se-cp-hex")).not.toBeNull();
    });

    it("shows welcome overlay on initial load", () => {
        editor = createSpriteEditor(container);
        expect(container.querySelector(".se-welcome-overlay")).not.toBeNull();
        expect(container.querySelector(".se-welcome-title")).not.toBeNull();
        expect(container.querySelectorAll(".se-welcome-btn").length).toBe(2);
    });

    it("hides welcome overlay when createNew is called", () => {
        editor = createSpriteEditor(container);
        expect(container.querySelector(".se-welcome-overlay")).not.toBeNull();
        editor.createNew(16, 16);
        expect(container.querySelector(".se-welcome-overlay")).toBeNull();
    });

    it("layer rows support drag reorder via mousedown", () => {
        editor = createSpriteEditor(container);
        editor.createNew(8, 8);
        const rows = container.querySelectorAll(".se-layer-row");
        expect(rows.length).toBeGreaterThanOrEqual(1);
        rows.forEach(row => expect(row.dataset.idx).toBeDefined());
    });

    it("layer opacity slider is present", () => {
        editor = createSpriteEditor(container);
        editor.createNew(8, 8);
        const sliders = container.querySelectorAll(".se-layer-opacity-slider");
        expect(sliders.length).toBe(1);
        expect(sliders[0].type).toBe("range");
        expect(sliders[0].min).toBe("0");
        expect(sliders[0].max).toBe("100");
    });

    it("merge button is disabled with less than 2 selected layers", () => {
        editor = createSpriteEditor(container);
        editor.createNew(8, 8);
        const btns = container.querySelectorAll(".se-layers-action-btn");
        let mergeBtn = null;
        btns.forEach(btn => { if (btn.title && btn.title.includes("Merge")) mergeBtn = btn; });
        expect(mergeBtn).not.toBeNull();
        expect(mergeBtn.disabled).toBe(true);
    });

    it("brush size uses a slider control", () => {
        editor = createSpriteEditor(container);
        editor.createNew(8, 8);
        const slider = container.querySelector(".se-toolbar-opt-slider");
        expect(slider).not.toBeNull();
        expect(slider.type).toBe("range");
        expect(slider.min).toBe("1");
        expect(slider.max).toBe("32");
    });

    it("rulers toggle button toggles ruler visibility", () => {
        editor = createSpriteEditor(container);
        const btns = container.querySelectorAll(".se-toolbar-btn");
        let rulersBtn = null;
        btns.forEach(b => { if (b.textContent === "Rulers") rulersBtn = b; });
        expect(rulersBtn).not.toBeNull();

        expect(rulersBtn.classList.contains("active")).toBe(false);
        rulersBtn.click();
        expect(rulersBtn.classList.contains("active")).toBe(true);
        rulersBtn.click();
        expect(rulersBtn.classList.contains("active")).toBe(false);
    });

    it("tab bar is present on editor creation", () => {
        editor = createSpriteEditor(container);
        const tabBar = container.querySelector(".se-tab-bar");
        expect(tabBar).not.toBeNull();
        expect(tabBar.querySelectorAll(".se-tab").length).toBe(1);
        expect(tabBar.querySelector(".se-tab-add")).not.toBeNull();
    });

    it("initial tab shows 'Untitled' and is active", () => {
        editor = createSpriteEditor(container);
        const tab = container.querySelector(".se-tab");
        expect(tab.classList.contains("active")).toBe(true);
        expect(tab.querySelector(".se-tab-name").textContent).toContain("Untitled");
    });

    it("getActiveTabId returns the current tab id", () => {
        editor = createSpriteEditor(container);
        expect(editor.getActiveTabId()).toBe(1);
    });

    it("createNew in empty tab reuses it", () => {
        editor = createSpriteEditor(container);
        editor.createNew(16, 16);
        expect(container.querySelectorAll(".se-tab").length).toBe(1);
    });

    it("createNew in tab with image creates a new tab", () => {
        editor = createSpriteEditor(container);
        editor.createNew(16, 16);
        editor.createNew(32, 32);
        expect(container.querySelectorAll(".se-tab").length).toBe(2);
    });

    it("clicking + button creates a new empty tab", () => {
        editor = createSpriteEditor(container);
        editor.createNew(16, 16);
        container.querySelector(".se-tab-add").click();

        expect(container.querySelectorAll(".se-tab").length).toBe(2);
        expect(container.querySelector(".se-welcome-overlay")).not.toBeNull();
    });

    it("switching tabs restores state", () => {
        editor = createSpriteEditor(container);
        editor.createNew(16, 16);
        editor.setFileName("first.lsprite");
        editor.createNew(32, 32);
        editor.setFileName("second.lsprite");
        expect(editor.getFileName()).toBe("second.lsprite");

        container.querySelectorAll(".se-tab")[0].click();
        expect(editor.getFileName()).toBe("first.lsprite");
    });

    it("closing a tab removes it from the tab bar", () => {
        editor = createSpriteEditor(container);
        editor.createNew(16, 16);
        editor.createNew(32, 32);
        expect(container.querySelectorAll(".se-tab").length).toBe(2);

        container.querySelectorAll(".se-tab")[1].querySelector(".se-tab-close").click();
        expect(container.querySelectorAll(".se-tab").length).toBe(1);
    });

    it("closing the last tab creates a new empty one", () => {
        editor = createSpriteEditor(container);
        editor.createNew(16, 16);
        expect(container.querySelectorAll(".se-tab").length).toBe(1);

        container.querySelectorAll(".se-tab")[0].querySelector(".se-tab-close").click();
        expect(container.querySelectorAll(".se-tab").length).toBe(1);
        expect(container.querySelector(".se-welcome-overlay")).not.toBeNull();
    });

    it("tab shows dirty indicator", () => {
        editor = createSpriteEditor(container);
        editor.createNew(8, 8);

        expect(container.querySelector(".se-tab-name").textContent).not.toContain("●");
        editor.markDirty();
        expect(container.querySelector(".se-tab-name").textContent).toContain("●");
    });

    it("clipboard is shared across tabs (cross-tab paste)", () => {
        editor = createSpriteEditor(container);
        editor.createNew(4, 4);
        editor.sprite.setPixel(0, 0, 255, 0, 0, 255);
        editor.selectAll();
        editor.copySelection();

        editor.createNew(4, 4);
        editor.paste();
        expect(editor.floatingPaste).not.toBeNull();
    });

    it("onTabChange callback fires on tab switch", () => {
        const cb = vi.fn();
        editor = createSpriteEditor(container, { onTabChange: cb });
        editor.createNew(8, 8);
        editor.createNew(16, 16);
        expect(cb).toHaveBeenCalled();
    });

    it("onTabClose callback fires when tab is closed", () => {
        const cb = vi.fn();
        editor = createSpriteEditor(container, { onTabClose: cb });
        editor.createNew(8, 8);
        editor.createNew(16, 16);

        container.querySelectorAll(".se-tab")[1].querySelector(".se-tab-close").click();
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("canvas hides native cursor", () => {
        editor = createSpriteEditor(container);
        expect(container.querySelector(".se-drawing-canvas").style.cursor).toBe("none");
    });
});

describe("End-to-end save flow", () => {
    let container;
    let editor;

    beforeEach(() => {
        container = document.createElement("div");
        container.id = "test-editor";
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (editor && editor.destroy) editor.destroy();
        container.remove();
    });

    it("100x100 image: draw, save as ashot.lsprite, verify tab name + re-save", async () => {
        // --- Wire up exactly like main.js does ---
        const tabFileHandles = new Map();
        const savedBlobs = []; // capture what was written to "disk"

        async function saveLsprite(blob, fileName, tabId) {
            const handle = tabFileHandles.get(tabId);
            if (handle) {
                // Auto-save path: write to existing handle
                savedBlobs.push({ blob, name: handle.name, type: "auto-save" });
                return handle.name;
            }
            // No handle → fall through to saveAs
            return await saveLspriteAs(blob, fileName, tabId);
        }

        async function saveLspriteAs(blob, fileName, tabId) {
            // Simulate what showSaveFilePicker does: user picks "ashot.lsprite"
            const handle = { name: "ashot.lsprite" };
            tabFileHandles.set(tabId, handle);
            savedBlobs.push({ blob, name: handle.name, type: "save-as" });
            return handle.name;
        }

        editor = createSpriteEditor(container, {
            onSave: (blob, fn, tid) => saveLsprite(blob, fn, tid),
            onSaveAs: (blob, fn, tid) => saveLspriteAs(blob, fn, tid),
        });

        // Step 1: Create 100x100 image
        editor.createNew(100, 100, 32);
        expect(editor.getFileName()).toBe("");
        expect(container.querySelector(".se-tab-name").textContent).toContain("Untitled");

        // Step 2: Draw 50 random dots
        for (let i = 0; i < 50; i++) {
            const x = Math.floor(Math.random() * 100);
            const y = Math.floor(Math.random() * 100);
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            editor.sprite.setPixel(x, y, r, g, b, 255);
        }
        editor.markDirty();
        expect(editor.isDirty()).toBe(true);

        // Step 3: First Ctrl+S → should trigger saveLspriteAs (no handle yet)
        await editor._handleAction("save");

        expect(savedBlobs.length).toBe(1);
        expect(savedBlobs[0].type).toBe("save-as");
        expect(savedBlobs[0].name).toBe("ashot.lsprite");

        // Step 4: Verify tab name updated to "ashot"
        expect(editor.getFileName()).toBe("ashot.lsprite");
        const tabName = container.querySelector(".se-tab-name").textContent;
        expect(tabName).toContain("ashot");
        expect(tabName).not.toContain("Untitled");
        expect(editor.isDirty()).toBe(false);

        // Step 5: Draw more, then Ctrl+S again → should auto-save (handle exists)
        editor.sprite.setPixel(50, 50, 0, 255, 0, 255);
        editor.markDirty();
        expect(editor.isDirty()).toBe(true);

        await editor._handleAction("save");

        expect(savedBlobs.length).toBe(2);
        expect(savedBlobs[1].type).toBe("auto-save");  // NOT "save-as"!
        expect(savedBlobs[1].name).toBe("ashot.lsprite");
        expect(editor.getFileName()).toBe("ashot.lsprite");
        expect(editor.isDirty()).toBe(false);

        // Step 6: Verify the saved blob is valid lsprite data
        const text = await savedBlobs[1].blob.text();
        const doc = JSON.parse(text);
        expect(doc.width).toBe(100);
        expect(doc.height).toBe(100);
        expect(doc.layers.length).toBe(1);
        expect(doc.layers[0].name).toBe("Background");
    });

    it("download fallback: prompt-based save names tab correctly", async () => {
        // Simulate environment with NO showSaveFilePicker
        // In this scenario, saveLsprite falls through to download + prompt

        const downloads = [];
        let promptCallCount = 0;

        async function saveLsprite(blob, fileName, tabId) {
            // No file handle, no showSaveFilePicker → prompt fallback
            if (fileName && fileName !== "Untitled") {
                // Already named: re-download silently
                downloads.push({ blob, name: fileName, prompted: false });
                return fileName;
            }
            // First save: simulate prompt("Enter file name:") → user types "ashot"
            promptCallCount++;
            const userChoice = "ashot.lsprite";
            downloads.push({ blob, name: userChoice, prompted: true });
            return userChoice;
        }

        editor = createSpriteEditor(container, {
            onSave: (blob, fn, tid) => saveLsprite(blob, fn, tid),
        });
        editor.createNew(100, 100, 32);

        // Draw some pixels
        for (let i = 0; i < 10; i++) {
            editor.sprite.setPixel(i, i, 255, 0, 0, 255);
        }
        editor.markDirty();

        // First Ctrl+S: fileName is "Untitled" → prompt → user types "ashot"
        await editor._handleAction("save");

        expect(promptCallCount).toBe(1);
        expect(downloads.length).toBe(1);
        expect(downloads[0].prompted).toBe(true);
        expect(downloads[0].name).toBe("ashot.lsprite");
        expect(editor.getFileName()).toBe("ashot.lsprite");
        expect(container.querySelector(".se-tab-name").textContent).toContain("ashot");

        // Second Ctrl+S: fileName is "ashot.lsprite" → re-download silently, NO prompt
        editor.markDirty();
        await editor._handleAction("save");

        expect(promptCallCount).toBe(1);  // still 1, no new prompt!
        expect(downloads.length).toBe(2);
        expect(downloads[1].prompted).toBe(false);  // silent re-download
        expect(downloads[1].name).toBe("ashot.lsprite");
        expect(editor.getFileName()).toBe("ashot.lsprite");
    });

    it("third Ctrl+S still auto-saves without prompting", async () => {
        const tabFileHandles = new Map();
        let saveAsCount = 0;
        let autoSaveCount = 0;

        async function saveLsprite(blob, fileName, tabId) {
            const handle = tabFileHandles.get(tabId);
            if (handle) {
                autoSaveCount++;
                return handle.name;
            }
            saveAsCount++;
            const handle2 = { name: "mysprite.lsprite" };
            tabFileHandles.set(tabId, handle2);
            return handle2.name;
        }

        editor = createSpriteEditor(container, {
            onSave: (blob, fn, tid) => saveLsprite(blob, fn, tid),
        });
        editor.createNew(32, 32);

        // Save 1: creates handle
        await editor._handleAction("save");
        expect(saveAsCount).toBe(1);
        expect(autoSaveCount).toBe(0);
        expect(editor.getFileName()).toBe("mysprite.lsprite");

        // Save 2: auto-saves
        editor.markDirty();
        await editor._handleAction("save");
        expect(saveAsCount).toBe(1);
        expect(autoSaveCount).toBe(1);

        // Save 3: still auto-saves
        editor.markDirty();
        await editor._handleAction("save");
        expect(saveAsCount).toBe(1);
        expect(autoSaveCount).toBe(2);

        // Tab name is consistent
        expect(editor.getFileName()).toBe("mysprite.lsprite");
        expect(container.querySelector(".se-tab-name").textContent).toContain("mysprite");
    });
});
