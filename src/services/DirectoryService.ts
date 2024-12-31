import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import {
    DirectoryService,
    FileEntry,
    FileOperationError,
    FileErrorCode
} from '../types/index.js';
import { FILE_OPERATION_DEFAULTS } from '../config/defaults.js';
import { FileServiceImpl } from './FileService.js';

/**
 * Implementation of DirectoryService interface handling directory operations
 * Follows SOLID principles:
 * - Single Responsibility: Handles only directory-level operations
 * - Open/Closed: Extensible through inheritance
 * - Liskov Substitution: Implements DirectoryService interface
 * - Interface Segregation: Focused directory operation methods
 * - Dependency Inversion: Depends on abstractions (DirectoryService interface)
 */
export class DirectoryServiceImpl implements DirectoryService {
    private fileService: FileServiceImpl;

    constructor() {
        this.fileService = new FileServiceImpl();
    }

    /**
     * Create a directory at the specified path
     * @param dirPath Path where to create the directory
     * @param recursive Whether to create parent directories if they don't exist
     */
    async create(dirPath: string, recursive = FILE_OPERATION_DEFAULTS.recursive): Promise<void> {
        try {
            await fs.mkdir(dirPath, { recursive });
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
                dirPath
            );
        }
    }

    /**
     * Remove a directory and optionally its contents
     * @param dirPath Path of directory to remove
     * @param recursive Whether to remove directory contents recursively
     */
    async remove(dirPath: string, recursive = false): Promise<void> {
        try {
            if (recursive) {
                // For recursive removal, we need to handle contents first
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) {
                        await this.remove(fullPath, true);
                    } else {
                        await fs.unlink(fullPath);
                    }
                }
            }
            await fs.rmdir(dirPath);
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to remove directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
                dirPath
            );
        }
    }

    /**
     * Copy a directory and its contents to a new location
     * @param source Source directory path
     * @param destination Destination directory path
     * @param overwrite Whether to overwrite existing files/directories
     */
    async copy(source: string, destination: string, overwrite = FILE_OPERATION_DEFAULTS.overwrite): Promise<void> {
        try {
            // Check if destination exists and overwrite is false
            if (!overwrite && existsSync(destination)) {
                throw new Error('Destination directory already exists');
            }

            // Create destination directory
            await fs.mkdir(destination, { recursive: true });

            // Read source directory contents
            const entries = await fs.readdir(source, { withFileTypes: true });

            // Process each entry
            for (const entry of entries) {
                const srcPath = path.join(source, entry.name);
                const destPath = path.join(destination, entry.name);

                if (entry.isDirectory()) {
                    // Recursively copy subdirectories
                    await this.copy(srcPath, destPath, overwrite);
                } else {
                    // Copy files
                    await this.fileService.copyFile(srcPath, destPath, overwrite);
                }
            }
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to copy directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
                source
            );
        }
    }

    /**
     * List contents of a directory with detailed metadata
     * @param dirPath Path of directory to list
     * @param recursive Whether to list contents recursively
     */
    async list(dirPath: string, recursive = false): Promise<FileEntry[]> {
        try {
            try {
                await fs.access(dirPath);
            } catch {
                throw new FileOperationError(
                    'INVALID_PATH' as FileErrorCode,
                    'Directory does not exist or is not accessible',
                    dirPath
                );
            }

            const pattern = recursive ? '**/*' : '*';
            const files = await glob(path.join(dirPath, pattern), {
                dot: false,
                nodir: false,
                windowsPathsNoEscape: true
            });

            const entries: FileEntry[] = [];

            for (const file of files) {
                try {
                    const metadata = await this.fileService.getMetadata(file);
                    entries.push({
                        path: file,
                        name: path.basename(file),
                        metadata
                    });
                } catch (error) {
                    console.error(`Error getting metadata for ${file}:`, error);
                }
            }

            return entries;
        } catch (error) {
            if (error instanceof FileOperationError) throw error;
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
                dirPath
            );
        }
    }

    /**
     * Check if a path exists and is a directory
     * @param dirPath Path to check
     */
    protected async validateDirectory(dirPath: string): Promise<void> {
        try {
            const stats = await fs.stat(dirPath);
            if (!stats.isDirectory()) {
                throw new FileOperationError(
                    'INVALID_PATH' as FileErrorCode,
                    'Path exists but is not a directory',
                    dirPath
                );
            }
        } catch (error) {
            if (error instanceof FileOperationError) throw error;
            throw new FileOperationError(
                'INVALID_PATH' as FileErrorCode,
                `Invalid or inaccessible directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
                dirPath
            );
        }
    }

    /**
     * Ensure a directory is empty
     * @param dirPath Path to check
     * @throws FileOperationError if directory is not empty
     */
    protected async ensureEmpty(dirPath: string): Promise<void> {
        const entries = await fs.readdir(dirPath);
        if (entries.length > 0) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                'Directory is not empty',
                dirPath
            );
        }
    }

    /**
     * Calculate total size of a directory
     * @param dirPath Path to directory
     * @returns Total size in bytes
     */
    protected async calculateSize(dirPath: string): Promise<number> {
        let totalSize = 0;
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                totalSize += await this.calculateSize(fullPath);
            } else {
                const stats = await fs.stat(fullPath);
                totalSize += stats.size;
            }
        }

        return totalSize;
    }
}
