# [Parakeet.tv](https://parakeet.tv) Extension

Share your code with the world.

This extension allows you to livestream your code, terminals, and more to [Parakeet.tv](https://parakeet.tv) straight from your editor.

## How to Install

There are two ways to install the extension:
 - If you're using VS Code: [install this extension for VS Code from the marketplace](https://marketplace.visualstudio.com/items?itemName=parakeet-tv.parakeet-tv)
 - If you're using Cursor, Windsurf, or another fork: 
   - [Download the latest VSIX file](https://github.com/parakeet-tv/parakeet-extension/releases/latest)
   - Open the command palette via Ctrl/Cmd + Shift + P
   - Run "Extensions: Install from VSIX..." and select the VSIX file

Once it's installed, you'll be able to navigate to the Parakeet.tv page on the left panel to start streaming.

## What data is sent to Parakeet.tv?

This is a good question! The data you send to Parakeet.tv is based on your extension's settings. 

For example, if you have "Current file only" under "What to share", only your currently opened file will be sent to the server and synced to viewers. All files within `.gitignore` are ignored and are never sent to the server. 

Currently, all terminal windows (inputs and outputs) are synced to the server and all viewers. Your keystrokes are not synced; only submitted commands (eg. after you press enter) are synced, but all output is synced.

If you'd like to take a deeper look, this extension is open source under the BSL 1.1 license: [Parakeet.tv Extension](https://github.com/parakeet-tv/parakeet-extension). 