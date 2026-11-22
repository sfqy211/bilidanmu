import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const LOCALES = ["zh-CN", "en"];
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(dictionary, prefix = "") {
  return Object.entries(dictionary).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") return [[path, value]];
    assert.ok(value && typeof value === "object" && !Array.isArray(value), `Invalid translation at ${path}`);
    return flatten(value, path);
  });
}

function parameters(message) {
  return [...new Set(Array.from(message.matchAll(/{{\s*([\w.]+)(?:\s*,\s*[^}]+)?\s*}}/g), ([, name]) => name))].sort();
}

function load(locale) {
  const file = new URL(`../src/i18n/locales/${locale}.json`, import.meta.url);
  const entries = flatten(JSON.parse(readFileSync(file, "utf8")));
  const required = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  const groups = new Map();
  for (const [path, message] of entries) {
    const suffix = PLURAL_SUFFIX.exec(path);
    const key = suffix ? path.slice(0, -suffix[0].length) : path;
    const forms = groups.get(key) ?? new Map();
    forms.set(suffix?.[1] ?? "", message);
    groups.set(key, forms);
  }
  for (const [key, forms] of groups) {
    if (forms.has("")) {
      assert.equal(forms.size, 1, `${locale} ${key}: mixed plural and plain translations`);
      continue;
    }
    for (const form of required) {
      assert.ok(forms.has(form), `${locale} ${key}: missing plural form ${form}`);
    }
    for (const [form, message] of forms) {
      assert.ok(form === "zero" || required.includes(form), `${locale} ${key}: unexpected plural form ${form}`);
      assert.deepEqual(parameters(message), parameters(forms.get("other")), `${locale} ${key}: plural interpolation differs`);
    }
  }
  return groups;
}

const [canonical, english] = LOCALES.map(load);
assert.deepEqual([...english.keys()].sort(), [...canonical.keys()].sort(), "English and Chinese translation keys differ");
for (const [key, forms] of canonical) {
  const translated = english.get(key);
  assert.equal(translated.has(""), forms.has(""), `${key}: plural and plain translations differ`);
  const base = forms.get("") ?? forms.get("other");
  for (const message of translated.values()) {
    assert.equal(message.trim() === "", base.trim() === "", `${key}: translation emptiness differs`);
    assert.deepEqual(parameters(message), parameters(base), `${key}: interpolation parameters differ`);
    assert.doesNotMatch(message, /\p{Script=Han}/u, `${key}: English translation contains Chinese text`);
  }
}
console.log(`Verified ${canonical.size} translation keys in ${LOCALES.join(" and ")}.`);
