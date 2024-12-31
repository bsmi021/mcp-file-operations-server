import { promises as fs, watch } from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
    WatchService,
    FileWatcher,
    FileOperationError,
    FileErrorCode
} from '../types/index.js';
import { FILE_OPERATION_DEFAULTS } from '../config/defaults.js';

/**
 * Implementation of WatchService interface handling file/directory watching operations
 * Follows SOLID principles:
 * - Single Responsibility: Handles only watching operations
 * - Open/Closed: Extensible through inheritance
 * - Liskov Substitution: Implements WatchService interface
 * - Interface Segregation: Focused watching methods
 * - Dependency Inversion: Depends on abstractions (WatchService interface)
 */
export class WatchServiceImpl implements WatchService {
    private watchers: Map<string, FileWatcher>;
    private watchEmitter: EventEmitter;
    private debounceTimers: Map<string, NodeJS.Timeout>;

    constructor() {
        this.watchers = new Map();
        this.watchEmitter = new EventEmitter();
        this.debounceTimers = new Map();

        // Increase max listeners to handle multiple watch points
        this.watchEmitter.setMaxListeners(100);
    }

    /**
     * Start watching a file or directory for changes
     * @param watchPath Path to watch
     * @param recursive Whether to watch subdirectories recursively
     */
    async watch(watchPath: string, recursive = FILE_OPERATION_DEFAULTS.recursive): Promise<FileWatcher> {
        try {
            // Validate path exists
            await fs.access(watchPath);

            // Check if already watching
            if (this.watchers.has(watchPath)) {
                throw new FileOperationError(
                    'OPERATION_FAILED' as FileErrorCode,
                    'Path is already being watched',
                    watchPath
                );
            }

            // Create watcher
            const watcher = watch(watchPath, { recursive }) as unknown as FileWatcher;

            // Wrap the native watcher in our own EventEmitter for better control
            const watchWrapper = new EventEmitter() as FileWatcher;
            watchWrapper.close = () => {
                watcher.close();
                this.watchers.delete(watchPath);
                this.watchEmitter.emit('watchEnd', watchPath);
            };

            // Handle watch events with debouncing
            watcher.on('change', (eventType: 'rename' | 'change', filename: string | null) => {
                const fullPath = filename ? path.join(watchPath, filename) : watchPath;

                // Clear existing timer for this path
                const existingTimer = this.debounceTimers.get(fullPath);
                if (existingTimer) {
                    clearTimeout(existingTimer);
                }

                // Set new debounced event
                const timer = setTimeout(() => {
                    this.handleWatchEvent(watchPath, eventType, filename, watchWrapper);
                    this.debounceTimers.delete(fullPath);
                }, FILE_OPERATION_DEFAULTS.watchDebounceTime);

                this.debounceTimers.set(fullPath, timer);
            });

            // Store watcher
            this.watchers.set(watchPath, watchWrapper);
            this.watchEmitter.emit('watchStart', watchPath);

            return watchWrapper;
        } catch (error) {
            if (error instanceof FileOperationError) throw error;
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to start watching: ${error instanceof Error ? error.message : 'Unknown error'}`,
                watchPath
            );
        }
    }

    /**
     * Stop watching a path
     * @param watchPath Path to stop watching
     */
    async unwatch(watchPath: string): Promise<void> {
        const watcher = this.watchers.get(watchPath);
        if (!watcher) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                'Path is not being watched',
                watchPath
            );
        }

        watcher.close();
    }

    /**
     * Check if a path is currently being watched
     * @param watchPath Path to check
     */
    isWatching(watchPath: string): boolean {
        return this.watchers.has(watchPath);
    }

    /**
     * Get all currently watched paths
     */
    getWatchedPaths(): string[] {
        return Array.from(this.watchers.keys());
    }

    /**
     * Add a listener for watch events
     * @param event Event type ('watchStart', 'watchEnd', 'change', 'rename')
     * @param listener Callback function
     */
    on(event: string, listener: (...args: any[]) => void): void {
        this.watchEmitter.on(event, listener);
    }

    /**
     * Remove a listener for watch events
     * @param event Event type
     * @param listener Callback function
     */
    off(event: string, listener: (...args: any[]) => void): void {
        this.watchEmitter.off(event, listener);
    }

    /**
     * Clean up all watchers
     */
    async dispose(): Promise<void> {
        for (const [path, watcher] of this.watchers) {
            try {
                watcher.close();
                this.watchEmitter.emit('watchEnd', path);
            } catch (error) {
                console.error(`Error closing watcher for ${path}:`, error);
            }
        }
        this.watchers.clear();
        this.watchEmitter.removeAllListeners();
    }

    private async handleWatchEvent(
        watchPath: string,
        eventType: 'rename' | 'change',
        filename: string | null,
        watcher: FileWatcher
    ): Promise<void> {
        try {
            const fullPath = filename ? path.join(watchPath, filename) : watchPath;

            // Check if path still exists
            const exists = await fs.access(fullPath).then(() => true).catch(() => false);

            const eventData = {
                type: eventType,
                path: fullPath,
                exists,
                timestamp: new Date().toISOString()
            };

            // Emit specific event
            watcher.emit(eventType, eventData);

            // Emit generic change event
            watcher.emit('change', eventData);

            // Emit through main emitter
            this.watchEmitter.emit('watchEvent', eventData);
        } catch (error) {
            console.error('Error handling watch event:', error);
            // Emit error event but don't throw to keep watcher alive
            watcher.emit('error', error);
        }
    }

    /**
     * Validate a path for watching
     * @param watchPath Path to validate
     */
    protected async validateWatchPath(watchPath: string): Promise<void> {
        try {
            const stats = await fs.stat(watchPath);
            if (!stats.isDirectory() && !stats.isFile()) {
                throw new FileOperationError(
                    'INVALID_PATH' as FileErrorCode,
                    'Path must be a file or directory',
                    watchPath
                );
            }
        } catch (error) {
            if (error instanceof FileOperationError) throw error;
            throw new FileOperationError(
                'INVALID_PATH' as FileErrorCode,
                `Invalid or inaccessible path: ${error instanceof Error ? error.message : 'Unknown error'}`,
                watchPath
            );
        }
    }
}
