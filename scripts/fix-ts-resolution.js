#!/usr/bin/env node

/**
 * Fix TypeScript language server module resolution issues
 * This script helps resolve common IDE problems with path aliases
 */

const fs = require("node:fs");

console.log("🔧 Fixing TypeScript language server issues...\n");

// 1. Clear TypeScript cache
console.log("1. Clearing TypeScript cache...");
const cacheFiles = [".tsbuildinfo", "node_modules/.cache", ".vscode/settings.json.bak"];

for (const file of cacheFiles) {
  try {
    if (fs.existsSync(file)) {
      fs.rmSync(file, { recursive: true, force: true });
      console.log(`   ✓ Removed ${file}`);
    }
  } catch (err) {
    console.log(`   ⚠️  Could not remove ${file}: ${err.message}`);
  }
}

// 2. Verify tsconfig.json paths
console.log("\n2. Verifying tsconfig.json paths...");
try {
  const tsconfig = JSON.parse(fs.readFileSync("tsconfig.json", "utf8"));
  const paths = tsconfig.compilerOptions?.paths;

  if (paths?.["@/*"]) {
    console.log("   ✓ Path aliases configured correctly");
  } else {
    console.log("   ❌ Path aliases not configured");
  }
} catch (err) {
  console.log(`   ❌ Could not read tsconfig.json: ${err.message}`);
}

// 3. Check if key files exist
console.log("\n3. Checking key files...");
const keyFiles = [
  "src/constants.ts",
  "src/types/index.ts",
  "src/utils/AppError.ts",
  "src/services/LoggerService.ts",
  "src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_2_Text_Extraction/TextExtractor.ts",
  "src/pipeline/phase_1_Text_Extraction_And_Format_Processing/step_2_Text_Extraction/ExecutionSummary.ts",
];

for (const file of keyFiles) {
  if (fs.existsSync(file)) {
    console.log(`   ✓ ${file} exists`);
  } else {
    console.log(`   ❌ ${file} missing`);
  }
}

console.log("\n🎯 Next steps:");
console.log(
  '1. In VS Code/Cursor: Press Ctrl+Shift+P and run "TypeScript: Restart TS Server"',
);
console.log("2. Close and reopen your index.ts file");
console.log("3. If issue persists, reload the entire VS Code/Cursor window");
console.log("4. Verify the build still works: npm run build");

console.log("\n✅ TypeScript resolution fix completed!");
