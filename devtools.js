// DevTools integration for Migration Analyzer

// Create a panel in the DevTools
chrome.devtools.panels.create(
  'Migration Analyzer',
  'icons/icon32.svg', // Use SVG icon
  'devtools-panel.html',
  (panel) => {
    console.log('Migration Analyzer DevTools panel created successfully');

    // Handle panel shown/hidden events
    panel.onShown.addListener((window) => {
      // Panel is now visible
      console.log('Migration Analyzer panel shown');
    });

    panel.onHidden.addListener(() => {
      // Panel is now hidden
      console.log('Migration Analyzer panel hidden');
    });
  }
);