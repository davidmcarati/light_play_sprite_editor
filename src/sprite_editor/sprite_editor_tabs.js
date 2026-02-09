import { LayerStack } from "./layer_data.js";
import { SpriteHistory } from "./sprite_data.js";

const EditorTabMethods = {
    _renderTabBar() {
        this._tabBarEl.innerHTML = "";
        for (const tab of this._tabs) {
            this._tabBarEl.appendChild(this._createTabElement(tab));
        }
        const addBtn = document.createElement("button");
        addBtn.className = "se-tab-add";
        addBtn.textContent = "+";
        addBtn.title = "New tab";
        addBtn.addEventListener("click", () => this._createNewTab());
        this._tabBarEl.appendChild(addBtn);
    },

    _createTabElement(tab) {
        const tabEl = document.createElement("div");
        tabEl.className = "se-tab";
        if (tab.id === this._activeTabId) tabEl.classList.add("active");
        tabEl.draggable = true;
        const tabId = tab.id;

        this._attachTabDragEvents(tabEl, tabId);

        const nameSpan = document.createElement("span");
        nameSpan.className = "se-tab-name";
        const rawName = tab.id === this._activeTabId ? this._fileName : tab.fileName;
        const isDirty = tab.id === this._activeTabId ? this._dirty : tab.dirty;
        let displayName = rawName || "Untitled";
        const dot = displayName.lastIndexOf(".");
        if (dot > 0) displayName = displayName.substring(0, dot);
        nameSpan.textContent = (isDirty ? "\u25CF " : "") + displayName;
        nameSpan.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            this._startTabRename(nameSpan, tabId);
        });
        tabEl.appendChild(nameSpan);

        const closeBtn = document.createElement("button");
        closeBtn.className = "se-tab-close";
        closeBtn.textContent = "\u00D7";
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._closeTab(tabId);
        });
        tabEl.appendChild(closeBtn);

        tabEl.addEventListener("click", () => this._switchToTab(tabId));
        return tabEl;
    },

    _attachTabDragEvents(tabEl, tabId) {
        tabEl.addEventListener("dragstart", (e) => {
            this._dragTabId = tabId;
            tabEl.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(tabId));
        });
        tabEl.addEventListener("dragend", () => {
            tabEl.classList.remove("dragging");
            this._dragTabId = null;
            this._tabBarEl.querySelectorAll(".se-tab").forEach(t => t.classList.remove("drag-over-tab"));
        });
        tabEl.addEventListener("dragover", (e) => {
            if (this._dragTabId == null) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            this._tabBarEl.querySelectorAll(".se-tab").forEach(t => t.classList.remove("drag-over-tab"));
            tabEl.classList.add("drag-over-tab");
        });
        tabEl.addEventListener("dragleave", () => tabEl.classList.remove("drag-over-tab"));
        tabEl.addEventListener("drop", (e) => {
            e.preventDefault();
            tabEl.classList.remove("drag-over-tab");
            if (this._dragTabId != null && this._dragTabId !== tabId) {
                const fromIdx = this._tabs.findIndex(t => t.id === this._dragTabId);
                const toIdx = this._tabs.findIndex(t => t.id === tabId);
                if (fromIdx !== -1 && toIdx !== -1) {
                    const [moved] = this._tabs.splice(fromIdx, 1);
                    this._tabs.splice(toIdx, 0, moved);
                    this._renderTabBar();
                }
            }
            this._dragTabId = null;
        });
    },

    _startTabRename(nameSpan, tabId) {
        const tab = this._tabs.find(t => t.id === tabId);
        if (!tab) return;

        const current = tabId === this._activeTabId ? this._fileName : tab.fileName;
        let displayName = current || "Untitled";
        const dot = displayName.lastIndexOf(".");
        if (dot > 0) displayName = displayName.substring(0, dot);

        const input = document.createElement("input");
        input.type = "text";
        input.className = "se-tab-rename-input";
        input.value = displayName;

        const commit = () => {
            const name = input.value.trim();
            if (name) {
                if (tabId === this._activeTabId) {
                    this._fileName = name;
                    this._toolbar.setFileName(name);
                } else {
                    tab.fileName = name;
                }
            }
            this._renderTabBar();
        };

        input.addEventListener("blur", commit);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); input.blur(); }
            if (e.key === "Escape") { input.removeEventListener("blur", commit); this._renderTabBar(); }
            e.stopPropagation();
        });
        input.addEventListener("click", (e) => e.stopPropagation());
        input.addEventListener("dblclick", (e) => e.stopPropagation());

        nameSpan.textContent = "";
        nameSpan.appendChild(input);
        input.focus();
        input.select();
    },

    _saveCurrentTabState() {
        const tab = this._tabs.find(t => t.id === this._activeTabId);
        if (!tab) return;
        tab.layerStack = this._layerStack;
        tab.history = this._history;
        tab.selection = this.selection;
        tab.floatingPaste = this.floatingPaste;
        tab.fileName = this._fileName;
        tab.dirty = this._dirty;
        tab.hasImage = this._hasImage;
        tab.zoom = this._spriteCanvas.getZoom();
        tab.panX = this._spriteCanvas._panX;
        tab.panY = this._spriteCanvas._panY;
    },

    _loadTabState(tab) {
        this._layerStack = tab.layerStack;
        this._history = tab.history;
        this.selection = tab.selection;
        this.floatingPaste = tab.floatingPaste;
        this._fileName = tab.fileName;
        this._dirty = tab.dirty;
        this._hasImage = tab.hasImage;

        this._spriteCanvas.setSelection(this.selection);
        this._spriteCanvas.setFloatingPaste(this.floatingPaste);
        this._spriteCanvas.setLayerStack(this._layerStack, true);
        this._spriteCanvas._panX = tab.panX;
        this._spriteCanvas._panY = tab.panY;
        this._spriteCanvas.setZoom(tab.zoom);

        this._toolbar.setCanvasSize(this._layerStack.width, this._layerStack.height);
        this._toolbar.setFileName(this._fileName);
        this._updateLayersPanel();

        if (!this._hasImage) this._showWelcome();
    },

    _switchToTab(tabId) {
        if (tabId === this._activeTabId) return;

        this._hideWelcome();
        this._saveCurrentTabState();
        this._activeTabId = tabId;

        const tab = this._tabs.find(t => t.id === tabId);
        if (!tab) return;
        this._loadTabState(tab);

        this._renderTabBar();
        if (this._onDirtyChange) this._onDirtyChange(this._dirty);
        if (this._onTabChange) this._onTabChange(tabId);
    },

    _createNewTab() {
        this._saveCurrentTabState();
        this._hideWelcome();

        const newStack = new LayerStack(32, 32);
        const tab = {
            id: this._nextTabId++,
            layerStack: newStack,
            history: new SpriteHistory(),
            selection: null,
            floatingPaste: null,
            fileName: "",
            dirty: false,
            hasImage: false,
            zoom: 8,
            panX: 0, panY: 0
        };
        this._tabs.push(tab);
        this._activeTabId = tab.id;

        this._layerStack = tab.layerStack;
        this._history = tab.history;
        this.selection = null;
        this.floatingPaste = null;
        this._fileName = "";
        this._dirty = false;
        this._hasImage = false;

        this._spriteCanvas.setSelection(null);
        this._spriteCanvas.setFloatingPaste(null);
        this._spriteCanvas.setLayerStack(this._layerStack, true);
        this._spriteCanvas._panX = 0;
        this._spriteCanvas._panY = 0;
        this._spriteCanvas.setZoom(8);

        this._toolbar.setCanvasSize(32, 32);
        this._toolbar.setFileName("");
        this._updateLayersPanel();

        this._showWelcome();
        this._renderTabBar();

        if (this._onDirtyChange) this._onDirtyChange(false);
        if (this._onTabChange) this._onTabChange(tab.id);
    },

    _closeTab(tabId) {
        const idx = this._tabs.findIndex(t => t.id === tabId);
        if (idx === -1) return;

        if (this._onTabClose) this._onTabClose(tabId);
        this._tabs.splice(idx, 1);

        if (this._tabs.length === 0) {
            this._createNewTab();
            return;
        }

        if (tabId === this._activeTabId) {
            this._hideWelcome();

            const newIdx = Math.min(idx, this._tabs.length - 1);
            const newTab = this._tabs[newIdx];
            this._activeTabId = newTab.id;
            this._loadTabState(newTab);

            if (this._onDirtyChange) this._onDirtyChange(this._dirty);
            if (this._onTabChange) this._onTabChange(this._activeTabId);
        }

        this._renderTabBar();
    },

    _openInTab(layerStack, fileName) {
        if (this._hasImage) {
            this._saveCurrentTabState();
            const tab = {
                id: this._nextTabId++,
                layerStack,
                history: new SpriteHistory(),
                selection: null,
                floatingPaste: null,
                fileName,
                dirty: false,
                hasImage: true,
                zoom: 8,
                panX: 0, panY: 0
            };
            this._tabs.push(tab);
            this._activeTabId = tab.id;
        }

        this._hideWelcome();
        this._hasImage = true;
        this._layerStack = layerStack;
        this._history = new SpriteHistory();
        this.selection = null;
        this.floatingPaste = null;
        this._fileName = fileName;
        this._dirty = false;
        this._spriteCanvas.setZoom(8);

        this._toolbar.setCanvasSize(this._layerStack.width, this._layerStack.height);
        this._toolbar.setFileName(this._fileName);
        this._spriteCanvas.setSelection(null);
        this._spriteCanvas.setFloatingPaste(null);
        this._spriteCanvas.setLayerStack(this._layerStack, true);

        const cw = this._container.clientWidth || 800;
        const ch = this._container.clientHeight || 600;
        if (this._layerStack.width * 8 > cw || this._layerStack.height * 8 > ch) {
            requestAnimationFrame(() => this._spriteCanvas.zoomToFit());
        }

        this._updateLayersPanel();
        this._renderTabBar();

        if (this._onDirtyChange) this._onDirtyChange(false);
        if (this._onTabChange) this._onTabChange(this._activeTabId);
    },

    getActiveTabId() {
        return this._activeTabId;
    }
};

export { EditorTabMethods };
