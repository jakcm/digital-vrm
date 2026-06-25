const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const lipSyncSource = fs.readFileSync(
  path.join(__dirname, '../src/features/lipSync/lipSync.ts'),
  'utf8'
);

const hasPlaybackStartSetter = /public\s+startVisemeSequence\s*\(/.test(lipSyncSource);
const clearResetsCurrentState = /public\s+clearVisemeSequence\s*\(\)\s*{[\s\S]*?_currentViseme\s*=\s*"sil"[\s\S]*?_visemeWeight\s*=\s*0/.test(lipSyncSource);
assert(hasPlaybackStartSetter, 'LipSync must expose startVisemeSequence() so Web Speech / external TTS visemes are timed from real playback start.');
assert(clearResetsCurrentState, 'clearVisemeSequence() must reset current viseme and weight to prevent mouth getting stuck open.');

const modelSource = fs.readFileSync(
  path.join(__dirname, '../src/features/vrmViewer/model.ts'),
  'utf8'
);
const expressionControllerSource = fs.readFileSync(
  path.join(__dirname, '../src/features/emoteController/expressionController.ts'),
  'utf8'
);
assert(/resetLipSync\s*\(\)/.test(modelSource), 'Model.update must call a reset helper when viseme weight is zero.');
assert(/"aa"[^\n]*"ee"[^\n]*"ih"[^\n]*"oh"[^\n]*"ou"/s.test(expressionControllerSource), 'resetLipSync must reset all VRM mouth presets, not only aa.');
assert(/this\._lipSync\?\.startVisemeSequence/.test(modelSource), 'Model.speak must start viseme timing when Web Speech playback has already begun.');
assert(/buildVisemeSequence/.test(modelSource), 'Model.speak must expand TTS word boundaries into smaller viseme segments.');
assert(/\\u4e00-\\u9fff/.test(modelSource), 'mapWordToViseme must handle Chinese characters instead of mapping them all to silence.');

const edgeSource = fs.readFileSync(
  path.join(__dirname, '../src/features/edgeTts/edgeTts.ts'),
  'utf8'
);
const transformed = edgeSource
  .replace(/export /g, '')
  + '\nthis.__generateFallbackVisemes = generateFallbackVisemes;';
const compiled = ts.transpileModule(transformed, {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2019 },
}).outputText;
const context = { console };
vm.createContext(context);
vm.runInContext(compiled, context);
const visemes = context.__generateFallbackVisemes('你好老板', { byteLength: 6000 });
assert(visemes.length >= 4, `Chinese fallback visemes should be character-level, got ${visemes.length}: ${JSON.stringify(visemes)}`);
assert(visemes.every(v => v.duration > 0), 'Every fallback viseme must have positive duration.');

console.log('lipSync regression checks passed');
