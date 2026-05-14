import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModelJson } from '../server/llm.js';
import { validateGenerateRequest } from '../server/validate.js';
import { buildWorldBibleSnippet } from '../server/worldBible.js';
import { fetchProxiedImage } from '../server/proxyImage.js';
import { parseMemoryJson } from '../server/memory.js';
import { evaluateConditions } from '../src/attributeEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const readProjectFile = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');

const testParseModelJson = () => {
  assert.deepEqual(
    parseModelJson('{"description":"a","actions":["b","c","d"]}'),
    { description: 'a', actions: ['b', 'c', 'd'] },
  );

  assert.deepEqual(
    parseModelJson('```json\n{"description":"a","actions":["b","c","d"]}\n```'),
    { description: 'a', actions: ['b', 'c', 'd'] },
  );

  assert.throws(
    () => parseModelJson('{"description":"a","actions":["b"]}'),
    /Invalid AI JSON output/i,
  );
};

const testValidateGenerateRequest = () => {
  assert.throws(
    () => validateGenerateRequest({ title: 't' }),
    /storyContext or userPrompt or worldBible is required/i,
  );

  assert.doesNotThrow(() => validateGenerateRequest({ title: 't', userPrompt: 'u' }));
  assert.doesNotThrow(() => validateGenerateRequest({ title: 't', worldBible: { premise: 'p' } }));

  const out = validateGenerateRequest({
    title: 't',
    storyContext: 'ctx',
    userPrompt: 'u',
    worldBible: { locations: [{ name: 'A', description: 'B' }] },
    location: 'A',
    memory: { summary: 's', facts: ['f1', 'f2'] },
  });
  assert.equal(out.title, 't');
  assert.equal(out.storyContext, 'ctx');
  assert.equal(out.location, 'A');
  assert.equal(out.memory.summary, 's');
  assert.equal(out.memory.facts.length, 2);
  assert.equal(out.memory.facts[0].text, 'f1');
};

const testWorldBibleSnippet = () => {
  const snippet = buildWorldBibleSnippet(
    {
      premise: 'p',
      locations: [{ name: 'Old Forest', description: 'dark trees and mist' }],
      characters: [{ name: 'Eldric', description: 'a weary ranger' }],
    },
    'old forest mist',
    'Old Forest',
    { maxChars: 200 },
  );
  assert.ok(snippet.includes('Selected Location: Old Forest'));
  assert.ok(snippet.length <= 200);
};

const testProxyImageValidation = async () => {
  await assert.rejects(
    () => fetchProxiedImage('http://example.com/a.png'),
    (e) => e && e.statusCode === 400,
  );

  await assert.rejects(
    () => fetchProxiedImage('https://127.0.0.1/a.png'),
    (e) => e && e.statusCode === 403,
  );
};

const testParseMemoryJson = () => {
  assert.deepEqual(
    parseMemoryJson('{"summary":"a","facts":["b","c"]}'),
    { summary: 'a', facts: [{ text: 'b', topic: '', entity: '' }, { text: 'c', topic: '', entity: '' }] },
  );
  assert.deepEqual(
    parseMemoryJson('```json\n{"summary":"a","facts":["b","c"]}\n```'),
    { summary: 'a', facts: [{ text: 'b', topic: '', entity: '' }, { text: 'c', topic: '', entity: '' }] },
  );
  assert.deepEqual(
    parseMemoryJson('{"summary":"a","facts":[{"text":"b","topic":"state","entity":"hero"}]}'),
    { summary: 'a', facts: [{ text: 'b', topic: 'state', entity: 'hero' }] },
  );
  assert.doesNotThrow(() => parseMemoryJson('{"summary":"a","facts":[]}'));
};

const testRequirementOr = () => {
  assert.equal(evaluateConditions({ a: true }, [{ key: 'a', op: 'truthy' }]), true);
  assert.equal(evaluateConditions({ a: false, b: true }, { any: [{ key: 'a', op: 'truthy' }, { key: 'b', op: 'truthy' }] }), true);
  assert.equal(evaluateConditions({ a: false, b: false }, { any: [{ key: 'a', op: 'truthy' }, { key: 'b', op: 'truthy' }] }), false);
  assert.equal(evaluateConditions({ a: true, b: false }, { all: [{ key: 'a', op: 'truthy' }, { key: 'b', op: 'truthy' }] }), false);
};

const testImageStylePreset = () => {
  const serverSource = readProjectFile('server.js');
  assert.match(serverSource, /High-quality story illustration matching the scene, tone, genre, and world context/);
  assert.doesNotMatch(serverSource, /survival horror/i);
};

const testEnvExample = () => {
  const envExample = readProjectFile('.env.example');
  assert.match(envExample, /GEMINI_API_KEY=your_gemini_api_key_here/);
  assert.doesNotMatch(envExample, /AIza[0-9A-Za-z_-]{20,}/);
};

const testNoChineseSourceText = () => {
  const excludedDirs = new Set([
    '.git',
    '.tmp_testform_pages',
    '.vercel',
    '__pycache__',
    'dist',
    'generated',
    'node_modules',
    'submission_source',
  ]);
  const extensions = new Set(['.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.svg']);
  const findings = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!excludedDirs.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile() || !extensions.has(path.extname(entry.name))) continue;
      const filePath = path.join(dir, entry.name);
      const text = fs.readFileSync(filePath, 'utf8');
      if (/\p{Script=Han}/u.test(text)) findings.push(path.relative(projectRoot, filePath));
    }
  };

  walk(projectRoot);
  assert.deepEqual(findings, []);
};

testParseModelJson();
testValidateGenerateRequest();
testWorldBibleSnippet();
await testProxyImageValidation();
testParseMemoryJson();
testRequirementOr();
testImageStylePreset();
testEnvExample();
testNoChineseSourceText();
console.log('selfcheck ok');
