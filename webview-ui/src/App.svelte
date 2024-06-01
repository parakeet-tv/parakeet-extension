<script lang="ts">
  import { allComponents, provideVSCodeDesignSystem } from "@vscode/webview-ui-toolkit";
  import { vscode } from "./lib/vscode";

  provideVSCodeDesignSystem().register(allComponents);

  function handleHowdyClick() {
    vscode.postMessage({
      command: "hello",
      text: "testing",
    });
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
