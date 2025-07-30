import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ARTIFACTS_STRUCTURE, ERROR_CODES, LOG_COMPONENTS } from '@/constants';
import type { BookStructureService } from '@/services/BookStructureService';
import type { ConfigService } from '@/services/ConfigService';
import type { LoggerService } from '@/services/LoggerService';
import { OCRService } from '@/services/OCRService';
import type { FileInfo, FilenameMetadata } from '@/types';
import { AppError } from '@/utils/AppError';

/**
 * Text extraction options
 */
export interface TextExtractionOptions {
    hasTextBoundaries: boolean;
    boundaries: {
        textBefore?: string;
        textAfter?: string;
    };
    fileType: string;
    outputDir?: string; // Optional - intermediate results always go to book-artifacts directory
    skipStartMarker?: boolean;
}

/**
 * Text extraction result
 */
export interface TextExtractionResult {
    extractedText: string;
    ocrText?: string; // Separate OCR text for comparison and quality analysis
    pagesExtracted?: number;
}

/**
 * TextExtractor handles text extraction from various file formats
 */
export class TextExtractor {
    private readonly logger: LoggerService;
    private readonly configDir: string;
    private readonly ocrService: OCRService;
    private readonly bookStructureService: BookStructureService;

    constructor(
        logger: LoggerService,
        configService: ConfigService,
        configDir: string,
        bookStructureService: BookStructureService,
    ) {
        this.logger = logger;
        this.configDir = configDir;
        this.ocrService = new OCRService(logger, configService);
        this.bookStructureService = bookStructureService;
    }

    /**
     * Extract text from a file
     */
    async extractText(
        fileInfo: FileInfo,
        options: TextExtractionOptions,
        metadata: FilenameMetadata,
        bookType: string,
    ): Promise<TextExtractionResult> {
        const extractionLogger = this.logger.getTaggedLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
            'text_extraction',
        );

        extractionLogger.info(
            {
                filename: fileInfo.name,
                format: fileInfo.format,
                hasTextBoundaries: options.hasTextBoundaries,
                boundaries: options.boundaries,
            },
            'Starting text extraction based on book structure',
        );

        try {
            // Check and prompt for missing boundaries
            const updatedOptions = await this.checkAndPromptBoundaries(
                metadata,
                options,
            );

            // Extract text based on file type
            const result = await this.performTextExtraction(
                fileInfo,
                updatedOptions,
                metadata,
                bookType,
            );

            // Save extracted text to book-artifacts directory
            await this.saveResults(fileInfo, metadata, result, updatedOptions);

            return result;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.EXTRACTION_FAILED,
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'extractText',
                `Failed to extract text from ${fileInfo.name}`,
                { filename: fileInfo.name, format: fileInfo.format },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Check for missing boundaries and prompt user if needed
     */
    private async checkAndPromptBoundaries(
        metadata: FilenameMetadata,
        options: TextExtractionOptions,
    ): Promise<TextExtractionOptions> {
        // Get the cached manifest from BookStructureService
        const manifest = this.bookStructureService.getBookManifest(metadata);

        if (!manifest) {
            throw new AppError(
                ERROR_CODES.CONFIG_INVALID,
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'checkAndPromptBoundaries',
                'Book manifest not loaded. Call loadBookManifest first.',
                { metadata },
            );
        }

        // Ensure book directory exists
        const configKey = this.getConfigKey(metadata);
        const bookDir = path.join(this.configDir, configKey);
        await fs.mkdir(bookDir, { recursive: true });

        const updatedOptions = { ...options };

        if (options.hasTextBoundaries) {
            // Check for text-based boundaries
            if (!manifest.textBeforeFirstChapter || !manifest.textAfterLastChapter) {
                const { textBefore, textAfter } = await this.promptWithSpinnerPause(
                    () => this.promptForTextBoundaries(metadata),
                    metadata,
                );

                // Update the manifest in the BookStructureService
                await this.bookStructureService.updateBookManifest(metadata, {
                    textBeforeFirstChapter: textBefore,
                    textAfterLastChapter: textAfter,
                });

                updatedOptions.boundaries.textBefore = textBefore;
                updatedOptions.boundaries.textAfter = textAfter;
            } else {
                updatedOptions.boundaries.textBefore = manifest.textBeforeFirstChapter;
                updatedOptions.boundaries.textAfter = manifest.textAfterLastChapter;
            }
        }

        return updatedOptions;
    }

    /**
     * Perform text extraction based on file type
     */
    private async performTextExtraction(
        fileInfo: FileInfo,
        options: TextExtractionOptions,
        metadata: FilenameMetadata,
        bookType: string,
    ): Promise<TextExtractionResult> {
        switch (fileInfo.format) {
            case 'pdf':
                if (options.fileType === 'pdf-text-ocr') {
                    return this.extractFromPdfTextOcr(
                        fileInfo,
                        options,
                        metadata,
                        bookType,
                    );
                }
                return this.extractFromPdfText(fileInfo, options);
            case 'epub':
                return this.extractFromEpub(fileInfo, options);
            case 'txt':
                return this.extractFromText(fileInfo, options);
            default:
                throw new AppError(
                    ERROR_CODES.INVALID_FORMAT,
                    LOG_COMPONENTS.PIPELINE_MANAGER,
                    'performTextExtraction',
                    `Unsupported file format: ${fileInfo.format}`,
                    { format: fileInfo.format },
                );
        }
    }

    /**
     * Extract text from PDF (text-based)
     */
    private async extractFromPdfText(
        fileInfo: FileInfo,
        options: TextExtractionOptions,
    ): Promise<TextExtractionResult> {
        const pdfParse = await import('pdf-parse');
        const buffer = await fs.readFile(fileInfo.path);
        const pdfData = await pdfParse.default(buffer);

        let extractedText = pdfData.text;

        let boundaryResult: {
            extractedText: string;
            startFound: boolean;
            endFound: boolean;
        } | null = null;

        if (
            options.hasTextBoundaries &&
            options.boundaries.textBefore &&
            options.boundaries.textAfter
        ) {
            // Extract text between text markers
            boundaryResult = this.extractTextBoundaries(
                extractedText,
                options.boundaries.textBefore,
                options.boundaries.textAfter,
            );
            extractedText = boundaryResult.extractedText;
        } else {
            // Clean up spaces even if no boundaries are set
            extractedText = this.cleanupMultipleSpaces(extractedText);
        }

        return {
            extractedText,
            pagesExtracted: pdfData.numpages,
        };
    }

    /**
     * Extract text between text boundaries using string markers, when the full text is extracted
     */
    private extractTextBoundaries(
        text: string,
        textBefore: string,
        textAfter: string,
    ): { extractedText: string; startFound: boolean; endFound: boolean } {
        // CRITICAL: Clean up spaces FIRST, then search for markers
        // This ensures markers work correctly after space normalization
        const cleanedText = this.cleanupMultipleSpaces(text);

        // CRITICAL: Normalize Unicode characters for consistent comparison
        // This fixes issues where ü in config file has different Unicode representation than extracted text
        const normalizedText = cleanedText.normalize('NFC');
        const normalizedTextBefore = textBefore.normalize('NFC');
        const normalizedTextAfter = textAfter.normalize('NFC');

        let startIndex = 0;
        let endIndex = normalizedText.length;
        let startFound = false;
        let endFound = false;

        // Find the start text marker in normalized text
        const startMarkerIndex = normalizedText.indexOf(normalizedTextBefore);
        if (startMarkerIndex !== -1) {
            // Start AFTER the marker text (exclude the marker itself)
            startIndex = startMarkerIndex + normalizedTextBefore.length;
            startFound = true;
            console.log(`✅ Start text marker found at position ${startMarkerIndex}`);
        } else {
            console.error(`❌ Start text marker not found: "${normalizedTextBefore}"`);
            console.log(
                '📍 If the start marker is not found, assume the document starts at position 0',
            );

            // Debug: Show similar text around potential matches
            this.debugTextMarkerSearch(normalizedText, normalizedTextBefore, 'start');

            startIndex = 0;
            startFound = false;
        }

        // Find the end text marker - look for the FIRST occurrence after the start marker
        const endMarkerIndex = normalizedText.indexOf(normalizedTextAfter, startIndex);
        if (endMarkerIndex !== -1) {
            // End BEFORE the marker text (exclude the marker itself)
            endIndex = endMarkerIndex;
            endFound = true;
        } else {
            console.error(`❌ End text marker not found: "${normalizedTextAfter}"`);
            console.log(
                '📍 If the end marker is not found, assume the document continues to the end',
            );
            endIndex = normalizedText.length;
            endFound = false;
        }

        // Sanity check: ensure start comes before end
        if (startFound && endFound && startIndex >= endIndex) {
            console.error(
                '❌ Start marker comes after end marker - using entire document',
            );
            console.error(`Start index: ${startIndex}, End index: ${endIndex}`);
            // Fallback to entire document
            startIndex = 0;
            endIndex = normalizedText.length;
            startFound = false;
            endFound = false;
        }

        const extractedText = normalizedText.slice(startIndex, endIndex);

        return {
            extractedText,
            startFound,
            endFound,
        };
    }

    /**
     * Clean up multiple consecutive spaces in text
     */
    private cleanupMultipleSpaces(text: string): string {
        // Replace multiple spaces with single space, repeat until no more multiple spaces
        let cleanedText = text;
        let previousLength = 0;

        // Keep cleaning until no more changes occur
        while (cleanedText.length !== previousLength) {
            previousLength = cleanedText.length;
            cleanedText = cleanedText.replace(/\s\s+/g, ' ');
        }

        return cleanedText;
    }

    /**
     * Check if OCR file already exists and load it if found
     */
    private async checkForExistingOcrFile(
        fileInfo: FileInfo,
        metadata: FilenameMetadata,
    ): Promise<{ exists: boolean; content?: string; filePath?: string }> {
        try {
            const configKey = this.getConfigKey(metadata);
            const bookDir = path.join(this.configDir, configKey);
            const phase1Dir = path.join(bookDir, ARTIFACTS_STRUCTURE.PHASE_DIRS.PHASE1);
            const ocrFile = path.join(phase1Dir, 'step2.ocr');

            // Check if OCR file exists
            const stats = await fs.stat(ocrFile);
            if (stats.isFile()) {
                const content = await fs.readFile(ocrFile, 'utf-8');

                this.logger.info(
                    LOG_COMPONENTS.PIPELINE_MANAGER,
                    'Found existing OCR file, skipping OCR process',
                    {
                        filename: fileInfo.name,
                        ocrFile,
                        contentLength: content.length,
                    },
                );

                console.log(
                    `📄 Found existing OCR file: ${ocrFile} (${content.length} chars)`,
                );

                return {
                    exists: true,
                    content: content.trim(),
                    filePath: ocrFile,
                };
            }
        } catch (error) {
            // File doesn't exist or other error - that's fine, we'll do OCR
            this.logger.debug(
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'No existing OCR file found, will perform OCR',
                {
                    filename: fileInfo.name,
                    error: error instanceof Error ? error.message : String(error),
                },
            );
        }

        return { exists: false };
    }

    /**
     * Extract text from PDF (hybrid text + OCR)
     */
    private async extractFromPdfTextOcr(
        fileInfo: FileInfo,
        options: TextExtractionOptions,
        metadata: FilenameMetadata,
        bookType: string,
    ): Promise<TextExtractionResult> {
        // First extract embedded text
        const textResult = await this.extractFromPdfText(fileInfo, options);

        // Check for existing OCR file first
        const existingOcr = await this.checkForExistingOcrFile(fileInfo, metadata);

        let ocrText: string;

        if (existingOcr.exists && existingOcr.content) {
            // Use existing OCR file - DON'T apply boundaries as file is already processed
            ocrText = existingOcr.content;

            return {
                extractedText: textResult.extractedText,
                ocrText,
                pagesExtracted: textResult.pagesExtracted,
            };
        }

        // Perform OCR if no existing file found
        try {
            // Get the book manifest for boundary markers
            const bookManifest = this.bookStructureService.getBookManifest(metadata);

            const ocrResult = await this.ocrService.performOCR(
                fileInfo,
                {
                    language: 'deu', // Pure German for better umlaut recognition
                    detectStructure: true,
                    enhanceImage: true,
                    timeout: 300000,
                    skipStartMarker: options.skipStartMarker,
                },
                bookType,
                bookManifest,
            );

            return {
                extractedText: textResult.extractedText,
                ocrText: ocrResult.structuredText, // OCR text with structured markup for .ocr file
            };
        } catch (error) {
            this.logger.error(
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'OCR processing failed in hybrid mode, using text-only',
                {
                    filename: fileInfo.name,
                    error: error instanceof Error ? error.message : String(error),
                },
            );

            // Return just the text result with a placeholder OCR text
            return {
                extractedText: textResult.extractedText,
                ocrText:
                    '# OCR Processing Failed\n\nOCR processing failed during hybrid extraction. Using embedded text only.',
                pagesExtracted: textResult.pagesExtracted,
            };
        }
    }

    /**
     * Extract text from EPUB
     */
    private async extractFromEpub(
        fileInfo: FileInfo,
        _options: TextExtractionOptions,
    ): Promise<TextExtractionResult> {
        // Placeholder EPUB implementation
        const extractedText = `[EPUB Content from ${fileInfo.name}]\n\nThis is placeholder EPUB text.`;

        return {
            extractedText,
            pagesExtracted: 0,
        };
    }

    /**
     * Extract text from plain text file
     */
    private async extractFromText(
        fileInfo: FileInfo,
        options: TextExtractionOptions,
    ): Promise<TextExtractionResult> {
        const content = await fs.readFile(fileInfo.path, 'utf-8');

        let extractedText = content;
        let boundaryResult: {
            extractedText: string;
            startFound: boolean;
            endFound: boolean;
        } | null = null;

        if (
            options.hasTextBoundaries &&
            options.boundaries.textBefore &&
            options.boundaries.textAfter
        ) {
            boundaryResult = this.extractTextBoundaries(
                extractedText,
                options.boundaries.textBefore,
                options.boundaries.textAfter,
            );
            extractedText = boundaryResult.extractedText;
        } else {
            // Clean up spaces even if no boundaries are set
            extractedText = this.cleanupMultipleSpaces(extractedText);
        }

        return {
            extractedText,
            pagesExtracted: 0,
        };
    }

    /**
     * Save results to the book-artifacts directory structure
     */
    private async saveResults(
        fileInfo: FileInfo,
        metadata: FilenameMetadata,
        result: TextExtractionResult,
        options: TextExtractionOptions,
    ): Promise<void> {
        // Create book-specific directory path
        const configKey = this.getConfigKey(metadata);
        const bookDir = path.join(this.configDir, configKey);
        const phase1Dir = path.join(bookDir, ARTIFACTS_STRUCTURE.PHASE_DIRS.PHASE1);

        // Ensure the phase1 directory exists
        await fs.mkdir(phase1Dir, { recursive: true });

        // Use new naming convention: step2.txt and step2.ocr (Step 2 = Text Extraction)
        const textFile = path.join(phase1Dir, 'step2.txt');
        const ocrFile = path.join(phase1Dir, 'step2.ocr');

        // Always save main extracted text
        await fs.writeFile(textFile, result.extractedText, 'utf-8');
        console.log(`💾 Saved text file: ${textFile}`);

        // Save OCR text if available (for PDF-text-ocr hybrid processing)
        if (result.ocrText && result.ocrText.trim().length > 0) {
            await fs.writeFile(ocrFile, result.ocrText, 'utf-8');
            console.log(`💾 Saved OCR file: ${ocrFile}`);
        } else if (options.fileType === 'pdf-text-ocr') {
            // For hybrid processing, always create an OCR file even if empty
            await fs.writeFile(
                ocrFile,
                '# OCR Processing Failed\n\nNo OCR results available.',
                'utf-8',
            );
            console.log(`💾 Saved empty OCR file (processing failed): ${ocrFile}`);
        }

        this.logger.info(
            LOG_COMPONENTS.PIPELINE_MANAGER,
            'Step 2 (Text Extraction) results saved to book-artifacts directory',
            {
                filename: fileInfo.name,
                textFile,
                ocrFile:
                    result.ocrText || options.fileType === 'pdf-text-ocr'
                        ? ocrFile
                        : null,
                extractedLength: result.extractedText.length,
                ocrLength: result.ocrText?.length || 0,
                phase1Dir,
            },
        );
    }

    /**
     * Generate config key from metadata
     */
    private getConfigKey(metadata: FilenameMetadata): string {
        const { author, title, bookIndex } = metadata;
        return `${author}#${title}${bookIndex ? `#${bookIndex}` : ''}`;
    }

    /**
     * Prompt user for text boundaries
     */
    private async promptForTextBoundaries(
        _metadata: FilenameMetadata,
    ): Promise<{ textBefore: string; textAfter: string }> {
        // Placeholder implementation - in real app this would prompt user
        return {
            textBefore: 'Default start text',
            textAfter: 'Default end text',
        };
    }

    /**
     * Debug helper to find similar text when marker search fails
     */
    private debugTextMarkerSearch(
        text: string,
        marker: string,
        markerType: 'start' | 'end',
    ): void {
        const maxSamples = 3;
        const contextLength = 100;

        console.log(`🔍 Debugging ${markerType} marker search for: "${marker}"`);
        console.log(`📄 Total text length: ${text.length} characters`);

        // Try partial matches
        const markerWords = marker.split(/\s+/);
        if (markerWords.length > 1) {
            console.log(
                `🔍 Searching for partial matches of ${markerWords.length} words...`,
            );

            for (let i = 0; i < markerWords.length && i < maxSamples; i++) {
                const word = markerWords[i];
                if (word && word.length > 2) {
                    // Skip very short words
                    const wordIndex = text.indexOf(word);
                    if (wordIndex !== -1) {
                        const start = Math.max(0, wordIndex - contextLength / 2);
                        const end = Math.min(
                            text.length,
                            wordIndex + word.length + contextLength / 2,
                        );
                        const context = text.slice(start, end);
                        console.log(
                            `  ✅ Found word "${word}" at position ${wordIndex}:`,
                        );
                        console.log(`     Context: "...${context}..."`);
                    }
                }
            }
        }

        // Show beginning/end of document for context
        if (markerType === 'start') {
            const beginning = text.slice(0, Math.min(500, text.length));
            console.log('📖 Document beginning (first 500 chars):');
            console.log(`     "${beginning}..."`);
        } else {
            const ending = text.slice(Math.max(0, text.length - 500));
            console.log('📖 Document ending (last 500 chars):');
            console.log(`     "...${ending}"`);
        }
    }

    /**
     * Pause spinner and prompt user
     */
    private async promptWithSpinnerPause<T>(
        promptFn: () => Promise<T>,
        _metadata: FilenameMetadata,
    ): Promise<T> {
        // Placeholder implementation
        return promptFn();
    }
}
