/**
 * Juchan Options Page Script
 * Handles settings management and API testing
 */

// DOM Elements
const elements = {
    // API Config
    apiType: document.getElementById('apiType'),
    apiEndpoint: document.getElementById('apiEndpoint'),
    apiModel: document.getElementById('apiModel'),
    visionModel: document.getElementById('visionModel'),
    visionModelGroup: document.getElementById('visionModelGroup'),
    apiKey: document.getElementById('apiKey'),
    apiKeyGroup: document.getElementById('apiKeyGroup'),

    // Translation Settings
    defaultSourceLang: document.getElementById('defaultSourceLang'),
    defaultTargetLang: document.getElementById('defaultTargetLang'),
    batchSize: document.getElementById('batchSize'),
    maxConcurrent: document.getElementById('maxConcurrent'),

    // Advanced Settings
    cacheEnabled: document.getElementById('cacheEnabled'),
    cacheDuration: document.getElementById('cacheDuration'),
    customPrompt: document.getElementById('customPrompt'),
    excludedSites: document.getElementById('excludedSites'),

    // Buttons
    btnTestApi: document.getElementById('btnTestApi'),
    btnClearCache: document.getElementById('btnClearCache'),
    btnSave: document.getElementById('btnSave'),
    btnReset: document.getElementById('btnReset'),

    // Other
    testResult: document.getElementById('testResult'),
    toast: document.getElementById('toast')
};

// Default settings
const defaultSettings = {
    apiType: 'ollama',
    apiEndpoint: 'http://localhost:11434/api/generate',
    apiModel: 'llama2',
    visionModel: 'llava',
    apiKey: '',
    sourceLang: 'auto',
    targetLang: 'vi',
    batchSize: 10,
    maxConcurrent: 3,
    cacheEnabled: true,
    cacheDuration: 86400000, // 24 hours in ms
    customPrompt: '',
    excludedSites: '',
    pageTranslate: true,
    imageTranslate: false,
    lazyTranslate: true
};

// API Presets with endpoints and available models
const apiPresets = {
    ollama: {
        endpoint: 'http://localhost:11434/api/generate',
        models: ['llama2', 'llama3', 'mistral', 'qwen2', 'qwen2:1.5b', 'phi3', 'gemma'],
        defaultModel: 'llama2',
        needsKey: false,
        visionModels: ['llava', 'bakllava', 'llava-phi3']
    },
    mymemory: {
        endpoint: 'https://api.mymemory.translated.net/get',
        models: ['(Không cần)'],
        defaultModel: '(Không cần)',
        needsKey: false,
        visionModels: []
    },
    openai: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
        defaultModel: 'gpt-3.5-turbo',
        needsKey: true,
        visionModels: ['gpt-4-vision-preview', 'gpt-4o']
    },
    gemini: {
        endpoint: '(Tự động)',
        models: ['gemini-pro', 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro', 'gemini-2.0-flash'],
        defaultModel: 'gemini-pro',
        needsKey: true,
        visionModels: ['gemini-pro-vision', 'gemini-1.5-flash']
    },
    anthropic: {
        endpoint: 'https://api.anthropic.com/v1/messages',
        models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229', 'claude-3-5-sonnet-20241022'],
        defaultModel: 'claude-3-haiku-20240307',
        needsKey: true,
        visionModels: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229']
    },
    groq: {
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
        defaultModel: 'llama-3.3-70b-versatile',
        needsKey: true,
        visionModels: []
    },
    custom: {
        endpoint: '',
        models: [],
        defaultModel: '',
        needsKey: true,
        visionModels: []
    }
};

/**
 * Initialize options page
 */
async function init() {
    await loadSettings();
    setupEventListeners();
}

/**
 * Load settings from storage
 */
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get('juchanSettings');
        const settings = { ...defaultSettings, ...result.juchanSettings };

        // Populate form
        elements.apiType.value = settings.apiType;
        elements.apiEndpoint.value = settings.apiEndpoint;

        // Pass saved models to populate function
        updateUIVisibility(settings.apiModel, settings.visionModel);

        elements.apiKey.value = settings.apiKey || '';
        elements.defaultSourceLang.value = settings.sourceLang;
        elements.defaultTargetLang.value = settings.targetLang;
        elements.batchSize.value = settings.batchSize;
        elements.maxConcurrent.value = settings.maxConcurrent;
        elements.cacheEnabled.checked = settings.cacheEnabled;
        elements.cacheDuration.value = Math.round(settings.cacheDuration / 3600000); // Convert to hours
        elements.customPrompt.value = settings.customPrompt || '';
        elements.excludedSites.value = settings.excludedSites || '';
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Không thể tải cài đặt', 'error');
    }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
    try {
        const settings = {
            apiType: elements.apiType.value,
            apiEndpoint: elements.apiEndpoint.value.trim(),
            apiModel: elements.apiModel.value.trim(),
            visionModel: elements.visionModel.value.trim(),
            apiKey: elements.apiKey.value.trim(),
            sourceLang: elements.defaultSourceLang.value,
            targetLang: elements.defaultTargetLang.value,
            batchSize: parseInt(elements.batchSize.value) || 10,
            maxConcurrent: parseInt(elements.maxConcurrent.value) || 3,
            cacheEnabled: elements.cacheEnabled.checked,
            cacheDuration: (parseInt(elements.cacheDuration.value) || 24) * 3600000, // Convert to ms
            customPrompt: elements.customPrompt.value.trim(),
            excludedSites: elements.excludedSites.value.trim(),
            // Preserve existing toggle states
            pageTranslate: true,
            imageTranslate: false,
            lazyTranslate: true
        };

        // Validate
        if (!settings.apiEndpoint) {
            showToast('Vui lòng nhập API Endpoint', 'error');
            return;
        }

        if (!settings.apiModel) {
            showToast('Vui lòng nhập tên Model', 'error');
            return;
        }

        // Merge with existing settings to preserve popup toggles
        const existing = await chrome.storage.local.get('juchanSettings');
        const merged = { ...existing.juchanSettings, ...settings };

        await chrome.storage.local.set({ juchanSettings: merged });
        showToast('Đã lưu cài đặt', 'success');
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Không thể lưu cài đặt', 'error');
    }
}

/**
 * Reset settings to default
 */
async function resetSettings() {
    if (!confirm('Bạn có chắc muốn đặt lại tất cả cài đặt về mặc định?')) {
        return;
    }

    try {
        await chrome.storage.local.set({ juchanSettings: defaultSettings });
        await loadSettings();
        updateUIVisibility();
        showToast('Đã đặt lại cài đặt', 'success');
    } catch (error) {
        console.error('Error resetting settings:', error);
        showToast('Không thể đặt lại cài đặt', 'error');
    }
}

/**
 * Test API connection
 */
async function testApiConnection() {
    elements.btnTestApi.disabled = true;
    elements.btnTestApi.innerHTML = '<span class="btn-icon">⏳</span> Đang test...';
    elements.testResult.textContent = '';
    elements.testResult.className = 'test-result';

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'TEST_API',
            endpoint: elements.apiEndpoint.value.trim(),
            model: elements.apiModel.value.trim(),
            apiKey: elements.apiKey.value.trim(),
            apiType: elements.apiType.value
        });

        if (response.success) {
            elements.testResult.textContent = '✓ Kết nối thành công!';
            elements.testResult.className = 'test-result success';
        } else {
            elements.testResult.textContent = `✗ Lỗi: ${response.error}`;
            elements.testResult.className = 'test-result error';
        }
    } catch (error) {
        elements.testResult.textContent = `✗ Lỗi: ${error.message}`;
        elements.testResult.className = 'test-result error';
    } finally {
        elements.btnTestApi.disabled = false;
        elements.btnTestApi.innerHTML = '<span class="btn-icon">🔍</span> Test Kết Nối';
    }
}

/**
 * Clear translation cache
 */
async function clearCache() {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ cache dịch?')) {
        return;
    }

    try {
        await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
        showToast('Đã xóa cache', 'success');
    } catch (error) {
        console.error('Error clearing cache:', error);
        showToast('Không thể xóa cache', 'error');
    }
}

/**
 * Update UI visibility based on API type
 */
/**
 * Update UI visibility based on API type
 */
function updateUIVisibility(preferredModel = null, preferredVisionModel = null) {
    const apiType = elements.apiType.value;
    const preset = apiPresets[apiType];

    if (!preset) return;

    // Auto-fill endpoint
    if (preset.endpoint) {
        elements.apiEndpoint.value = preset.endpoint;
    }

    // Populate Model Select
    populateSelect(elements.apiModel, preset.models, preferredModel || preset.defaultModel);

    // Populate Vision Model Select
    populateSelect(elements.visionModel, preset.visionModels, preferredVisionModel || preset.visionModels[0]);

    // Update API key placeholder
    const apiKeyPlaceholders = {
        'ollama': 'Không cần API key (local)',
        'mymemory': 'Không cần API key (free)',
        'openai': 'sk-... (OpenAI API key)',
        'gemini': 'AIza... (Google API key)',
        'anthropic': 'sk-ant-... (Claude API key)',
        'groq': 'gsk_... (Groq API key)',
        'custom': 'Nhập API key nếu cần'
    };
    elements.apiKey.placeholder = apiKeyPlaceholders[apiType] || 'Nhập API key';

    // Update endpoint placeholder
    const endpointPlaceholders = {
        'ollama': 'http://localhost:11434/api/generate',
        'mymemory': '(Tự động)',
        'openai': 'https://api.openai.com/v1/chat/completions',
        'gemini': '(Tự động - chỉ cần nhập API Key)',
        'anthropic': 'https://api.anthropic.com/v1/messages',
        'groq': 'https://api.groq.com/openai/v1/chat/completions',
        'custom': 'https://your-api-endpoint.com/translate'
    };
    elements.apiEndpoint.placeholder = endpointPlaceholders[apiType] || '';

    // Show/hide fields based on API type
    const endpointGroup = elements.apiEndpoint.closest('.form-group');
    const modelGroup = elements.apiModel.closest('.form-group');
    const keyGroup = elements.apiKeyGroup || elements.apiKey.closest('.form-group');
    const visionGroup = elements.visionModelGroup;

    if (apiType === 'mymemory') {
        if (endpointGroup) endpointGroup.style.display = 'none';
        if (modelGroup) modelGroup.style.display = 'none';
        if (keyGroup) keyGroup.style.display = 'none';
        if (visionGroup) visionGroup.style.display = 'none';
    } else if (apiType === 'gemini') {
        if (endpointGroup) endpointGroup.style.display = 'none';
        if (modelGroup) modelGroup.style.display = 'block';
        if (keyGroup) keyGroup.style.display = 'block';
        if (visionGroup) visionGroup.style.display = 'block';
    } else if (apiType === 'ollama') {
        if (endpointGroup) endpointGroup.style.display = 'block';
        if (modelGroup) modelGroup.style.display = 'block';
        if (keyGroup) keyGroup.style.display = 'none';
        if (visionGroup) visionGroup.style.display = 'block';
    } else if (apiType === 'groq') {
        if (endpointGroup) endpointGroup.style.display = 'block';
        if (modelGroup) modelGroup.style.display = 'block';
        if (keyGroup) keyGroup.style.display = 'block';
        if (visionGroup) visionGroup.style.display = 'none';
    } else {
        if (endpointGroup) endpointGroup.style.display = 'block';
        if (modelGroup) modelGroup.style.display = 'block';
        if (keyGroup) keyGroup.style.display = 'block';
        if (visionGroup) visionGroup.style.display = 'block';
    }
}

/**
 * Populate select element with options
 */
function populateSelect(selectElement, options, selectedValue) {
    if (!selectElement) return;

    selectElement.innerHTML = ''; // Clear existing options

    if (!options || options.length === 0) {
        // If Custom or no options, maybe allow typing (but it's a select...)
        // For now add a placeholder
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- Custom (Nhập trong code) --';
        selectElement.appendChild(opt);
        return;
    }

    options.forEach(optValue => {
        const option = document.createElement('option');
        option.value = optValue;
        option.textContent = optValue;
        selectElement.appendChild(option);
    });

    if (selectedValue && options.includes(selectedValue)) {
        selectElement.value = selectedValue;
    } else if (options.length > 0) {
        selectElement.value = options[0];
    }
}


/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    const toast = elements.toast;
    const icon = toast.querySelector('.toast-icon');
    const msg = toast.querySelector('.toast-message');

    icon.textContent = type === 'success' ? '✓' : '✗';
    msg.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // API type change
    elements.apiType.addEventListener('change', updateUIVisibility);

    // Buttons
    elements.btnTestApi.addEventListener('click', testApiConnection);
    elements.btnClearCache.addEventListener('click', clearCache);
    elements.btnSave.addEventListener('click', saveSettings);
    elements.btnReset.addEventListener('click', resetSettings);

    // Links
    document.getElementById('linkHelp')?.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL('help/help.html') });
    });

    document.getElementById('linkAbout')?.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Juchan v1.0.0\n\n🌸 AI Auto Translator\nDịch tự động trang web và ảnh bằng AI LLM.\n\nMade with ❤️');
    });

    // Auto-save on enter key
    document.querySelectorAll('input[type="text"], input[type="url"], input[type="number"]').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveSettings();
            }
        });
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
