// IndexedDB 設定
const DB_NAME = 'GourmetLogDB';
const DB_VERSION = 2;
const STORE_NAME = 'records';
let db;
let currentRecordId = null; // 現在表示中のレコードID
let isEditMode = false;      // 編集モードフラグ
let currentImages = [];      // フォームで現在扱っている全ての画像Base64配列

// DOM 要素
const historyList = document.getElementById('historyList');
const searchInput = document.getElementById('searchInput');
const addNewBtn = document.getElementById('addNewBtn');
const formView = document.getElementById('formView');
const detailView = document.getElementById('detailView');
const recordForm = document.getElementById('recordForm');
const cancelBtn = document.getElementById('cancelBtn');
const backBtn = document.getElementById('backBtn');
const deleteBtn = document.getElementById('deleteBtn');
const editBtn = document.getElementById('editBtn');
const shopPhotoInput = document.getElementById('shopPhoto');
const imagePreview = document.getElementById('imagePreview');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const formTitle = document.getElementById('formTitle');
const submitBtn = recordForm.querySelector('.submit-btn');
const sidebar = document.getElementById('sidebar');

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initDB();
    setupEventListeners();
});

function initDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => console.error('Database error:', event.target.error);
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
    };
    request.onsuccess = (event) => {
        db = event.target.result;
        loadHistory();
    };
}

function setupEventListeners() {
    addNewBtn.addEventListener('click', () => showForm(false));
    editBtn.addEventListener('click', () => showForm(true));
    cancelBtn.addEventListener('click', () => {
        if (confirm('入力を破棄しますか？')) {
            isEditMode ? (detailView.classList.remove('hidden'), formView.classList.add('hidden')) : showHome();
        }
    });
    backBtn.addEventListener('click', showHome);
    shopPhotoInput.addEventListener('change', handleFilesSelect);
    recordForm.addEventListener('submit', handleFormSubmit);
    searchInput.addEventListener('input', (e) => loadHistory(e.target.value));
    deleteBtn.addEventListener('click', handleDelete);
    exportBtn.addEventListener('click', exportData);
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', importData);
}

async function showForm(isEdit = false) {
    isEditMode = isEdit;
    formView.classList.remove('hidden');
    detailView.classList.add('hidden');
    toggleSidebarForMobile(true); // モバイルではサイドバーを隠す

    if (isEditMode && currentRecordId) {
        formTitle.textContent = '記録を編集・追記';
        submitBtn.textContent = '更新する';
        const record = await getRecordById(currentRecordId);
        if (record) {
            document.getElementById('shopName').value = record.shopName;
            document.getElementById('visitDate').value = record.visitDate;
            document.getElementById('comment').value = record.comment;
            currentImages = record.images || (record.image ? [record.image] : []);
            renderPreviewList();
        }
    } else {
        formTitle.textContent = '新しい思い出を記録';
        submitBtn.textContent = '保存する';
        recordForm.reset();
        currentImages = [];
        renderPreviewList();
        currentRecordId = null;
    }
    updateHighlights();
}

function showHome() {
    currentRecordId = null;
    formView.classList.add('hidden');
    detailView.classList.add('hidden');
    toggleSidebarForMobile(false); // モバイルではサイドバーを表示する
    updateHighlights();
}

function toggleSidebarForMobile(isHidden) {
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-hidden', isHidden);
    }
}

async function handleFilesSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        const promises = Array.from(files).map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target.result);
                reader.readAsDataURL(file);
            });
        });
        const converted = await Promise.all(promises);
        currentImages = [...currentImages, ...converted];
        renderPreviewList();
        shopPhotoInput.value = ''; // 連続選択を可能にするため
    }
}

// プレビューリストの描画（削除ボタン付き）
function renderPreviewList() {
    imagePreview.innerHTML = '';
    if (currentImages.length > 0) {
        imagePreview.classList.remove('hidden');
        currentImages.forEach((src, index) => {
            const container = document.createElement('div');
            container.className = 'preview-item';

            const img = document.createElement('img');
            img.src = src;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-photo-btn';
            removeBtn.innerHTML = '×';
            removeBtn.title = 'この写真を削除';
            removeBtn.onclick = (e) => {
                e.preventDefault();
                removeImage(index);
            };

            container.appendChild(img);
            container.appendChild(removeBtn);
            imagePreview.appendChild(container);
        });
    } else {
        imagePreview.classList.add('hidden');
    }
}

function removeImage(index) {
    if (confirm('この写真をリストから削除しますか？')) {
        currentImages.splice(index, 1);
        renderPreviewList();
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const recordData = {
        shopName: document.getElementById('shopName').value,
        visitDate: document.getElementById('visitDate').value,
        comment: document.getElementById('comment').value,
        images: currentImages,
        createdAt: isEditMode ? undefined : new Date().getTime()
    };

    if (isEditMode) recordData.id = currentRecordId;

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = isEditMode ? store.put(recordData) : store.add(recordData);

    request.onsuccess = () => {
        loadHistory();
        if (isEditMode) {
            getRecordById(currentRecordId).then(showDetail);
        } else {
            showHome();
        }
        alert(isEditMode ? '記録を更新しました！' : '記録を保存しました！');
    };
}

function getRecordById(id) {
    return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
    });
}

function loadHistory(filter = '') {
    if (!db) return;
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = (event) => {
        const records = event.target.result.sort((a, b) => b.createdAt - a.createdAt);
        renderHistoryList(records, filter);
    };
}

function renderHistoryList(records, filter) {
    historyList.innerHTML = '';
    const filtered = records.filter(r => r.shopName.toLowerCase().includes(filter.toLowerCase()));
    if (filtered.length === 0) {
        historyList.innerHTML = '<li class="empty-msg">記録が見つかりません</li>';
        return;
    }
    filtered.forEach(record => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.dataset.id = record.id;
        li.innerHTML = `<span class="shop-name">${escapeHTML(record.shopName)}</span><span class="visit-date">${escapeHTML(record.visitDate)}</span>`;
        li.addEventListener('click', () => showDetail(record));
        historyList.appendChild(li);
    });
    updateHighlights();
}

function showDetail(record) {
    currentRecordId = record.id;
    formView.classList.add('hidden');
    detailView.classList.remove('hidden');
    toggleSidebarForMobile(true); // モバイルではサイドバーを隠す
    document.getElementById('detailTitle').textContent = record.shopName;
    document.getElementById('detailDate').textContent = record.visitDate;
    document.getElementById('detailComment').textContent = record.comment;
    const slider = document.getElementById('detailImageContainer');
    slider.innerHTML = '';
    const allImages = record.images || (record.image ? [record.image] : []);
    if (allImages.length > 0) {
        allImages.forEach(src => {
            const img = document.createElement('img');
            img.src = src;
            slider.appendChild(img);
        });
        slider.classList.remove('hidden');
    } else {
        slider.classList.add('hidden');
    }
    updateHighlights();
}

function updateHighlights() {
    document.querySelectorAll('.history-item').forEach(el => {
        el.classList.toggle('active', Number(el.dataset.id) === currentRecordId);
    });
}

function handleDelete() {
    if (!currentRecordId) return;
    if (confirm('この記録を削除してもよろしいですか？')) {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.delete(currentRecordId).onsuccess = () => { loadHistory(); showHome(); };
    }
}

function exportData() {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    store.getAll().onsuccess = (event) => {
        const data = JSON.stringify(event.target.result);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gourmet_log_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    };
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const importedData = JSON.parse(event.target.result);
            if (!confirm('データを読み込みますか？')) return;
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            for (const item of importedData) { delete item.id; store.add(item); }
            transaction.oncomplete = () => { loadHistory(); alert('完了'); };
        } catch (err) { alert('失敗'); }
    };
    reader.readAsText(file);
}

function escapeHTML(str) {
    if (!str) return '';
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}
