import { EventEmitter } from 'events';
import { PATCH_TYPES, FILE_ERROR_CODES } from '../config/defaults.js';

// Change Types
export type ChangeType =
    | 'file_edit'
    | 'file_create'
    | 'file_delete'
    | 'file_move'
    | 'directory_create'
    | 'directory_delete'
    | 'directory_copy'
    | 'permission_change'
    | 'watch_start'
    | 'watch_end'
    | 'patch_apply';

// Merge Strategy Types
export type MergeStrategy = 'overwrite' | 'merge' | 'smart';

// Conflict Resolution Types
export type ConflictResolution = 'force' | 'revert' | 'manual';

// File System Types
export interface FileWatcher extends EventEmitter {
    close(): void;
}

// File Context Types
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

export interface FileContent {
    content: string;
    metadata: FileMetadata;
    encoding: string;
    truncated: boolean;
    totalLines: number;
}

export interface DirectoryContent {
    files: { [path: string]: FileContent };
    metadata: {
        totalFiles: number;
        totalSize: number;
        truncated: boolean;
    };
}

// Search Types
export interface SearchOptions {
    recursive?: boolean;
    includeHidden?: boolean;
    maxDepth?: number;
    fileTypes?: string[];
}

export interface SearchMatch {
    path: string;
    line: number;
    content: string;
    context: {
        before: string[];
        after: string[];
    };
}

export interface SearchResult {
    matches: SearchMatch[];
    totalMatches: number;
}

// Patch Operation Types
export type PatchType = typeof PATCH_TYPES[keyof typeof PATCH_TYPES];

export interface WhitespaceConfig {
    preserveIndentation?: boolean;
    preserveLineEndings?: boolean;
    normalizeWhitespace?: boolean;
    trimTrailingWhitespace?: boolean;
    defaultIndentation?: string;
    defaultLineEnding?: string;
}

export type BatchConfig = {
    maxChunkSize: number;
    maxLinesPerChunk: 1000;
    parallel: false;
    maxParallelOps: 4;
    chunkDelay: 100;
};

export interface PatchOperation {
    type: PatchType;
    filePath: string;
    search?: string;
    searchPattern?: RegExp;
    replace?: string;
    lineNumbers?: number[];
    content?: string;
    diff?: string;
    createBackup?: boolean;
    whitespaceConfig?: WhitespaceConfig;
    mergeStrategy?: MergeStrategy;
    conflictResolution?: ConflictResolution;
}

export interface PatchResult {
    success: boolean;
    filePath: string;
    type: PatchType;
    changesApplied: number;
    backupPath?: string;
    originalContent?: string[];
    newContent?: string[];
    error?: string;
    conflicts?: string[];
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

// Progress Types
export interface ProgressInfo {
    currentChunk: number;
    totalChunks: number;
    bytesProcessed: number;
    totalBytes: number;
    linesProcessed: number;
    totalLines: number;
    startTime: number;
    estimatedTimeRemaining: number;
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
    type: ChangeType;
    details?: Record<string, unknown>;
}

// Error Types
export type FileErrorCode = typeof FILE_ERROR_CODES[keyof typeof FILE_ERROR_CODES];

export class FileOperationError extends Error {
    constructor(
        public code: FileErrorCode,
        message: string,
        public path: string
    ) {
        super(message);
        this.name = 'FileOperationError';
    }
}

// Service Types
export interface FileService {
    readFile(path: string, encoding?: string): Promise<string>;
    writeFile(path: string, content: string, encoding?: string): Promise<void>;
    copyFile(source: string, destination: string, overwrite?: boolean): Promise<void>;
    moveFile(source: string, destination: string, overwrite?: boolean): Promise<void>;
    deleteFile(path: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    getMetadata(path: string): Promise<FileMetadata>;
}

export interface DirectoryService {
    create(path: string, recursive?: boolean): Promise<void>;
    remove(path: string, recursive?: boolean): Promise<void>;
    copy(source: string, destination: string, overwrite?: boolean): Promise<void>;
    list(path: string, recursive?: boolean): Promise<FileEntry[]>;
}

export interface WatchService {
    watch(path: string, recursive?: boolean): Promise<FileWatcher>;
    unwatch(path: string): Promise<void>;
    isWatching(path: string): boolean;
}

export interface PatchService {
    applyPatch(operation: PatchOperation): Promise<PatchResult>;
    createBackup(path: string): Promise<string>;
    normalizeContent(content: string, config?: WhitespaceConfig): NormalizedContent;
}

export interface ChangeTrackingService {
    addChange(change: Omit<Change, 'id' | 'timestamp'>): Promise<Change>;
    getChanges(limit?: number, type?: ChangeType): Promise<Change[]>;
    clearChanges(): Promise<void>;
}

// Stream Processing Types
export interface StreamProcessor {
    processFile(
        filePath: string,
        processor: (chunk: string, chunkInfo: { start: number; end: number }) => Promise<string>
    ): Promise<ChunkResult[]>;
    on(event: string, listener: (progress: ProgressInfo) => void): void;
}

// Content Scope Types
export interface ContentScope {
    startLine: number;
    endLine: number;
    content: string;
}

// Utility Types
export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ValidationResult = {
    valid: boolean;
    errors?: string[];
};
