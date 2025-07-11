import { promises as fs, existsSync } from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import {
    FileService,
    FileMetadata,
    FileOperationError,
    FileErrorCode
} from '../types/index.js';
import { FILE_OPERATION_DEFAULTS } from '../config/defaults.js';

/**
 * Implementation of FileService interface handling basic file operations
 * Follows SOLID principles:
 * - Single Responsibility: Handles only file-level operations
 * - Open/Closed: Extensible through inheritance
 * - Liskov Substitution: Implements FileService interface
 * - Interface Segregation: Focused file operation methods
 * - Dependency Inversion: Depends on abstractions (FileService interface)
 */
export class FileServiceImpl implements FileService {
    /**
     * Read file content with specified encoding
     * @param filePath Path to the file
     * @param encoding File encoding (defaults to utf8)
     */
    async readFile(filePath: string, encoding: BufferEncoding = FILE_OPERATION_DEFAULTS.encoding): Promise<string> {
        try {
            const content = await fs.readFile(filePath, encoding);
            return content;
        } catch (error) {
            throw new FileOperationError(
                'FILE_NOT_FOUND' as FileErrorCode,
                `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                filePath
            );
        }
    }

    /**
     * Write content to file with specified encoding
     * @param filePath Path to write the file
     * @param content Content to write
     * @param encoding File encoding (defaults to utf8)
     */
    async writeFile(filePath: string, content: string, encoding: BufferEncoding = FILE_OPERATION_DEFAULTS.encoding): Promise<void> {
        try {
            // Ensure directory exists
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, encoding);
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                filePath
            );
        }
    }

    /**
     * Copy file from source to destination
     * @param source Source file path
     * @param destination Destination file path
     * @param overwrite Whether to overwrite existing file
     */
    async copyFile(source: string, destination: string, overwrite = FILE_OPERATION_DEFAULTS.overwrite): Promise<void> {
        try {
            // Ensure destination directory exists
            await fs.mkdir(path.dirname(destination), { recursive: true });

            // Check if destination exists and overwrite is false
            if (!overwrite && existsSync(destination)) {
                throw new Error('Destination file already exists');
            }

            await fs.copyFile(source, destination, overwrite ? 0 : fs.constants.COPYFILE_EXCL);
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to copy file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                source
            );
        }
    }

    /**
     * Move/rename file from source to destination
     * @param source Source file path
     * @param destination Destination file path
     * @param overwrite Whether to overwrite existing file
     */
    async moveFile(source: string, destination: string, overwrite = FILE_OPERATION_DEFAULTS.overwrite): Promise<void> {
        try {
            // Ensure destination directory exists
            await fs.mkdir(path.dirname(destination), { recursive: true });

            // Check if destination exists and overwrite is false
            if (!overwrite && existsSync(destination)) {
                throw new Error('Destination file already exists');
            }

            await fs.rename(source, destination);
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to move file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                source
            );
        }
    }

    /**
     * Delete file at specified path
     * @param filePath Path to the file to delete
     */
    async deleteFile(filePath: string): Promise<void> {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                filePath
            );
        }
    }

    /**
     * Check if file exists at specified path
     * @param filePath Path to check
     */
    async exists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get file metadata including size, type, and timestamps
     * @param filePath Path to the file
     */
    async getMetadata(filePath: string): Promise<FileMetadata> {
        try {
            const stats = await fs.stat(filePath);
            return {
                size: stats.size,
                mimeType: (mime.lookup(filePath) || 'application/octet-stream') as string,
                modifiedTime: stats.mtime.toISOString(),
                createdTime: stats.birthtime.toISOString(),
                isDirectory: stats.isDirectory(),
            };
        } catch (error) {
            throw new FileOperationError(
                'FILE_NOT_FOUND' as FileErrorCode,
                `Failed to get metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
                filePath
            );
        }
    }

    /**
     * Validate file path and ensure it's accessible
     * @param filePath Path to validate
     * @throws FileOperationError if path is invalid or inaccessible
     */
    protected async validatePath(filePath: string): Promise<void> {
        try {
            await fs.access(filePath);
        } catch (error) {
            throw new FileOperationError(
                'INVALID_PATH' as FileErrorCode,
                `Invalid or inaccessible path: ${error instanceof Error ? error.message : 'Unknown error'}`,
                filePath
            );
        }
    }

    /**
     * Ensure file size is within limits
     * @param filePath Path to check
     * @param maxSize Maximum allowed size in bytes
     * @throws FileOperationError if file is too large
     */
    protected async validateFileSize(filePath: string, maxSize = FILE_OPERATION_DEFAULTS.maxFileSize): Promise<void> {
        const stats = await fs.stat(filePath);
        if (stats.size > maxSize) {
            throw new FileOperationError(
                'FILE_TOO_LARGE' as FileErrorCode,
                `File size ${stats.size} exceeds maximum ${maxSize}`,
                filePath
            );
        }
    }

    /**
     * Read multiple files in a single operation
     * @param filePaths Array of file paths to read
     * @param encoding File encoding (defaults to utf8)
     * @returns Array of file read results with success/error status
     */
    async readManyFiles(filePaths: string[], encoding: BufferEncoding = FILE_OPERATION_DEFAULTS.encoding): Promise<Array<{
        path: string;
        success: boolean;
        content?: string;
        error?: string;
    }>> {
        const results = await Promise.allSettled(
            filePaths.map(async (filePath) => {
                const content = await this.readFile(filePath, encoding);
                return { path: filePath, success: true, content };
            })
        );

        return results.map((result, index) => {
            const filePath = filePaths[index];
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    path: filePath,
                    success: false,
                    error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
                };
            }
        });
    }

    /**
     * Write multiple files in a single operation
     * @param files Array of file objects with path and content
     * @param encoding File encoding (defaults to utf8)
     * @returns Array of file write results with success/error status
     */
    async writeManyFiles(files: Array<{ path: string; content: string }>, encoding: BufferEncoding = FILE_OPERATION_DEFAULTS.encoding): Promise<Array<{
        path: string;
        success: boolean;
        error?: string;
    }>> {
        const results = await Promise.allSettled(
            files.map(async (file) => {
                await this.writeFile(file.path, file.content, encoding);
                return { path: file.path, success: true };
            })
        );

        return results.map((result, index) => {
            const filePath = files[index].path;
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    path: filePath,
                    success: false,
                    error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
                };
            }
        });
    }
}
