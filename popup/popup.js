/**
 * Juchan Popup Script
 * Handles popup UI interactions and communication with background/content scripts
 */

// DOM Elements
const elements = {
    // Toggles
    togglePageTranslate: document.getElementById('togglePageTranslate'),
    toggleImageTranslate: document.getElementById('toggleImageTranslate'),
    toggleLazyTranslate: document.getElementById('toggleLazyTranslate'),

    // Language
    sourceLang: document.getElementById('sourceLang'),
    targetLang: document.getElementById('targetLang'),

    // API Config
    apiType: document.getElementById('apiType'),
    apiEndpoint: document.getElementById('apiEndpoint'),
    apiModel: document.getElementById('apiModel'),
    apiKey: document.getElementById('apiKey'),
    apiConfig: document.getElementById('apiConfig'),
    btnToggleApi: document.getElementById('btnToggleApi'),
    btnToggleKey: document.getElementById('btnToggleKey'),
    btnTestApi: document.getElementById('btnTestApi'),
    apiStatusText: document.getElementById('apiStatusText'),

    // Actions
    btnTranslateNow: document.getElementById('btnTranslateNow'),
    btnRestore: document.getElementById('btnRestore'),
    btnSettings: document.getElementById('btnSettings'),
    btnHelp: document.getElementById('btnHelp'),

    // Status
    statusIndicator: document.getElementById('statusIndicator'),
    statTexts: document.getElementById('statTexts'),
    statImages: document.getElementById('statImages'),
    statTime: document.getElementById('statTime')
};

// API Presets
const apiPresets = {
    ollama: {
        endpoint: 'http://localhost:11434/api/generate',
        model: 'llama2',
        needsKey: false
    },
    mymemory: {
        endpoint: 'https://api.mymemory.translated.net/get',
        model: '(Không cần)',
        needsKey: false
    },
    openai: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-3.5-turbo',
        needsKey: true
    },
    gemini: {
        endpoint: '(Tự động - không cần nhập)',
        model: 'gemini-pro',
        needsKey: true
    },
    anthropic: {
        endpoint: 'https://api.anthropic.com/v1/messages',
        model: 'claude-3-haiku-20240307',
        needsKey: true
    },
    groq: {
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'llama-3.3-70b-versatile',
        needsKey: true
    },
    custom: {
        endpoint: '',
        model: '',
        needsKey: true
    }
};

// Default settings
const defaultSettings = {
    pageTranslate: true,
    imageTranslate: false,
    lazyTranslate: true,
    sourceLang: 'auto',
    targetLang: 'vi',
    apiType: 'ollama',
    apiEndpoint: 'http://localhost:11434/api/generate',
    apiModel: 'llama2',
    apiKey: ''
};

/**
 * Initialize popup
 */
async function init() {
    await loadSettings();
    setupEventListeners();
    await updateStats();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get('juchanSettings');
        const settings = { ...defaultSettings, ...result.juchanSettings };

        // Load toggle states
        elements.togglePageTranslate.checked = settings.pageTranslate;
        elements.toggleImageTranslate.checked = settings.imageTranslate;
        elements.toggleLazyTranslate.checked = settings.lazyTranslate;

        // Load language settings
        elements.sourceLang.value = settings.sourceLang;
        elements.targetLang.value = settings.targetLang;

        // Load API settings
        elements.apiType.value = settings.apiType || 'ollama';
        elements.apiEndpoint.value = settings.apiEndpoint || apiPresets.ollama.endpoint;
        elements.apiModel.value = settings.apiModel || apiPresets.ollama.model;
        elements.apiKey.value = settings.apiKey || '';

        // Update placeholder based on API type
        updateApiPlaceholders();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
    const settings = {
        pageTranslate: elements.togglePageTranslate.checked,
        imageTranslate: elements.toggleImageTranslate.checked,
        lazyTranslate: elements.toggleLazyTranslate.checked,
        sourceLang: elements.sourceLang.value,
        targetLang: elements.targetLang.value,
        apiType: elements.apiType.value,
        apiEndpoint: elements.apiEndpoint.value.trim(),
        apiModel: elements.apiModel.value.trim(),
        apiKey: elements.apiKey.value.trim()
    };

    try {
        // Get existing settings to preserve other configs
        const result = await chrome.storage.local.get('juchanSettings');
        const existingSettings = result.juchanSettings || {};

        await chrome.storage.local.set({
            juchanSettings: { ...existingSettings, ...settings }
        });

        // Notify content script of settings change
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_UPDATED',
                settings
            }).catch(() => { });
        }
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

/**
 * Update API placeholders based on selected type
 */
function updateApiPlaceholders() {
    const type = elements.apiType.value;
    const preset = apiPresets[type];

    if (preset) {
        elements.apiEndpoint.placeholder = preset.endpoint || 'Nhập API endpoint';
        elements.apiModel.placeholder = preset.model || 'Nhập tên model';

        // Update key field visibility hint
        if (preset.needsKey) {
            elements.apiKey.placeholder = 'Nhập API key của bạn';
        } else {
            elements.apiKey.placeholder = 'Không cần API key';
        }
    }

    // Hide/show fields based on API type
    const endpointRow = elements.apiEndpoint.closest('.form-row');
    const modelRow = elements.apiModel.closest('.form-row');
    const keyRow = elements.apiKey.closest('.form-row');

    if (type === 'mymemory') {
        // Hide all unnecessary fields for MyMemory
        if (endpointRow) endpointRow.style.display = 'none';
        if (modelRow) modelRow.style.display = 'none';
        if (keyRow) keyRow.style.display = 'none';
    } else if (type === 'gemini') {
        // Gemini doesn't need endpoint
        if (endpointRow) endpointRow.style.display = 'none';
        if (modelRow) modelRow.style.display = 'block';
        if (keyRow) keyRow.style.display = 'block';
    } else if (type === 'ollama') {
        // Ollama doesn't need API key
        if (endpointRow) endpointRow.style.display = 'block';
        if (modelRow) modelRow.style.display = 'block';
        if (keyRow) keyRow.style.display = 'none';
    } else {
        // Show all fields for other types
        if (endpointRow) endpointRow.style.display = 'block';
        if (modelRow) modelRow.style.display = 'block';
        if (keyRow) keyRow.style.display = 'block';
    }
}

/**
 * Apply API preset when type changes
 */
function applyApiPreset() {
    const type = elements.apiType.value;
    const preset = apiPresets[type];

    if (preset && type !== 'custom') {
        elements.apiEndpoint.value = preset.endpoint;
        elements.apiModel.value = preset.model;
    }

    updateApiPlaceholders();
    saveSettings();
}

/**
 * Toggle API config panel
 */
function toggleApiConfig() {
    const isExpanded = elements.apiConfig.classList.toggle('expanded');
    elements.btnToggleApi.classList.toggle('expanded', isExpanded);
    elements.btnToggleApi.textContent = isExpanded ? '▲' : '▼';
}

/**
 * Toggle API key visibility
 */
function toggleKeyVisibility() {
    const input = elements.apiKey;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    elements.btnToggleKey.textContent = isPassword ? '🔒' : '👁️';
}

/**
 * Test API connection
 */
async function testApiConnection() {
    elements.btnTestApi.disabled = true;
    elements.btnTestApi.textContent = '⏳ Testing...';
    elements.apiStatusText.textContent = '';
    elements.apiStatusText.className = 'api-status-text';

    try {
        // Save current settings first
        await saveSettings();

        console.log('Juchan Popup: Testing API connection...', {
            type: elements.apiType.value,
            model: elements.apiModel.value.trim(),
            hasKey: !!elements.apiKey.value.trim()
        });

        const response = await chrome.runtime.sendMessage({
            type: 'TEST_API',
            endpoint: elements.apiEndpoint.value.trim(),
            model: elements.apiModel.value.trim(),
            apiKey: elements.apiKey.value.trim(),
            apiType: elements.apiType.value
        });

        console.log('Juchan Popup: Test response:', response);

        if (!response) {
            throw new Error('Không nhận được phản hồi từ service worker. Thử reload extension.');
        }

        if (response.success) {
            elements.apiStatusText.textContent = '✓ Kết nối OK!';
            elements.apiStatusText.className = 'api-status-text success';
        } else {
            elements.apiStatusText.textContent = `✗ ${response.error || 'Lỗi không xác định'}`;
            elements.apiStatusText.className = 'api-status-text error';
        }
    } catch (error) {
        console.error('Juchan Popup: Test error:', error);
        let errorMsg = error.message || 'Lỗi kết nối';

        // Provide helpful error messages
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
            errorMsg = 'Lỗi mạng. Kiểm tra kết nối internet và API key.';
        } else if (errorMsg.includes('Could not establish connection')) {
            errorMsg = 'Service worker chưa sẵn sàng. Thử reload extension.';
        }

        elements.apiStatusText.textContent = `✗ ${errorMsg}`;
        elements.apiStatusText.className = 'api-status-text error';
    } finally {
        elements.btnTestApi.disabled = false;
        elements.btnTestApi.textContent = '🔍 Test';
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Toggle switches
    elements.togglePageTranslate.addEventListener('change', saveSettings);
    elements.toggleImageTranslate.addEventListener('change', saveSettings);
    elements.toggleLazyTranslate.addEventListener('change', saveSettings);

    // Button listeners
    elements.btnTranslate.addEventListener('click', translateNow);
    elements.btnRestore.addEventListener('click', restorePage);

    // API listeners
    elements.apiType.addEventListener('change', applyApiPreset);
    elements.btnTestApi.addEventListener('click', testApiConnection);
    elements.btnToggleKey.addEventListener('click', toggleKeyVisibility);

    // Save settings on change
    const inputs = [
        elements.togglePageTranslate,
        elements.toggleImageTranslate,
        elements.toggleLazyTranslate,
        elements.sourceLang,
        elements.targetLang,
        elements.apiEndpoint,
        elements.apiModel,
        elements.apiKey
    ];

    inputs.forEach(input => {
        input.addEventListener('change', saveSettings);
    });

    // Tab switching logic
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Add active class to clicked button
            btn.classList.add('active');

            // Show corresponding content
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            // Save tab state? (optional, maybe not needed for simple popup)
        });
    });
}

/**
 * Translate current page immediately
 */
async function translateNow() {
    setStatus('loading', 'Đang dịch...');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab');

        // Check if this is a valid page (not chrome://, about:, etc.)
        if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('about:') || tab.url?.startsWith('chrome-extension://')) {
            throw new Error('Không thể dịch trang này (trang hệ thống)');
        }

        const startTime = Date.now();

        // Try to send message, inject content script if needed
        let response;
        try {
            response = await chrome.tabs.sendMessage(tab.id, {
                type: 'TRANSLATE_NOW',
                options: {
                    translateText: elements.togglePageTranslate.checked,
                    translateImages: elements.toggleImageTranslate.checked,
                    sourceLang: elements.sourceLang.value,
                    targetLang: elements.targetLang.value
                }
            });
        } catch (err) {
            console.log('Juchan: Content script not loaded, injecting...');

            // Inject content script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/content.js']
            });
            await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: ['content/content.css']
            });

            // Wait a bit for script to initialize
            await new Promise(r => setTimeout(r, 500));

            // Retry
            response = await chrome.tabs.sendMessage(tab.id, {
                type: 'TRANSLATE_NOW',
                options: {
                    translateText: elements.togglePageTranslate.checked,
                    translateImages: elements.toggleImageTranslate.checked,
                    sourceLang: elements.sourceLang.value,
                    targetLang: elements.targetLang.value
                }
            });
        }

        if (response?.success) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            elements.statTime.textContent = `${elapsed}s`;
            setStatus('success', 'Hoàn thành');
            await updateStats();
        } else {
            throw new Error(response?.error || 'Translation failed');
        }
    } catch (error) {
        console.error('Translation error:', error);
        setStatus('error', error.message || 'Lỗi');
    }
}

/**
 * Restore original page content
 */
async function restorePage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;

        await chrome.tabs.sendMessage(tab.id, { type: 'RESTORE_PAGE' });
        setStatus('success', 'Đã khôi phục');

        // Reset stats
        elements.statTexts.textContent = '0';
        elements.statImages.textContent = '0';
        elements.statTime.textContent = '0s';
    } catch (error) {
        console.error('Restore error:', error);
    }
}

/**
 * Open settings page
 */
function openSettings() {
    chrome.runtime.openOptionsPage();
}

/**
 * Open help page
 */
function openHelp() {
    chrome.tabs.create({
        url: chrome.runtime.getURL('help/help.html')
    });
}

/**
 * Update status indicator
 */
function setStatus(type, text) {
    const statusDot = elements.statusIndicator.querySelector('.status-dot');
    const statusText = elements.statusIndicator.querySelector('.status-text');

    statusDot.className = 'status-dot';
    if (type === 'loading') {
        statusDot.classList.add('loading');
    } else if (type === 'error') {
        statusDot.classList.add('error');
    }

    statusText.textContent = text;

    // Reset to ready after 3 seconds
    if (type !== 'loading') {
        setTimeout(() => {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Sẵn sàng';
        }, 3000);
    }
}

/**
 * Update translation statistics
 */
async function updateStats() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;

        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATS' });

        if (response) {
            elements.statTexts.textContent = response.textCount || 0;
            elements.statImages.textContent = response.imageCount || 0;
        }
    } catch (error) {
        // Content script not loaded yet, ignore
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
