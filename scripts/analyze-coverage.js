#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const COVERAGE_FILE = './coverage/coverage-final.json';
const SOURCE_FILE = './src/lzma.ts';

if (!fs.existsSync(COVERAGE_FILE)) {
  console.log("❌ Fichier de coverage non trouvé. Lancez `pnpm test -- --coverage` d'abord.");
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
const sourceLines = fs.readFileSync(SOURCE_FILE, 'utf8').split('\n');

// Analyser le fichier principal
const filePath = path.resolve(SOURCE_FILE);
const data = coverage[filePath] || coverage[Object.keys(coverage)[0]];

if (!data) {
  console.log('❌ Données de coverage non trouvées');
  process.exit(1);
}

console.log('🔍 ANALYSE DE PRÉCISION DU COVERAGE\n');

// Fonctions non couvertes
const uncoveredFunctions = Object.entries(data.f).filter(([, count]) => count === 0);
console.log(`📊 FONCTIONS NON COUVERTES (${uncoveredFunctions.length}):`);
uncoveredFunctions.forEach(([key, count]) => {
  const fn = data.fnMap[key];
  const startLine = fn.loc.start.line;
  const endLine = fn.loc.end.line;

  console.log(`  Function ${key}: "${fn.name}" (lignes ${startLine}-${endLine})`);
  console.log(`    Code: ${sourceLines[startLine - 1]?.trim() || 'N/A'}`);

  // Vérifier si c'est un artefact
  const isArtifact =
    sourceLines[startLine - 1]?.includes('/* v8 ignore') ||
    sourceLines[startLine - 1]?.includes('export const') ||
    fn.name.includes('anonymous');

  if (isArtifact) {
    console.log(`    ⚠️  Probablement un artefact V8`);
  } else {
    console.log(`    🎯 VRAIE fonction non testée`);
  }
  console.log('');
});

// Statements non couverts
const uncoveredStatements = Object.entries(data.s).filter(([, count]) => count === 0);
console.log(`📊 STATEMENTS NON COUVERTS (${uncoveredStatements.length}):`);
uncoveredStatements.slice(0, 10).forEach(([key, count]) => {
  const stmt = data.statementMap[key];
  const line = stmt.start.line;

  console.log(`  Statement ${key}: ligne ${line}`);
  console.log(`    Code: ${sourceLines[line - 1]?.trim() || 'N/A'}`);

  // Vérifier si c'est vraiment du code exécutable
  const codeLine = sourceLines[line - 1]?.trim() || '';
  const isIgnorable =
    codeLine.includes('/* v8 ignore') ||
    codeLine === '' ||
    codeLine.includes('//') ||
    codeLine === '}' ||
    codeLine === '{' ||
    codeLine.includes('export const');

  if (isIgnorable) {
    console.log(`    ⚠️  Ligne probablement ignorable`);
  } else {
    console.log(`    🎯 VRAI code non testé`);
  }
  console.log('');
});

// Branches critiques non couvertes
const uncoveredBranches = Object.entries(data.b)
  .filter(([, counts]) => counts.includes(0))
  .filter(([key]) => {
    const branch = data.branchMap[key];
    const line = sourceLines[branch.line - 1]?.trim() || '';
    return !line.includes('/* v8 ignore') && line.length > 0;
  });

console.log(`📊 BRANCHES CRITIQUES NON COUVERTES (${uncoveredBranches.length}):`);
uncoveredBranches.slice(0, 10).forEach(([key, counts]) => {
  const branch = data.branchMap[key];
  const line = branch.line;

  console.log(`  Branch ${key}: ligne ${line} - ${counts}`);
  console.log(`    Code: ${sourceLines[line - 1]?.trim() || 'N/A'}`);
  console.log(`    Type: ${branch.type}`);
  console.log(`    🎯 VRAIE condition non testée`);
  console.log('');
});

console.log('💡 RÉSUMÉ:');
console.log(
  `  - Fonctions vraiment non testées: ${
    uncoveredFunctions.filter(([key]) => {
      const fn = data.fnMap[key];
      return (
        !fn.name.includes('anonymous') &&
        !sourceLines[fn.loc.start.line - 1]?.includes('export const')
      );
    }).length
  }`
);

console.log(
  `  - Statements vraiment non testés: ${
    uncoveredStatements.filter(([key]) => {
      const stmt = data.statementMap[key];
      const codeLine = sourceLines[stmt.start.line - 1]?.trim() || '';
      return (
        !codeLine.includes('/* v8 ignore') &&
        codeLine !== '' &&
        !codeLine.includes('//') &&
        codeLine !== '}' &&
        codeLine !== '{' &&
        !codeLine.includes('export const')
      );
    }).length
  }`
);

console.log(`  - Branches vraiment non testées: ${uncoveredBranches.length}`);
