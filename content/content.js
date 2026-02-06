/**
 * Juchan Content Script
 * Handles DOM manipulation, text extraction, and overlay rendering
 */

(() => {
    'use strict';

    // State management
    const state = {
        settings: null,
        isTranslating: false,
        translatedElements: new Map(),
        translatedImages: new Map(),
        originalContents: new Map(),
        observer: null,
        scrollObserver: null,
        stats: {
            textCount: 0,
            imageCount: 0
        }
    };

    // Configuration
    const config = {
        minTextLength: 2,
        maxTextLength: 5000,
        excludeTags: ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'CANVAS', 'SVG', 'CODE', 'PRE'],
        excludeClasses: ['juchan-overlay', 'juchan-translated', 'notranslate'],
        batchDelay: 100,
        scrollDebounce: 200
    };

    /**
     * Initialize content script
     */
    async function init() {
        await loadSettings();
        setupMessageListener();

        if (state.settings?.lazyTranslate) {
            setupScrollObserver();
        }

        if (state.settings?.pageTranslate) {
            setupMutationObserver();
        }

        console.log('🌸 Juchan initialized');
    }

    /**
     * Load settings from storage
     */
    async function loadSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
            state.settings = response.settings;
        } catch (error) {
            console.error('Failed to load settings:', error);
            state.settings = {
                pageTranslate: true,
                imageTranslate: false,
                lazyTranslate: true,
                sourceLang: 'auto',
                targetLang: 'vi'
            };
        }
    }

    /**
     * Setup message listener
     */
    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            handleMessage(message).then(sendResponse).catch(error => {
                console.error('Message error:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true;
        });
    }

    /**
     * Handle incoming messages
     */
    async function handleMessage(message) {
        console.log('🌸 Juchan: Received message:', message.type, message);

        switch (message.type) {
            case 'TRANSLATE_NOW':
                console.log('🌸 Juchan: Starting translation with options:', message.options);
                return await translatePage(message.options);

            case 'RESTORE_PAGE':
                return restorePage();

            case 'GET_STATS':
                return state.stats;

            case 'SETTINGS_UPDATED':
                state.settings = { ...state.settings, ...message.settings };
                return { success: true };

            case 'SHOW_TRANSLATION_POPUP':
                showTranslationPopup(message.original, message.translation);
                return { success: true };

            default:
                return { success: false, error: 'Unknown message type' };
        }
    }

    /**
     * Translate entire page
     */
    async function translatePage(options) {
        console.log('🌸 Juchan: translatePage called with options:', options);

        if (state.isTranslating) {
            console.log('🌸 Juchan: Already translating, skipping');
            return { success: false, error: 'Translation in progress' };
        }

        state.isTranslating = true;
        state.stats = { textCount: 0, imageCount: 0 };

        try {
            if (options.translateText) {
                console.log('🌸 Juchan: Translating text nodes...');
                await translateTextNodes();
            } else {
                console.log('🌸 Juchan: Text translation disabled');
            }

            if (options.translateImages) {
                console.log('🌸 Juchan: Translating images...');
                await translateImages();
            }

            console.log('🌸 Juchan: translatePage complete, stats:', state.stats);
            return { success: true, stats: state.stats };
        } catch (error) {
            console.error('🌸 Juchan: Translation error:', error);
            return { success: false, error: error.message };
        } finally {
            state.isTranslating = false;
        }
    }

    /**
     * Find and translate text nodes
     */
    async function translateTextNodes() {
        const textNodes = findTextNodes(document.body);
        const textsToTranslate = [];
        const nodesToUpdate = [];

        console.log('🌸 Juchan: Found', textNodes.length, 'text nodes');

        for (const node of textNodes) {
            const text = node.textContent.trim();

            if (!shouldTranslateText(text)) continue;
            if (state.translatedElements.has(node)) continue;

            // Store original content
            if (!state.originalContents.has(node)) {
                state.originalContents.set(node, node.textContent);
            }

            textsToTranslate.push(text);
            nodesToUpdate.push(node);
        }

        console.log('🌸 Juchan: Texts to translate:', textsToTranslate.length);
        if (textsToTranslate.length === 0) {
            console.log('🌸 Juchan: No texts to translate');
            return;
        }

        // Batch translate
        console.log('🌸 Juchan: Sending to background for translation...');
        const response = await chrome.runtime.sendMessage({
            type: 'TRANSLATE_BATCH',
            texts: textsToTranslate,
            sourceLang: state.settings.sourceLang,
            targetLang: state.settings.targetLang
        });

        console.log('🌸 Juchan: Translation response:', response);

        if (response && response.success && response.translations) {
            console.log('🌸 Juchan: Applying', response.translations.length, 'translations');
            for (let i = 0; i < nodesToUpdate.length; i++) {
                const node = nodesToUpdate[i];
                const translation = response.translations[i];

                if (translation) {
                    applyTextTranslation(node, translation);
                    state.translatedElements.set(node, true);
                    state.stats.textCount++;
                }
            }
            console.log('🌸 Juchan: Translation complete! Stats:', state.stats);
        } else {
            console.error('🌸 Juchan: Translation failed:', response?.error || 'Unknown error');
        }
    }

    /**
     * Find all text nodes in element
     */
    function findTextNodes(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: (node) => {
                    const parent = node.parentElement;
                    if (!parent) return NodeFilter.FILTER_REJECT;

                    // Skip excluded tags
                    if (config.excludeTags.includes(parent.tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    // Skip excluded classes
                    for (const cls of config.excludeClasses) {
                        if (parent.classList.contains(cls)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                    }

                    // Skip empty or whitespace-only
                    if (!node.textContent.trim()) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        return textNodes;
    }

    /**
     * Check if text should be translated
     */
    function shouldTranslateText(text) {
        if (!text) return false;
        if (text.length < config.minTextLength) return false;
        if (text.length > config.maxTextLength) return false;

        // Skip if mostly numbers/symbols
        const alphaRatio = (text.match(/[a-zA-Z\u00C0-\u024F\u1100-\u11FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g) || []).length / text.length;
        if (alphaRatio < 0.3) return false;

        return true;
    }

    /**
     * Apply translation to text node
     */
    function applyTextTranslation(node, translation) {
        const parent = node.parentElement;
        if (!parent) return;

        // Add translated class
        parent.classList.add('juchan-translated');

        // Store original as data attribute
        parent.dataset.juchanOriginal = node.textContent;

        // Replace text
        node.textContent = translation;
    }

    /**
     * Translate images with text
     */
    async function translateImages() {
        const images = document.querySelectorAll('img:not(.juchan-processed)');

        for (const img of images) {
            await translateImage(img);
        }
    }

    /**
     * Translate single image
     */
    async function translateImage(img) {
        if (!img.complete || !img.naturalWidth) return;
        if (img.naturalWidth < 100 || img.naturalHeight < 100) return;

        try {
            // Get image as base64
            const imageData = await getImageData(img);
            if (!imageData) return;

            // Send to background for OCR + translation
            const response = await chrome.runtime.sendMessage({
                type: 'TRANSLATE_IMAGE',
                imageData,
                targetLang: state.settings.targetLang
            });

            if (response.success && response.textRegions?.length) {
                applyImageTranslations(img, response.textRegions);
                img.classList.add('juchan-processed');
                state.stats.imageCount++;
                state.translatedImages.set(img, response.textRegions);
            }
        } catch (error) {
            console.error('Image translation error:', error);
        }
    }

    /**
     * Get image as base64 data URL
     */
    async function getImageData(img) {
        return new Promise((resolve) => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                resolve(canvas.toDataURL('image/jpeg', 0.8));
            } catch (error) {
                // CORS error - try fetch
                fetch(img.src)
                    .then(res => res.blob())
                    .then(blob => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    })
                    .catch(() => resolve(null));
            }
        });
    }

    /**
     * Apply translations to image
     */
    function applyImageTranslations(img, textRegions) {
        // Create container for overlays
        const container = document.createElement('div');
        container.className = 'juchan-image-container';
        container.style.cssText = `
      position: relative;
      display: inline-block;
      width: ${img.offsetWidth}px;
      height: ${img.offsetHeight}px;
    `;

        // Wrap image
        img.parentNode.insertBefore(container, img);
        container.appendChild(img);
        img.style.display = 'block';

        // Create overlays for each text region
        for (const region of textRegions) {
            const overlay = createTextOverlay(region, img);
            container.appendChild(overlay);
        }
    }

    /**
     * Create text overlay for translated region
     */
    function createTextOverlay(region, img) {
        const overlay = document.createElement('div');
        overlay.className = 'juchan-overlay juchan-text-overlay';

        const { position, translation, original } = region;

        overlay.style.cssText = `
      position: absolute;
      top: ${position.top}%;
      left: ${position.left}%;
      width: ${position.width}%;
      min-height: ${position.height}%;
      background: rgba(255, 255, 255, 0.95);
      color: #000;
      font-size: ${calculateFontSize(position, img)}px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      z-index: 1000;
      pointer-events: auto;
      cursor: pointer;
      transition: all 0.2s ease;
    `;

        overlay.textContent = translation;
        overlay.title = `Original: ${original}`;

        // Toggle original on click
        overlay.addEventListener('click', () => {
            const isShowingOriginal = overlay.dataset.showOriginal === 'true';
            overlay.textContent = isShowingOriginal ? translation : original;
            overlay.dataset.showOriginal = !isShowingOriginal;
        });

        return overlay;
    }

    /**
     * Calculate appropriate font size for overlay
     */
    function calculateFontSize(position, img) {
        const regionHeight = (position.height / 100) * img.offsetHeight;
        const baseFontSize = Math.max(10, Math.min(regionHeight * 0.6, 20));
        return Math.round(baseFontSize);
    }

    /**
     * Restore original page content
     */
    function restorePage() {
        // Restore text nodes
        for (const [node, original] of state.originalContents) {
            if (node.parentElement) {
                node.textContent = original;
                node.parentElement.classList.remove('juchan-translated');
                delete node.parentElement.dataset.juchanOriginal;
            }
        }

        // Remove image overlays
        document.querySelectorAll('.juchan-image-container').forEach(container => {
            const img = container.querySelector('img');
            if (img) {
                container.parentNode.insertBefore(img, container);
                img.classList.remove('juchan-processed');
            }
            container.remove();
        });

        // Clear state
        state.translatedElements.clear();
        state.translatedImages.clear();
        state.originalContents.clear();
        state.stats = { textCount: 0, imageCount: 0 };

        return { success: true };
    }

    /**
     * Setup scroll observer for lazy translation
     */
    function setupScrollObserver() {
        let scrollTimeout;
        const observedElements = new WeakSet();

        state.scrollObserver = new IntersectionObserver((entries) => {
            const visibleElements = entries
                .filter(e => e.isIntersecting)
                .map(e => e.target);

            if (visibleElements.length === 0) return;

            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(async () => {
                if (!state.settings?.pageTranslate || state.isTranslating) return;

                const textsToTranslate = [];
                const nodesToUpdate = [];

                for (const element of visibleElements) {
                    if (state.translatedElements.has(element)) continue;

                    const textNodes = findTextNodes(element);
                    for (const node of textNodes) {
                        const text = node.textContent.trim();
                        if (!shouldTranslateText(text)) continue;
                        if (state.translatedElements.has(node)) continue;

                        if (!state.originalContents.has(node)) {
                            state.originalContents.set(node, node.textContent);
                        }

                        textsToTranslate.push(text);
                        nodesToUpdate.push(node);
                    }
                }

                if (textsToTranslate.length > 0) {
                    const response = await chrome.runtime.sendMessage({
                        type: 'TRANSLATE_BATCH',
                        texts: textsToTranslate,
                        sourceLang: state.settings.sourceLang,
                        targetLang: state.settings.targetLang
                    });

                    if (response.success) {
                        for (let i = 0; i < nodesToUpdate.length; i++) {
                            const node = nodesToUpdate[i];
                            const translation = response.translations[i];

                            if (translation) {
                                applyTextTranslation(node, translation);
                                state.translatedElements.set(node, true);
                                state.stats.textCount++;
                            }
                        }
                    }
                }

                // Handle images
                if (state.settings?.imageTranslate) {
                    for (const element of visibleElements) {
                        if (element.tagName === 'IMG' && !state.translatedImages.has(element)) {
                            await translateImage(element);
                        }
                    }
                }
            }, config.scrollDebounce);
        }, {
            rootMargin: '100px',
            threshold: 0.1
        });

        // Observe all major content elements
        const elementsToObserve = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, a, img');
        elementsToObserve.forEach(el => {
            if (!observedElements.has(el)) {
                state.scrollObserver.observe(el);
                observedElements.add(el);
            }
        });
    }

    /**
     * Setup mutation observer for dynamic content
     */
    function setupMutationObserver() {
        state.observer = new MutationObserver((mutations) => {
            if (!state.settings?.pageTranslate) return;

            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Observe new elements for lazy translation
                        if (state.scrollObserver) {
                            const elements = node.querySelectorAll?.('p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, a, img') || [];
                            elements.forEach(el => state.scrollObserver.observe(el));
                            if (node.matches?.('p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, a, img')) {
                                state.scrollObserver.observe(node);
                            }
                        }
                    }
                }
            }
        });

        state.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Show translation popup
     */
    function showTranslationPopup(original, translation) {
        // Remove existing popup
        const existing = document.querySelector('.juchan-popup');
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.className = 'juchan-overlay juchan-popup';
        popup.innerHTML = `
      <div class="juchan-popup-header">
        <span>🌸 Juchan</span>
        <button class="juchan-popup-close">×</button>
      </div>
      <div class="juchan-popup-content">
        <div class="juchan-popup-original">
          <label>Gốc:</label>
          <p>${escapeHtml(original)}</p>
        </div>
        <div class="juchan-popup-translation">
          <label>Dịch:</label>
          <p>${escapeHtml(translation)}</p>
        </div>
      </div>
    `;

        document.body.appendChild(popup);

        // Position near selection
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            popup.style.position = 'fixed';
            popup.style.top = `${Math.min(rect.bottom + 10, window.innerHeight - popup.offsetHeight - 20)}px`;
            popup.style.left = `${Math.min(rect.left, window.innerWidth - popup.offsetWidth - 20)}px`;
        }

        // Close button
        popup.querySelector('.juchan-popup-close').addEventListener('click', () => {
            popup.remove();
        });

        // Auto-close after 10s
        setTimeout(() => popup.remove(), 10000);
    }

    /**
     * Escape HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
