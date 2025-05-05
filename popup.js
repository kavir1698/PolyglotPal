document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const extensionToggle = document.getElementById('extension-toggle');
  const statusText = document.getElementById('status-text');
  const targetLanguage = document.getElementById('target-language');
  const apiKey = document.getElementById('api-key');
  const apiProvider = document.getElementById('api-provider');
  const baseUrl = document.getElementById('base-url');
  const baseUrlContainer = document.getElementById('base-url-container');
  const modelSelection = document.getElementById('model-selection');
  const customModelContainer = document.getElementById('custom-model-container');
  const customModel = document.getElementById('custom-model');
  const saveButton = document.getElementById('save-settings');
  const pinnedTranslationContainer = document.getElementById('pinned-translations');

  // API Provider base URLs
  const providerBaseUrls = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1',
    ollama: 'http://localhost:11434/api',
    openrouter: 'https://openrouter.ai/api/v1',
    localai: 'http://localhost:8080/v1',
    custom: ''
  };

  // Add a loading indicator for models
  let modelsLoading = false;
  let availableModels = [];

  // Load saved settings
  chrome.storage.sync.get(
    {
      enabled: false,
      targetLanguage: 'es',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo',
      customModel: '',
      pinnedTranslations: []
    },
    function(items) {
      extensionToggle.checked = items.enabled;
      statusText.textContent = items.enabled ? 'On' : 'Off';
      targetLanguage.value = items.targetLanguage;
      apiKey.value = items.apiKey;
      baseUrl.value = items.baseUrl;

      // Set the API provider dropdown based on the base URL
      let providerFound = false;
      for (const [provider, url] of Object.entries(providerBaseUrls)) {
        if (url === items.baseUrl) {
          apiProvider.value = provider;
          providerFound = true;
          break;
        }
      }

      if (!providerFound) {
        apiProvider.value = 'custom';
      }

      // If we have both API key and base URL, try to fetch models
      if (items.apiKey && items.baseUrl) {
        fetchModels(items.baseUrl, items.apiKey, items.model);
      } else {
        // Otherwise, use default hardcoded models as fallback
        populateModelSelectionWithDefaults(items.model);
      }

      // Set model selection
      if (items.model === 'custom' && items.customModel) {
        customModel.value = items.customModel;
        customModelContainer.style.display = 'block';
      }

      // Display pinned translations
      displayPinnedTranslations(items.pinnedTranslations);
    }
  );

  // Extension toggle
  extensionToggle.addEventListener('change', function() {
    const isEnabled = extensionToggle.checked;
    statusText.textContent = isEnabled ? 'On' : 'Off';

    // Save the state
    chrome.storage.sync.set({ enabled: isEnabled });

    // Send message to background script
    chrome.runtime.sendMessage({ action: 'toggleExtension', enabled: isEnabled });
  });

  // Base URL or API key change - update model list
  const updateModelsDebounced = debounce(function() {
    const newApiKey = apiKey.value.trim();
    const newBaseUrl = baseUrl.value.trim();

    if (newApiKey && newBaseUrl) {
      fetchModels(newBaseUrl, newApiKey);
    }
  }, 1000);

  baseUrl.addEventListener('input', updateModelsDebounced);
  apiKey.addEventListener('input', updateModelsDebounced);

  // API provider selection change
  apiProvider.addEventListener('change', function() {
    const selectedProvider = apiProvider.value;

    if (selectedProvider === 'custom') {
      // For custom provider, show empty URL field
      baseUrl.value = '';
      baseUrlContainer.style.display = 'block';
    } else {
      // For known providers, set the URL and show it as read-only
      baseUrl.value = providerBaseUrls[selectedProvider];
      baseUrlContainer.style.display = 'block';

      // If API key is present, attempt to fetch models for the new provider
      const currentApiKey = apiKey.value.trim();
      if (currentApiKey) {
        fetchModels(providerBaseUrls[selectedProvider], currentApiKey);
      }
    }
  });

  // Model selection change
  modelSelection.addEventListener('change', function() {
    if (modelSelection.value === 'custom') {
      customModelContainer.style.display = 'block';
    } else {
      customModelContainer.style.display = 'none';
    }
  });

  // Save settings
  saveButton.addEventListener('click', function() {
    // Determine the model value
    let modelValue = modelSelection.value;
    if (modelValue === 'custom') {
      modelValue = customModel.value.trim() || 'gpt-3.5-turbo'; // Fallback if empty
    }

    const settings = {
      targetLanguage: targetLanguage.value,
      apiKey: apiKey.value.trim(),
      baseUrl: baseUrl.value.trim(),
      model: modelSelection.value,
      customModel: customModel.value.trim()
    };

    chrome.storage.sync.set(settings, function() {
      // Show a saved confirmation
      saveButton.textContent = 'Saved!';
      setTimeout(() => {
        saveButton.textContent = 'Save Settings';
      }, 1500);

      // Send message to background script about settings update
      chrome.runtime.sendMessage({
        action: 'settingsUpdated',
        settings: {
          ...settings,
          // For background script, we want the actual model name
          actualModel: modelValue
        }
      });
    });
  });

  // Function to fetch models from the API
  function fetchModels(baseUrl, apiKey, selectedModel) {
    if (modelsLoading) return;

    modelsLoading = true;
    modelSelection.disabled = true;

    // Show loading state
    const originalOptions = modelSelection.innerHTML;
    modelSelection.innerHTML = '<option value="">Loading models...</option>';

    chrome.runtime.sendMessage(
      {
        action: 'fetchAvailableModels',
        baseUrl: baseUrl,
        apiKey: apiKey
      },
      function(response) {
        modelsLoading = false;
        modelSelection.disabled = false;

        if (response && response.success && response.models) {
          availableModels = response.models;
          populateModelSelection(response.models, selectedModel);
        } else {
          // If error, use default hardcoded models as fallback
          console.error('Error fetching models:', response?.error || 'Unknown error');
          populateModelSelectionWithDefaults(selectedModel);
        }
      }
    );
  }

  // Populate model selection dropdown with fetched models
  function populateModelSelection(models, selectedModel = '') {
    // Clear existing options
    modelSelection.innerHTML = '';

    // Add models from the API
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      modelSelection.appendChild(option);
    });

    // Add custom model option
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom Model';
    modelSelection.appendChild(customOption);

    // Set selected model
    if (selectedModel) {
      // Check if selected model exists in options
      if (Array.from(modelSelection.options).some(option => option.value === selectedModel)) {
        modelSelection.value = selectedModel;
      } else {
        // If selected model doesn't exist in the list, use custom
        modelSelection.value = 'custom';
        customModel.value = selectedModel;
        customModelContainer.style.display = 'block';
      }
    }
  }

  // Fallback with hardcoded models
  function populateModelSelectionWithDefaults(selectedModel = '') {
    const defaultModels = [
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'claude-2', name: 'Claude 2' },
      { id: 'claude-instant', name: 'Claude Instant' },
      { id: 'gemini-pro', name: 'Gemini Pro' },
      { id: 'mistral-7b', name: 'Mistral 7B' },
      { id: 'llama-2-70b', name: 'Llama 2 70B' }
    ];

    populateModelSelection(defaultModels, selectedModel);
  }

  // Function to display pinned translations
  function displayPinnedTranslations(pins) {
    if (pins.length === 0) {
      pinnedTranslationContainer.innerHTML = '<div class="no-pins">No pinned translations yet</div>';
      return;
    }

    let html = '';

    pins.forEach((pin, index) => {
      html += `
        <div class="pinned-item">
          <div class="remove-pin" data-index="${index}">×</div>
          <div class="text">${pin.text}</div>
          <div class="translation">${pin.translation}</div>
          ${pin.context ? `<div class="context">${pin.context}</div>` : ''}
        </div>
      `;
    });

    pinnedTranslationContainer.innerHTML = html;

    // Add event listeners to remove pins
    const removeButtons = document.querySelectorAll('.remove-pin');
    removeButtons.forEach(button => {
      button.addEventListener('click', function() {
        const index = parseInt(this.getAttribute('data-index'));
        removePin(index);
      });
    });
  }

  // Function to remove a pinned translation
  function removePin(index) {
    chrome.storage.sync.get({ pinnedTranslations: [] }, function(data) {
      const pins = data.pinnedTranslations;
      pins.splice(index, 1);

      chrome.storage.sync.set({ pinnedTranslations: pins }, function() {
        displayPinnedTranslations(pins);
      });
    });
  }

  // Simple debounce function
  function debounce(func, wait) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }
});