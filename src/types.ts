/**
 * Combined types for file operations server
 */

// File Context Types
export type FileEncoding = 'utf8' | 'utf-8' | 'ascii' | 'binary' | 'base64' | 'hex' | 'latin1';

export interface FileMetadata {
    size: number;
    mimeType: string;
    modifiedTime: string;
    createdTime: string;
    isDirectory: boolean;
}

export interface FileEntry {
    path: string;
    name: string;
    metadata: FileMetadata;
}

export interface SearchOptions {
    recursive?: boolean;
    includeHidden?: boolean;
    maxDepth?: number;
    fileTypes?: string[];
}

export interface ReadOptions {
    encoding?: FileEncoding;
    maxSize?: number;
    startLine?: number;
    endLine?: number;
}

export interface SearchResult {
    matches: Array<{
        path: string;
        line: number;
        content: string;
        context: {
            before: string[];
            after: string[];
        };
    }>;
    totalMatches: number;
}

export interface FileContent {
    content: string;
    metadata: FileMetadata;
    encoding: string;
    truncated: boolean;
    totalLines?: number;
}

export interface DirectoryContent {
    files: {
        [path: string]: FileContent;
    };
    metadata: {
        totalFiles: number;
        totalSize: number;
        truncated: boolean;
    };
}

// File Patch Types
export type PatchType = 'line' | 'block' | 'diff' | 'complete';

export interface BasePatchOperation {
    type: PatchType;
    filePath: string;
    createBackup?: boolean;
    validate?: boolean;
    whitespaceConfig?: WhitespaceConfig;
}

export interface LinePatchOperation extends BasePatchOperation {
    type: 'line';
    search: string | RegExp;
    replace?: string;
    lineNumbers?: number[];
    context?: number;
}

export interface BlockPatchOperation extends BasePatchOperation {
    type: 'block';
    search: string | RegExp;
    replace?: string;
    startDelimiter?: string;
    endDelimiter?: string;
    includeDelimiters?: boolean;
}

export interface CompleteUpdateOperation extends BasePatchOperation {
    type: 'complete';
    content: string;
    preserveFormatting?: boolean;
}

export interface DiffPatchOperation extends BasePatchOperation {
    type: 'diff';
    diff: string;
    context?: number;
    ignoreWhitespace?: boolean;
}

export interface BatchConfig {
    maxChunkSize?: number;
    maxLinesPerChunk?: number;
    parallel?: boolean;
    maxParallelOps?: number;
    chunkDelay?: number;
}

export interface ProgressInfo {
    currentChunk: number;
    totalChunks: number;
    bytesProcessed: number;
    totalBytes: number;
    linesProcessed: number;
    totalLines: number;
    startTime: number;
    estimatedTimeRemaining?: number;
}

export type PatchOperation = LinePatchOperation | BlockPatchOperation | DiffPatchOperation | CompleteUpdateOperation;

export interface PatchResult {
    success: boolean;
    filePath: string;
    type: PatchType;
    changesApplied: number;
    backupPath?: string;
    error?: string;
    modifiedLines?: number[];
    originalContent?: string[];
    newContent?: string[];
    whitespaceChanges?: {
        indentationFixed: boolean;
        lineEndingsNormalized: boolean;
        trailingWhitespaceRemoved: boolean;
    };
}

export interface WhitespaceConfig {
    preserveIndentation: boolean;
    preserveLineEndings: boolean;
    normalizeWhitespace: boolean;
    trimTrailingWhitespace: boolean;
    defaultIndentation?: string;
    defaultLineEnding?: string;
}

export interface NormalizedContent {
    normalized: string;
    lineEndings: string;
    indentation: string;
    hash: string;
    stats: {
        indentationSpaces: number;
        indentationTabs: number;
        trailingWhitespace: number;
        emptyLines: number;
        maxLineLength: number;
    };
}

export type ScopeType = 'class' | 'method' | 'property' | 'unknown';

export interface ContentScope {
    type: ScopeType;
    start: number;
    end: number;
    context: string[];
    indentationLevel: number;
}

export interface ChunkResult {
    success: boolean;
    chunkIndex: number;
    startLine: number;
    endLine: number;
    bytesProcessed: number;
    error?: string;
}

// Change Tracking Types
export interface Change {
    id: string;
    timestamp: string;
    description: string;
    type: string;
    details?: Record<string, any>;
}

// Error Types
export enum FileErrorCode {
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    PERMISSION_DENIED = 'PERMISSION_DENIED',
    INVALID_PATH = 'INVALID_PATH',
    FILE_TOO_LARGE = 'FILE_TOO_LARGE',
    ENCODING_ERROR = 'ENCODING_ERROR',
    OPERATION_FAILED = 'OPERATION_FAILED',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// File System Types
export interface FileWatcherEvents {
    change: (eventType: 'rename' | 'change', filename: string | null) => void;
    error: (error: Error) => void;
}

export interface FileWatcher {
    on<E extends keyof FileWatcherEvents>(event: E, listener: FileWatcherEvents[E]): this;
    close(): void;
}

export class FileOperationError extends Error {
    constructor(
        public code: FileErrorCode,
        message: string,
        public path?: string
    ) {
        super(message);
        this.name = 'FileOperationError';
    }
}
