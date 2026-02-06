# Juchan - AI Auto Translator 🌸

Chrome extension dịch tự động trang web và ảnh (manga/comic) sử dụng AI LLM.

## ✨ Tính năng

- **📝 Dịch văn bản** - Tự động dịch và đè text lên trang web
- **🖼️ Dịch ảnh** - OCR và dịch text trong ảnh, overlay đúng vị trí (manga, comic)
- **🔄 Lazy Translate** - Chỉ dịch khi cuộn vào viewport, tiết kiệm API
- **🤖 AI LLM Local** - Sử dụng Ollama hoặc OpenAI API

## 🚀 Cài đặt

### Bước 1: Chuẩn bị Icons
Do Chrome yêu cầu PNG icons, bạn cần convert các file SVG sang PNG:

```bash
# Cài đặt sharp-cli
npm install -g sharp-cli

# Convert icons
cd D:\Learning\Juchan\icons
sharp -i icon16.svg -o icon16.png
sharp -i icon32.svg -o icon32.png
sharp -i icon48.svg -o icon48.png
sharp -i icon128.svg -o icon128.png
```

Hoặc sử dụng công cụ online như [CloudConvert](https://cloudconvert.com/svg-to-png).

### Bước 2: Cài đặt Ollama (Khuyến nghị)

1. Tải Ollama từ [ollama.ai](https://ollama.ai)
2. Cài đặt và khởi động
3. Pull model dịch:
   ```bash
   ollama pull llama2
   ```
4. (Tùy chọn) Pull model vision cho dịch ảnh:
   ```bash
   ollama pull llava
   ```

### Bước 3: Load Extension vào Chrome

1. Mở Chrome, vào `chrome://extensions/`
2. Bật "Developer mode" ở góc phải
3. Click "Load unpacked"
4. Chọn thư mục `D:\Learning\Juchan`
5. Extension sẽ xuất hiện trên toolbar

## 📖 Sử dụng

### Dịch trang web
1. Click icon Juchan 🌸 trên toolbar
2. Bật toggle "Dịch trang web"
3. Nhấn "Dịch ngay" hoặc bật "Lazy Translate"

### Dịch ảnh Manga
1. Bật toggle "Dịch ảnh (Manga/Comic)"
2. Nhấn "Dịch ngay"
3. Click vào overlay để xem text gốc

### Menu chuột phải
Chọn text → Click phải → "Dịch với Juchan"

## ⚙️ Cấu hình

Vào **Cài đặt** (click icon ⚙️) để:
- Thay đổi API endpoint
- Đổi model AI
- Cấu hình cache
- Custom prompt
- Loại trừ trang web

## 🔧 Yêu cầu hệ thống

- Chrome/Edge/Brave (Chromium-based)
- Ollama hoặc OpenAI API
- RAM: 8GB+ (cho model 7B)
- VRAM: 4GB+ (để chạy model nhanh hơn)

## 📁 Cấu trúc thư mục

```
Juchan/
├── manifest.json          # Extension manifest
├── background/
│   └── service-worker.js  # Background script
├── content/
│   ├── content.js         # Content script
│   └── content.css        # Overlay styles
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
├── options/
│   ├── options.html       # Settings page
│   ├── options.css        # Settings styles
│   └── options.js         # Settings logic
├── help/
│   └── help.html          # Help page
└── icons/
    ├── icon16.svg/png
    ├── icon32.svg/png
    ├── icon48.svg/png
    └── icon128.svg/png
```

## 🐛 Troubleshooting

### Lỗi kết nối API
- Kiểm tra Ollama đang chạy: `ollama list`
- Đảm bảo endpoint đúng: `http://localhost:11434/api/generate`

### Dịch chậm
- Sử dụng model nhẹ hơn: `llama2:7b`
- Giảm batch size trong Settings

### Dịch ảnh không hoạt động
- Cần model vision: `ollama pull llava`
- Một số ảnh CORS protected không thể đọc

## 📝 License

MIT License

## 🤝 Contributing

Pull requests are welcome!

---

Made with 🌸 for manga lovers
# juchan
