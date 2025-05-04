// Initialize state
let extensionEnabled = false;
let settings = {
  targetLanguage: 'es',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1'
};
let selectionTimeout = null;
let tooltipElement = null;
let pinnedTooltips = [];

// Add debug logging
function debugLog(message, data) {
  console.log(`[Language Learning Extension] ${message}`, data || '');
}

// Load saved settings when the content script starts
chrome.storage.sync.get(
  {
    enabled: false,
    targetLanguage: 'es',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1'
  },
  function(items) {
    extensionEnabled = items.enabled;
    settings.targetLanguage = items.targetLanguage;
    settings.apiKey = items.apiKey;
    settings.baseUrl = items.baseUrl;

    debugLog('Extension loaded with settings:', { enabled: extensionEnabled, language: settings.targetLanguage });
    debugLog('API Key set:', settings.apiKey ? 'Yes' : 'No');
  }
);

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  debugLog('Message received:', message);
  if (message.action === 'updateState') {
    extensionEnabled = message.enabled;
    settings = {...settings, ...message.settings};

    debugLog('Extension state updated:', { enabled: extensionEnabled });

    // Remove tooltip if extension is disabled
    if (!extensionEnabled && tooltipElement) {
      removeTooltip();
    }
  }
  // Always respond to prevent connection errors
  if (sendResponse) {
    sendResponse({received: true});
  }
});

// Detect text selection
document.addEventListener('mouseup', handleTextSelection);
document.addEventListener('keyup', handleTextSelection);

// Handle text selection with debounce
function handleTextSelection(event) {
  // Don't process if extension is disabled
  if (!extensionEnabled) {
    debugLog('Selection ignored - extension disabled');
    return;
  }

  debugLog('Selection detected');

  // Skip if it's a click on the tooltip itself
  if (tooltipElement && tooltipElement.contains(event.target)) return;

  // Cancel previous timeout if exists
  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }

  // Set a timeout to avoid translating text while user is still selecting
  selectionTimeout = setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    debugLog('Selected text:', text);

    // Remove existing tooltip if clicking elsewhere or selection is empty
    if (tooltipElement && (!text || !selection.rangeCount)) {
      removeTooltip();
      return;
    }

    // Check if we have valid text selected
    if (text && text.length > 0 && text.length < 500) {
      // Get the selection range
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (!settings.apiKey) {
        debugLog('API key is missing. Please set it in the extension settings.');
        showErrorTooltip('API key is missing. Please set it in the extension settings.', rect);
        return;
      }

      debugLog('Requesting translation for:', text);

      // Request translation
      chrome.runtime.sendMessage(
        { action: 'translateText', text },
        function(response) {
          debugLog('Translation response:', response);
          if (response && !response.error) {
            showTooltip(response, rect);
          } else if (response && response.error) {
            console.error('Translation error:', response.error);
            showErrorTooltip('Translation error: ' + response.error, rect);
          } else {
            showErrorTooltip('No response from translation service', rect);
          }
        }
      );
    }
  }, 1000); // 1 second debounce
}

// Show error in tooltip
function showErrorTooltip(errorMessage, rect) {
  // Remove existing tooltip if any
  removeTooltip();

  // Create tooltip element
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'llext-tooltip llext-error';
  tooltipElement.innerHTML = `
    <div class="llext-tooltip-header">
      <div class="llext-original-text">Error</div>
      <div class="llext-actions">
        <button class="llext-close-button">✕</button>
      </div>
    </div>
    <div class="llext-error-message">${errorMessage}</div>
  `;

  // Position the tooltip
  positionTooltip(tooltipElement, rect);

  // Append to body
  document.body.appendChild(tooltipElement);

  // Add event listeners
  const closeButton = tooltipElement.querySelector('.llext-close-button');
  closeButton.addEventListener('click', removeTooltip);
}

// Show the translation tooltip
function showTooltip(data, rect) {
  // Remove existing tooltip if any
  removeTooltip();

  // Create tooltip element
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'llext-tooltip';
  tooltipElement.innerHTML = `
    <div class="llext-tooltip-header">
      <div class="llext-original-text">${data.originalText}</div>
      <div class="llext-actions">
        <button class="llext-pin-button">📌</button>
        <button class="llext-close-button">✕</button>
      </div>
    </div>
    <div class="llext-translation">${data.translation}</div>
    <div class="llext-context">
      <div class="llext-part-speech">${data.partOfSpeech}</div>
      <div class="llext-example">${data.example}</div>
      ${data.model ? `<div class="llext-model">Using model: ${data.model}</div>` : ''}
    </div>
  `;

  // Position the tooltip
  positionTooltip(tooltipElement, rect);

  // Append to body
  document.body.appendChild(tooltipElement);

  // Add event listeners
  const closeButton = tooltipElement.querySelector('.llext-close-button');
  closeButton.addEventListener('click', removeTooltip);

  const pinButton = tooltipElement.querySelector('.llext-pin-button');
  pinButton.addEventListener('click', () => {
    // Pin the translation
    chrome.runtime.sendMessage({
      action: 'pinTranslation',
      pin: {
        text: data.originalText,
        translation: data.translation,
        context: `${data.partOfSpeech} - ${data.example}`,
        model: data.model
      }
    });

    // Visual confirmation
    pinButton.textContent = '📍';
    pinButton.disabled = true;
  });

  // Highlight selected text
  highlightSelectedText();
}

// Position the tooltip near the selected text
function positionTooltip(tooltip, rect) {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

  // Calculate initial position
  let top = rect.bottom + scrollTop + 10; // 10px below the selection
  let left = rect.left + scrollLeft;

  // Apply the position
  tooltip.style.position = 'absolute';
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.zIndex = '9999';

  // After appending to DOM (in showTooltip), we can check if it's visible in viewport
  // and adjust if needed
  setTimeout(() => {
    const tooltipRect = tooltip.getBoundingClientRect();

    // Check if tooltip is out of viewport
    if (tooltipRect.right > window.innerWidth) {
      // Shift to the left
      left = rect.right + scrollLeft - tooltipRect.width;
      tooltip.style.left = `${left}px`;
    }

    if (tooltipRect.bottom > window.innerHeight) {
      // Place above the selection instead
      top = rect.top + scrollTop - tooltipRect.height - 10;
      tooltip.style.top = `${top}px`;
    }
  }, 0);
}

// Remove the tooltip
function removeTooltip() {
  if (tooltipElement && tooltipElement.parentNode) {
    tooltipElement.parentNode.removeChild(tooltipElement);
    tooltipElement = null;

    // Remove any highlighting
    removeHighlighting();
  }
}

// Highlight the selected text
function highlightSelectedText() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const span = document.createElement('span');
  span.className = 'llext-highlighted-text';

  try {
    range.surroundContents(span);
  } catch (e) {
    console.error('Failed to highlight text:', e);
  }
}

// Remove highlighting
function removeHighlighting() {
  const highlights = document.querySelectorAll('.llext-highlighted-text');
  highlights.forEach(highlight => {
    const parent = highlight.parentNode;
    while (highlight.firstChild) {
      parent.insertBefore(highlight.firstChild, highlight);
    }
    parent.removeChild(highlight);
  });
}