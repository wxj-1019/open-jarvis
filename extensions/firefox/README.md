# Firefox Extension

This directory contains the Firefox-specific files for the OpenJarvis Context Bridge extension.

## Shared Files

The following files are shared with the Chrome extension and should be copied or symlinked:
- `content-script.js` → Copy from `../chrome/content-script.js`
- `readability-loader.js` → Copy from `../chrome/readability-loader.js`
- `popup.html` → Copy from `../chrome/popup.html`
- `popup.js` → Copy from `../chrome/popup.js`

## Build

```bash
# Copy shared files
cp ../chrome/content-script.js .
cp ../chrome/readability-loader.js .
cp ../chrome/popup.html .
cp ../chrome/popup.js .
```
