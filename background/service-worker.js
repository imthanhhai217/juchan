/**
 * Juchan Background Service Worker
 * Handles API calls, message routing, and extension lifecycle
 */

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('Juchan installed:', details.reason);

    // Set default settings
    const defaultSettings = {
        pageTranslate: true,
        imageTranslate: false,
        lazyTranslate: true,
        sourceLang: 'auto',
        targetLang: 'vi',
        apiEndpoint: 'http://localhost:11434/api/generate',
        apiModel: 'llama2',
        apiType: 'ollama', // ollama, openai, custom
        customPrompt: '',
        maxConcurrent: 3,
        batchSize: 10,
        cacheEnabled: true,
        cacheDuration: 86400000 // 24 hours
    };

    const result = await chrome.storage.local.get('juchanSettings');
    if (!result.juchanSettings) {
        await chrome.storage.local.set({ juchanSettings: defaultSettings });
    }

    // Initialize translation cache
    await chrome.storage.local.set({ juchanCache: {} });
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Juchan: Received message:', message.type);

    handleMessage(message, sender)
        .then(response => {
            console.log('Juchan: Response for', message.type, ':', response);
            sendResponse(response);
        })
        .catch(error => {
            console.error('Juchan: Error handling', message.type, ':', error);
            sendResponse({ success: false, error: error.message || String(error) });
        });

    return true; // Keep channel open for async response
});

/**
 * Handle incoming messages
 */
async function handleMessage(message, sender) {
    switch (message.type) {
        case 'TRANSLATE_TEXT':
            return await translateText(message.text, message.sourceLang, message.targetLang);

        case 'TRANSLATE_BATCH':
            return await translateBatch(message.texts, message.sourceLang, message.targetLang);

        case 'TRANSLATE_IMAGE':
            return await translateImage(message.imageData, message.targetLang);

        case 'GET_SETTINGS':
            return await getSettings();

        case 'SAVE_SETTINGS':
            return await saveSettings(message.settings);

        case 'CLEAR_CACHE':
            return await clearCache();

        case 'TEST_API':
            return await testApiConnection(message.endpoint, message.model, message.apiKey, message.apiType);

        default:
            throw new Error(`Unknown message type: ${message.type}`);
    }
}

/**
 * Get current settings
 */
async function getSettings() {
    const result = await chrome.storage.local.get('juchanSettings');
    return { success: true, settings: result.juchanSettings };
}

/**
 * Save settings
 */
async function saveSettings(settings) {
    const result = await chrome.storage.local.get('juchanSettings');
    const updatedSettings = { ...result.juchanSettings, ...settings };
    await chrome.storage.local.set({ juchanSettings: updatedSettings });
    return { success: true };
}

/**
 * Translate single text
 */
async function translateText(text, sourceLang, targetLang) {
    if (!text?.trim()) {
        return { success: true, translation: text };
    }

    // Check cache first
    const cached = await getCachedTranslation(text, targetLang);
    if (cached) {
        return { success: true, translation: cached, fromCache: true };
    }

    const settings = (await chrome.storage.local.get('juchanSettings')).juchanSettings;

    console.log('Juchan: translateText settings:', {
        apiType: settings?.apiType,
        apiModel: settings?.apiModel,
        hasApiKey: !!settings?.apiKey,
        targetLang
    });

    if (!settings) {
        return { success: false, error: 'Chưa có cài đặt. Vui lòng mở popup và cấu hình API.' };
    }

    try {
        const translation = await callTranslationAPI(text, sourceLang, targetLang, settings);

        // Cache the result
        if (settings.cacheEnabled) {
            await cacheTranslation(text, targetLang, translation);
        }

        return { success: true, translation };
    } catch (error) {
        console.error('Juchan: Translation error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Translate batch of texts
 */
async function translateBatch(texts, sourceLang, targetLang) {
    if (!texts?.length) {
        return { success: true, translations: [] };
    }

    const settings = (await chrome.storage.local.get('juchanSettings')).juchanSettings;
    const results = [];
    const uncached = [];
    const uncachedIndices = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
        const cached = await getCachedTranslation(texts[i], targetLang);
        if (cached) {
            results[i] = cached;
        } else {
            uncached.push(texts[i]);
            uncachedIndices.push(i);
        }
    }

    // Translate uncached texts in batches
    if (uncached.length > 0) {
        const batchSize = settings.batchSize || 10;

        for (let i = 0; i < uncached.length; i += batchSize) {
            const batch = uncached.slice(i, i + batchSize);
            const batchTranslations = await translateBatchAPI(batch, sourceLang, targetLang, settings);

            for (let j = 0; j < batchTranslations.length; j++) {
                const originalIndex = uncachedIndices[i + j];
                results[originalIndex] = batchTranslations[j];

                // Cache result
                if (settings.cacheEnabled) {
                    await cacheTranslation(uncached[i + j], targetLang, batchTranslations[j]);
                }
            }
        }
    }

    return { success: true, translations: results };
}

/**
 * Call translation API
 */
async function callTranslationAPI(text, sourceLang, targetLang, settings) {
    const { apiEndpoint, apiModel, apiType } = settings;

    console.log('Juchan: callTranslationAPI with:', { apiType, apiModel });

    const langNames = {
        'vi': 'Vietnamese',
        'en': 'English',
        'ja': 'Japanese',
        'ko': 'Korean',
        'zh': 'Chinese',
        'auto': 'auto-detect'
    };

    const prompt = buildTranslationPrompt(text, langNames[sourceLang] || sourceLang, langNames[targetLang] || targetLang);

    switch (apiType) {
        case 'ollama':
            return await callOllamaAPI(apiEndpoint, apiModel, prompt);
        case 'mymemory':
            return await callMyMemoryAPI(settings, text, sourceLang, targetLang);
        case 'openai':
            return await callOpenAIAPI(settings, prompt);
        case 'gemini':
            return await callGeminiAPI(settings, prompt);
        case 'anthropic':
            return await callAnthropicAPI(settings, prompt);
        case 'groq':
            return await callGroqAPI(settings, prompt);
        default:
            console.warn('Juchan: Unknown apiType, falling back to custom:', apiType);
            return await callCustomAPI(settings, prompt);
    }
}

/**
 * Build translation prompt
 */
function buildTranslationPrompt(text, sourceLang, targetLang) {
    return `Translate the following text from ${sourceLang} to ${targetLang}. Only return the translation, nothing else.

Text: ${text}

Translation:`;
}

/**
 * Call Ollama API
 */
async function callOllamaAPI(endpoint, model, prompt) {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            stream: false,
            options: {
                temperature: 0.3,
                top_p: 0.9
            }
        })
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response?.trim() || '';
}

/**
 * Call MyMemory Translation API (Free, no key required)
 * https://mymemory.translated.net/doc/spec.php
 */
async function callMyMemoryAPI(settings, text, sourceLang, targetLang) {
    // MyMemory uses language codes like "en|vi"
    const langCodes = {
        'vi': 'vi',
        'en': 'en',
        'ja': 'ja',
        'ko': 'ko',
        'zh': 'zh-CN',
        'auto': 'en'
    };

    const source = langCodes[sourceLang] || 'en';
    const target = langCodes[targetLang] || 'vi';

    // Build URL with query params
    const params = new URLSearchParams({
        q: text,
        langpair: `${source}|${target}`
    });

    const url = `https://api.mymemory.translated.net/get?${params.toString()}`;

    console.log('Juchan: Calling MyMemory API', { url: url.substring(0, 100), source, target, textLength: text.length });

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`MyMemory API error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();

        if (data.responseStatus !== 200) {
            throw new Error(`MyMemory error: ${data.responseDetails || 'Unknown error'}`);
        }

        console.log('Juchan: MyMemory success, translated:', data.responseData?.translatedText?.substring(0, 50));
        return data.responseData?.translatedText || '';
    } catch (err) {
        console.error('Juchan: MyMemory fetch error:', err);
        throw new Error(`MyMemory API lỗi: ${err.message}`);
    }
}

/**
 * Call OpenAI-compatible API
 */
async function callOpenAIAPI(settings, prompt) {
    const response = await fetch(settings.apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey || ''}`
        },
        body: JSON.stringify({
            model: settings.apiModel,
            messages: [
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 1000
        })
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Call Google Gemini API
 */
async function callGeminiAPI(settings, prompt) {
    if (!settings.apiKey) {
        throw new Error('Gemini API cần API key. Lấy key tại: https://aistudio.google.com/app/apikey');
    }

    // Normalize model name - use gemini-pro for compatibility
    let model = settings.apiModel || 'gemini-pro';

    // Map common model names to their actual API names
    const modelMappings = {
        'gemini-flash': 'gemini-1.5-flash-latest',
        'gemini-1.5-flash': 'gemini-1.5-flash-latest',
        'gemini-1.5-pro': 'gemini-1.5-pro-latest',
        'flash': 'gemini-1.5-flash-latest',
        'pro': 'gemini-pro'
    };

    if (modelMappings[model]) {
        model = modelMappings[model];
    }

    // Use v1beta for all models (more stable and widely available)
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`;

    console.log('Juchan: Calling Gemini API', { model, endpoint: endpoint.replace(settings.apiKey, '***') });

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1000
            }
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errorMsg = error.error?.message || response.statusText;

        // Provide helpful suggestions
        if (response.status === 404) {
            throw new Error(`Model "${model}" không tồn tại. Thử dùng: gemini-pro hoặc gemini-1.5-flash-latest`);
        }
        throw new Error(`Gemini API error: ${response.status} - ${errorMsg}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

/**
 * Call Anthropic Claude API
 */
async function callAnthropicAPI(settings, prompt) {
    const response = await fetch(settings.apiEndpoint || 'https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: settings.apiModel || 'claude-3-haiku-20240307',
            max_tokens: 1000,
            messages: [
                { role: 'user', content: prompt }
            ]
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Claude API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text?.trim() || '';
}

/**
 * Call Groq API (OpenAI-compatible)
 */
async function callGroqAPI(settings, prompt) {
    const response = await fetch(settings.apiEndpoint || 'https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.apiModel || 'llama2-70b-4096',
            messages: [
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 1000
        })
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Groq API error: ${response.status} - ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
}

/**
 * Call custom API
 */
async function callCustomAPI(settings, prompt) {
    const response = await fetch(settings.apiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(settings.apiKey ? { 'Authorization': `Bearer ${settings.apiKey}` } : {})
        },
        body: JSON.stringify({
            prompt: prompt,
            model: settings.apiModel
        })
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    // Try common response formats
    return data.response || data.text || data.output || data.result || '';
}

/**
 * Translate batch using API
 */
async function translateBatchAPI(texts, sourceLang, targetLang, settings) {
    const langNames = {
        'vi': 'Vietnamese',
        'en': 'English',
        'ja': 'Japanese',
        'ko': 'Korean',
        'zh': 'Chinese',
        'auto': 'auto-detect'
    };

    const numberedTexts = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

    const prompt = `Translate each of the following texts from ${langNames[sourceLang] || sourceLang} to ${langNames[targetLang] || targetLang}. Return only the translations in the same numbered format.

${numberedTexts}

Translations:`;

    let response;
    switch (settings.apiType) {
        case 'ollama':
            response = await callOllamaAPI(settings.apiEndpoint, settings.apiModel, prompt);
            break;
        case 'mymemory':
            // MyMemory doesn't support batch, translate individually
            const mmTranslations = [];
            for (const text of texts) {
                const t = await callMyMemoryAPI(settings, text, sourceLang, targetLang);
                mmTranslations.push(t);
            }
            return mmTranslations;
        case 'openai':
            response = await callOpenAIAPI(settings, prompt);
            break;
        case 'gemini':
            response = await callGeminiAPI(settings, prompt);
            break;
        case 'anthropic':
            response = await callAnthropicAPI(settings, prompt);
            break;
        case 'groq':
            response = await callGroqAPI(settings, prompt);
            break;
        default:
            response = await callCustomAPI(settings, prompt);
    }

    // Parse numbered responses
    const lines = response.split('\n').filter(l => l.trim());
    const translations = [];

    for (const line of lines) {
        const match = line.match(/^\d+\.\s*(.+)$/);
        if (match) {
            translations.push(match[1].trim());
        }
    }

    // Fallback: if parsing failed, translate individually
    if (translations.length !== texts.length) {
        const individualTranslations = [];
        for (const text of texts) {
            const translation = await callTranslationAPI(text, sourceLang, targetLang, settings);
            individualTranslations.push(translation);
        }
        return individualTranslations;
    }

    return translations;
}

/**
 * Translate image (OCR + Translation)
 */
async function translateImage(imageData, targetLang) {
    const settings = (await chrome.storage.local.get('juchanSettings')).juchanSettings;

    const prompt = `This is an image containing text (possibly manga/comic speech bubbles or other text). 
Please:
1. Identify all text regions in the image
2. For each text region, provide:
   - The approximate position (top, left, width, height as percentages)
   - The original text
   - The translation to ${targetLang}

Return the result as JSON array:
[
  {
    "position": {"top": 10, "left": 20, "width": 30, "height": 15},
    "original": "original text",
    "translation": "translated text"
  }
]

Only return the JSON, nothing else.`;

    try {
        let response;

        if (settings.apiType === 'ollama') {
            // Ollama with vision model (llava, etc.)
            response = await fetch(settings.apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: settings.visionModel || 'llava',
                    prompt: prompt,
                    images: [imageData.split(',')[1]], // Remove data:image/... prefix
                    stream: false
                })
            });
        } else if (settings.apiType === 'openai') {
            // OpenAI Vision API
            response = await fetch(settings.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.apiKey}`
                },
                body: JSON.stringify({
                    model: settings.visionModel || 'gpt-4-vision-preview',
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: imageData } }
                        ]
                    }],
                    max_tokens: 2000
                })
            });
        } else {
            throw new Error('Image translation requires vision-capable model');
        }

        if (!response.ok) {
            throw new Error(`Vision API error: ${response.status}`);
        }

        const data = await response.json();
        let result;

        if (settings.apiType === 'ollama') {
            result = data.response;
        } else {
            result = data.choices?.[0]?.message?.content;
        }

        // Parse JSON response
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const textRegions = JSON.parse(jsonMatch[0]);
            return { success: true, textRegions };
        }

        return { success: false, error: 'Could not parse image translation result' };
    } catch (error) {
        console.error('Image translation error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get cached translation
 */
async function getCachedTranslation(text, targetLang) {
    const result = await chrome.storage.local.get('juchanCache');
    const cache = result.juchanCache || {};
    const key = `${targetLang}:${text}`;
    const entry = cache[key];

    if (entry) {
        const settings = (await chrome.storage.local.get('juchanSettings')).juchanSettings;
        const isExpired = Date.now() - entry.timestamp > (settings.cacheDuration || 86400000);

        if (!isExpired) {
            return entry.translation;
        }
    }

    return null;
}

/**
 * Cache translation
 */
async function cacheTranslation(text, targetLang, translation) {
    const result = await chrome.storage.local.get('juchanCache');
    const cache = result.juchanCache || {};
    const key = `${targetLang}:${text}`;

    cache[key] = {
        translation,
        timestamp: Date.now()
    };

    await chrome.storage.local.set({ juchanCache: cache });
}

/**
 * Clear translation cache
 */
async function clearCache() {
    await chrome.storage.local.set({ juchanCache: {} });
    return { success: true };
}

/**
 * Test API connection
 */
async function testApiConnection(endpoint, model, apiKey, apiType) {
    const testPrompt = 'Say "OK" if you can read this.';
    const testSettings = {
        apiEndpoint: endpoint,
        apiModel: model,
        apiKey: apiKey,
        apiType: apiType
    };

    try {
        let response;
        switch (apiType) {
            case 'ollama':
                response = await callOllamaAPI(endpoint, model, testPrompt);
                break;
            case 'mymemory':
                response = await callMyMemoryAPI(testSettings, 'Hello', 'en', 'vi');
                break;
            case 'openai':
                response = await callOpenAIAPI(testSettings, testPrompt);
                break;
            case 'gemini':
                response = await callGeminiAPI(testSettings, testPrompt);
                break;
            case 'anthropic':
                response = await callAnthropicAPI(testSettings, testPrompt);
                break;
            case 'groq':
                response = await callGroqAPI(testSettings, testPrompt);
                break;
            default:
                response = await callCustomAPI(testSettings, testPrompt);
        }
        return { success: true, response };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Context menu for quick translation
chrome.contextMenus?.create({
    id: 'juchan-translate-selection',
    title: 'Dịch với Juchan',
    contexts: ['selection']
});

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'juchan-translate-selection' && info.selectionText) {
        const settings = (await chrome.storage.local.get('juchanSettings')).juchanSettings;
        const result = await translateText(info.selectionText, 'auto', settings.targetLang);

        if (result.success && tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'SHOW_TRANSLATION_POPUP',
                original: info.selectionText,
                translation: result.translation
            });
        }
    }
});
