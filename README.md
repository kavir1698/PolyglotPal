# Language Learning Assistant Chrome Extension

A Chrome extension that helps you learn languages by providing instant translations and context for selected text while browsing the web.

## Features

- **Instant Translation**: Select any text on a webpage to get an immediate translation
- **Language Context**: View part-of-speech information and example sentences alongside translations
- **Multiple Languages**: Support for 12+ target languages
- **Customizable LLM Provider**: Use any API provider of your choice (OpenAI, Claude, etc.)
- **Dynamic Model Selection**: Automatically fetches available models from your API provider
- **Keyboard Shortcut**: Toggle the extension on/off with Ctrl+Shift+L
- **Pinned Translations**: Save translations for quick reference
- **Text Highlighting**: Selected text gets subtly highlighted for context
- **Minimalist Design**: Clean, unobtrusive tooltip that matches page styling

## Installation

### From Source
1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click "Load unpacked" and select the language_chrome_extension folder
5. The extension should now appear in your browser toolbar

## Usage

1. Click the extension icon in the toolbar to open the settings popup
2. Enter your API key and base URL for your chosen LLM provider
3. Select your target language from the dropdown
4. Choose a model from the automatically populated list (or enter a custom model)
5. Toggle the extension on
6. Browse any webpage and select text to translate
7. After a 1-second pause, a tooltip will appear with the translation and additional context
8. Pin translations for future reference by clicking the pin button on the tooltip

## Configuration

### API Setup
The extension uses LLM APIs for translation. You'll need:
- **API Key**: Your authentication key for the LLM service
- **Base URL**: The endpoint for your API provider (usually ends before `/chat/completions` or `/models`)
- **Model**: Select from available models or specify a custom one

### Supported Languages
- Spanish
- French
- German
- Italian
- Persian
- Portuguese
- Russian
- Japanese
- Chinese
- Korean
- Arabic
- Hindi
- Turkish

## Development

### Project Structure
- `manifest.json`: Chrome extension configuration
- `popup.html/js/css`: Extension popup UI and functionality
- `background.js`: Core logic and API communication
- `content.js/css`: Content scripts for webpage interaction and tooltip rendering
- `icons/`: Extension icons

### Debugging
The extension includes comprehensive debugging logs. To view:
1. Right-click on the extension popup and select "Inspect"
2. Check the console for detailed logs prefixed with `[Language Learning Extension]`

## Privacy

This extension:
- Only processes text you explicitly select
- Sends selected text to the LLM API you configure
- Stores settings and pinned translations in your browser's local storage
- Does not collect any usage data
