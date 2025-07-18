# AI Coding Guidelines for book-cleaner-cli

## TypeScript Configuration Awareness

This project uses **strict TypeScript** with several important settings that affect code generation:

### Critical TypeScript Settings

```json
{
  "exactOptionalPropertyTypes": true,    // Optional props cannot be assigned undefined
  "noImplicitAny": true,                // No implicit any types
  "noImplicitReturns": true,            // All code paths must return
  "noUnusedLocals": true,               // No unused variables
  "noUnusedParameters": true,           // No unused parameters
  "noUncheckedIndexedAccess": true      // Index access requires null checks
}
```

### Key Patterns to Follow

#### ✅ Correct: Optional Properties
```typescript
// Good: Conditionally include optional properties
const output: SomeType = {
  requiredProp: value,
};

if (optionalValue !== undefined) {
  output.optionalProp = optionalValue;
}
```

#### ❌ Incorrect: Assigning undefined to optional properties
```typescript
// Bad: Will fail with exactOptionalPropertyTypes
const output: SomeType = {
  requiredProp: value,
  optionalProp: undefined, // ERROR!
};
```

#### ✅ Correct: Handling nullable types
```typescript
// Good: Use proper type guards
if (result.pagesExtracted !== undefined) {
  summary.pagesExtracted = result.pagesExtracted;
}
```

#### ✅ Correct: Array access with null checks
```typescript
// Good: Handle potential undefined from array access
const item = items[index];
if (item !== undefined) {
  processItem(item);
}
```

## Biome Linting Rules

### Enforced Patterns
- **No `any` types** - Use proper TypeScript types
- **No non-null assertions (`!`)** - Use type guards instead
- **Use `Number.parseInt`** instead of global `parseInt`
- **No unused variables** - Prefix with `_` if intentional
- **Static methods**: Use class name, not `this`

### Import Organization
```typescript
// External imports first
import { promises as fs } from "node:fs";
import * as path from "node:path";

// Type imports
import type { SomeType } from "./types";

// Internal imports (alphabetical)
import { AppError } from "@/utils/AppError";
import { FileUtils } from "@/utils/FileUtils";
```

## Constants Management

**CRITICAL**: Always check `src/constants.ts` before defining new constants:

```typescript
// ✅ Good: Use existing constants
import { ERROR_CODES, LOG_LEVELS } from "@/constants";

// ❌ Bad: String literals
throw new Error("Configuration not found");

// ✅ Good: Defined constants
throw new AppError(ERROR_CODES.CONFIG_NOT_FOUND, "Configuration not found");
```

## Error Handling

### Required Pattern
```typescript
try {
  const result = await operation();
  return result;
} catch (error) {
  throw new AppError(
    ERROR_CODES.OPERATION_FAILED,
    "Operation failed",
    { context: "additional info" },
    error // Chain original error
  );
}
```

### DeepSeek Integration
- **No fallback mechanisms** - If DeepSeek fails, exit the application
- Always handle DeepSeek errors by terminating the pipeline

## Common Pitfalls to Avoid

1. **Optional Property Assignment**
   ```typescript
   // ❌ Don't do this
   obj.optional = maybeUndefined;
   
   // ✅ Do this
   if (maybeUndefined !== undefined) {
     obj.optional = maybeUndefined;
   }
   ```

2. **Array/Object Access**
   ```typescript
   // ❌ Don't do this (noUncheckedIndexedAccess)
   const value = array[index].property;
   
   // ✅ Do this
   const item = array[index];
   if (item !== undefined) {
     const value = item.property;
   }
   ```

3. **Type Assertions**
   ```typescript
   // ❌ Don't do this
   const result = data as SomeType;
   
   // ✅ Do this
   function isSomeType(data: unknown): data is SomeType {
     return typeof data === "object" && data !== null && "expectedProp" in data;
   }
   
   if (isSomeType(data)) {
     // Use data safely
   }
   ```

## Pre-Code Generation Checklist

Before generating code, ask yourself:

1. [ ] Are there existing constants I should use?
2. [ ] Am I handling optional properties correctly?
3. [ ] Are all imports organized properly?
4. [ ] Am I using proper TypeScript types (no `any`)?
5. [ ] Are error cases handled with AppError?
6. [ ] Are unused variables prefixed with `_`?
7. [ ] Are static methods using class names, not `this`?

## Testing Pattern

```typescript
describe("Component", () => {
  it("should handle success case", async () => {
    // Arrange
    const mockData = { ... };
    
    // Act
    const result = await component.process(mockData);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.property).toBe(expectedValue);
  });
  
  it("should handle error case", async () => {
    // Arrange
    const invalidData = { ... };
    
    // Act & Assert
    await expect(component.process(invalidData))
      .rejects.toThrow(AppError);
  });
});
```

## Memory: Project-Specific Patterns

- File naming: `<author>#<title>[#<book-index>].<extension>`
- Config naming: `<author>#<title>.config.yaml`
- Pipeline phases in folders: `phase_1_Text_Extraction_And_Format_Processing`
- Always use tagged logging: `LoggerService.getLogger('COMPONENT', 'Subcomponent')`

## Quick Reference Commands

```bash
# Check TypeScript errors
npm run build

# Check and fix linting
npm run lint
npm run lint:fix

# Apply unsafe fixes (usually safe)
npx biome check . --fix --unsafe
```

---

**Remember**: This project prioritizes correctness over convenience. Strict TypeScript settings are intentional and should be respected, not circumvented. 