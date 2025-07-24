/**
 * Jest test setup file
 */

// Global test configuration
beforeAll(() => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'error';

    // Mock console methods for cleaner test output
    jest.spyOn(console, 'log').mockImplementation(() => {
        // Intentionally empty for test output suppression
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {
        // Intentionally empty for test output suppression
    });
    jest.spyOn(console, 'error').mockImplementation(() => {
        // Intentionally empty for test output suppression
    });
});

afterAll(() => {
    // Restore console methods
    jest.restoreAllMocks();
});

// Clean up after each test
afterEach(() => {
    jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
    createMockLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn(),
        getTaggedLogger: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn(),
        }),
        getPipelineLogger: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn(),
        }),
        getFileProcessingLogger: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn(),
        }),
        getTextExtractionLogger: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn(),
        }),
        getOCRLogger: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn(),
        }),
        getConfigLogger: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn(),
        }),
        getCLILogger: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn(),
        }),
        getErrorLogger: jest.fn().mockReturnValue({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            fatal: jest.fn(),
        }),
        flush: jest.fn(),
        updateConfig: jest.fn(),
        isLevelEnabled: jest.fn().mockReturnValue(true),
        getLogLevel: jest.fn().mockReturnValue('info'),
        createPerformanceLogger: jest.fn().mockReturnValue({
            complete: jest.fn(),
            error: jest.fn(),
            progress: jest.fn(),
        }),
    }),
};

// Type declarations for global utilities
// Mock logger type following .cursorrules #5 - no any keyword
interface MockLogger {
    debug: jest.MockedFunction<(...args: unknown[]) => void>;
    info: jest.MockedFunction<(...args: unknown[]) => void>;
    warn: jest.MockedFunction<(...args: unknown[]) => void>;
    error: jest.MockedFunction<(...args: unknown[]) => void>;
    fatal: jest.MockedFunction<(...args: unknown[]) => void>;
    getTaggedLogger: jest.MockedFunction<
        (component: string, tag: string) => MockLogger
    >;
}

declare global {
    namespace NodeJS {
        interface Global {
            testUtils: {
                createMockLogger: () => MockLogger;
            };
        }
    }

    var testUtils: {
        createMockLogger: () => MockLogger;
    };
}
