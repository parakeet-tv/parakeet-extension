// scripts/esbuild.js
/* eslint-disable no-console */
const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').Plugin} */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      if (watch) console.log("[watch] build started");
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      if (watch) console.log("[watch] build finished");
    });
  },
};

async function main() {
  const common = {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",               // VS Code extension host expects CJS bundle
    outfile: "dist/extension.js",
    sourcemap: !production,
    sourcesContent: false,
    minify: production,
    logLevel: "silent",
    external: ["vscode"],        // MUST stay external
    tsconfig: "tsconfig.json",   // respect TS 5 config (incl. DOM lib)
    target: "node20",            // match your VS Code engine (Node 20 on recent builds)
    conditions: ["node", "import", "default"],
    mainFields: ["module", "main"], // prefer ESM entry, fall back to main
    define: {
      "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development"),
    },
    plugins: [esbuildProblemMatcherPlugin],
    // Optional: if you use TS path aliases, uncomment next line
    // inject: [], // or use a paths-resolver plugin if needed
    // Optional: make sure .ts resolves before .js in source
    resolveExtensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"],
  };

  const ctx = await esbuild.context(common);

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
