import { LOG_COMPONENTS, OCR_PAGE_HEIGHT, OCR_PAGE_WIDTH, OCR_WHITELIST } from '@/constants';
import type { ConfigService } from '@/services/ConfigService';
import type { LoggerService } from '@/services/LoggerService';
import type { BookManifestInfo, FileInfo, FilenameMetadata, BookStructureSection } from '@/types';
import { fixGermanUmlautErrors } from '@/utils/TextUtils';
import type { Worker } from 'tesseract.js';
import Tesseract from 'tesseract.js';
import { GetTextAndStructureFromOcr } from './GetTextAndStructureFromOcr';
import { checkForBookTextStartMarker, checkForBookTextEndMarker } from './checkForBookTextMarkers';
import type { BookStructureService } from '@/services/BookStructureService';

/**
 * OCR result interface with structured text recognition
 */
export interface OCRResult {
    structuredText: string; // Text with structure markers (# for headings, \n\n for paragraphs, [M]/[T] for footnotes)
    pageCount: number;
    errors?: string[];
}

/**
 * OCR options interface
 */
export interface OCROptions {
    language?: string;
    pageRange?: {
        start: number;
        end: number;
    };
    enhanceImage?: boolean;
    timeout?: number;
    detectStructure?: boolean; // Enable structured text recognition
    minHeadingFontSize?: number; // Legacy option - no longer used (structure detection disabled)
    skipStartMarker?: boolean; // Skip checking for start marker
}

/**
 * Advanced OCR Service for structured text recognition
 *
 * Features:
 * - Structured text recognition (headings, paragraphs, footnotes)
 * - Multi-language support with German optimization
 * - Layout analysis and text formatting
 * - Confidence scoring and error detection
 */
export class OCRService {
    private readonly logger: LoggerService;
    private readonly configService: ConfigService;
    private readonly bookStructureService: BookStructureService;
    private readonly defaultLanguage = 'deu'; // Pure German for better umlaut recognition

    constructor(
        logger: LoggerService,
        configService: ConfigService,
        bookStructureService: BookStructureService,
    ) {
        this.logger = logger;
        this.configService = configService;
        this.bookStructureService = bookStructureService;
    }

    /**
     * Perform structured OCR on the given file
     *
     * @param fileInfo - File information
     * @param options - OCR processing options
     * @param bookType - Book type for structured text processing
     * @param bookManifest - Book manifest containing boundary markers
     * @returns OCR result with structured text and metadata
     */
    async performOCR(
        fileInfo: FileInfo,
        options: OCROptions,
        bookType: string,
        bookManifest?: BookManifestInfo,
    ): Promise<OCRResult> {
        const ocrLogger = this.logger.getTaggedLogger(
            LOG_COMPONENTS.PIPELINE_MANAGER,
            'ocr_service',
        );

        ocrLogger.info(
            {
                filename: fileInfo.name,
                format: fileInfo.format,
                size: fileInfo.size,
                options: {
                    language: options.language || this.defaultLanguage,
                    enhanceImage: options.enhanceImage ?? true,
                    detectStructure: options.detectStructure ?? true,
                    timeout: options.timeout || 300000,
                },
            },
            'Starting structured OCR processing with Tesseract.js',
        );

        try {
            // Import Tesseract.js dynamically to handle any import issues
            const { createWorker } = await import('tesseract.js');

            // Initialize Tesseract worker with optimized German language settings
            const language = options.language || this.defaultLanguage;
            const worker = await createWorker(language);

            // Configure worker for better German text recognition with graphics exclusion
            await worker.setParameters({
                // Text recognition settings
                tessedit_char_whitelist: OCR_WHITELIST,
                preserve_interword_spaces: '1',

                // Graphics exclusion settings
                tessedit_do_invert: '0', // Don't invert images (helps exclude graphics)
                tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK, // Process as single text block
                tessedit_min_confidence: '60', // Minimum confidence for text recognition

                // Text-only mode (exclude graphics)
                textonly: '1', // Text-only mode (exclude graphics)

                // Additional graphics exclusion parameters
                tessedit_do_noise_removal: '1', // Remove noise that might be graphics
                tessedit_do_deskew: '1', // Deskew text (graphics are often skewed)
                tessedit_do_adaptive_threshold: '1', // Use adaptive thresholding for text
            });

            console.log('🇩🇪 OCR optimized for German text with graphics exclusion');

            try {
                // Check file path
                const filePath = fileInfo.path;
                if (!filePath) {
                    return {
                        structuredText: '',
                        pageCount: 0,
                        errors: ['No file path provided'],
                    };
                }

                // Handle PDF files by converting to images first
                if (fileInfo.format === 'pdf') {
                    const result = await this.processPDFWithOCR(
                        filePath,
                        worker,
                        bookType,
                        bookManifest,
                        options,
                    );

                    ocrLogger.info(
                        {
                            filename: fileInfo.name,
                        },
                        'Structured OCR processing completed successfully',
                    );

                    return result;
                }

                // For non-PDF files, return simple fallback
                // This code path is rarely used in our current workflow
                return {
                    structuredText: '',
                    pageCount: 0,
                    errors: ['Non-PDF files not fully supported in current implementation'],
                };
            } catch (workerError) {
                // Handle worker-specific errors (like PDF reading issues)
                throw new Error(
                    `OCR processing failed: ${
                        workerError instanceof Error ? workerError.message : String(workerError)
                    }`,
                );
            } finally {
                // Clean up worker safely
                try {
                    await worker.terminate();
                } catch (_terminateError) {
                    // Ignore termination errors
                }
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Return simple fallback result
            ocrLogger.warn(
                {
                    filename: fileInfo.name,
                    error: errorMessage,
                },
                'OCR processing failed, returning empty result',
            );

            return {
                structuredText: '',
                pageCount: 0,
                errors: [`OCR processing failed: ${errorMessage}`],
            };
        }
    }

    /**
     * Process PDF by converting to images and running OCR
     */
    private async processPDFWithOCR(
        filePath: string,
        worker: Worker,
        bookType: string,
        bookManifest?: BookManifestInfo,
        options?: OCROptions,
    ): Promise<OCRResult> {
        const ocrLogger = this.logger.getTaggedLogger(LOG_COMPONENTS.PIPELINE_MANAGER, 'pdf_ocr');

        try {
            // Import pdf2pic dynamically
            const { fromPath } = await import('pdf2pic');
            const fs = await import('node:fs');
            const path = await import('node:path');

            // Ensure temp directory exists
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Convert PDF to images
            const convert = fromPath(filePath, {
                density: 300, // 300 DPI for good quality
                saveFilename: 'page',
                savePath: tempDir,
                format: 'png',
                width: OCR_PAGE_WIDTH,
                height: OCR_PAGE_HEIGHT,
            });

            ocrLogger.info({ filePath }, 'Converting PDF to images');

            // Convert all pages for full processing
            const results = await convert.bulk(-1, { responseType: 'buffer' });

            console.log(`✅ PDF conversion complete! Found ${results.length} pages`);
            console.log('🔍 Starting OCR processing...');

            const scanResults: {
                textWithHeaders: string;
                footnoteText: string;
                level1HeadingsIndex: number;
                level2HeadingsIndex: number;
                level3HeadingsIndex: number;
            } = {
                textWithHeaders: '',
                footnoteText: '\n\n# FUSSNOTEN',
                level1HeadingsIndex: 0,
                level2HeadingsIndex: 0,
                level3HeadingsIndex: 0,
            };

            const errors: string[] = [];

            // Initialize text processor for structured text extraction
            const textProcessor = new GetTextAndStructureFromOcr(
                this.logger,
                this.configService,
                bookManifest,
            );

            // Use the book type passed from CLI

            ocrLogger.info({ pageCount: results.length }, 'Processing pages with OCR');

            let firstContentPageFound = false;

            // Process each page
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                if (!result?.buffer) continue;

                const pageBuffer = result.buffer;
                const pageNumber = i + 1;
                const progressPercent = Math.round((pageNumber / results.length) * 100);

                ocrLogger.info(
                    {
                        pageNumber,
                        totalPages: results.length,
                        progress: `${progressPercent}%`,
                    },
                    `Processing page ${pageNumber}/${results.length} (${progressPercent}%)`,
                );

                try {
                    const { data } = await worker.recognize(pageBuffer);

                    if (!firstContentPageFound) {
                        // Skip start marker check if skipStartMarker is true
                        if (options?.skipStartMarker) {
                            firstContentPageFound = true;
                            console.log(
                                '⏭️  Skipping start marker check (--skip-start-marker enabled)',
                            );
                        } else {
                            const boundaryFound = checkForBookTextStartMarker(
                                data.text,
                                bookManifest,
                                this.logger,
                            );

                            if (boundaryFound) {
                                // Found the boundary marker - skip this page and start processing from next page
                                firstContentPageFound = true;
                                console.log(
                                    `📍 Found boundary start marker on page ${pageNumber} - skipping this page and starting content processing from next page`,
                                );
                                continue; // Skip this page entirely
                            }
                            // Boundary not found yet - continue searching
                            continue;
                        }
                    }

                    // Check for end marker - if found, exit the loop
                    const endBoundaryFound = checkForBookTextEndMarker(
                        data.text,
                        bookManifest,
                        this.logger,
                    );

                    if (endBoundaryFound) {
                        console.log(
                            `📍 Found boundary end marker on page ${pageNumber} - stopping content processing`,
                        );
                        break; // Exit the loop
                    }

                    // Convert Tesseract data to our OCRData format (handle null vs undefined)
                    const paragraphs = data.paragraphs;

                    // Write paragraphs to paragraphs.json for this page
                    try {
                        const fs = await import('node:fs/promises');
                        const path = await import('node:path');

                        const paragraphsJsonPath = path.join(
                            'temp',
                            `paragraphs_page_${pageNumber}.json`,
                        );

                        // Purge all "words" objects from the paragraphs structure before saving
                        function purgeWords(obj: unknown): unknown {
                            if (Array.isArray(obj)) {
                                return obj.map(purgeWords);
                            }
                            if (obj && typeof obj === 'object') {
                                const newObj: Record<string, unknown> = {};
                                for (const [key, value] of Object.entries(obj)) {
                                    if (key === 'words') {
                                        // Remove the "words" property completely
                                        continue;
                                    }
                                    // Recursively process nested objects and arrays
                                    newObj[key] = purgeWords(value);
                                }
                                return newObj;
                            }
                            return obj;
                        }

                        const _paragraphsPurged = purgeWords(paragraphs);

                        await fs.writeFile(
                            paragraphsJsonPath,
                            JSON.stringify(paragraphs ?? [], null, 2),
                            'utf-8',
                        );
                    } catch (writeErr) {
                        ocrLogger.error(
                            { pageNumber, error: writeErr },
                            'Failed to write paragraphs.json for page',
                        );
                    }

                    // Process OCR data with structured text extraction
                    const {
                        success,
                        textWithHeaders,
                        footnoteText,
                        level1HeadingsIndex,
                        level2HeadingsIndex,
                        level3HeadingsIndex,
                    } = await textProcessor.processOCRData(data, bookType, scanResults);

                    if (success) {
                        scanResults.textWithHeaders = this.concatenateText(
                            scanResults.textWithHeaders,
                            textWithHeaders,
                        );
                        scanResults.footnoteText = this.concatenateText(
                            scanResults.footnoteText,
                            footnoteText,
                        );
                        scanResults.level1HeadingsIndex = level1HeadingsIndex;
                        scanResults.level2HeadingsIndex = level2HeadingsIndex;
                        scanResults.level3HeadingsIndex = level3HeadingsIndex;
                    } else {
                        errors.push(`Page ${pageNumber} failed to process`);
                    }
                } catch (pageError) {
                    const errorMsg = `Failed to process page ${pageNumber}: ${
                        pageError instanceof Error ? pageError.message : String(pageError)
                    }`;
                    errors.push(errorMsg);
                    console.log(
                        `❌ Page ${pageNumber} failed: ${
                            pageError instanceof Error ? pageError.message : String(pageError)
                        }`,
                    );
                    ocrLogger.warn({ pageNumber, error: errorMsg }, 'Page processing failed');
                }
            }

            // Clean up temporary files if needed
            // Note: pdf2pic with buffer response type doesn't create temp files

            const successfulPages = results.length - errors.length;

            // Log completion summary
            console.log('\n🎉 OCR Processing Complete!');
            console.log('📊 Summary:');
            console.log(`   • Total pages: ${results.length}`);
            console.log(`   • Successfully processed: ${successfulPages}`);
            console.log(`   • Failed pages: ${errors.length}`);
            console.log(
                `   • Detected headers: ${scanResults.level1HeadingsIndex + scanResults.level2HeadingsIndex + scanResults.level3HeadingsIndex}`,
            );
            console.log(
                `   • Structured text length: ${scanResults.textWithHeaders.length.toLocaleString()} characters`,
            );
            console.log(
                `   • Footnote text length: ${scanResults.footnoteText.length.toLocaleString()} characters`,
            );

            if (errors.length > 0) {
                console.log(`⚠️  ${errors.length} pages had errors - check logs for details`);
            }

            // Apply German umlaut corrections to structured text
            console.log('🔤 Applying German umlaut corrections...');
            const fullStructuredText = scanResults.textWithHeaders + scanResults.footnoteText;
            const { correctedText: correctedStructuredText } = fixGermanUmlautErrors(
                fullStructuredText,
                this.logger,
            );

            // Apply text removal patterns to clean text (not for now because it seems to be dangerous)
            const cleanedStructuredText = await this.applyTextRemovalPatterns(
                correctedStructuredText,
                bookType,
            );

            // Write book structure and footnotes to manifest if we have the metadata
            if (bookManifest) {
                await this.writeBookStructureToManifest(
                    cleanedStructuredText,
                    scanResults.footnoteText,
                    bookManifest,
                );
            }

            ocrLogger.info(
                {
                    totalPages: results.length,
                    successfulPages,
                    failedPages: errors.length,
                    structuredTextLength: correctedStructuredText.length,
                    footnoteTextLength: scanResults.footnoteText.length,
                },
                'OCR processing completed with structured text extraction and German optimizations',
            );

            return {
                structuredText: cleanedStructuredText,
                pageCount: results.length,
            };
        } catch (error) {
            const errorMsg = `PDF OCR processing failed: ${
                error instanceof Error ? error.message : String(error)
            }`;
            ocrLogger.error({ filePath, error: errorMsg }, 'PDF processing failed');

            // Return empty result as fallback
            return {
                structuredText: '',
                pageCount: 0,
                errors: [errorMsg],
            };
        }
    }

    /**
     * Check if OCR is required for the given file
     */
    isOCRRequired(fileInfo: FileInfo): boolean {
        const imageFormats = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp'];
        return imageFormats.includes(fileInfo.format.toLowerCase());
    }

    /**
     * Get supported OCR languages
     */
    getSupportedLanguages(): string[] {
        return [
            'deu', // German
        ];
    }

    /**
     * Concatenate two text strings with hyphenation handling
     * If last character of first text is hyphen and first character of second text is lowercase,
     * then glue them (remove hyphen), otherwise put a space in between
     */
    private concatenateText(firstText: string, secondText: string): string {
        if (!firstText || firstText.length === 0) {
            return secondText;
        }

        if (!secondText || secondText.length === 0) {
            return firstText;
        }

        // Remove trailing spaces (but not newlines) from first text before checking hyphenation
        const trimmedFirstText = firstText.replace(/[ \t]+$/, '');

        const lastCharOfFirst = trimmedFirstText.charAt(trimmedFirstText.length - 1);
        const firstCharOfSecond = secondText.charAt(0);

        // Check if last character is hyphen and first character is lowercase
        if (lastCharOfFirst === '-' && firstCharOfSecond === firstCharOfSecond.toLowerCase()) {
            // Remove hyphen and glue the texts together
            return trimmedFirstText.slice(0, -1) + secondText;
        }
        // Add space between texts
        return `${trimmedFirstText} ${secondText}`;
    }

    /**
     * Apply text removal patterns to clean text
     */
    private async applyTextRemovalPatterns(text: string, bookType: string): Promise<string> {
        try {
            // Load book type configuration to get text removal patterns
            const bookTypesConfig = await this.configService.loadBookTypesConfig();

            if (!bookTypesConfig || typeof bookTypesConfig !== 'object') {
                return text;
            }

            const config = bookTypesConfig[bookType] as Record<string, unknown>;
            if (!config) {
                return text;
            }

            const textRemovalPatterns =
                (config.textRemovalPatterns as string[]) ||
                (config['text-removal-patterns'] as string[]) ||
                [];

            if (textRemovalPatterns.length === 0) {
                return text;
            }

            let cleanedText = text;

            for (const pattern of textRemovalPatterns) {
                try {
                    // Handle both string patterns and regex patterns
                    const regexPattern =
                        pattern.startsWith('/') && pattern.endsWith('/')
                            ? new RegExp(pattern.slice(1, -1), 'g')
                            : new RegExp(pattern, 'g');

                    cleanedText = cleanedText.replace(regexPattern, '');
                } catch (error) {
                    this.logger.warn(
                        LOG_COMPONENTS.PIPELINE_MANAGER,
                        'Failed to apply text removal pattern',
                        {
                            pattern,
                            error: error instanceof Error ? error.message : String(error),
                        },
                    );
                }
            }

            return cleanedText;
        } catch (error) {
            this.logger.warn(
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'Failed to load text removal patterns',
                {
                    bookType,
                    error: error instanceof Error ? error.message : String(error),
                },
            );
            return text;
        }
    }

    /**
     * Write book structure and footnotes to the manifest file.
     */
    private async writeBookStructureToManifest(
        structuredText: string,
        footnoteText: string,
        bookManifest: BookManifestInfo,
    ): Promise<void> {
        try {
            // Parse structured text to extract headers and paragraphs
            const bookStructure = this.parseStructuredText(structuredText);
            const footnotes = this.parseFootnotes(footnoteText);

            // Update the book manifest with the extracted structure
            const updatedManifest: BookManifestInfo = {
                ...bookManifest,
                bookStructure: bookStructure,
                footnotes: footnotes as unknown as BookManifestInfo['footnotes'], // Cast to match the expected type
            };

            // Get the metadata from the book manifest to save it
            const metadata: FilenameMetadata = {
                author: bookManifest.author,
                title: bookManifest.title,
                bookIndex: bookManifest.bookIndex,
                originalFilename: `${bookManifest.author}#${bookManifest.title}${bookManifest.bookIndex ? `#${bookManifest.bookIndex}` : ''}`,
            };

            // Save the updated manifest using the BookStructureService
            await this.bookStructureService.saveBookManifest(metadata, updatedManifest);

            this.logger.info(
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'Book structure and footnotes written to manifest',
                {
                    structureItems: bookStructure.length,
                    footnotesCount: footnotes.length,
                },
            );
        } catch (error) {
            this.logger.error(
                LOG_COMPONENTS.PIPELINE_MANAGER,
                'Failed to write book structure to manifest',
                {
                    error: error instanceof Error ? error.message : String(error),
                },
            );
        }
    }

    /**
     * Parse structured text to extract headers and their first 5 words of following paragraphs
     */
    private parseStructuredText(structuredText: string): string[] {
        const structure: string[] = [];

        // Skip the footnotes section
        const mainContent = structuredText.split('# FUSSNOTEN')[0] || structuredText;
        const contentLines = mainContent.split('\n');

        for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i]?.trim() || '';

            // Check for headers (#, ##, ###)
            if (line.startsWith('#')) {
                // Add the header as is

                structure.push(line);
            } else if (line.length > 0) {
                // This is a paragraph line - extract first 5 words
                const words = line.split(/\s+/).filter((word) => word.length > 0);
                if (words.length > 0) {
                    const firstFiveWords = words.slice(0, 5).join(' ');
                    structure.push(firstFiveWords);
                }
            }
        }

        return structure;
    }

    /**
     * Parse footnotes from footnote text
     */
    private parseFootnotes(footnoteText: string): string[] {
        const footnotes: string[] = [];
        const lines = footnoteText.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Skip empty lines and the "FUSSNOTEN" header
            if (trimmedLine.length === 0 || trimmedLine === '# FUSSNOTEN') {
                continue;
            }

            // Remove any footnote markers and add to array
            const cleanFootnote = trimmedLine.replace(/^\[[MT]\]\s*/, '').trim();
            if (cleanFootnote.length > 0) {
                footnotes.push(cleanFootnote);
            }
        }

        return footnotes;
    }
}
