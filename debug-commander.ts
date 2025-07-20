import { Command } from "commander";

console.log("🔍 Testing Commander.js functionality");

try {
  console.log("✅ Command imported successfully");
  console.log("📦 Command constructor:", typeof Command);
  
  const command = new Command();
  console.log("✅ Command instance created");
  console.log("🔧 Command instance methods:");
  console.log("   - argument:", typeof command.argument);
  console.log("   - option:", typeof command.option);
  console.log("   - description:", typeof command.description);
  console.log("   - version:", typeof command.version);
  console.log("   - action:", typeof command.action);
  
  // Test basic methods
  if (typeof command.argument === "function") {
    console.log("✅ .argument() method is available");
  } else {
    console.log("❌ .argument() method is missing or not a function");
  }

  // Try to create a simple command
  const testCommand = command
    .name("test")
    .description("Test command")
    .version("1.0.0");
    
  console.log("✅ Basic command creation successful");
  
  // Now test the problematic .argument() method
  if (testCommand.argument) {
    testCommand.argument("<test-input>", "Test input argument");
    console.log("✅ .argument() method works correctly");
  } else {
    console.log("❌ .argument() method failed");
  }
  
} catch (error) {
  console.error("❌ Error during Commander.js testing:");
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error("\n📋 Stack trace:");
    console.error(error.stack);
  }
} 