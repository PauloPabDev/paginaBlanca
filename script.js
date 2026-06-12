const TABS_KEY = 'notas_blancas_tabs';
const ACTIVE_KEY = 'notas_blancas_active';
const LEGACY_KEY = 'notas_blancas_editor';
const TRASH_KEY = 'notas_blancas_trash';

function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function loadTabs() {
    try {
        const raw = localStorage.getItem(TABS_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed) && parsed.length > 0) {
            // Ensure every tab has a name field (migration from old format)
            parsed.forEach(t => { if (t.name === undefined) t.name = ''; });
            return parsed;
        }
    } catch {}

    // Migrate legacy single note
    const legacy = localStorage.getItem(LEGACY_KEY);
    return [{ id: uid(), name: '', content: legacy || '' }];
}

function save() {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
    localStorage.setItem(ACTIVE_KEY, activeId);
}

function tabLabel(tab) {
    return tab.name.trim() || 'Sin título';
}

function startRename(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    const titleEl = tabBar.querySelector(`.tab[data-id="${tabId}"] .tab-title`);
    if (!titleEl) return;

    const input = document.createElement('input');
    input.className = 'tab-rename-input';
    input.value = tab.name;
    input.placeholder = 'Sin título';
    input.maxLength = 40;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;

    function commit() {
        if (committed) return;
        committed = true;
        tab.name = input.value.trim();
        save();
        render();
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') {
            committed = true; // skip commit on blur
            render();
        }
    });
    // Prevent tab switch while renaming
    input.addEventListener('click', e => e.stopPropagation());
}

function loadTrash() {
    try {
        const raw = localStorage.getItem(TRASH_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [];
}

function saveTrash() {
    localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
}

let tabs = loadTabs();
let trash = loadTrash();
let confirmingId = null;
let confirmingEmpty = false;
let activeId = localStorage.getItem(ACTIVE_KEY) || tabs[0].id;
if (!tabs.find(t => t.id === activeId)) activeId = tabs[0].id;

const tabBar = document.getElementById('tab-bar');
const newTabBtn = document.getElementById('new-tab-btn');
const editor = document.getElementById('editor');
const previewEl = document.getElementById('preview');
const previewToggle = document.getElementById('preview-toggle');
const snippetMenu = document.getElementById('snippet-menu');
const trashBtn = document.getElementById('trash-btn');
const trashBadge = document.getElementById('trash-badge');
const trashModal = document.getElementById('trash-modal');

function render() {
    tabBar.querySelectorAll('.tab').forEach(el => el.remove());

    tabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = 'tab' + (tab.id === activeId ? ' active' : '');
        el.dataset.id = tab.id;

        const title = document.createElement('span');
        title.className = 'tab-title';
        title.textContent = tabLabel(tab);
        title.title = 'Doble clic para renombrar';
        el.appendChild(title);

        if (tabs.length > 1) {
            const x = document.createElement('span');
            x.className = 'tab-close';
            x.textContent = '×';
            x.title = 'Cerrar (Ctrl+W)';
            x.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });
            el.appendChild(x);
        }

        el.addEventListener('click', () => switchTab(tab.id));
        el.addEventListener('dblclick', e => {
            e.stopPropagation();
            // click already ran switchTab+render, so query fresh DOM
            startRename(tab.id);
        });
        tabBar.insertBefore(el, newTabBtn);
    });

    const activeEl = tabBar.querySelector('.tab.active');
    if (activeEl) activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function switchTab(id) {
    const cur = tabs.find(t => t.id === activeId);
    if (cur) cur.content = editor.value;
    activeId = id;
    const tab = tabs.find(t => t.id === id);
    editor.value = tab.content;
    save();
    render();
    renderPreview();
    if (!previewMode[activeId]) {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
    }
}

function newTab() {
    const cur = tabs.find(t => t.id === activeId);
    if (cur) cur.content = editor.value;
    const tab = { id: uid(), name: '', content: '' };
    tabs.push(tab);
    activeId = tab.id;
    editor.value = '';
    save();
    render();
    // Start rename immediately so the user can name the new tab
    startRename(tab.id);
}

function closeTab(id) {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const [removed] = tabs.splice(idx, 1);
    trash.push({ id: removed.id, name: removed.name, content: removed.content, deletedAt: new Date().toISOString() });
    saveTrash();
    updateTrashBadge();
    if (activeId === id) {
        const next = tabs[Math.min(idx, tabs.length - 1)];
        activeId = next.id;
        editor.value = next.content;
    }
    save();
    render();
}

editor.addEventListener('input', () => {
    const tab = tabs.find(t => t.id === activeId);
    if (!tab) return;
    tab.content = editor.value;
    save();
});

newTabBtn.addEventListener('click', newTab);

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !trashModal.hidden) {
        closeTrashModal();
        return;
    }
    if (e.ctrlKey && !e.shiftKey && e.key === 't') {
        e.preventDefault();
        newTab();
    }
    if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        closeTab(activeId);
    }
    if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeId);
        const next = e.shiftKey
            ? (idx - 1 + tabs.length) % tabs.length
            : (idx + 1) % tabs.length;
        switchTab(tabs[next].id);
    }
    // Ctrl+1…9 para cambiar de pestaña
    if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
        const n = parseInt(e.key) - 1;
        if (tabs[n]) { e.preventDefault(); switchTab(tabs[n].id); }
    }
    if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        togglePreview();
    }
});

// Init
const activeTab = tabs.find(t => t.id === activeId);
editor.value = activeTab ? activeTab.content : '';
render();
updateTrashBadge();

window.addEventListener('load', () => {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
});

// ── Papelera ─────────────────────────────────────────────────────────────────

function updateTrashBadge() {
    if (trash.length > 0) {
        trashBadge.textContent = trash.length;
        trashBadge.hidden = false;
    } else {
        trashBadge.hidden = true;
    }
}

function openTrashModal() {
    renderTrashModal();
    trashModal.hidden = false;
}

function closeTrashModal() {
    confirmingId = null;
    confirmingEmpty = false;
    trashModal.hidden = true;
}

function renderTrashModal() {
    const list = trashModal.querySelector('.trash-list');
    const footer = trashModal.querySelector('.trash-footer');
    list.innerHTML = '';
    footer.innerHTML = '';

    if (trash.length === 0) {
        confirmingId = null;
        confirmingEmpty = false;
        const msg = document.createElement('p');
        msg.className = 'trash-empty-msg';
        msg.textContent = 'La papelera está vacía';
        list.appendChild(msg);
        footer.hidden = true;
        return;
    }

    footer.hidden = false;

    // Footer: vaciar papelera con confirmación inline
    if (confirmingEmpty) {
        const label = document.createElement('span');
        label.className = 'trash-confirm-label';
        label.textContent = '¿Vaciar todo?';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'trash-restore-btn';
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.addEventListener('click', () => { confirmingEmpty = false; renderTrashModal(); });
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'trash-empty-all-btn trash-empty-all-btn--confirm';
        confirmBtn.textContent = 'Sí, vaciar';
        confirmBtn.addEventListener('click', emptyTrash);
        footer.appendChild(label);
        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
    } else {
        const emptyBtn = document.createElement('button');
        emptyBtn.className = 'trash-empty-all-btn';
        emptyBtn.textContent = 'Vaciar papelera';
        emptyBtn.addEventListener('click', () => { confirmingEmpty = true; renderTrashModal(); });
        footer.appendChild(emptyBtn);
    }

    [...trash].reverse().forEach(item => {
        const row = document.createElement('div');
        row.className = 'trash-item';

        const info = document.createElement('div');
        info.className = 'trash-item-info';

        const name = document.createElement('div');
        name.className = 'trash-item-name';
        name.textContent = item.name || 'Sin título';

        const preview = document.createElement('div');
        preview.className = 'trash-item-preview';
        preview.textContent = item.content.trim().slice(0, 60) || '(vacío)';

        const date = document.createElement('div');
        date.className = 'trash-item-date';
        date.textContent = formatTrashDate(item.deletedAt);

        info.appendChild(name);
        info.appendChild(preview);
        info.appendChild(date);

        const actions = document.createElement('div');
        actions.className = 'trash-item-actions';

        if (confirmingId === item.id) {
            // Confirmación inline para este item
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'trash-restore-btn';
            cancelBtn.textContent = 'Cancelar';
            cancelBtn.addEventListener('click', () => { confirmingId = null; renderTrashModal(); });
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'trash-delete-btn trash-delete-btn--confirm';
            confirmBtn.textContent = 'Eliminar';
            confirmBtn.title = 'Confirmar eliminación';
            confirmBtn.addEventListener('click', () => deleteForever(item.id));
            actions.appendChild(cancelBtn);
            actions.appendChild(confirmBtn);
        } else {
            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'trash-restore-btn';
            restoreBtn.textContent = 'Restaurar';
            restoreBtn.addEventListener('click', () => restoreTab(item.id));
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'trash-delete-btn';
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Eliminar definitivamente';
            deleteBtn.addEventListener('click', () => { confirmingId = item.id; renderTrashModal(); });
            actions.appendChild(restoreBtn);
            actions.appendChild(deleteBtn);
        }

        row.appendChild(info);
        row.appendChild(actions);
        list.appendChild(row);
    });
}

function formatTrashDate(iso) {
    return new Date(iso).toLocaleString('es', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}

function restoreTab(id) {
    const idx = trash.findIndex(t => t.id === id);
    if (idx === -1) return;
    const [item] = trash.splice(idx, 1);
    saveTrash();
    updateTrashBadge();

    const cur = tabs.find(t => t.id === activeId);
    if (cur) cur.content = editor.value;

    tabs.push({ id: item.id, name: item.name, content: item.content });
    activeId = item.id;
    editor.value = item.content;
    save();
    render();
    closeTrashModal();
    editor.focus();
}

function deleteForever(id) {
    trash = trash.filter(t => t.id !== id);
    confirmingId = null;
    saveTrash();
    updateTrashBadge();
    renderTrashModal();
}

function emptyTrash() {
    trash = [];
    confirmingId = null;
    confirmingEmpty = false;
    saveTrash();
    updateTrashBadge();
    closeTrashModal();
}

trashBtn.addEventListener('click', openTrashModal);
trashModal.querySelector('.trash-overlay').addEventListener('click', closeTrashModal);
trashModal.querySelector('.trash-close-btn').addEventListener('click', closeTrashModal);

// ── Exportar / Importar ───────────────────────────────────────────────────────

function exportCurrentTab() {
    const tab = tabs.find(t => t.id === activeId);
    if (!tab) return;
    const content = editor.value;
    const filename = (tab.name.trim() || 'Sin título') + '.txt';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function importTextFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const cur = tabs.find(t => t.id === activeId);
        if (cur) cur.content = editor.value;
        const name = file.name.replace(/\.txt$/i, '');
        const tab = { id: uid(), name, content: e.target.result };
        tabs.push(tab);
        activeId = tab.id;
        editor.value = tab.content;
        save();
        render();
        editor.focus();
    };
    reader.readAsText(file, 'UTF-8');
}

const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');

exportBtn.addEventListener('click', exportCurrentTab);
importBtn.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', e => {
    importTextFile(e.target.files[0]);
    importInput.value = '';
});

// ── Preview ──────────────────────────────────────────────────────────────────

const previewMode = {};

function togglePreview() {
    previewMode[activeId] = !previewMode[activeId];
    renderPreview();
}

function renderPreview() {
    if (previewMode[activeId]) {
        previewEl.innerHTML = marked.parse(editor.value);
        editor.hidden = true;
        previewEl.hidden = false;
        previewToggle.textContent = 'Editar';
        previewToggle.classList.add('active');
    } else {
        editor.hidden = false;
        previewEl.hidden = true;
        previewToggle.textContent = 'Preview';
        previewToggle.classList.remove('active');
    }
}

previewToggle.addEventListener('click', togglePreview);

// ── Auto-pares ────────────────────────────────────────────────────────────────

function insertAround(open, close) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = editor.value.slice(start, end);
    const replacement = open + selected + close;
    insertText(replacement);
    editor.setSelectionRange(start + open.length, start + open.length + selected.length);
}

function insertText(text) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.focus();
    if (!document.execCommand('insertText', false, text)) {
        editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
        editor.setSelectionRange(start + text.length, start + text.length);
        editor.dispatchEvent(new Event('input'));
    }
}

editor.addEventListener('keydown', e => {
    if (snippetMenu && !snippetMenu.hidden) {
        handleSnippetKey(e);
        return;
    }

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const hasSelection = start !== end;
    const before = editor.value.slice(0, start);
    const prevChar = before.slice(-1);

    if (e.key === '*' && !e.ctrlKey && !e.metaKey) {
        if (hasSelection) {
            e.preventDefault();
            insertAround('**', '**');
            return;
        }
        if (prevChar === '*') {
            e.preventDefault();
            // already typed one *, add closing **cursor**
            editor.value = editor.value.slice(0, start) + '**' + editor.value.slice(end);
            editor.setSelectionRange(start, start);
            editor.dispatchEvent(new Event('input'));
            return;
        }
    }

    if (e.key === '_' && !e.ctrlKey && !e.metaKey && hasSelection) {
        e.preventDefault();
        insertAround('_', '_');
        return;
    }

    if (e.key === '`' && !e.ctrlKey && !e.metaKey) {
        if (hasSelection) {
            e.preventDefault();
            insertAround('`', '`');
            return;
        }
    }

    if (e.key === '~' && !e.ctrlKey && !e.metaKey) {
        if (hasSelection) {
            e.preventDefault();
            insertAround('~~', '~~');
            return;
        }
        if (prevChar === '~') {
            e.preventDefault();
            editor.value = editor.value.slice(0, start) + '~~' + editor.value.slice(end);
            editor.setSelectionRange(start, start);
            editor.dispatchEvent(new Event('input'));
            return;
        }
    }

    if (e.key === '[' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (hasSelection) {
            const sel = editor.value.slice(start, end);
            const ins = '[' + sel + '](url)';
            insertText(ins);
            editor.setSelectionRange(start + sel.length + 3, start + sel.length + 6);
        } else {
            insertText('[](url)');
            editor.setSelectionRange(start + 1, start + 1);
        }
        return;
    }

    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        insertText('  ');
        return;
    }

    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const lineStart = before.lastIndexOf('\n') + 1;
        const currentLine = before.slice(lineStart);
        const ulMatch = currentLine.match(/^(\s*)([-*])\s/);
        const olMatch = currentLine.match(/^(\s*)(\d+)\.\s/);
        if (ulMatch) {
            if (currentLine.trim() === ulMatch[2]) {
                // empty list item — break out
                e.preventDefault();
                editor.value = editor.value.slice(0, lineStart) + '\n' + editor.value.slice(end);
                editor.setSelectionRange(lineStart + 1, lineStart + 1);
                editor.dispatchEvent(new Event('input'));
            } else {
                e.preventDefault();
                insertText('\n' + ulMatch[1] + ulMatch[2] + ' ');
            }
            return;
        }
        if (olMatch) {
            if (currentLine.trim() === olMatch[2] + '.') {
                e.preventDefault();
                editor.value = editor.value.slice(0, lineStart) + '\n' + editor.value.slice(end);
                editor.setSelectionRange(lineStart + 1, lineStart + 1);
                editor.dispatchEvent(new Event('input'));
            } else {
                e.preventDefault();
                insertText('\n' + olMatch[1] + (parseInt(olMatch[2]) + 1) + '. ');
            }
            return;
        }
    }
});

// ── Snippet menu ──────────────────────────────────────────────────────────────

const SNIPPETS = [
    { label: 'H1',      hint: '# Encabezado',       text: '# ',           cursor: 2 },
    { label: 'H2',      hint: '## Encabezado',       text: '## ',          cursor: 3 },
    { label: 'H3',      hint: '### Encabezado',      text: '### ',         cursor: 4 },
    { label: 'Negrita', hint: '**texto**',            text: '****',         cursor: 2 },
    { label: 'Cursiva', hint: '*texto*',              text: '**',           cursor: 1 },
    { label: 'Tachado', hint: '~~texto~~',            text: '~~~~',         cursor: 2 },
    { label: 'Cita',    hint: '> cita',               text: '> ',           cursor: 2 },
    { label: 'Código',  hint: '`código`',             text: '``',           cursor: 1 },
    { label: 'Bloque',  hint: '```\ncódigo\n```',     text: '```\n\n```',   cursor: 4 },
    { label: 'Lista',   hint: '- elemento',           text: '- ',           cursor: 2 },
    { label: 'Tabla',   hint: '| col | col |',        text: '| Col 1 | Col 2 |\n|--------|--------|\n|        |        |\n', cursor: 2 },
    { label: 'Línea',   hint: '---',                  text: '---\n',        cursor: 4 },
    { label: 'Enlace',  hint: '[texto](url)',          text: '[](url)',      cursor: 1 },
];

let snippetStart = -1;
let snippetFilter = '';
let snippetSelected = 0;
let visibleSnippets = [];

function getCaretCoords(textarea) {
    const div = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    ['font', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight',
     'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
     'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
     'width', 'whiteSpace', 'wordWrap', 'overflowWrap', 'tabSize'
    ].forEach(p => div.style[p] = style[p]);
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.top = '-9999px';
    div.style.left = '-9999px';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.height = 'auto';
    div.style.overflow = 'hidden';

    const text = textarea.value.slice(0, textarea.selectionStart);
    div.textContent = text;
    const span = document.createElement('span');
    span.textContent = '​';
    div.appendChild(span);
    document.body.appendChild(div);
    const rect = span.getBoundingClientRect();
    const taRect = textarea.getBoundingClientRect();
    document.body.removeChild(div);
    return {
        top: rect.top - taRect.top + textarea.getBoundingClientRect().top - textarea.scrollTop,
        left: rect.left - taRect.left + textarea.getBoundingClientRect().left,
    };
}

function openSnippetMenu() {
    snippetSelected = 0;
    renderSnippetMenu();
    if (visibleSnippets.length === 0) { closeSnippetMenu(); return; }
    const coords = getCaretCoords(editor);
    const menuH = Math.min(visibleSnippets.length * 36, 280);
    const top = coords.top + 24 + window.scrollY;
    const fitsBelow = coords.top + 24 + menuH < window.innerHeight;
    snippetMenu.style.top = (fitsBelow ? top : coords.top - menuH + window.scrollY) + 'px';
    snippetMenu.style.left = Math.min(coords.left, window.innerWidth - 220) + 'px';
    snippetMenu.hidden = false;
}

function renderSnippetMenu() {
    visibleSnippets = SNIPPETS.filter(s =>
        snippetFilter === '' || s.label.toLowerCase().includes(snippetFilter.toLowerCase())
    );
    if (snippetSelected >= visibleSnippets.length) snippetSelected = 0;
    snippetMenu.innerHTML = '';
    visibleSnippets.forEach((s, i) => {
        const item = document.createElement('div');
        item.className = 'snippet-item' + (i === snippetSelected ? ' selected' : '');
        item.innerHTML = `<span class="snippet-label">${s.label}</span><span class="snippet-hint">${s.hint}</span>`;
        item.addEventListener('mousedown', e => { e.preventDefault(); applySnippet(i); });
        snippetMenu.appendChild(item);
    });
}

function closeSnippetMenu() {
    snippetMenu.hidden = true;
    snippetStart = -1;
    snippetFilter = '';
}

function applySnippet(idx) {
    const snippet = visibleSnippets[idx];
    if (!snippet) return;
    const pos = editor.selectionStart;
    // replace from snippetStart (the '/') to current cursor
    const before = editor.value.slice(0, snippetStart);
    const after = editor.value.slice(pos);
    editor.value = before + snippet.text + after;
    const newPos = snippetStart + snippet.cursor;
    editor.setSelectionRange(newPos, newPos);
    editor.dispatchEvent(new Event('input'));
    closeSnippetMenu();
    editor.focus();
}

function handleSnippetKey(e) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        snippetSelected = (snippetSelected + 1) % visibleSnippets.length;
        renderSnippetMenu();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        snippetSelected = (snippetSelected - 1 + visibleSnippets.length) % visibleSnippets.length;
        renderSnippetMenu();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySnippet(snippetSelected);
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSnippetMenu();
    }
}

editor.addEventListener('input', () => {
    if (previewMode[activeId]) return;
    const pos = editor.selectionStart;
    const before = editor.value.slice(0, pos);
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineText = before.slice(lineStart);
    const slashIdx = lineText.lastIndexOf('/');

    if (slashIdx !== -1) {
        const precedingChar = slashIdx > 0 ? lineText[slashIdx - 1] : ' ';
        if (precedingChar === ' ' || precedingChar === '\t' || slashIdx === 0) {
            snippetStart = lineStart + slashIdx;
            snippetFilter = lineText.slice(slashIdx + 1);
            openSnippetMenu();
            return;
        }
    }
    closeSnippetMenu();
});

document.addEventListener('click', e => {
    if (!snippetMenu.hidden && !snippetMenu.contains(e.target)) closeSnippetMenu();
});
