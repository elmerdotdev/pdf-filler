// Set pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Application State
let pdfArrayBuffer = null;
let pdfDoc = null;
let totalPages = 0;
let pageScale = 1.5;
let activeElement = null;
let annotations = {}; // pageNum -> array of annotation objects

// Persistent Default Settings State
let currentSettings = {
  fontFamily: 'Helvetica',
  fontSize: 16,
  color: '#000000'
};

// Tap-to-Place State for Mobile / Touch
let pendingTapWidget = null;

// Undo / Redo History Stack
let historyStack = [];
let historyPointer = -1;
const MAX_HISTORY = 50;

// DOM Elements
const pdfUpload = document.getElementById('pdf-upload');
const downloadFab = document.getElementById('download-fab');
const undoFab = document.getElementById('undo-fab');
const redoFab = document.getElementById('redo-fab');
const startOverFab = document.getElementById('start-over-fab');
const pageNumDisplay = document.getElementById('page-num-display');
const viewerContainer = document.getElementById('viewer-container');
const dropZone = document.getElementById('drop-zone');
const imageUploadInput = document.getElementById('image-upload-input');
const placedList = document.getElementById('placed-list');

// Mobile Responsive UI Elements
const sidebar = document.getElementById('sidebar');
const mobileBurgerFab = document.getElementById('mobile-burger-fab');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const tapPlacementBanner = document.getElementById('tap-placement-banner');

// Widget Cards
const textWidget = document.getElementById('text-widget');
const checkmarkWidget = document.getElementById('checkmark-widget');
const imageWidget = document.getElementById('image-widget');

// Event Listeners
pdfUpload.addEventListener('change', handlePdfUpload);
downloadFab.addEventListener('click', exportPdf);
undoFab.addEventListener('click', undo);
redoFab.addEventListener('click', redo);
startOverFab.addEventListener('click', startOver);

// Mobile Sidebar Controls
mobileBurgerFab.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

setupDropZone();
setupWidgets();

// Global click listener to deselect elements
document.addEventListener('click', (e) => {
  if (!e.target.closest('.draggable-annotation') &&
      !e.target.closest('.floating-toolbar') &&
      !e.target.closest('.placed-item') &&
      !e.target.closest('#sidebar') &&
      !e.target.closest('#mobile-burger-fab')) {
    deselectAll();
  }
});

function toggleSidebar() {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('active');
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
}

function setupDropZone() {
  dropZone.addEventListener('click', () => pdfUpload.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  ['dragleave', 'dragend'].forEach(type => {
    dropZone.addEventListener(type, () => dropZone.classList.remove('dragover'));
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      loadPdfFile(files[0]);
    }
  });
}

function setupWidgets() {
  const widgets = [
    { el: textWidget, type: 'text' },
    { el: checkmarkWidget, type: 'checkmark' },
    { el: imageWidget, type: 'image' }
  ];

  widgets.forEach(({ el, type }) => {
    // Drag & Drop for Desktop
    el.addEventListener('dragstart', (e) => {
      if (!pdfDoc) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('widgetType', type);
      e.dataTransfer.effectAllowed = 'copy';
    });

    // Tap to place for Mobile / Touch
    el.addEventListener('click', () => {
      if (!pdfDoc) return;
      pendingTapWidget = type;
      closeSidebar();
      tapPlacementBanner.classList.add('active');
    });
  });
}

function handlePdfUpload(e) {
  const file = e.target.files[0];
  if (file && file.type === 'application/pdf') {
    loadPdfFile(file);
  }
}

async function loadPdfFile(file) {
  pdfArrayBuffer = await file.arrayBuffer();
  const pdfDataCopy = pdfArrayBuffer.slice(0);

  pdfDoc = await pdfjsLib.getDocument({ data: pdfDataCopy }).promise;
  totalPages = pdfDoc.numPages;
  annotations = {};
  historyStack = [];
  historyPointer = -1;

  enableControls();
  saveStateToHistory();
  renderAllPages();
}

function enableControls() {
  downloadFab.disabled = false;
  startOverFab.disabled = false;
  pageNumDisplay.textContent = `Total Pages: ${totalPages}`;
  [textWidget, checkmarkWidget, imageWidget].forEach(w => {
    w.style.opacity = '1';
    w.style.cursor = 'grab';
  });
}

/* History Undo / Redo */
function saveStateToHistory() {
  historyStack = historyStack.slice(0, historyPointer + 1);
  const clone = JSON.parse(JSON.stringify(annotations));
  historyStack.push(clone);

  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
  } else {
    historyPointer++;
  }

  updateHistoryUI();
}

function updateHistoryUI() {
  undoFab.disabled = historyPointer <= 0;
  redoFab.disabled = historyPointer >= historyStack.length - 1;
}

function undo() {
  if (historyPointer > 0) {
    historyPointer--;
    annotations = JSON.parse(JSON.stringify(historyStack[historyPointer]));
    reRenderAnnotationsOnly();
    updateHistoryUI();
  }
}

function redo() {
  if (historyPointer < historyStack.length - 1) {
    historyPointer++;
    annotations = JSON.parse(JSON.stringify(historyStack[historyPointer]));
    reRenderAnnotationsOnly();
    updateHistoryUI();
  }
}

function startOver() {
  if (!confirm('Are you sure you want to remove all added elements?')) return;
  annotations = {};
  saveStateToHistory();
  reRenderAnnotationsOnly();
}

function reRenderAnnotationsOnly() {
  document.querySelectorAll('.annotation-layer').forEach(layer => {
    layer.innerHTML = '';
  });

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const pageWrapper = document.querySelector(`.page-wrapper[data-page-num="${pageNum}"]`);
    if (pageWrapper) {
      const annotationLayer = pageWrapper.querySelector('.annotation-layer');
      if (annotations[pageNum]) {
        annotations[pageNum].forEach(ann => {
          renderAnnotationElement(ann, annotationLayer, pageNum);
        });
      }
    }
  }

  updatePlacedWidgetsList();
}

async function renderAllPages() {
  viewerContainer.innerHTML = '';

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    await renderSinglePage(pageNum);
  }

  updatePlacedWidgetsList();
}

async function renderSinglePage(pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: pageScale });

  const pageWrapper = document.createElement('div');
  pageWrapper.className = 'page-wrapper';
  pageWrapper.style.width = `${viewport.width}px`;
  pageWrapper.style.height = `${viewport.height}px`;
  pageWrapper.dataset.pageNum = pageNum;

  const pageLabel = document.createElement('div');
  pageLabel.className = 'page-label';
  pageLabel.textContent = `Page ${pageNum}`;
  pageWrapper.appendChild(pageLabel);

  const canvas = document.createElement('canvas');
  canvas.className = 'page-canvas';
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');

  await page.render({ canvasContext: context, viewport: viewport }).promise;

  const annotationLayer = document.createElement('div');
  annotationLayer.className = 'annotation-layer';

  // Drag over & drop handlers (Desktop)
  annotationLayer.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  annotationLayer.addEventListener('drop', (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('widgetType');
    const rect = annotationLayer.getBoundingClientRect();
    const dropX = e.clientX - rect.left;
    const dropY = e.clientY - rect.top;

    placeWidgetAt(type, pageNum, dropX, dropY);
  });

  // Tap-to-place click handler (Mobile)
  annotationLayer.addEventListener('click', (e) => {
    if (pendingTapWidget) {
      const rect = annotationLayer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      placeWidgetAt(pendingTapWidget, pageNum, clickX, clickY);

      pendingTapWidget = null;
      tapPlacementBanner.classList.remove('active');
    }
  });

  pageWrapper.appendChild(canvas);
  pageWrapper.appendChild(annotationLayer);
  viewerContainer.appendChild(pageWrapper);

  if (annotations[pageNum]) {
    annotations[pageNum].forEach(ann => {
      renderAnnotationElement(ann, annotationLayer, pageNum);
    });
  }
}

function placeWidgetAt(type, pageNum, x, y) {
  if (type === 'text') {
    addTextAnnotation(pageNum, x, y);
  } else if (type === 'checkmark') {
    addCheckmarkAnnotation(pageNum, x, y);
  } else if (type === 'image') {
    triggerImageUpload(pageNum, x, y);
  }
}

function triggerImageUpload(pageNum, x, y) {
  imageUploadInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      const dataUrl = event.target.result;
      const img = new Image();
      img.onload = function () {
        const initialWidth = Math.min(150, img.width);
        const initialHeight = (img.height / img.width) * initialWidth;

        const newAnn = {
          id: 'ann_' + Date.now(),
          type: 'image',
          dataUrl: dataUrl,
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: initialWidth,
          height: initialHeight
        };

        addAnnotationToPage(pageNum, newAnn);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    imageUploadInput.value = '';
  };
  imageUploadInput.click();
}

function addTextAnnotation(pageNum, x, y) {
  const newAnn = {
    id: 'ann_' + Date.now(),
    type: 'text',
    text: '',
    x: Math.max(0, x),
    y: Math.max(0, y),
    fontSize: currentSettings.fontSize,
    fontFamily: currentSettings.fontFamily,
    color: currentSettings.color
  };
  addAnnotationToPage(pageNum, newAnn, true);
}

function addCheckmarkAnnotation(pageNum, x, y) {
  const newAnn = {
    id: 'ann_' + Date.now(),
    type: 'text',
    text: '✓',
    x: Math.max(0, x),
    y: Math.max(0, y),
    fontSize: Math.max(24, currentSettings.fontSize),
    fontFamily: currentSettings.fontFamily,
    color: currentSettings.color
  };
  addAnnotationToPage(pageNum, newAnn, false);
}

function addAnnotationToPage(pageNum, ann, autoFocus = false) {
  if (!annotations[pageNum]) {
    annotations[pageNum] = [];
  }
  annotations[pageNum].push(ann);

  const pageWrapper = document.querySelector(`.page-wrapper[data-page-num="${pageNum}"]`);
  if (pageWrapper) {
    const annotationLayer = pageWrapper.querySelector('.annotation-layer');
    renderAnnotationElement(ann, annotationLayer, pageNum, autoFocus);
  }

  saveStateToHistory();
  updatePlacedWidgetsList();
}

function renderAnnotationElement(ann, container, pageNum, autoFocus = false) {
  const el = document.createElement('div');
  el.className = 'draggable-annotation';
  el.id = ann.id;
  el.dataset.pageNum = pageNum;
  el.style.left = `${ann.x}px`;
  el.style.top = `${ann.y}px`;

  const deleteBtn = document.createElement('div');
  deleteBtn.className = 'delete-btn';
  deleteBtn.innerHTML = '&times;';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeAnnotation(pageNum, ann.id);
    el.remove();
    saveStateToHistory();
    updatePlacedWidgetsList();
  });
  el.appendChild(deleteBtn);

  if (ann.type === 'text') {
    renderTextContent(el, ann, autoFocus);
  } else if (ann.type === 'image') {
    renderImageContent(el, ann);
  }

  makeDraggable(el, ann, pageNum);

  container.appendChild(el);
  selectElement(el, ann);
}

function renderTextContent(el, ann, autoFocus = false) {
  const textSpan = document.createElement('span');
  textSpan.className = 'text-content-span';
  textSpan.setAttribute('data-placeholder', 'Type text here...');
  textSpan.innerText = ann.text;

  el.style.fontSize = `${ann.fontSize}px`;
  el.style.fontFamily = getFontCss(ann.fontFamily);
  el.style.color = ann.color;
  el.appendChild(textSpan);

  const toolbar = document.createElement('div');
  toolbar.className = 'floating-toolbar';
  toolbar.innerHTML = `
    <select class="tb-font">
      <option value="Helvetica" ${ann.fontFamily === 'Helvetica' ? 'selected' : ''}>Helvetica</option>
      <option value="Times-Roman" ${ann.fontFamily === 'Times-Roman' ? 'selected' : ''}>Times New Roman</option>
      <option value="Courier" ${ann.fontFamily === 'Courier' ? 'selected' : ''}>Courier</option>
    </select>
    <input type="number" class="tb-size" value="${ann.fontSize}" min="8" max="96" style="width: 70px; min-width: 70px;">
    <input type="color" class="tb-color" value="${ann.color}">
  `;

  toolbar.querySelector('.tb-font').addEventListener('change', (e) => {
    ann.fontFamily = e.target.value;
    currentSettings.fontFamily = ann.fontFamily;
    el.style.fontFamily = getFontCss(ann.fontFamily);
    saveStateToHistory();
  });

  toolbar.querySelector('.tb-size').addEventListener('input', (e) => {
    ann.fontSize = parseInt(e.target.value, 10) || 16;
    currentSettings.fontSize = ann.fontSize;
    el.style.fontSize = `${ann.fontSize}px`;
    saveStateToHistory();
  });

  toolbar.querySelector('.tb-color').addEventListener('input', (e) => {
    ann.color = e.target.value;
    currentSettings.color = ann.color;
    el.style.color = ann.color;
    saveStateToHistory();
  });

  toolbar.addEventListener('click', (e) => e.stopPropagation());
  toolbar.addEventListener('mousedown', (e) => e.stopPropagation());
  toolbar.addEventListener('touchstart', (e) => e.stopPropagation());
  el.appendChild(toolbar);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    selectElement(el, ann);
  });

  function enableEditing() {
    textSpan.contentEditable = 'true';
    textSpan.focus();

    if (window.getSelection && textSpan.innerText.length > 0) {
      const range = document.createRange();
      range.selectNodeContents(textSpan);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  let lastTapTime = 0;
  el.addEventListener('touchend', (e) => {
    if (e.target.closest('.floating-toolbar') || e.target.closest('.delete-btn')) return;

    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;

    if (tapLength < 300 && tapLength > 0) {
      e.preventDefault();
      enableEditing();
    }
    lastTapTime = currentTime;
  });

  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    enableEditing();
  });

  textSpan.addEventListener('blur', () => {
    textSpan.contentEditable = 'false';
    ann.text = textSpan.innerText.trim();
    saveStateToHistory();
    updatePlacedWidgetsList();
  });

  if (autoFocus) {
    setTimeout(() => {
      enableEditing();
    }, 100);
  }
}

function renderImageContent(el, ann) {
  el.classList.add('draggable-image');
  el.style.width = `${ann.width}px`;
  el.style.height = `${ann.height}px`;

  const img = document.createElement('img');
  img.src = ann.dataUrl;
  img.ondragstart = () => false; // Prevent native browser drag ghosting for <img> tag
  el.appendChild(img);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'resize-handle';
  el.appendChild(resizeHandle);

  makeResizable(el, resizeHandle, ann);

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    selectElement(el, ann);
  });
}

function updatePlacedWidgetsList() {
  placedList.innerHTML = '';
  let count = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const pageAnns = annotations[pageNum];
    if (!pageAnns) continue;

    pageAnns.forEach(ann => {
      count++;
      const item = document.createElement('div');
      item.className = 'placed-item';

      let label = 'Text';
      if (ann.type === 'text') {
        label = ann.text ? `"${ann.text}"` : 'Empty Text';
      } else if (ann.type === 'image') {
        label = 'Image';
      }

      item.innerHTML = `
        <span class="placed-item-title">${label}</span>
        <span class="placed-item-badge">Page ${pageNum}</span>
      `;

      item.addEventListener('click', () => {
        const targetEl = document.getElementById(ann.id);
        if (targetEl) {
          closeSidebar();
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          selectElement(targetEl, ann);
        }
      });

      placedList.appendChild(item);
    });
  }

  if (count === 0) {
    placedList.innerHTML = '<span style="font-size: 0.8rem; color: #94a3b8; font-style: italic;">No elements placed yet</span>';
  }
}

function getFontCss(fontFamily) {
  switch (fontFamily) {
    case 'Times-Roman': return '"Times New Roman", Times, serif';
    case 'Courier': return '"Courier New", Courier, monospace';
    default: return 'Helvetica, Arial, sans-serif';
  }
}

function selectElement(el, ann) {
  deselectAll();
  activeElement = { el, ann };
  el.classList.add('active');

  if (ann.type === 'text') {
    currentSettings.fontFamily = ann.fontFamily;
    currentSettings.fontSize = ann.fontSize;
    currentSettings.color = ann.color;
  }
}

function deselectAll() {
  document.querySelectorAll('.draggable-annotation').forEach(el => {
    el.classList.remove('active');
    const span = el.querySelector('.text-content-span');
    if (span) span.contentEditable = 'false';
  });
  activeElement = null;
}

function removeAnnotation(pageNum, id) {
  if (annotations[pageNum]) {
    annotations[pageNum] = annotations[pageNum].filter(ann => ann.id !== id);
  }
  if (activeElement && activeElement.ann.id === id) {
    activeElement = null;
  }
}

function makeDraggable(el, ann, pageNum) {
  let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

  el.addEventListener('mousedown', startDrag);
  el.addEventListener('touchstart', startDrag, { passive: false });

  function startDrag(e) {
    const textSpan = el.querySelector('.text-content-span');
    if ((textSpan && textSpan.contentEditable === 'true') || e.target.classList.contains('resize-handle') || e.target.closest('.floating-toolbar')) return;

    // Prevent default touch scrolling / image native dragging
    if (e.type === 'touchstart') {
      e.preventDefault();
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;
    initialLeft = parseFloat(el.style.left) || 0;
    initialTop = parseFloat(el.style.top) || 0;

    function onMove(moveEvent) {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }

      const curX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const curY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const dx = curX - startX;
      const dy = curY - startY;

      const newX = initialLeft + dx;
      const newY = initialTop + dy;

      el.style.left = `${newX}px`;
      el.style.top = `${newY}px`;

      ann.x = newX;
      ann.y = newY;
    }

    function onEnd() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      saveStateToHistory();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }
}

function makeResizable(el, handle, ann) {
  let startX = 0, startY = 0, startWidth = 0, startHeight = 0;

  handle.addEventListener('mousedown', startResize);
  handle.addEventListener('touchstart', startResize, { passive: false });

  function startResize(e) {
    e.stopPropagation();
    if (e.type === 'touchstart') {
      e.preventDefault();
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    startX = clientX;
    startY = clientY;
    startWidth = el.offsetWidth;
    startHeight = el.offsetHeight;

    const aspectRatio = startWidth / startHeight;

    function onMove(moveEvent) {
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }

      const curX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const dx = curX - startX;
      let newWidth = Math.max(30, startWidth + dx);
      let newHeight = newWidth / aspectRatio;

      el.style.width = `${newWidth}px`;
      el.style.height = `${newHeight}px`;

      ann.width = newWidth;
      ann.height = newHeight;
    }

    function onEnd() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      saveStateToHistory();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }
}

function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

async function exportPdf() {
  if (!pdfArrayBuffer) return;

  try {
    const pdfDocLib = await PDFLib.PDFDocument.load(pdfArrayBuffer);

    const standardFonts = {
      'Helvetica': PDFLib.StandardFonts.Helvetica,
      'Times-Roman': PDFLib.StandardFonts.TimesRoman,
      'Courier': PDFLib.StandardFonts.Courier
    };

    const loadedFonts = {};
    for (const [key, fontName] of Object.entries(standardFonts)) {
      loadedFonts[key] = await pdfDocLib.embedFont(fontName);
    }

    const pages = pdfDocLib.getPages();

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const pageNum = pageIdx + 1;
      const pageAnns = annotations[pageNum];
      if (!pageAnns || pageAnns.length === 0) continue;

      const page = pages[pageIdx];
      const { width: pdfWidth, height: pdfHeight } = page.getSize();
      const pdfJsViewport = (await pdfDoc.getPage(pageNum)).getViewport({ scale: pageScale });

      const scaleX = pdfWidth / pdfJsViewport.width;
      const scaleY = pdfHeight / pdfJsViewport.height;

      for (const ann of pageAnns) {
        if (ann.type === 'text') {
          if (!ann.text) continue;

          const font = loadedFonts[ann.fontFamily] || loadedFonts['Helvetica'];
          const rgb = hexToRgb(ann.color);

          const pdfX = ann.x * scaleX;
          const pdfFontSize = ann.fontSize * scaleY;
          const pdfY = pdfHeight - (ann.y * scaleY) - (pdfFontSize * 0.8);

          try {
            page.drawText(ann.text, {
              x: pdfX,
              y: pdfY,
              size: pdfFontSize,
              font: font,
              color: PDFLib.rgb(rgb.r, rgb.g, rgb.b)
            });
          } catch (encodeErr) {
            if (ann.text.includes('✓')) {
              const checkmarkPath = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
              const svgScale = (pdfFontSize / 24);
              page.drawSvgPath(checkmarkPath, {
                x: pdfX,
                y: pdfY + pdfFontSize,
                scale: svgScale,
                color: PDFLib.rgb(rgb.r, rgb.g, rgb.b)
              });
            } else {
              console.warn('Skipping character encoding error:', encodeErr);
            }
          }
        } else if (ann.type === 'image') {
          let embeddedImage;
          if (ann.dataUrl.startsWith('data:image/png')) {
            embeddedImage = await pdfDocLib.embedPng(ann.dataUrl);
          } else {
            embeddedImage = await pdfDocLib.embedJpg(ann.dataUrl);
          }

          const pdfX = ann.x * scaleX;
          const pdfW = ann.width * scaleX;
          const pdfH = ann.height * scaleY;
          const pdfY = pdfHeight - (ann.y * scaleY) - pdfH;

          page.drawImage(embeddedImage, {
            x: pdfX,
            y: pdfY,
            width: pdfW,
            height: pdfH
          });
        }
      }
    }

    const pdfBytes = await pdfDocLib.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'edited_document.pdf';
    link.click();
  } catch (err) {
    console.error('Error exporting PDF:', err);
    alert('Failed to generate PDF. Check console for details.');
  }
}
