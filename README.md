# PDF Filler

> A lightweight, privacy-friendly web application to overlay text fields, checkmarks, and images onto non-fillable PDF documents directly in the browser.

[**Live Demo**](https://elmerdotdev.github.io/pdf-filler/)

---

## 🚀 Features

- 📄 **Fill Any PDF**: Add text boxes, checkmarks (`✓`), and images/signatures to flat or non-editable PDF documents.
- 🎨 **Formatting Controls**: Change font family (Helvetica, Times New Roman, Courier), font size, and text color with a floating context toolbar.
- 🧩 **Page Builder Widgets**: Drag-and-drop widgets from the sidebar (Desktop) or tap-to-place (Mobile/Touch devices).
- 📜 **Continuous Scroll**: Renders multi-page PDFs in a vertical layout for seamless editing across pages.
- 📍 **Element Layer Navigation**: Easily locate placed elements via the sidebar navigation list with auto-scroll.
- ↩️ **Undo / Redo / Start Over**: Full history stack support to revert or re-apply edits anytime.
- 📱 **Mobile Responsive**: Floating burger menu, touch double-tap text focus, and touch drag-and-resize support.
- 🔒 **100% Client-Side Privacy**: All PDF rendering and editing happen locally in your browser—no files are uploaded to a backend server.

---

## 🛠️ Built With

- **HTML5 / CSS3 / JavaScript** (ES6+)
- [PDF.js](https://mozilla.github.io/pdf.js/) (Rendering PDF pages in canvas)
- [pdf-lib](https://pdf-lib.js.org/) (Embedding custom text, vector checkmarks, and images into the PDF document)

---

## 📦 Getting Started

No build step or Node.js server required! Simply clone the repo and open `index.html` in any web browser:

```bash
git clone https://github.com/elmerdotdev/pdf-filler.git
cd pdf-filler
```

Open `index.html` directly or serve via any static HTTP server (e.g. GitHub Pages, VS Code Live Server, or Python SimpleHTTP):

```bash
python3 -m http.server 8000
```

Then navigate to `http://localhost:8000`.

---

## 🌐 Live Demo

Try the app online: **[https://elmerdotdev.github.io/pdf-filler/](https://elmerdotdev.github.io/pdf-filler/)**

---

## 📄 License

MIT License. Free to use for personal and commercial projects.
