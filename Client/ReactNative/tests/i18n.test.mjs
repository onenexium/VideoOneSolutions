import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { boot } from "./support/boot.mjs";

const ctx = await boot({ mock: true });
after(() => ctx.fake?.close());
const i18n = await import("../services/i18n.ts");

test("text comes in the language chosen, and English fills any gap", () => {
  i18n.setLanguage("en");
  assert.equal(i18n.translate("common.retry"), "Try again");
  i18n.setLanguage("hi");
  assert.equal(i18n.translate("common.retry"), "फिर कोशिश करें");
  assert.equal(i18n.translate("common.retry", "ta"), "Try again", "a language with no text: English");
});

test("an unknown language falls back to English instead of breaking", () => {
  i18n.setLanguage("hi");
  i18n.setLanguage("xx");
  assert.equal(i18n.getLanguage(), "en");
});

test("every English text has a Hindi one for the screens covered, and no Hindi key is stray", async () => {
  const src = await readFile(new URL("../services/i18n.ts", import.meta.url), "utf8");
  const keys = (block) => [...block.matchAll(/^\s+"([\w.]+)":/gm)].map((m) => m[1]);
  const enBlock = src.slice(src.indexOf("const en = {"), src.indexOf("} as const;"));
  const hiBlock = src.slice(src.indexOf("const hi:"), src.indexOf("const dictionaries"));
  const enKeys = new Set(keys(enBlock));
  const hiKeys = keys(hiBlock);
  assert.ok(enKeys.size > 20);
  for (const key of hiKeys) assert.ok(enKeys.has(key), `${key} is in Hindi but not English`);
  assert.deepEqual([...enKeys].filter((k) => !hiKeys.includes(k)), []);
});
