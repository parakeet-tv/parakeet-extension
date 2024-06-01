<script lang="ts">
  import { allComponents, provideVSCodeDesignSystem } from "@vscode/webview-ui-toolkit";
  import { vscode } from "./lib/vscode";
  import { ws } from "./lib/partykit";

  provideVSCodeDesignSystem().register(allComponents);

  function handleHowdyClick() {
    vscode.postMessage({
      command: "hello",
      text: "testing",
    });

    ws.send(
      JSON.stringify({
        message: "hello world",
      })
    );
  }
</script>

<main>
  <h2>Parakeet</h2>
  <vscode-button on:click={handleHowdyClick}>Message</vscode-button>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    height: 100%;
    width: 100%;
  }
</style>
