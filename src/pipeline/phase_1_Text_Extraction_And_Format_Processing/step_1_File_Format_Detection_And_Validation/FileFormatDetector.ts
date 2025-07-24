import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import pdfParse from 'pdf-parse';
import {
    BANNER_MESSAGES,
    ERROR_CODES,
    FILE_SIZE_LIMITS,
    FORMAT_DETECTION_CONFIDENCE,
    LOG_COMPONENTS,
    MAGIC_NUMBERS,
    MIME_TYPES,
    PDF_CONTENT_TYPES,
    SUPPORTED_FORMATS,
    VALIDATION_THRESHOLDS,
} from '../../../constants';
import type { LoggerService } from '../../../services/LoggerService';
import type {
    FileFormatMetadata,
    FileFormatResult,
    FileInfo,
    MagicNumberResult,
    PDFValidationResult,
    SupportedFormat,
    ValidationIssue,
    ValidationResult,
} from '../../../types';
import { AppError } from '../../../utils/AppError';

/**
 * Comprehensive file format detector that validates actual file content
 * beyond just file extensions
 */
export class FileFormatDetector {
    private readonly logger: LoggerService;

    constructor(logger: LoggerService) {
        this.logger = logger;
    }

    /**
     * Display phase banners
     */
    public displayPhase1Banner(): void {
        console.log('');
        for (const line of BANNER_MESSAGES.PHASE_1_START) {
            console.log(line);
        }
        console.log('');
    }

    public displayStep1Banner(): void {
        console.log(BANNER_MESSAGES.STEP_1_1);
        console.log('');
    }

    /**
     * Detect and validate file format
     */
    async detectFormat(fileInfo: FileInfo): Promise<FileFormatResult> {
        const detectorLogger = this.logger.getTextExtractionLogger(
            LOG_COMPONENTS.FILE_HANDLER,
        );

        detectorLogger.debug(
            {
                filePath: fileInfo.path,
                extension: extname(fileInfo.path),
                size: fileInfo.size,
            },
            'Starting file format detection',
        );

        try {
            // Step 1: Read file header for magic number detection
            const header = await this.readFileHeader(fileInfo.path);

            // Step 2: Detect format by magic numbers
            const magicNumberResult = this.detectByMagicNumbers(header);

            // Step 3: Validate against file extension
            const extensionFormat = this.getFormatFromExtension(fileInfo.path);

            // Step 4: Validate file size
            const sizeValidation = this.validateFileSize(
                fileInfo.size,
                magicNumberResult.format || extensionFormat,
            );

            // Step 5: Perform format-specific validation
            const validationResult = await this.validateFormat(
                fileInfo,
                magicNumberResult.format || extensionFormat,
            );

            // Step 6: Calculate confidence and final result
            const result = this.calculateFinalResult(
                magicNumberResult,
                extensionFormat,
                sizeValidation,
                validationResult,
                fileInfo.size,
            );

            detectorLogger.info(
                {
                    filePath: fileInfo.path,
                    detectedFormat: result.format,
                    confidence: result.confidence,
                    isValid: result.isValid,
                    issues: result.issues,
                    contentType: result.metadata.contentType,
                },
                'File format detection completed',
            );

            return result;
        } catch (error) {
            throw new AppError(
                ERROR_CODES.INVALID_FORMAT,
                LOG_COMPONENTS.FILE_HANDLER,
                'detectFormat',
                `Failed to detect file format: ${fileInfo.path}`,
                { filePath: fileInfo.path },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Read file header for magic number detection
     */
    private async readFileHeader(filePath: string): Promise<Buffer> {
        try {
            const fd = await fs.open(filePath, 'r');
            const buffer = Buffer.alloc(VALIDATION_THRESHOLDS.MAX_HEADER_SIZE);
            const { bytesRead } = await fd.read(
                buffer,
                0,
                VALIDATION_THRESHOLDS.MAX_HEADER_SIZE,
                0,
            );
            await fd.close();
            return buffer.subarray(0, bytesRead);
        } catch (error) {
            throw new AppError(
                ERROR_CODES.FILE_NOT_FOUND,
                LOG_COMPONENTS.FILE_HANDLER,
                'readFileHeader',
                `Failed to read file header: ${filePath}`,
                { filePath },
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    /**
     * Detect format by magic numbers (file signatures)
     */
    private detectByMagicNumbers(header: Buffer): MagicNumberResult {
        const magicNumbers = [
            {
                format: 'pdf' as SupportedFormat,
                signature: Buffer.from(MAGIC_NUMBERS.PDF),
                offset: 0,
                confidence: FORMAT_DETECTION_CONFIDENCE.VERY_HIGH,
            },
            {
                format: 'epub' as SupportedFormat,
                signature: Buffer.from(MAGIC_NUMBERS.EPUB),
                offset: 0,
                confidence: FORMAT_DETECTION_CONFIDENCE.HIGH,
            },
        ];

        for (const magic of magicNumbers) {
            const headerSlice = header.subarray(
                magic.offset,
                magic.offset + magic.signature.length,
            );
            if (headerSlice.equals(magic.signature)) {
                return {
                    format: magic.format,
                    confidence: magic.confidence,
                    detectedAt: magic.offset,
                };
            }
        }

        // Check for text files (UTF-8 BOM)
        if (
            header.length >= 3 &&
            header[0] === MAGIC_NUMBERS.UTF8_BOM[0] &&
            header[1] === MAGIC_NUMBERS.UTF8_BOM[1] &&
            header[2] === MAGIC_NUMBERS.UTF8_BOM[2]
        ) {
            return {
                format: 'txt',
                confidence: FORMAT_DETECTION_CONFIDENCE.HIGH,
                detectedAt: 0,
            };
        }

        // Check for text files (no BOM, contains printable characters)
        if (this.isLikelyTextFile(header)) {
            return {
                format: 'txt',
                confidence: FORMAT_DETECTION_CONFIDENCE.MEDIUM,
                detectedAt: 0,
            };
        }

        return { format: null, confidence: 0, detectedAt: -1 };
    }

    /**
     * Check if buffer contains mostly printable characters (likely text)
     */
    private isLikelyTextFile(buffer: Buffer): boolean {
        let printableCount = 0;
        const totalChecked = Math.min(buffer.length, 512);

        for (let i = 0; i < totalChecked; i++) {
            const byte = buffer[i];
            if (byte !== undefined) {
                // Printable ASCII + common whitespace + UTF-8 continuation bytes
                if (
                    (byte >= 32 && byte <= 126) ||
                    byte === 9 ||
                    byte === 10 ||
                    byte === 13 ||
                    byte >= 128
                ) {
                    printableCount++;
                }
            }
        }

        return (
            printableCount / totalChecked > VALIDATION_THRESHOLDS.TEXT_PRINTABLE_RATIO
        );
    }

    /**
     * Get format from file extension
     */
    private getFormatFromExtension(filePath: string): SupportedFormat {
        const ext = extname(filePath).toLowerCase();

        switch (ext) {
            case '.pdf':
                return 'pdf';
            case '.epub':
                return 'epub';
            case '.txt':
                return 'txt';

            default:
                return 'txt'; // Default fallback
        }
    }

    /**
     * Validate file size against format limits
     */
    private validateFileSize(
        fileSize: number,
        format: SupportedFormat,
    ): ValidationResult {
        const issues: ValidationIssue[] = [];
        let isValid = true;

        const limit =
            FILE_SIZE_LIMITS[format.toUpperCase() as keyof typeof FILE_SIZE_LIMITS];
        if (limit && fileSize > limit) {
            issues.push({
                type: 'error',
                message: `File size (${Math.round(
                    fileSize / 1024 / 1024,
                )}MB) exceeds limit for ${format} files (${Math.round(limit / 1024 / 1024)}MB)`,
                details: { fileSize, limit, format },
            });
            isValid = false;
        }

        return { isValid, issues, metadata: { fileSize } };
    }

    /**
     * Perform format-specific validation
     */
    private async validateFormat(
        fileInfo: FileInfo,
        format: SupportedFormat,
    ): Promise<ValidationResult> {
        try {
            switch (format) {
                case 'pdf':
                    return await this.validatePDF(fileInfo.path);
                case 'epub':
                    return await this.validateEPUB(fileInfo.path);
                case 'txt':
                    return await this.validateText(fileInfo.path);
                default:
                    return {
                        isValid: false,
                        issues: [
                            { type: 'error', message: `Unsupported format: ${format}` },
                        ],
                        metadata: {},
                    };
            }
        } catch (error) {
            return {
                isValid: false,
                issues: [
                    {
                        type: 'error',
                        message: `Validation failed: ${
                            error instanceof Error ? error.message : String(error)
                        }`,
                    },
                ],
                metadata: {},
            };
        }
    }

    /**
     * Validate PDF file structure and content
     */
    private async validatePDF(filePath: string): Promise<PDFValidationResult> {
        const issues: ValidationIssue[] = [];
        let isValid = true;

        try {
            const buffer = await fs.readFile(filePath);

            // Parse PDF with limited pages for validation
            const pdfData = await pdfParse(buffer, { max: 5 }); // Check first 5 pages

            // Get full page count
            const fullPdfData = await pdfParse(buffer, { max: 0 });
            const pageCount = fullPdfData.numpages;

            // Extract version from header
            const header = buffer.toString('ascii', 0, 8);
            const versionMatch = header.match(/%PDF-(\d+\.\d+)/);
            const version = versionMatch?.[1] ?? 'unknown';

            // Check for embedded text
            const hasEmbeddedText = pdfData.text.trim().length > 0;
            const textLength = pdfData.text.length;

            // Analyze PDF structure for images
            const pdfString = buffer.toString('latin1');
            const imageDetection = this.analyzeImageContent(pdfString, pageCount);
            const hasImages = imageDetection.hasImages;
            const imagePages = imageDetection.imagePages;
            const estimatedImageCount = imageDetection.estimatedImageCount;

            // Determine content type based on text extraction and image analysis
            let contentType: 'text_based' | 'image_based' | 'hybrid' | 'empty';
            let textCoverage = 0;

            if (pageCount === 0) {
                contentType = PDF_CONTENT_TYPES.EMPTY;
                isValid = false;
                issues.push({
                    type: 'error',
                    message: 'PDF has no pages',
                    details: { pageCount: 0 },
                });
            } else if (
                !hasEmbeddedText ||
                textLength < VALIDATION_THRESHOLDS.MIN_TEXT_LENGTH
            ) {
                if (hasImages) {
                    contentType = PDF_CONTENT_TYPES.IMAGE_BASED;
                    issues.push({
                        type: 'warning',
                        message:
                            'PDF contains images without embedded text (requires OCR processing)',
                        details: {
                            textLength,
                            hasEmbeddedText,
                            estimatedImageCount,
                            imagePages:
                                imagePages.length > 0 ? imagePages.slice(0, 5) : [],
                        },
                    });
                } else {
                    contentType = PDF_CONTENT_TYPES.EMPTY;
                    issues.push({
                        type: 'error',
                        message: 'PDF has no embedded text and no detected images',
                        details: { textLength, hasEmbeddedText, hasImages },
                    });
                }
            } else {
                // Estimate text coverage (rough heuristic)
                const avgTextPerPage = textLength / Math.min(pageCount, 5);
                textCoverage = Math.min(100, (avgTextPerPage / 200) * 100); // Assume 200 chars per page as baseline

                if (hasImages && estimatedImageCount > 0) {
                    if (textCoverage > 60) {
                        contentType = PDF_CONTENT_TYPES.HYBRID;
                        issues.push({
                            type: 'info',
                            message: `PDF has mixed content (text and ${estimatedImageCount} images)`,
                            details: { textCoverage, estimatedImageCount, hasImages },
                        });
                    } else {
                        contentType = PDF_CONTENT_TYPES.IMAGE_BASED;
                        issues.push({
                            type: 'warning',
                            message: `PDF is primarily image-based (${estimatedImageCount} images, low text coverage)`,
                            details: { textCoverage, estimatedImageCount, hasImages },
                        });
                    }
                } else {
                    contentType = PDF_CONTENT_TYPES.TEXT_BASED;
                    if (textCoverage < 50) {
                        issues.push({
                            type: 'info',
                            message: 'PDF has moderate text content',
                            details: { textCoverage },
                        });
                    }
                }
            }

            // Extract metadata
            const metadata = {
                pageCount,
                hasEmbeddedText,
                contentType,
                version,
                ...(pdfData.info?.Title && { title: pdfData.info.Title }),
                ...(pdfData.info?.Author && { author: pdfData.info.Author }),
                ...(pdfData.info?.CreationDate && {
                    creationDate: new Date(pdfData.info.CreationDate),
                }),
                textCoverage,
                hasImages,
                estimatedImageCount,
                imagePages,
                textPages: [] as number[], // Would need more sophisticated analysis
            };

            return {
                isValid,
                issues,
                metadata,
                contentType: contentType as
                    | 'text_based'
                    | 'image_based'
                    | 'hybrid'
                    | 'empty',
                hasEmbeddedText: hasEmbeddedText,
                pageCount: pageCount,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            issues.push({
                type: 'error',
                message: `PDF parsing failed: ${errorMessage}`,
                details: { error: errorMessage },
            });

            return {
                isValid: false,
                issues,
                metadata: {
                    pageCount: 0,
                    hasEmbeddedText: false,
                    contentType: PDF_CONTENT_TYPES.EMPTY,
                    version: 'unknown',
                    textCoverage: 0,
                    hasImages: false,
                    estimatedImageCount: 0,
                    imagePages: [],
                    textPages: [],
                },
                contentType: PDF_CONTENT_TYPES.EMPTY,
                hasEmbeddedText: false,
                pageCount: 0,
            };
        }
    }

    /**
     * Analyze PDF content for images using pattern matching
     */
    private analyzeImageContent(
        pdfString: string,
        pageCount: number,
    ): {
        hasImages: boolean;
        imagePages: number[];
        estimatedImageCount: number;
    } {
        // Common image-related PDF patterns
        const imagePatterns = [
            /\/XObject\s*<<[^>]*\/Subtype\s*\/Image/gi,
            /\/Type\s*\/XObject[^>]*\/Subtype\s*\/Image/gi,
            /\/Filter\s*\/DCTDecode/gi, // JPEG images
            /\/Filter\s*\/FlateDecode[^>]*\/BitsPerComponent/gi, // PNG-like images
            /\/Filter\s*\/CCITTFaxDecode/gi, // TIFF images
            /\/Filter\s*\/JBIG2Decode/gi, // JBIG2 images
            /\/Filter\s*\/JPXDecode/gi, // JPEG2000 images
            /stream\s*\r?\n.*?JFIF/gi, // JPEG stream markers
            /stream\s*\r?\n.*?PNG/gi, // PNG stream markers
        ];

        // Image object patterns
        const imageObjectPatterns = [
            /\/Im\d+\s+\d+\s+\d+\s+R/gi, // Image references
            /\/I\d+\s+\d+\s+\d+\s+R/gi, // Alternative image references
            /\/Image\d+\s+\d+\s+\d+\s+R/gi, // Named image references
        ];

        let totalImageMatches = 0;
        let hasImages = false;
        const imagePages: number[] = [];

        // Count image patterns
        for (const pattern of imagePatterns) {
            const matches = pdfString.match(pattern);
            if (matches) {
                totalImageMatches += matches.length;
                hasImages = true;
            }
        }

        // Count image object references
        for (const pattern of imageObjectPatterns) {
            const matches = pdfString.match(pattern);
            if (matches) {
                totalImageMatches += matches.length;
                hasImages = true;
            }
        }

        // Estimate image count (conservative estimate)
        const estimatedImageCount = Math.max(
            Math.floor(totalImageMatches / 3), // Account for multiple references per image
            hasImages ? 1 : 0,
        );

        // Try to detect which pages might have images (rough estimation)
        if (hasImages && pageCount > 0) {
            // Simple heuristic: distribute images across pages
            for (let i = 1; i <= Math.min(pageCount, estimatedImageCount); i++) {
                imagePages.push(i);
            }
        }

        return {
            hasImages,
            imagePages,
            estimatedImageCount,
        };
    }

    /**
     * Validate EPUB file structure (placeholder for now)
     */
    private async validateEPUB(_filePath: string): Promise<ValidationResult> {
        return {
            isValid: false,
            issues: [{ type: 'error', message: 'EPUB validation not implemented yet' }],
            metadata: {},
        };
    }

    /**
     * Validate text file encoding and content (placeholder for now)
     */
    private async validateText(_filePath: string): Promise<ValidationResult> {
        return {
            isValid: false,
            issues: [{ type: 'error', message: 'Text validation not implemented yet' }],
            metadata: {},
        };
    }

    /**
     * Calculate final result based on all validation steps
     */
    private calculateFinalResult(
        magicNumberResult: MagicNumberResult,
        extensionFormat: SupportedFormat,
        sizeValidation: ValidationResult,
        validationResult: ValidationResult,
        fileSize: number,
    ): FileFormatResult {
        const issues: string[] = [];
        const format = magicNumberResult.format || extensionFormat;
        let confidence = magicNumberResult.confidence;

        // Combine all validation issues
        for (const issue of sizeValidation.issues) {
            issues.push(issue.message);
        }
        for (const issue of validationResult.issues) {
            issues.push(issue.message);
        }

        // Check format consistency
        if (magicNumberResult.format && magicNumberResult.format !== extensionFormat) {
            issues.push(
                `Format mismatch: magic number suggests ${magicNumberResult.format}, extension suggests ${extensionFormat}`,
            );
            confidence *= 0.8; // Reduce confidence
        }

        // Check if format is supported
        if (!SUPPORTED_FORMATS.includes(format)) {
            issues.push(`Unsupported format: ${format}`);
            return {
                format: 'txt', // Fallback
                mimeType: 'application/octet-stream',
                isValid: false,
                confidence: 0,
                issues,
                metadata: { fileSize, security: { isCorrupted: true } },
            };
        }

        // Adjust confidence based on validation
        if (!validationResult.isValid || !sizeValidation.isValid) {
            confidence *= 0.5;
        }

        // Get MIME type
        const mimeType = this.getMimeType(format);

        // Create metadata
        const metadata: FileFormatMetadata = {
            fileSize,
            ...validationResult.metadata,
            security: {
                exceedsSize: !sizeValidation.isValid,
                isCorrupted: !validationResult.isValid,
            },
        };

        return {
            format,
            mimeType,
            isValid: validationResult.isValid && sizeValidation.isValid,
            confidence: Math.max(0, Math.min(1, confidence)),
            issues,
            metadata,
        };
    }

    /**
     * Get MIME type for format
     */
    private getMimeType(format: SupportedFormat): string {
        switch (format) {
            case 'pdf':
                return MIME_TYPES.PDF;
            case 'epub':
                return MIME_TYPES.EPUB;
            case 'txt':
                return MIME_TYPES.TXT;

            default:
                return 'application/octet-stream';
        }
    }
}
