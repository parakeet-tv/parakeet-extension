# Parakeet.tv Extension

This extension enables you to share what you're working on live with others on [Parakeet.tv](https://parakeet.tv).

It uses [Svelte](https://svelte.dev/) + [Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit).

## Documentation

For a deeper dive into how this sample works, read the guides below.

- [Extension structure](./docs/extension-structure.md)
- [Extension commands](./docs/extension-commands.md)
- [Extension development cycle](./docs/extension-development-cycle.md)

## Setup

```bash
# Clone the source
git clone https://github.com/benank/parakeet-extension

# Navigate into the cloned repo
cd parakeet-extension

# Install dependencies for both the extension and webview UI source code
npm run install:all

# Build webview UI source code
npm run build:webview

# Open sample in VS Code
code .
```

Once the sample is open inside VS Code you can run the extension by doing the following:

1. Press `F5` to open a new Extension Development Host window
2. You should see the Parakeet icon on the left.
