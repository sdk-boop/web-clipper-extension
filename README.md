# Web Clipper to Word — Chrome Extension

Automatically captures copied text + article links as you browse,
then lets you export everything as a formatted `.docx` Word document.

---

## Installation

1. Open **Chrome** and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder (`web-clipper-extension/`)

---

## How to use

| Action | What happens |
|---|---|
| Select text → **Ctrl+C** (Win/Linux) or **Cmd+C** (Mac) | Clip is saved automatically. A small toast notification confirms it. |
| Click the extension icon (toolbar) | Opens the popup showing all your clips |
| Click **Export to Word (.docx)** | Downloads a formatted Word document |
| Click **×** on a clip | Removes just that clip |
| Click **Clear All** | Removes all clips |

---

## Word document format

The exported `.docx` includes:

- A cover heading with export date and clip count
- Each clip formatted with:
  - **Title** (og:title or page `<title>`)
  - **Date captured** + **clickable source URL**
  - The clipped text body (multi-paragraph preserved)
- A separator line between clips

---

## Notes

- Up to **500 clippings** are stored (oldest are automatically pruned)
- Duplicate clips (same URL + same text) are ignored
- Clippings persist across browser restarts via `chrome.storage.local`
- Requires Chrome 88+ (Manifest V3)
