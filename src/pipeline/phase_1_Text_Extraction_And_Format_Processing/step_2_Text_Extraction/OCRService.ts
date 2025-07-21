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
    extractedText: string;
    structuredText: string; // Text with structure markers (# for headings, \n\n for paragraphs, [M]/[T] for footnotes)
    confidence: number;
    processingTime: number;
    pageCount: number;
    language: string;
    errors: string[];
    detectedStructure?: {
        headings: HeadingInfo[];
        paragraphs: ParagraphInfo[];
        footnotes: FootnoteInfo[];
    };
}

/**
 * Heading information from OCR analysis
 */
interface HeadingInfo {
    text: string;
    level: number; // 1 for #, 2 for ##
    confidence: number;
    position: { x: number; y: number; width: number; height: number };
    fontSize: number;
}

/**
 * Paragraph information
 */
interface ParagraphInfo {
    text: string;
    confidence: number;
    position: { x: number; y: number; width: number; height: number };
    wordCount: number;
}

/**
 * Footnote information
 */
interface FootnoteInfo {
    marker: string;
    text: string;
    confidence: number;
    markerPosition: { x: number; y: number; width: number; height: number };
    textPosition: { x: number; y: number; width: number; height: number };
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

                const processingTime = Date.now() - startTime;
                result.processingTime = processingTime;

                ocrLogger.info(
                    {
                        filename: fileInfo.name,
                        processingTime,
                        confidence: result.confidence,
                        textLength: result.extractedText.length,
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
                extractedText: '',
                structuredText: '',
                confidence: 0,
                processingTime: Date.now() - startTime,
                pageCount: 0,
                language: options.language || this.defaultLanguage,
                errors: [`OCR processing failed: ${errorMessage}`],
                detectedStructure: {
                    headings: [],
                    paragraphs: [],
                    footnotes: [],
                },
            };
        }
    }

    /**
     * Process file with structured text recognition
     */
    private async processWithStructuredRecognition(
        worker: Worker,
        fileInfo: FileInfo,
        options: OCROptions,
        _logger: unknown,
        bookType: string,
    ): Promise<OCRResult> {
        // For files with paths, perform actual OCR
        const filePath = fileInfo.path;
        if (filePath) {
            // Handle PDF files by converting to images first
            if (fileInfo.format === 'pdf') {
                const processingTime = Date.now();
                const pdfResults = await this.processPDFWithOCR(
                    filePath,
                    worker,
                    options,
                    bookType,
                );
                pdfResults.processingTime = Date.now() - processingTime;
                return pdfResults;
            }

            // Handle image files directly
            const result = await (
                worker as unknown as {
                    recognize: (...args: unknown[]) => Promise<{ data: OCRData }>;
                }
            ).recognize(filePath);
            const { data } = result;

            // Analyze structure from OCR data
            const detectedStructure = this.analyzeDocumentStructure(
                data as unknown as OCRData,
                options,
            );

            // Create structured text with markers
            const structuredText = this.applyStructuredMarkers(data.text, detectedStructure);

            // Apply German umlaut corrections
            const correctedText = this.fixGermanUmlautErrors(data.text);
            const correctedStructuredText = this.fixGermanUmlautErrors(structuredText);

            return {
                extractedText: correctedText,
                structuredText: correctedStructuredText,
                confidence: data.confidence,
                processingTime: 0,
                pageCount: 1,
                language: options.language || this.defaultLanguage,
                errors: [],
                detectedStructure,
            };
        }

        // Fallback for files without path
        return {
            extractedText: '',
            structuredText: '',
            confidence: 0,
            processingTime: 0,
            pageCount: 0,
            language: options.language || this.defaultLanguage,
            errors: ['No file path provided'],
            detectedStructure: {
                headings: [],
                paragraphs: [],
                footnotes: [],
            },
        };
    }

    /**
     * Analyze document structure using fallback stubs (no actual analysis)
     */
    private analyzeDocumentStructure(
        _ocrData: OCRData,
        _options?: OCROptions,
    ): {
        headings: HeadingInfo[];
        paragraphs: ParagraphInfo[];
        footnotes: FootnoteInfo[];
    } {
        // Simple fallback stub - return empty structures
        // This preserves the interface but doesn't perform any analysis
        return {
            headings: [],
            paragraphs: [],
            footnotes: [],
        };
    }

    // Note: Old text-pattern matching methods and VisualLayoutAnalyzer
    // have been removed and replaced with simple fallback stubs

    /**
     * Process PDF by converting to images and running OCR
     */
    private async processPDFWithOCR(
        filePath: string,
        worker: Worker,
        options: OCROptions,
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
                    const processingResult = await textProcessor.processOCRData(
                        data,
                        bookType,
                        scanResults,
                    );

                    scanResults.textWithHeaders += processingResult.textWithHeaders;
                    scanResults.footnoteText += processingResult.footnoteText;
                    scanResults.level1HeadingsIndex = processingResult.level1HeadingsIndex;
                    scanResults.level2HeadingsIndex = processingResult.level2HeadingsIndex;
                    scanResults.level3HeadingsIndex = processingResult.level3HeadingsIndex;
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
                    totalHeaders:
                        scanResults.level1HeadingsIndex +
                        scanResults.level2HeadingsIndex +
                        scanResults.level3HeadingsIndex,
                    structuredTextLength: correctedStructuredText.length,
                    footnoteTextLength: scanResults.footnoteText.length,
                },
                'OCR processing completed with structured text extraction and German optimizations',
            );

            return {
                extractedText: correctedStructuredText,
                structuredText: correctedStructuredText,
                confidence: averageConfidence,
                processingTime: 0, // Will be set by caller
                pageCount: results.length,
                language: options.language || this.defaultLanguage,
                errors,
            };
        } catch (error) {
            const errorMsg = `PDF OCR processing failed: ${
                error instanceof Error ? error.message : String(error)
            }`;
            ocrLogger.error({ filePath, error: errorMsg }, 'PDF processing failed');

            // Return empty result as fallback
            return {
                extractedText: '',
                structuredText: '',
                confidence: 0,
                processingTime: 0,
                pageCount: 0,
                language: options.language || this.defaultLanguage,
                errors: [errorMsg],
                detectedStructure: {
                    headings: [],
                    paragraphs: [],
                    footnotes: [],
                },
            };
        }
    }

    /**
     * Apply structured markers to create formatted text
     * Fallback stub: returns original text unchanged when no structure is detected
     */
    private applyStructuredMarkers(
        originalText: string,
        structure: {
            headings: HeadingInfo[];
            paragraphs: ParagraphInfo[];
            footnotes: FootnoteInfo[];
        },
    ): string {
        const { headings, paragraphs, footnotes } = structure;

        // If no structure detected, return original text unchanged
        if (headings.length === 0 && paragraphs.length === 0 && footnotes.length === 0) {
            return originalText;
        }

        // This code path will not be reached with current fallback stubs,
        // but kept for potential future structure detection
        let structuredText = '';

        // Sort all elements by vertical position
        const allElements = [
            ...headings.map((h) => ({ ...h, type: 'heading' as const })),
            ...paragraphs.map((p) => ({ ...p, type: 'paragraph' as const })),
            ...footnotes.map((f) => ({
                ...f,
                type: 'footnote' as const,
                position: f.textPosition,
            })),
        ].sort((a, b) => a.position.y - b.position.y);

        // Build structured text with markers
        for (const element of allElements) {
            switch (element.type) {
                case 'heading': {
                    const heading = element as HeadingInfo & { type: 'heading' };
                    const marker = '#'.repeat(heading.level);
                    structuredText += `${marker} ${heading.text}\n\n`;
                    break;
                }

                case 'paragraph': {
                    const paragraph = element as ParagraphInfo & { type: 'paragraph' };
                    structuredText += `${paragraph.text}\n\n`;
                    break;
                }

                case 'footnote': {
                    const footnote = element as FootnoteInfo & { type: 'footnote' };
                    structuredText += `[M]${footnote.marker}[/M] [T]${footnote.text}[/T]\n\n`;
                    break;
                }
            }
        }

        return structuredText.replace(/^\s+/, '').replace(/\s+$/, '');
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
     * Get OCR statistics for analysis
     */
    getOCRStatistics(result: OCRResult): {
        textQuality: 'excellent' | 'good' | 'fair' | 'poor';
        structureDetected: boolean;
        recommendedLanguage: string;
        processingEfficiency: number;
    } {
        const textQuality =
            result.confidence > 90
                ? 'excellent'
                : result.confidence > 75
                  ? 'good'
                  : result.confidence > 60
                    ? 'fair'
                    : 'poor';

        const structureDetected = result.structuredText.includes('#');

        const processingEfficiency =
            result.extractedText.length / Math.max(result.processingTime, 1);

        return {
            textQuality,
            structureDetected,
            recommendedLanguage: result.language,
            processingEfficiency,
        };
    }

    /**
     * Log raw Tesseract data to tesseract_raw.json file
     */
    private async logTesseractRawData(
        pageNumber: number,
        data: OCRData,
        filePath: string,
    ): Promise<void> {
        try {
            const { promises: fs } = await import('node:fs');
            const path = await import('node:path');

            // Extract relevant data from Tesseract response
            const pageData = {
                pageNumber,
                timestamp: new Date().toISOString(),
                sourceFile: path.basename(filePath),
                confidence: data.confidence || 0,
                text: data.text || '',
                paragraphs:
                    data.paragraphs?.map((paragraph) => ({
                        text: paragraph.text || '',
                        confidence: paragraph.confidence || 0,
                        bbox: paragraph.bbox || null,
                        lines:
                            paragraph.lines?.map((line) => ({
                                text: line.text || '',
                                confidence: line.confidence || 0,
                                bbox: line.bbox || null,
                                words:
                                    line.words?.map((word) => ({
                                        text: word.text || '',
                                        confidence: word.confidence || 0,
                                        bbox: word.bbox || null,
                                    })) || [],
                            })) || [],
                    })) || [],
                blocks:
                    data.blocks?.map((block) => ({
                        text: block.text || '',
                        confidence: block.confidence || 0,
                        bbox: block.bbox || null,
                    })) || [],
            };

            // Determine output file path
            const outputDir = path.dirname(filePath);
            const tesseractRawFile = path.join(outputDir, 'tesseract_raw.json');

            // Load existing data if file exists
            let existingData: Array<typeof pageData> = [];
            try {
                const existingContent = await fs.readFile(tesseractRawFile, 'utf8');
                existingData = JSON.parse(existingContent);
                if (!Array.isArray(existingData)) {
                    existingData = [];
                }
            } catch {
                // File doesn't exist or is invalid, start with empty array
                existingData = [];
            }

            // Add new page data
            existingData.push(pageData);

            // Sort by page number
            existingData.sort((a, b) => a.pageNumber - b.pageNumber);

            // Write back to file
            await fs.writeFile(tesseractRawFile, JSON.stringify(existingData, null, 2), 'utf8');

            const ocrLogger = this.logger.getTaggedLogger(LOG_COMPONENTS.OCR_SERVICE, 'ocr');
            ocrLogger.debug(
                {
                    pageNumber,
                    filePath: tesseractRawFile,
                    textLength: pageData.text.length,
                    paragraphCount: pageData.paragraphs.length,
                    blockCount: pageData.blocks.length,
                },
                'Raw Tesseract data saved to tesseract_raw.json',
            );
        } catch (error) {
            const ocrLogger = this.logger.getTaggedLogger(LOG_COMPONENTS.OCR_SERVICE, 'ocr');
            ocrLogger.warn(
                {
                    pageNumber,
                    error: error instanceof Error ? error.message : String(error),
                },
                'Failed to save raw Tesseract data',
            );
        }
    }
}
