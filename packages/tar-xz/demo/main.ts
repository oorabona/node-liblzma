import { initModule, xzAsync } from 'node-liblzma';
import { createTarXz, extractTarXz, listTarXz, type TarEntry } from '../src/index.browser.js';

// DOM Elements
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const fileList = document.getElementById('file-list') as HTMLDivElement;
const presetSelect = document.getElementById('preset-select') as HTMLSelectElement;
const createBtn = document.getElementById('create-btn') as HTMLButtonElement;

const archiveInput = document.getElementById('archive-input') as HTMLInputElement;
const extractBtn = document.getElementById('extract-btn') as HTMLButtonElement;
const downloadAllBtn = document.getElementById('download-all-btn') as HTMLButtonElement;
const archiveTree = document.getElementById('archive-tree') as HTMLDivElement;

const statsSection = document.getElementById('stats') as HTMLElement;
const statFiles = document.getElementById('stat-files') as HTMLSpanElement;
const statOriginal = document.getElementById('stat-original') as HTMLSpanElement;
const statCompressed = document.getElementById('stat-compressed') as HTMLSpanElement;
const statRatio = document.getElementById('stat-ratio') as HTMLSpanElement;
const statTime = document.getElementById('stat-time') as HTMLSpanElement;

// State
const filesToArchive: File[] = [];
let extractedFiles: Array<{ name: string; data: Uint8Array; entry: TarEntry }> = [];

// Utilities
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) return 'folder';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const icons: Record<string, string> = {
    ts: 'ts',
    js: 'js',
    json: 'json',
    md: 'md',
    txt: 'txt',
    html: 'html',
    css: 'css',
    png: 'img',
    jpg: 'img',
    gif: 'img',
    svg: 'svg',
  };
  return icons[ext] || 'file';
}

function updateCreateButton(): void {
  createBtn.disabled = filesToArchive.length === 0;
}

function createFileItem(file: File, index: number): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'file-item';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'file-name';
  nameSpan.textContent = `[${getFileIcon(file.name, false)}] ${file.name}`;

  const sizeSpan = document.createElement('span');
  sizeSpan.className = 'file-size';
  sizeSpan.textContent = formatBytes(file.size);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = 'X';
  removeBtn.addEventListener('click', () => {
    filesToArchive.splice(index, 1);
    renderFileList();
    updateCreateButton();
  });

  item.appendChild(nameSpan);
  item.appendChild(sizeSpan);
  item.appendChild(removeBtn);

  return item;
}

function renderFileList(): void {
  fileList.replaceChildren();
  filesToArchive.forEach((file, index) => {
    fileList.appendChild(createFileItem(file, index));
  });
}

function createTreeItem(entry: TarEntry): HTMLDivElement {
  const isDir = entry.type === '5';

  const item = document.createElement('div');
  item.className = `tree-item ${isDir ? 'directory' : ''}`;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'item-name';
  nameSpan.textContent = `[${getFileIcon(entry.name, isDir)}] ${entry.name}`;

  const infoSpan = document.createElement('span');
  infoSpan.className = 'item-info';

  const sizeSpan = document.createElement('span');
  sizeSpan.className = 'item-size';
  sizeSpan.textContent = isDir ? '-' : formatBytes(entry.size);
  infoSpan.appendChild(sizeSpan);

  if (!isDir) {
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.textContent = 'Download';
    downloadBtn.addEventListener('click', () => {
      const file = extractedFiles.find((f) => f.name === entry.name);
      if (file) {
        downloadFile(file.name, file.data);
      }
    });
    infoSpan.appendChild(downloadBtn);
  }

  item.appendChild(nameSpan);
  item.appendChild(infoSpan);

  return item;
}

function renderArchiveTree(entries: TarEntry[]): void {
  archiveTree.replaceChildren();
  for (const entry of entries) {
    archiveTree.appendChild(createTreeItem(entry));
  }
}

function updateStats(files: number, original: number, compressed: number, time: number): void {
  statsSection.hidden = false;
  statFiles.textContent = files.toString();
  statOriginal.textContent = formatBytes(original);
  statCompressed.textContent = formatBytes(compressed);
  statRatio.textContent =
    original > 0 ? `${((1 - compressed / original) * 100).toFixed(1)}%` : '0%';
  statTime.textContent = `${time}ms`;
}

function downloadFile(name: string, data: Uint8Array): void {
  const blob = new Blob([data]);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.split('/').pop() || name;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Event Handlers
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');

  const files = Array.from(e.dataTransfer?.files || []);
  filesToArchive.push(...files);
  renderFileList();
  updateCreateButton();
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  filesToArchive.push(...files);
  renderFileList();
  updateCreateButton();
  fileInput.value = '';
});

createBtn.addEventListener('click', async () => {
  if (filesToArchive.length === 0) return;

  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';

  const startTime = performance.now();
  let totalOriginal = 0;

  try {
    // Convert files to TarInputFile format
    const inputFiles = await Promise.all(
      filesToArchive.map(async (file) => {
        const content = new Uint8Array(await file.arrayBuffer());
        totalOriginal += content.length;
        return {
          name: file.name,
          content,
          mtime: file.lastModified / 1000,
        };
      })
    );

    const preset = Number.parseInt(presetSelect.value, 10);
    const archive = await createTarXz({ files: inputFiles, preset });

    const endTime = performance.now();

    // Download the archive
    const blob = new Blob([archive], { type: 'application/x-xz' });
    downloadBlob('archive.tar.xz', blob);

    // Update stats
    updateStats(
      filesToArchive.length,
      totalOriginal,
      archive.length,
      Math.round(endTime - startTime)
    );
  } catch (error) {
    console.error('Failed to create archive:', error);
    alert(`Failed to create archive: ${error}`);
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = 'Create tar.xz';
  }
});

archiveInput.addEventListener('change', async () => {
  const file = archiveInput.files?.[0];
  if (!file) return;

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const startTime = performance.now();

    // List contents
    const entries = await listTarXz(data);
    renderArchiveTree(entries);

    // Extract to memory for download
    extractedFiles = await extractTarXz(data);

    const endTime = performance.now();

    extractBtn.disabled = false;
    downloadAllBtn.disabled = false;

    // Calculate total original size
    const totalOriginal = extractedFiles.reduce((sum, f) => sum + f.data.length, 0);
    updateStats(entries.length, totalOriginal, data.length, Math.round(endTime - startTime));
  } catch (error) {
    console.error('Failed to read archive:', error);
    alert(`Failed to read archive: ${error}`);
  }

  archiveInput.value = '';
});

extractBtn.addEventListener('click', () => {
  for (const file of extractedFiles) {
    if (file.entry.type !== '5') {
      // Not a directory
      downloadFile(file.name, file.data);
    }
  }
});

downloadAllBtn.addEventListener('click', () => {
  // Download all non-directory files
  for (const file of extractedFiles) {
    if (file.entry.type !== '5') {
      downloadFile(file.name, file.data);
    }
  }
});

// Initialize WASM module on load (required before any XZ operation)
// Warmup with a tiny payload to trigger JIT compilation
const statusEl = document.getElementById('archive-tree') as HTMLDivElement;
statusEl.textContent = 'Initializing WASM...';

initModule()
  .then(async () => {
    // Warmup: compress a tiny payload to trigger JIT compilation
    await xzAsync('warmup');
    if (statusEl.textContent === 'Initializing WASM...') {
      statusEl.textContent = '';
    }
  })
  .catch((err: Error) => {
    console.error('Failed to initialize WASM:', err);
    statusEl.textContent = `WASM init failed: ${err.message}`;
  });
