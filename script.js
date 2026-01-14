// IndexedDB 設定
const DB_NAME = 'GourmetLogDB';
const DB_VERSION = 3;
const STORE_NAME = 'records';
let db;
let currentRecordId = null; // 現在表示中のレコードID
let isEditMode = false;      // 編集モードフラグ
let currentImages = [];      // フォームで現在扱っている全ての画像Base64配列
let currentRating = 0;       // 現在の評価（0-5）
let currentSortOption = 'newest'; // 現在の並び替えオプション
let showFavoritesOnly = false;    // お気に入りのみ表示フラグ

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
const sortDropdown = document.getElementById('sortDropdown');
const favFilterBtn = document.getElementById('favFilterBtn');
const starRatingInput = document.getElementById('starRatingInput');
const favoriteCheckbox = document.getElementById('favoriteCheckbox');
const tagsInput = document.getElementById('tagsInput');

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

    // 新機能のイベントリスナー
    if (sortDropdown) {
        sortDropdown.addEventListener('change', (e) => {
            currentSortOption = e.target.value;
            loadHistory(searchInput.value);
        });
    }
    if (favFilterBtn) {
        favFilterBtn.addEventListener('click', () => {
            showFavoritesOnly = !showFavoritesOnly;
            favFilterBtn.classList.toggle('active', showFavoritesOnly);
            loadHistory(searchInput.value);
        });
    }

    // 星評価のイベントリスナーは動的に追加（renderStarRating関数内）
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
            currentRating = record.rating || 0;
            if (favoriteCheckbox) favoriteCheckbox.checked = record.favorite || false;
            if (tagsInput) tagsInput.value = (record.tags || []).join(', ');
            renderPreviewList();
            renderStarRating(currentRating);
        }
    } else {
        formTitle.textContent = '新しい思い出を記録';
        submitBtn.textContent = '保存する';
        recordForm.reset();
        currentImages = [];
        currentRating = 0;
        if (favoriteCheckbox) favoriteCheckbox.checked = false;
        if (tagsInput) tagsInput.value = '';
        renderPreviewList();
        renderStarRating(0);
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

    const tagsValue = tagsInput ? tagsInput.value.trim() : '';
    const tagsArray = tagsValue ? tagsValue.split(',').map(t => t.trim()).filter(t => t) : [];

    const recordData = {
        shopName: document.getElementById('shopName').value,
        visitDate: document.getElementById('visitDate').value,
        comment: document.getElementById('comment').value,
        images: currentImages,
        rating: currentRating,
        favorite: favoriteCheckbox ? favoriteCheckbox.checked : false,
        tags: tagsArray,
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
        let records = event.target.result;

        // お気に入りフィルター
        if (showFavoritesOnly) {
            records = records.filter(r => r.favorite);
        }

        // 並び替え
        switch (currentSortOption) {
            case 'newest':
                records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                break;
            case 'oldest':
                records.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
                break;
            case 'rating-high':
                records.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                break;
            case 'rating-low':
                records.sort((a, b) => (a.rating || 0) - (b.rating || 0));
                break;
            case 'name':
                records.sort((a, b) => (a.shopName || '').localeCompare(b.shopName || '', 'ja'));
                break;
            case 'favorite':
                records.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
                break;
        }

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

        const rating = record.rating || 0;
        const favorite = record.favorite ? '♥' : '';
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
        const tagsHtml = (record.tags && record.tags.length > 0)
            ? `<div class="item-tags">${record.tags.map(tag => `<span class="tag-badge">${escapeHTML(tag)}</span>`).join('')}</div>`
            : '';

        li.innerHTML = `
            <div class="item-header">
                <span class="shop-name">${escapeHTML(record.shopName)}</span>
                ${favorite ? '<span class="favorite-icon">♥</span>' : ''}
            </div>
            <div class="item-meta">
                <span class="visit-date">${escapeHTML(record.visitDate)}</span>
                ${rating > 0 ? `<span class="rating-stars">${stars}</span>` : ''}
            </div>
            ${tagsHtml}
        `;
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

    // 評価とお気に入りの表示
    const detailRating = document.getElementById('detailRating');
    const detailFavorite = document.getElementById('detailFavorite');
    const detailTags = document.getElementById('detailTags');

    if (detailRating) {
        const rating = record.rating || 0;
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
        detailRating.textContent = rating > 0 ? stars : '';
    }

    if (detailFavorite) {
        detailFavorite.textContent = record.favorite ? '♥' : '';
        detailFavorite.style.display = record.favorite ? 'inline' : 'none';
    }

    if (detailTags) {
        if (record.tags && record.tags.length > 0) {
            detailTags.innerHTML = record.tags.map(tag => `<span class="tag-badge">${escapeHTML(tag)}</span>`).join('');
            detailTags.style.display = 'block';
        } else {
            detailTags.style.display = 'none';
        }
    }

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

// 星評価のレンダリング
function renderStarRating(rating) {
    if (!starRatingInput) return;
    starRatingInput.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
        const star = document.createElement('span');
        star.className = 'star';
        star.textContent = i <= rating ? '★' : '☆';
        star.dataset.rating = i;
        star.addEventListener('click', () => {
            currentRating = i;
            renderStarRating(i);
        });
        starRatingInput.appendChild(star);
    }
}

function escapeHTML(str) {
    if (!str) return '';
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
}
