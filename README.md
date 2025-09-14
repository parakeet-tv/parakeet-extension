# [Parakeet.tv](https://parakeet.tv) Extension

Share your code with the world.

This extension allows you to livestream your code, terminals, and more to [Parakeet.tv](https://parakeet.tv) straight from your editor.

## What data is sent to Parakeet.tv?

This is a good question! The data you send to Parakeet.tv is based on your extension's settings. 

For example, if you have "Current file only" under "What to share", only your currently opened file will be sent to the server and synced to viewers. All files within `.gitignore` are ignored and are never sent to the server. 

Currently, all terminal windows (inputs and outputs) are synced to the server and all viewers. Your keystrokes are not synced; only submitted commands (eg. after you press enter) are synced, but all output is synced.

If you'd like to take a deeper look, this extension is open source under the BSL 1.1 license: [Parakeet.tv Extension](https://github.com/parakeet-tv/parakeet-extension). 