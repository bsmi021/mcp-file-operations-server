import { Transform, pipeline } from 'stream';
import { EventEmitter } from 'events';
import { promises as fs, createReadStream, createWriteStream } from 'fs';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);
import {
    StreamProcessor,
    ChunkResult,
    ProgressInfo,
    FileOperationError,
    FileErrorCode
} from '../types/index.js';
import { DEFAULT_BATCH_CONFIG } from '../config/defaults.js';

/**
 * Implementation of StreamProcessor interface handling streaming operations
 * Follows SOLID principles:
 * - Single Responsibility: Handles only streaming operations
 * - Open/Closed: Extensible through inheritance
 * - Liskov Substitution: Implements StreamProcessor interface
 * - Interface Segregation: Focused streaming methods
 * - Dependency Inversion: Depends on abstractions (StreamProcessor interface)
 */
export class StreamProcessorImpl implements StreamProcessor {
    private config: typeof DEFAULT_BATCH_CONFIG;
    private buffer: string = '';
    private chunkIndex: number = 0;
    private bytesProcessed: number = 0;
    private linesProcessed: number = 0;
    private startTime: number = Date.now();
    private progressEmitter: EventEmitter;
    private transform: Transform;

    constructor(config = DEFAULT_BATCH_CONFIG) {
        this.config = config;
        this.progressEmitter = new EventEmitter();
        this.progressEmitter.setMaxListeners(100); // Allow more listeners for large batch operations

        // Initialize transform stream
        this.transform = new Transform({
            objectMode: true,
            transform: (chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null, data?: any) => void) => {
                try {
                    this.buffer += chunk.toString();
                    while (this.shouldProcessChunk()) {
                        const { content, lineCount } = this.extractChunk();
                        this.bytesProcessed += content.length;
                        this.linesProcessed += lineCount;
                        this.transform.push({
                            content,
                            metadata: {
                                chunkIndex: this.chunkIndex++,
                                startLine: this.linesProcessed - lineCount,
                                endLine: this.linesProcessed,
                                bytesProcessed: content.length
                            }
                        });
                    }
                    callback();
                } catch (error) {
                    callback(error instanceof Error ? error : new Error(String(error)));
                }
            },
            flush: (callback: (error?: Error | null, data?: any) => void) => {
                try {
                    if (this.buffer.length > 0) {
                        const { content, lineCount } = this.extractChunk();
                        this.bytesProcessed += content.length;
                        this.linesProcessed += lineCount;
                        this.transform.push({
                            content,
                            metadata: {
                                chunkIndex: this.chunkIndex++,
                                startLine: this.linesProcessed - lineCount,
                                endLine: this.linesProcessed,
                                bytesProcessed: content.length
                            }
                        });
                    }
                    callback();
                } catch (error) {
                    callback(error instanceof Error ? error : new Error(String(error)));
                }
            }
        });
    }

    /**
     * Process a file using streaming with progress tracking
     * @param filePath Path to the file to process
     * @param processor Function to process each chunk
     */
    async processFile(
        filePath: string,
        processor: (chunk: string, chunkInfo: { start: number; end: number }) => Promise<string>
    ): Promise<ChunkResult[]> {
        const results: ChunkResult[] = [];
        const stats = await fs.stat(filePath);
        const maxChunkSize = this.config.maxChunkSize;
        const totalChunks = Math.ceil(stats.size / maxChunkSize);

        return new Promise((resolve, reject) => {
            const readStream = createReadStream(filePath, { encoding: 'utf8' });
            const tempPath = `${filePath}.tmp`;
            const writeStream = createWriteStream(tempPath, { encoding: 'utf8' });

            const processChunk = async (chunk: string): Promise<string> => {
                this.buffer += chunk;
                let output = '';

                while (this.shouldProcessChunk()) {
                    const { content, lineCount } = this.extractChunk();
                    const startLine = this.linesProcessed;
                    const endLine = startLine + lineCount;

                    try {
                        const processed = await processor(content, { start: startLine, end: endLine });

                        this.bytesProcessed += content.length;
                        this.linesProcessed += lineCount;

                        const result: ChunkResult = {
                            success: true,
                            chunkIndex: this.chunkIndex++,
                            startLine,
                            endLine,
                            bytesProcessed: content.length
                        };
                        results.push(result);

                        this.emitProgress({
                            currentChunk: this.chunkIndex,
                            totalChunks,
                            bytesProcessed: this.bytesProcessed,
                            totalBytes: stats.size,
                            linesProcessed: this.linesProcessed,
                            totalLines: -1, // Unknown until full processing
                            startTime: this.startTime,
                            estimatedTimeRemaining: this.calculateETA(stats.size)
                        });

                        if (this.config.chunkDelay) {
                            await new Promise(resolve => setTimeout(resolve, this.config.chunkDelay));
                        }

                        output += processed;
                    } catch (error) {
                        const errorResult: ChunkResult = {
                            success: false,
                            chunkIndex: this.chunkIndex++,
                            startLine,
                            endLine,
                            bytesProcessed: 0,
                            error: error instanceof Error ? error.message : String(error)
                        };
                        results.push(errorResult);
                    }
                }

                return output;
            };

            const transform = new Transform({
                transform: (chunk, _encoding, callback) => {
                    processChunk(chunk.toString())
                        .then(processed => callback(null, processed))
                        .catch(error => callback(error));
                },
                flush: (callback) => {
                    if (this.buffer.length > 0) {
                        processChunk(this.buffer)
                            .then(processed => callback(null, processed))
                            .catch(error => callback(error));
                    } else {
                        callback();
                    }
                }
            });

            pipelineAsync(readStream, transform, writeStream).catch(async (error: unknown) => {
                await fs.unlink(tempPath).catch(() => { });
                if (error) {
                    reject(new FileOperationError(
                        'OPERATION_FAILED' as FileErrorCode,
                        `Stream processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        filePath
                    ));
                } else {
                    try {
                        await fs.rename(tempPath, filePath);
                        resolve(results);
                    } catch (renameError) {
                        await fs.unlink(tempPath).catch(() => { });
                        reject(new FileOperationError(
                            'OPERATION_FAILED' as FileErrorCode,
                            `Failed to rename temporary file: ${renameError instanceof Error ? renameError.message : 'Unknown error'}`,
                            filePath
                        ));
                    }
                }
            });
        });
    }

    /**
     * Add event listener for progress updates
     * @param event Event name
     * @param listener Callback function
     */
    on(event: string, listener: (...args: any[]) => void): this {
        if (event === 'progress') {
            this.progressEmitter.on(event, listener);
        } else {
            this.transform.on(event, listener);
        }
        return this;
    }

    /**
     * Remove event listener
     * @param event Event name
     * @param listener Callback function
     */
    off(event: string, listener: (...args: any[]) => void): this {
        if (event === 'progress') {
            this.progressEmitter.off(event, listener);
        } else {
            this.transform.off(event, listener);
        }
        return this;
    }


    /**
     * Check if current buffer should be processed
     */
    private shouldProcessChunk(): boolean {
        const currentSize = this.buffer.length;
        const lineCount = this.buffer.split('\n').length - 1;
        return currentSize >= this.config.maxChunkSize || lineCount >= this.config.maxLinesPerChunk;
    }

    /**
     * Extract a chunk from the buffer
     */
    private extractChunk(): { content: string; lineCount: number } {
        const lines = this.buffer.split('\n');
        const chunkLines = lines.slice(0, this.config.maxLinesPerChunk);
        const chunk = chunkLines.join('\n');
        this.buffer = lines.slice(this.config.maxLinesPerChunk).join('\n');
        return { content: chunk, lineCount: chunkLines.length };
    }

    /**
     * Calculate estimated time remaining
     * @param totalBytes Total bytes to process
     */
    private calculateETA(totalBytes: number): number {
        const elapsedMs = Date.now() - this.startTime;
        const bytesPerMs = this.bytesProcessed / elapsedMs;
        const remainingBytes = totalBytes - this.bytesProcessed;
        return remainingBytes / bytesPerMs;
    }

    /**
     * Emit progress event
     * @param progress Progress information
     */
    private emitProgress(progress: ProgressInfo): void {
        this.progressEmitter.emit('progress', progress);
    }
}
