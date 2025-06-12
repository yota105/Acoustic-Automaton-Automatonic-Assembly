# Template Setup Guide

This guide helps you set up a new project from this template.

## Post-Clone Setup

After cloning this template, follow these steps to customize it for your project:

### 1. Update Project Metadata

Edit the following files with your project information:

#### `package.json`
```json
{
  "name": "your-project-name",
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/your-project-name.git"
  },
  "bugs": {
    "url": "https://github.com/yourusername/your-project-name/issues"
  },
  "homepage": "https://github.com/yourusername/your-project-name#readme"
}
```

#### `src-tauri/Cargo.toml`
```toml
[package]
name = "your-project-name"
description = "Your project description"
authors = ["Your Name <your.email@example.com>"]
```

#### `src-tauri/tauri.conf.json`
```json
{
  "productName": "Your App Name",
  "identifier": "com.yourcompany.yourapp"
}
```

### 2. Initialize Git Repository

```bash
# Remove existing git history
rm -rf .git

# Initialize new repository
git init
git add .
git commit -m "Initial commit from template"

# Add your remote repository
git remote add origin https://github.com/yourusername/your-project-name.git
git branch -M main
git push -u origin main
```

### 3. Customize Audio Processing

Edit `src/dsp/mysynth.dsp` to create your custom DSP:

```faust
import("stdfaust.lib");

// Your custom DSP code here
process = _ * 0.5; // Simple pass-through with gain
```

### 4. Customize Visualization

Modify `src/visualizer.ts` to create your visual effects:

```typescript
// Add your custom Three.js or p5.js code
```

### 5. Update Dependencies

Check for the latest versions of dependencies:

```bash
npm update
```

### 6. Test the Setup

```bash
# Install dependencies
npm install

# Run development mode
npm run dev-with-faust
```

## Template Structure

```
├── src/
│   ├── audio/              # Audio processing
│   ├── dsp/               # Faust DSP files
│   ├── types/             # TypeScript types
│   ├── controller.ts      # Main app logic
│   ├── visualizer.ts      # Visualization logic
│   └── *.html            # UI pages
├── src-tauri/            # Rust backend
├── public/               # Static assets
└── docs/                 # Documentation
```

## Common Customizations

### Adding New DSP Effects

1. Create a new `.dsp` file in `src/dsp/`
2. Update the build script in `package.json`
3. Import and use in `src/audio/audioCore.ts`

### Adding New Visualizations

1. Install additional libraries: `npm install <library>`
2. Import in `src/visualizer.ts`
3. Add controls in `src/controller.ts`

### Custom UI Components

1. Modify HTML files in `src/`
2. Update styles in `src/styles.css`
3. Add event handlers in controller files

## Troubleshooting

If you encounter issues:

1. Check Node.js and Rust versions
2. Verify Tauri prerequisites
3. Clear node_modules and reinstall
4. Check Faust installation

## Support

- Template Issues: [GitHub Issues](https://github.com/yourusername/tauri-electronics-template/issues)
- Tauri Documentation: [tauri.app](https://tauri.app/)
- Faust Documentation: [faust.grame.fr](https://faust.grame.fr/)
