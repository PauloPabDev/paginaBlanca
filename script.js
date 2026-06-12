const TABS_KEY = 'notas_blancas_tabs';
const ACTIVE_KEY = 'notas_blancas_active';
const LEGACY_KEY = 'notas_blancas_editor';

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

let tabs = loadTabs();
let activeId = localStorage.getItem(ACTIVE_KEY) || tabs[0].id;
if (!tabs.find(t => t.id === activeId)) activeId = tabs[0].id;

const tabBar = document.getElementById('tab-bar');
const newTabBtn = document.getElementById('new-tab-btn');
const editor = document.getElementById('editor');

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
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
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
    tabs.splice(idx, 1);
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
});

// Init
const activeTab = tabs.find(t => t.id === activeId);
editor.value = activeTab ? activeTab.content : '';
render();

window.addEventListener('load', () => {
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length);
});
