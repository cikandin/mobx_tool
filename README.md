# MobX DevTools

A Chrome extension to track and debug MobX state.

## Features

- 🔍 **State Tracking**: Real-time monitoring of MobX observable state
- 📝 **Action Logging**: Track MobX action execution with arguments and changes
- 🔀 **Diff View**: See exactly what changed before and after each action
- 📍 **Stack Trace**: View source-mapped call stack with source code preview
- ✏️ **Value Editing**: Edit observable values directly from DevTools
- 🎯 **Store Filtering**: Select which stores to track and display
- 💾 **State Export**: Export current state as JSON file
- 🎨 **Dark/Light Theme**: Automatically follows Chrome DevTools theme

## Installation

### From Source

1. Clone or download this repository.

2. Install dependencies and build:
   ```bash
   npm install
   npm run build
   ```

3. Open Chrome Extensions page:
   - Navigate to `chrome://extensions/` or
   - Chrome Menu > Extensions > Manage Extensions

4. Enable Developer Mode (toggle in top right).

5. Click "Load unpacked" and select the `dist/` folder.

6. Open Chrome DevTools and look for the "MobX" tab.

### For Development

```bash
npm install
npm run dev  # Watch mode - rebuilds on file changes
```

Load the project root folder (not `dist/`) as unpacked extension for development.

## Usage

1. Open any web page that uses MobX.

2. Open Chrome DevTools (F12 or Cmd+Option+I).

3. Click on the "MobX" tab.

4. Two main tabs are available:

### State Tab
- View current MobX state as an expandable tree
- **Filter Stores**: Click "Filter Stores" to select which stores to track
- **Refresh**: Manually refresh state
- **Export**: Save current state as JSON file
- **Edit Values**: Double-click on any primitive value to edit it directly

### Actions Tab
- View all executed MobX actions with timestamps
- **Filter**: Type to filter actions by name or store
- **Clear**: Clear the action log

Each action has three detail views:
- **State**: Current state of the affected store
- **Diff**: Shows exactly what changed (old value → new value)
- **Trace**: Call stack with clickable source code preview

## Automatic Detection

MobX DevTools automatically detects MobX in any web page without requiring manual configuration. It works with:
- MobX stores created with `makeObservable` / `makeAutoObservable`
- Any MobX version (4.x, 5.x, 6.x)
- Vite, Webpack, and other bundlers

## Build System

This project uses Vite for building:

```bash
npm run build  # Production build to dist/
npm run dev    # Watch mode for development
```

The `dist/` folder contains the production-ready extension.

## File Structure

```
mobxtool/
├── manifest.json          # Chrome extension manifest
├── devtools.html          # DevTools entry point
├── devtools.js            # DevTools panel creation
├── panel.html             # DevTools panel UI
├── panel.css              # DevTools panel styles
├── panel/                 # Panel modules
│   ├── utils.js           # Shared utilities
│   ├── state-panel.js     # State tab logic
│   ├── actions-panel.js   # Actions tab logic
│   ├── connection.js      # Background script connection
│   └── main.js            # Main initialization
├── content.js             # Content script (page ↔ DevTools bridge)
├── inject.js              # Injected MobX tracking script
├── background.js          # Background service worker
├── src/
│   └── inject.js          # Source for Vite build
├── lib/                   # Local libraries
│   ├── mobx.js            # MobX library
│   └── sourcemapped-stacktrace.js  # Source map support
├── dist/                  # Built extension (load this in Chrome)
├── example.html           # Test page with MobX
├── vite.config.js         # Vite configuration
└── icons/                 # Extension icons
```

## Limitations

- Objects with circular references may not serialize completely
- Private fields or restricted objects may not be tracked
- Very large state objects may impact performance

## License

MIT
