import type { RecognizeOptions, Worker } from 'tesseract.js';
import { ERROR_CODES, LOG_COMPONENTS, OCR_PAGE_HEIGHT, OCR_PAGE_WIDTH } from '../../../constants';
import type { LoggerService } from '../../../services/LoggerService';
import type { ConfigService } from '../../../services/ConfigService';
import type { FileInfo } from '../../../types';
import { AppError } from '../../../utils/AppError';
import { GetTextAndStructureFromOcr } from './GetTextAndStructureFromOcr';

/**
 * OCR Block structure for visual layout analysis
 */
interface OCRBlock {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    paragraphs?: OCRParagraph[];
}

/**
 * OCR Paragraph structure
 */
interface OCRParagraph {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    lines?: OCRLine[];
}

/**
 * OCR Line structure
 */
interface OCRLine {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
    words?: OCRWord[];
}

/**
 * OCR Word structure
 */
interface OCRWord {
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Generic OCR data structure for analysis
 */
interface OCRData {
    text: string;
    confidence: number;
    blocks?: OCRBlock[];
    paragraphs?: OCRParagraph[];
    lines?: OCRLine[];
    words?: OCRWord[];
}

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
    private readonly defaultLanguage = 'deu'; // Pure German for better umlaut recognition

    constructor(logger: LoggerService, configService: ConfigService) {
        this.logger = logger;
        this.configService = configService;
    }

    /**
     * Post-process OCR text to fix common German umlaut recognition errors
     * Only targets clear OCR errors, not valid German words
     */
    private fixGermanUmlautErrors(text: string): string {
        // Conservative corrections for clear OCR misrecognitions only
        const umlautCorrections: Array<[RegExp, string]> = [
            // ö corrections - only clear OCR errors
            [/\bEr[o0]ffn/gi, 'Eröffn'], // Eröffnen (Eroffnen is not a word)
            [/\bk[o0]nnen\b/gi, 'können'], // können (konnen is not a word)
            [/\bm[o0]glich/gi, 'möglich'], // möglich (moglich is not a word)
            [/\bf[o0]rder/gi, 'förder'], // fördern (forder is not common)
            [/\bg[o0]ttlich/gi, 'göttlich'], // göttlich (gottlich is not a word)

            // ü corrections - target obvious OCR double-letter errors
            [/\bHinzufligungen\b/gi, 'Hinzufügungen'], // Specific OCR error from example
            [/\bVerfligungen\b/gi, 'Verfügungen'], // Similar pattern
            [/\biiber\b/gi, 'über'], // über (iiber is clearly OCR error)
            [/\bfiir\b/gi, 'für'], // für (fiir is clearly OCR error)
            [/\bnatiirlich/gi, 'natürlich'], // natürlich (natiirlich is OCR error)
            [/\bspriiren\b/gi, 'spüren'], // spüren (spriiren is OCR error)
            [/\bmiissen\b/gi, 'müssen'], // müssen (miissen is OCR error)
            [/\bwiirde\b/gi, 'würde'], // würde (wiirde is OCR error)
            [/\bkiinstler/gi, 'künstler'], // künstlerisch (kiinstler is OCR error)
            [/\bzuriick/gi, 'zurück'], // zurück (zuriick is OCR error)
            [/\bRiickzug/gi, 'Rückzug'], // Rückzug (Riickzug is OCR error)
            [/\bverfafit\b/gi, 'verfaßt'], // verfaßt (verfafit is a common OCR error for verfaßt)
            [/\bverfaflen\b/gi, 'verfaßten'], // verfaßten (verfaflen is a common OCR error for verfaßten)
            [/\bverfafler\b/gi, 'verfaßter'], // verfaßter (verfafler is a common OCR error for verfaßter)

            // ä corrections - only clear non-words
            [/\berklaren\b/gi, 'erklären'], // erklären (erklaren is not a word)
            [/\bandern\b/gi, 'ändern'], // ändern (andern is not common as verb)
            [/\bregelmaBig\b/gi, 'regelmäßig'], // regelmäßig (regelmaBig is OCR error)
            [/\blanger\b(?=\s+(als|werden|machen))/gi, 'länger'], // länger only in comparative context

            // ß corrections - target clear B/ss OCR errors
            [/\bgroBe\b/gi, 'große'], // große (groBe with capital B is OCR error)
            [/\bweiB\b/gi, 'weiß'], // weiß (weiB with capital B is OCR error)
            [/\bmuBte\b/gi, 'mußte'], // musste (muBte with capital B is OCR error)
            [/\bdaB\b/gi, 'daß'], // dass (daB with capital B is OCR error)
            [/\bschlieBlich\b/gi, 'schließlich'], // schließlich (schlieBlich is OCR error)
            [/\bgroBer\b/gi, 'größer'], // größer (groBer with capital B is OCR error)
            [/\bgroBte\b/gi, 'größte'], // größte (groBte with capital B is OCR error)
            [/\bheiBt\b/gi, 'heißt'], // heißt (heiBt with capital B is OCR error)

            // Z/I OCR confusion corrections
            [/\bZdee\b/gi, 'Idee'], // Idee (Zdee is OCR error for Z/I confusion)

            // Conservative generic patterns - only obvious OCR patterns
            [/\b([a-zA-Z]+)iii([a-zA-Z]+)\b/g, '$1üi$2'], // Triple i likely OCR error
            [/\b([a-zA-Z]+)iie([a-zA-Z]+)\b/g, '$1üe$2'], // ii+e likely OCR error
            [/\b([a-zA-Z]+)iien\b/g, '$1üen'], // ii+en ending likely OCR error
        ];

        let correctedText = text;
        let corrections = 0;

        for (const [pattern, replacement] of umlautCorrections) {
            correctedText = correctedText.replace(pattern, replacement);

            // Count actual replacements (not just length change)
            const matches = text.match(pattern);
            if (matches) {
                corrections += matches.length;
            }
        }

        if (corrections > 0) {
            this.logger.info(
                LOG_COMPONENTS.PIPELINE_MANAGER,
                `Applied ${corrections} German umlaut corrections`,
                {
                    corrections,
                    beforeLength: text.length,
                    afterLength: correctedText.length,
                },
            );
            console.log(`🔤 Fixed ${corrections} German umlaut recognition errors`);
        }

        return correctedText;
    }

    /**
     * Perform structured OCR on the given file
     *
     * @param fileInfo - File information
     * @param options - OCR processing options
     * @param bookType - Book type for structured text processing
     * @returns OCR result with structured text and metadata
     */
    async performOCR(
        fileInfo: FileInfo,
        options: OCROptions = {},
        bookType: string,
    ): Promise<OCRResult> {
        const startTime = Date.now();
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

            // Configure worker for better German text recognition
            await worker.setParameters({
                tessedit_char_whitelist:
                    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzäöüßÄÖÜ0123456789.,;:!?()[]{}"-— \n\r\t',
                preserve_interword_spaces: '1',
            });

            console.log('🇩🇪 OCR optimized for German text with umlaut recognition');

            try {
                // Perform OCR with structured text recognition
                const result = await this.processWithStructuredRecognition(
                    worker,
                    fileInfo,
                    options,
                    ocrLogger,
                    bookType,
                );

                ocrLogger.info(
                    {
                        filename: fileInfo.name,
                    },
                    'Structured OCR processing completed successfully',
                );

                return result;
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
     * Process file with structured text recognition
     * Simplified to focus on PDF processing which is our primary use case
     */
    private async processWithStructuredRecognition(
        worker: Worker,
        fileInfo: FileInfo,
        options: OCROptions,
        _logger: unknown,
        bookType: string,
    ): Promise<OCRResult> {
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
            const processingTime = Date.now();
            const pdfResults = await this.processPDFWithOCR(filePath, worker, bookType);

            return pdfResults;
        }

        // For non-PDF files, return simple fallback
        // This code path is rarely used in our current workflow
        return {
            structuredText: '',
            pageCount: 0,
            errors: ['Non-PDF files not fully supported in current implementation'],
        };
    }

    /**
     * Process PDF by converting to images and running OCR
     */
    private async processPDFWithOCR(
        filePath: string,
        worker: Worker,
        bookType: string,
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

            let totalConfidence = 0;
            const scanResults: {
                textWithHeaders: string;
                footnoteText: string;
                level1HeadingsIndex: number;
                level2HeadingsIndex: number;
                level3HeadingsIndex: number;
            } = {
                textWithHeaders: '',
                footnoteText: '',
                level1HeadingsIndex: 0,
                level2HeadingsIndex: 0,
                level3HeadingsIndex: 0,
            };

            const errors: string[] = [];

            // Initialize text processor for structured text extraction
            const textProcessor = new GetTextAndStructureFromOcr(this.logger, this.configService);

            // Use the book type passed from CLI

            ocrLogger.info({ pageCount: results.length }, 'Processing pages with OCR');

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

                    // Convert Tesseract data to our OCRData format (handle null vs undefined)
                    const paragraphs = data.paragraphs;

                    // Write paragraphs to paragraphs.json for this page
                    try {
                        const fs = await import('fs/promises');
                        const path = await import('path');

                        const paragraphsJsonPath = path.join(
                            'temp',
                            `paragraphs_page_${pageNumber}.json`,
                        );

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

            const averageConfidence = results.length > 0 ? totalConfidence / results.length : 0;
            const successfulPages = results.length - errors.length;

            // Log completion summary
            console.log('\n🎉 OCR Processing Complete!');
            console.log('📊 Summary:');
            console.log(`   • Total pages: ${results.length}`);
            console.log(`   • Successfully processed: ${successfulPages}`);
            console.log(`   • Failed pages: ${errors.length}`);
            console.log(`   • Average confidence: ${Math.round(averageConfidence)}%`);
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
            const correctedStructuredText = this.fixGermanUmlautErrors(fullStructuredText);

            ocrLogger.info(
                {
                    totalPages: results.length,
                    successfulPages,
                    failedPages: errors.length,
                    averageConfidence,
                    structuredTextLength: correctedStructuredText.length,
                    footnoteTextLength: scanResults.footnoteText.length,
                },
                'OCR processing completed with structured text extraction and German optimizations',
            );

            return {
                structuredText: correctedStructuredText,
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

        const lastCharOfFirst = firstText.charAt(firstText.length - 1);
        const firstCharOfSecond = secondText.charAt(0);

        // Check if last character is hyphen and first character is lowercase
        if (lastCharOfFirst === '-' && firstCharOfSecond === firstCharOfSecond.toLowerCase()) {
            // Remove hyphen and glue the texts together
            return firstText.slice(0, -1) + secondText;
        } else {
            // Add space between texts
            return firstText + ' ' + secondText;
        }
    }
}
