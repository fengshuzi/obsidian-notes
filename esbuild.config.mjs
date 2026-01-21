import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "module";

const prod = process.argv[2] === "production";

esbuild
    .build({
        entryPoints: ["src/main.ts"],
        bundle: true,
        external: [
            "obsidian",
            "electron",
            "@codemirror/autocomplete",
            "@codemirror/collab",
            "@codemirror/commands",
            "@codemirror/language",
            "@codemirror/lint",
            "@codemirror/search",
            "@codemirror/state",
            "@codemirror/view",
            "@lezer/common",
            "@lezer/highlight",
            "@lezer/lr",
            ...builtinModules,
        ],
        format: "cjs",
        minify: prod,
        watch: !prod,
        target: "es2016",
        logLevel: "info",
        sourcemap: prod ? false : "inline",
        treeShaking: true,
        outfile: "dist/main.js",
    })
    .catch(() => process.exit(1));
