/**
 * Default configurations for file operations
 */

export const DEFAULT_BATCH_CONFIG = {
    maxChunkSize: 1024 * 1024, // 1MB
    maxLinesPerChunk: 1000,
    parallel: false,
    maxParallelOps: 4,
    chunkDelay: 100  // ms
} as const;


export const DEFAULT_WHITESPACE_CONFIG = {
    preserveIndentation: true,
    preserveLineEndings: true,
    normalizeWhitespace: true,
    trimTrailingWhitespace: true,
    defaultIndentation: '    ',
    defaultLineEnding: '\n'
} as const;

/**
 * File operation error codes
 */
export const FILE_ERROR_CODES = {
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    INVALID_PATH: 'INVALID_PATH',
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    OPERATION_FAILED: 'OPERATION_FAILED',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * Default file operation settings
 */
export const FILE_OPERATION_DEFAULTS = {
    encoding: 'utf8',
    recursive: true,
    createBackup: false,
    overwrite: false,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    maxSearchResults: 1000,
    contextLines: 2, // Number of lines before/after for search results
    watchDebounceTime: 100 // ms
} as const;

/**
 * Patch operation types
 */
export const PATCH_TYPES = {
    LINE: 'line',
    BLOCK: 'block',
    DIFF: 'diff',
    COMPLETE: 'complete'
} as const;

/**
 * Change tracking settings
 */
export const CHANGE_TRACKING_CONFIG = {
    maxChanges: 1000,
    persistChanges: true,
    changeTypes: {
        FILE_EDIT: 'file_edit',
        FILE_CREATE: 'file_create',
        FILE_DELETE: 'file_delete',
        FILE_MOVE: 'file_move',
        DIRECTORY_CREATE: 'directory_create',
        DIRECTORY_DELETE: 'directory_delete',
        PERMISSION_CHANGE: 'permission_change',
        WATCH_START: 'watch_start',
        WATCH_END: 'watch_end',
        PATCH_APPLY: 'patch_apply'
    }
} as const;
