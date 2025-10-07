#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const V8_COVERAGE = './coverage/coverage-final.json';
const MONOCART_DATA = './coverage-reports/coverage-data.js';
const SOURCE_FILE = './src/lzma.ts';

console.log('🔍 COMPARAISON V8 vs MONOCART\n');

// Lire V8
if (!fs.existsSync(V8_COVERAGE)) {
  console.log('❌ V8 coverage manquant');
  process.exit(1);
}
const v8Coverage = JSON.parse(fs.readFileSync(V8_COVERAGE, 'utf8'));
const sourceLines = fs.readFileSync(SOURCE_FILE, 'utf8').split('\n');
const filePath = path.resolve(SOURCE_FILE);
const v8Data = v8Coverage[filePath] || v8Coverage[Object.keys(v8Coverage)[0]];

// Lire Monocart
if (!fs.existsSync(MONOCART_DATA)) {
  console.log('❌ Monocart data manquant');
  process.exit(1);
}

// Extraire les données Monocart du fichier JS
const monocartContent = fs.readFileSync(MONOCART_DATA, 'utf8');
const monocartMatch = monocartContent.match(/window\.reportData\s*=\s*'([^']+)'/);
if (!monocartMatch) {
  console.log('❌ Format Monocart non reconnu');
  process.exit(1);
}

// Monocart utilise un format compressé, on doit le décoder
console.log('⚠️  Monocart utilise un format de données compressé, analyse simplifiée...');
const monocartData = { summary: null };
const summaryData = monocartData.summary;

console.log('📊 COMPARAISON GLOBALE:');
console.log(
  `V8       : ${v8Data.s ? Object.values(v8Data.s).filter((x) => x > 0).length : 0} statements couverts / ${v8Data.s ? Object.keys(v8Data.s).length : 0} total`
);
console.log(
  `Monocart : ${summaryData.statements.covered} statements couverts / ${summaryData.statements.total} total`
);
console.log('');

console.log(
  `V8       : ${v8Data.b ? Object.values(v8Data.b).filter((arr) => arr.every((x) => x > 0)).length : 0} branches couvertes / ${v8Data.b ? Object.keys(v8Data.b).length : 0} total`
);
console.log(
  `Monocart : ${summaryData.branches.covered} branches couvertes / ${summaryData.branches.total} total`
);
console.log('');

console.log(
  `V8       : ${v8Data.f ? Object.values(v8Data.f).filter((x) => x > 0).length : 0} fonctions couvertes / ${v8Data.f ? Object.keys(v8Data.f).length : 0} total`
);
console.log(
  `Monocart : ${summaryData.functions.covered} fonctions couvertes / ${summaryData.functions.total} total`
);
console.log('');

// Analyse des statements non couverts
const v8UncoveredStmts = Object.entries(v8Data.s || {}).filter(([, count]) => count === 0);
console.log(`🎯 V8 STATEMENTS NON COUVERTS: ${v8UncoveredStmts.length}`);
v8UncoveredStmts.slice(0, 5).forEach(([key]) => {
  const stmt = v8Data.statementMap[key];
  const line = stmt.start.line;
  console.log(`  Ligne ${line}: ${sourceLines[line - 1]?.trim() || 'N/A'}`);
});

console.log('\n💡 VERDICT:');
if (summaryData.statements.total !== Object.keys(v8Data.s || {}).length) {
  console.log('⚠️  Monocart détecte un nombre différent de statements');
}

const v8Pct = (
  (Object.values(v8Data.s || {}).filter((x) => x > 0).length / Object.keys(v8Data.s || {}).length) *
  100
).toFixed(2);
const monocartPct = summaryData.statements.pct;

console.log(`V8       : ${v8Pct}% statements coverage`);
console.log(`Monocart : ${monocartPct}% statements coverage`);

if (Math.abs(parseFloat(monocartPct) - parseFloat(v8Pct)) > 1) {
  console.log('✨ Monocart montre une différence significative !');
} else {
  console.log('📊 Résultats similaires entre V8 et Monocart');
}
