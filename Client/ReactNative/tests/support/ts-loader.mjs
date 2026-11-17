// ESM loader hooks so tests can import the app's real TypeScript services in Node:
// transpiles .ts, resolves the "@/" alias and swaps React Native / Expo native modules
// for small in-memory stubs. Nothing here is used by the app itself.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stubs = {
  "react-native": "react-native.mjs",
  "expo-secure-store": "expo-secure-store.mjs",
  "expo-constants": "expo-constants.mjs",
  "expo-crypto": "expo-crypto.mjs",
  "@react-native-async-storage/async-storage": "async-storage.mjs",
};

function withExtension(file) {
  for (const candidate of [file, `${file}.ts`, `${file}.tsx`, `${file}/index.ts`]) {
    if (existsSync(candidate) && !candidate.endsWith("/") && path.extname(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (stubs[specifier]) {
    const url = pathToFileURL(path.join(root, "tests/support/stubs", stubs[specifier])).href;
    return { url, shortCircuit: true };
  }
  let file = null;
  if (specifier.startsWith("@/")) {
    file = withExtension(path.join(root, specifier.slice(2)));
  } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    file = withExtension(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
  }
  if (file) {
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && /\.tsx?$/.test(url)) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: fileURLToPath(url),
    });
    return { format: "module", source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
