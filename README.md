# Light Play — Sprite Editor

A browser-based pixel-art sprite editor built with vanilla JavaScript and HTML5 Canvas.

I've split this out from the larger game engine I'm working on and put it up publicly — feel free to use and enjoy if you find it useful!

**Upcoming:** I'm planning to add a pixel-art respective bone animation tool and a texture packer soon.

Made by **David Mkrtchian** — [www.davidmcarati.info](https://www.davidmcarati.info)

## Features

- **Pixel-perfect drawing** — Pencil, eraser, line, rectangle, ellipse tools with adjustable brush size
- **Bucket fill** with configurable color tolerance (scanline flood fill, handles huge canvases)
- **Eyedropper** tool for quick color sampling
- **Selection & Move** — Select regions, cut/copy/paste, floating paste with repositioning; hold Shift while moving to copy instead of cut
- **Layers** — Add, remove, reorder (drag & drop), duplicate, merge selected, flatten; per-layer visibility, opacity slider, and lock
- **Multi-tab editing** — Work on several images in parallel; drag to reorder tabs, double-click to rename
- **Cross-tab clipboard** — Copy from one tab, paste into another
- **Color picker** — HSV square + hue/alpha strips, hex input, palette with add/remove, recent colors
- **Undo / Redo** — Memory-budgeted history (512 MB cap) that adapts to image size instead of a fixed step count
- **Save / Save As** — Native `.lsprite` format preserving all layers and metadata
  - **Ctrl+S** auto-saves to the current file if one exists; otherwise opens a save dialog
  - **Ctrl+Shift+S** always opens a save-as dialog; the new file becomes the current context
- **Export** — PNG, JPEG, or WebP with quality and scale (1×–16×) settings; remembers your last export preferences
- **Open** — Load `.lsprite` project files or standard image files (PNG, JPEG, WebP, GIF, BMP)
- **Drag & Drop** — Drop `.lsprite` or image files directly onto the editor
- **New image dialog** — Choose width, height, and color depth (8-bit, 16-bit, 32-bit)
- **Tool cursor preview** — Semi-transparent brush preview follows your cursor; crosshair for non-painting tools
- **Rulers** — Toggleable pixel rulers on top and left edges, adaptive tick spacing; toggle via View menu
- **Fractional zoom** — Zoom from 1% to 64× to handle anything from icons to 6000×4000 paintings; Ctrl+0 to zoom-to-fit
- **Keyboard shortcuts** for all major actions
- **Fully local** — No server, no cloud; everything runs in the browser

## Performance

Optimized for large canvases (tested up to 6000×4000):

- **Memory-budgeted undo** — History capped at 512 MB total; small images get 50 steps, large images get fewer but never crash
- **Single-layer fast path** — Skips alpha blending when only one visible layer exists (pure memcpy)
- **Composite caching** — Flattened image buffer reused across frames; only re-flattened when pixels change
- **GPU checkerboard** — Uses a tiled `createPattern` instead of drawing individual rectangles
- **Scanline flood fill** — Fills rows at a time with a tiny dynamic queue instead of per-pixel stacks
- **RAF coalescing** — Multiple redraw requests collapsed into a single `requestAnimationFrame`
- **Viewport clipping** — Grid lines, ruler ticks, and overlays only drawn for the visible area

## Getting Started

### Run locally

Serve the project directory with any static HTTP server:

```bash
npx serve .
```

Then open `http://localhost:3000` in a Chromium-based browser (Chrome, Edge) for full File System Access API support.

> **Note:** The File System Access API (used for native save/open dialogs) is supported in Chromium-based browsers. In other browsers, save/export falls back to download prompts.

### No build step required

The project is pure vanilla JS with ES modules — no bundler, no transpiler, no framework.

## Project Structure

```
├── index.html                    # Entry point
├── src/
│   ├── main.js                   # App bootstrap, file handle tracking, drag & drop
│   └── sprite_editor/
│       ├── sprite_editor.js      # Main editor class, tabs, layout, keyboard, actions
│       ├── sprite_canvas.js      # Canvas rendering, zoom, pan, grid, rulers
│       ├── sprite_data.js        # SpriteState (pixel buffer), SpriteHistory (undo/redo)
│       ├── layer_data.js         # Layer, LayerStack, compositing
│       ├── layers_panel.js       # Layers UI panel (drag-to-reorder, opacity slider)
│       ├── color.js              # Color class (RGBA, HSV, hex conversions)
│       ├── color_picker.js       # Color picker UI (SV square, hue/alpha strips, palette)
│       ├── tools.js              # Drawing tools (pencil, eraser, fill, line, rect, etc.)
│       ├── toolbar.js            # Top toolbar UI (file actions, tool buttons, options)
│       ├── modal_dialog.js       # Reusable modal dialog for settings/prompts
│       └── lsprite_format.js     # .lsprite serialization/deserialization (JSON + base64)
├── tests/
│   ├── setup.js                  # Test polyfills (ImageData, ResizeObserver, canvas mock)
│   ├── color.test.js
│   ├── sprite_data.test.js
│   ├── layer_data.test.js
│   ├── lsprite_format.test.js
│   ├── tools.test.js
│   └── sprite_editor_integration.test.js
├── package.json
└── vitest.config.js
```

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| B | Pencil tool |
| E | Eraser tool |
| G | Bucket fill tool |
| I | Eyedropper tool |
| L | Line tool |
| U | Rectangle tool |
| O | Ellipse tool |
| M | Selection tool |
| V | Move tool |
| X | Swap foreground / background colors |
| [ / ] | Decrease / increase brush size |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+A | Select all |
| Ctrl+D | Deselect |
| Ctrl+C | Copy selection |
| Ctrl+X | Cut selection |
| Ctrl+V | Paste |
| Ctrl+0 | Zoom to fit |
| Delete | Delete selection |
| Escape | Deselect / cancel |
| Right-click / Middle-click / Alt+click | Pan canvas |
| Scroll wheel | Zoom in / out |

## .lsprite Format

The `.lsprite` file is a JSON document containing:

- Format version
- Canvas width, height, and color depth
- Active layer index
- Array of layers, each with: name, visibility, opacity, locked state, and pixel data (base64-encoded RGBA)

## Tests

Install dev dependencies and run the test suite:

```bash
npm install
npm test
```

Tests use [Vitest](https://vitest.dev/) with jsdom for headless DOM testing — **164 tests** across 6 test files covering all core modules and full editor integration.

## License

Part of the Light Play project by David Mkrtchian.
