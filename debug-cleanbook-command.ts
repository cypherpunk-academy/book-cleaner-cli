import {
  APP_DESCRIPTION,
  APP_VERSION,
  CLI_ALIASES,
  CLI_OPTIONS,
  DEFAULT_LOG_LEVEL,
  DEFAULT_OUTPUT_DIR,
} from "./src/constants";
import { Command } from "commander";

console.log("🔍 Debug: CleanBookCommand Constants and Command Creation");

console.log("\n📋 Constants Check:");
console.log("APP_DESCRIPTION:", APP_DESCRIPTION);
console.log("APP_VERSION:", APP_VERSION);
console.log("DEFAULT_OUTPUT_DIR:", DEFAULT_OUTPUT_DIR);
console.log("DEFAULT_LOG_LEVEL:", DEFAULT_LOG_LEVEL);

console.log("\n📋 CLI_OPTIONS Check:");
console.log("CLI_OPTIONS.OUTPUT_DIR:", CLI_OPTIONS.OUTPUT_DIR);
console.log("CLI_OPTIONS.AUTHOR:", CLI_OPTIONS.AUTHOR);
console.log("CLI_OPTIONS.TITLE:", CLI_OPTIONS.TITLE);
console.log("CLI_OPTIONS.BOOK_INDEX:", CLI_OPTIONS.BOOK_INDEX);

console.log("\n📋 CLI_ALIASES Check:");
console.log("CLI_ALIASES[OUTPUT_DIR]:", CLI_ALIASES[CLI_OPTIONS.OUTPUT_DIR]);
console.log("CLI_ALIASES[AUTHOR]:", CLI_ALIASES[CLI_OPTIONS.AUTHOR]);
console.log("CLI_ALIASES[TITLE]:", CLI_ALIASES[CLI_OPTIONS.TITLE]);
console.log("CLI_ALIASES[BOOK_INDEX]:", CLI_ALIASES[CLI_OPTIONS.BOOK_INDEX]);

try {
  console.log("\n🏗️  Creating Command (step by step):");
  
  const command = new Command();
  console.log("✅ new Command() created");
  
  command.name("clean-book");
  console.log("✅ .name() set");
  
  command.description(APP_DESCRIPTION);
  console.log("✅ .description() set");
  
  command.version(APP_VERSION);
  console.log("✅ .version() set");
  
  console.log("\n🎯 Testing .argument() method:");
  command.argument("<input-file>", "Input file path (PDF, EPUB, or TXT)");
  console.log("✅ .argument() completed successfully");
  
  console.log("\n🎯 Testing .option() methods:");
  
  const outputDirOption = `-${CLI_ALIASES[CLI_OPTIONS.OUTPUT_DIR]}, --${CLI_OPTIONS.OUTPUT_DIR} <dir>`;
  console.log("Output dir option string:", outputDirOption);
  command.option(outputDirOption, "Output directory for processed files", DEFAULT_OUTPUT_DIR);
  console.log("✅ output-dir option added");

  const authorOption = `-${CLI_ALIASES[CLI_OPTIONS.AUTHOR]}, --${CLI_OPTIONS.AUTHOR} <author>`;
  console.log("Author option string:", authorOption);  
  command.option(authorOption, "Override author from filename");
  console.log("✅ author option added");
  
  console.log("\n🎉 Command creation successful!");
  
} catch (error) {
  console.error("\n❌ Error during command creation:");
  console.error("Error message:", error instanceof Error ? error.message : String(error));
  console.error("Error type:", typeof error);
  
  if (error instanceof Error && error.stack) {
    console.error("\n📋 Stack trace:");
    console.error(error.stack);
  }
} 