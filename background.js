// Initialize extension state
let extensionEnabled = false;
let settings = {
  targetLanguage: 'es',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini'
};

// Debug logging
function debugLog(message, data) {
  console.log(`[Language Learning Background] ${message}`, data || '');
}

// Load saved settings when the extension starts
chrome.storage.sync.get(
  {
    enabled: false,
    targetLanguage: 'es',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    customModel: ''
  },
  function(items) {
    extensionEnabled = items.enabled;
    settings.targetLanguage = items.targetLanguage;
    settings.apiKey = items.apiKey;
    settings.baseUrl = items.baseUrl;

    // Determine the actual model to use
    if (items.model === 'custom' && items.customModel) {
      settings.model = items.customModel;
    } else {
      settings.model = items.model;
    }

    debugLog('Extension initialized with settings:', {
      enabled: extensionEnabled,
      targetLanguage: settings.targetLanguage,
      model: settings.model,
      hasApiKey: !!settings.apiKey
    });

    // Update the extension icon based on enabled state
    updateIcon(extensionEnabled);
  }
);

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  debugLog('Message received:', message);

  switch (message.action) {
    case 'toggleExtension':
      extensionEnabled = message.enabled;
      updateIcon(extensionEnabled);

      // Broadcast the new state to all content scripts
      broadcastState();
      break;

    case 'settingsUpdated':
      // Update settings
      settings.targetLanguage = message.settings.targetLanguage || settings.targetLanguage;
      settings.apiKey = message.settings.apiKey || settings.apiKey;
      settings.baseUrl = message.settings.baseUrl || settings.baseUrl;

      // Use the actual model passed from the popup, or fallback to the selected model
      if (message.settings.actualModel) {
        settings.model = message.settings.actualModel;
      } else if (message.settings.model === 'custom' && message.settings.customModel) {
        settings.model = message.settings.customModel;
      } else if (message.settings.model) {
        settings.model = message.settings.model;
      }

      debugLog('Settings updated:', settings);

      // Broadcast the new settings to all content scripts
      broadcastState();
      break;

    case 'translateText':
      debugLog('Translation requested for:', message.text);

      if (extensionEnabled && settings.apiKey) {
        translateText(message.text, settings.targetLanguage, settings.apiKey, settings.baseUrl, settings.model)
          .then(result => {
            debugLog('Translation result:', result);
            sendResponse(result);
          })
          .catch(error => {
            debugLog('Translation error:', error.message);
            sendResponse({ error: error.message });
          });
        return true; // Indicates that the response is sent asynchronously
      } else {
        const reason = !extensionEnabled ? "Extension is disabled" : "API key is missing";
        debugLog('Translation request rejected:', reason);
        sendResponse({ error: reason });
      }
      break;

    case 'pinTranslation':
      savePin(message.pin);
      sendResponse({ success: true });
      break;

    case 'fetchAvailableModels':
      fetchAvailableModels(message.baseUrl, message.apiKey)
        .then(models => {
          debugLog('Models fetched:', models);
          sendResponse({ success: true, models: models });
        })
        .catch(error => {
          debugLog('Error fetching models:', error.message);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicates that the response is sent asynchronously
  }

  // Return true for async response if we haven't already sent a response
  return true;
});

// Listen for keyboard shortcut
chrome.commands.onCommand.addListener(function(command) {
  if (command === 'toggle-extension') {
    extensionEnabled = !extensionEnabled;

    // Save the new state
    chrome.storage.sync.set({ enabled: extensionEnabled });

    // Update the icon
    updateIcon(extensionEnabled);

    // Broadcast the new state to all content scripts
    broadcastState();
  }
});

// Update the extension icon based on enabled state
function updateIcon(enabled) {
  // Use the same icon but set badge text to indicate status instead of using a different icon
  const iconPath = {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png'
  };

  chrome.action.setIcon({ path: iconPath });

  // Set a badge to indicate if it's enabled or disabled
  if (enabled) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#888888' });
  }
}

// Broadcast the current state to all content scripts
function broadcastState() {
  chrome.tabs.query({}, function(tabs) {
    const state = {
      action: 'updateState',
      enabled: extensionEnabled,
      settings: settings
    };

    debugLog('Broadcasting state to all tabs:', state);

    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, state)
        .catch(error => {
          // Ignore errors when trying to send to tabs where content script is not loaded
          debugLog('Failed to send to tab:', { tabId: tab.id, error: error.message });
        });
    });
  });
}

// Save a pinned translation
function savePin(pin) {
  chrome.storage.sync.get({ pinnedTranslations: [] }, function(data) {
    const pins = data.pinnedTranslations;

    // Add new pin at the beginning
    pins.unshift(pin);

    // Limit to 20 pins
    if (pins.length > 20) {
      pins.pop();
    }

    chrome.storage.sync.set({ pinnedTranslations: pins });
  });
}

// Function to translate text using the LLM API
async function translateText(text, targetLanguage, apiKey, baseUrl, model) {
  try {
    debugLog('Using model for translation:', model);

    // Create the proper URL for the chat completions endpoint
    const apiUrl = baseUrl.endsWith('/')
      ? `${baseUrl}chat/completions`
      : `${baseUrl}/chat/completions`;

    debugLog('Making API request to:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: `You are a language translation assistant that translates text to ${targetLanguage}.
                     Provide the translation followed by detailed linguistic information to help language learners.

                     Include the following in your response:
                     1. Translation of the text
                     2. Part-of-speech information
                     3. Gender information (if the word is a noun and the target language has grammatical gender)
                     4. One example sentence showing usage
                     5. Usage frequency (indicate if common/uncommon and formal/informal)
                     6. Common collocations (2-3 words or phrases frequently used with the translated term)

                     Format your response as JSON with the following fields:
                     - "translation": the translated text
                     - "partOfSpeech": part of speech
                     - "gender": grammatical gender if applicable
                     - "example": example sentence
                     - "usageFrequency": object with "frequency" (common/uncommon) and "register" (formal/informal)
                     - "collocations": array of common word combinations with the translated term`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    let result;

    try {
      // Try to parse the content as JSON
      result = JSON.parse(data.choices[0].message.content);
    } catch (e) {
      // If parsing fails, use the raw content
      debugLog('Failed to parse JSON response:', e, data.choices[0].message.content);
      result = {
        translation: data.choices[0].message.content,
        partOfSpeech: 'N/A',
        example: 'N/A'
      };
    }

    return {
      originalText: text,
      translation: result.translation,
      partOfSpeech: result.partOfSpeech,
      gender: result.gender || null, // Include gender if available
      example: result.example,
      model: model,  // Include the model used for this translation
      usageFrequency: result.usageFrequency || null, // Include usage frequency if available
      collocations: result.collocations || [] // Include collocations if available
    };
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

// Function to fetch available models from the API provider
async function fetchAvailableModels(baseUrl, apiKey) {
  if (!baseUrl || !apiKey) {
    throw new Error('Base URL and API key are required to fetch models');
  }

  try {
    debugLog('Fetching models from:', baseUrl);

    // Ensure the URL ends with a slash if needed
    const modelsUrl = baseUrl.endsWith('/')
      ? `${baseUrl}models`
      : `${baseUrl}/models`;

    debugLog('Making models request to:', modelsUrl);

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch models: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    debugLog('Received models response:', data);

    // Different APIs have different response formats, try to handle common ones
    let models = [];

    // Format 1: OpenAI-style with data array
    if (data.data && Array.isArray(data.data)) {
      models = data.data.map(model => ({
        id: model.id,
        name: model.id
      }));
    }
    // Format 2: Simple array of objects with 'id' property
    else if (Array.isArray(data)) {
      models = data.map(model => ({
        id: model.id || model.name || model.model,
        name: model.name || model.id || model.model || 'Unknown model'
      }));
    }
    // Format 3: Object with models property
    else if (data.models && Array.isArray(data.models)) {
      models = data.models.map(model => ({
        id: model.id || model.name || model.model,
        name: model.name || model.id || model.model || 'Unknown model'
      }));
    }
    // If none of the above formats match, try to extract any object with an id
    else {
      const possibleModels = [];
      const searchForModels = (obj, depth = 0) => {
        if (depth > 3) return; // Prevent infinite recursion

        if (obj && typeof obj === 'object') {
          if (obj.id || obj.name || obj.model) {
            possibleModels.push({
              id: obj.id || obj.name || obj.model,
              name: obj.name || obj.id || obj.model
            });
          }

          Object.values(obj).forEach(val => {
            if (Array.isArray(val) || typeof val === 'object') {
              searchForModels(val, depth + 1);
            }
          });
        }
      };

      searchForModels(data);
      models = possibleModels;
    }

    // Filter out duplicates and empty models
    models = models
      .filter(model => model.id && model.name)
      .filter((model, index, self) =>
        index === self.findIndex(m => m.id === model.id)
      );

    // If no models found, throw an error
    if (models.length === 0) {
      throw new Error('No models found in the API response');
    }

    return models;
  } catch (error) {
    debugLog('Error fetching models:', error);
    throw error;
  }
}