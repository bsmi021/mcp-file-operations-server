import { promises as fs, existsSync, readFileSync } from 'fs';
import * as path from 'path';
import {
    ChangeTrackingService,
    Change,
    FileOperationError,
    FileErrorCode,
    ChangeType
} from '../types/index.js';
import { CHANGE_TRACKING_CONFIG } from '../config/defaults.js';

/**
 * Implementation of ChangeTrackingService interface handling change history
 * Follows SOLID principles:
 * - Single Responsibility: Handles only change tracking operations
 * - Open/Closed: Extensible through inheritance
 * - Liskov Substitution: Implements ChangeTrackingService interface
 * - Interface Segregation: Focused change tracking methods
 * - Dependency Inversion: Depends on abstractions (ChangeTrackingService interface)
 */
export class ChangeTrackingServiceImpl implements ChangeTrackingService {
    private changes: Change[];
    private changesFilePath: string;

    constructor(storageDir?: string) {
        // Use provided storage directory or default to user's home directory
        const baseDir = storageDir || process.env.USERPROFILE || process.env.HOME || '.';
        this.changesFilePath = path.join(baseDir, '.cline-changes.json');
        this.changes = this.loadChanges();
    }

    /**
     * Add a new change to the history
     * @param change Change details (without id and timestamp)
     */
    async addChange(change: Omit<Change, 'id' | 'timestamp'>): Promise<Change> {
        const newChange: Change = {
            id: this.generateChangeId(),
            timestamp: new Date().toISOString(),
            description: change.description,
            type: change.type,
            details: change.details
        };

        // Add to in-memory changes
        this.changes.push(newChange);

        // Trim if exceeding max changes
        if (this.changes.length > CHANGE_TRACKING_CONFIG.maxChanges) {
            this.changes = this.changes.slice(-CHANGE_TRACKING_CONFIG.maxChanges);
        }

        // Persist changes if enabled
        if (CHANGE_TRACKING_CONFIG.persistChanges) {
            await this.saveChanges();
        }

        return newChange;
    }

    /**
     * Get changes with optional filtering
     * @param limit Maximum number of changes to return
     * @param type Filter by change type
     */
    async getChanges(limit?: number, type?: ChangeType): Promise<Change[]> {
        let filteredChanges = [...this.changes];

        // Apply type filter if specified
        if (type) {
            filteredChanges = filteredChanges.filter(change => change.type === type);
        }

        // Sort by timestamp descending (most recent first)
        filteredChanges.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        // Apply limit if specified
        if (limit && limit > 0) {
            filteredChanges = filteredChanges.slice(0, limit);
        }

        return filteredChanges;
    }

    /**
     * Clear all tracked changes
     */
    async clearChanges(): Promise<void> {
        this.changes = [];
        if (CHANGE_TRACKING_CONFIG.persistChanges) {
            await this.saveChanges();
        }
    }

    /**
     * Get changes by time range
     * @param startTime Start of time range
     * @param endTime End of time range
     */
    async getChangesByTimeRange(startTime: Date, endTime: Date): Promise<Change[]> {
        return this.changes.filter(change => {
            const changeTime = new Date(change.timestamp);
            return changeTime >= startTime && changeTime <= endTime;
        });
    }

    /**
     * Get changes for a specific file path
     * @param filePath Path to file
     */
    async getChangesByFile(filePath: string): Promise<Change[]> {
        return this.changes.filter(change =>
            change.details &&
            (change.details.filePath === filePath ||
                (Array.isArray(change.details.files) &&
                    change.details.files.includes(filePath)))
        );
    }

    /**
     * Get summary of changes grouped by type
     */
    async getChangeSummary(): Promise<Record<string, number>> {
        return this.changes.reduce((summary: Record<string, number>, change) => {
            summary[change.type] = (summary[change.type] || 0) + 1;
            return summary;
        }, {});
    }

    /**
     * Load changes from persistent storage
     */
    private loadChanges(): Change[] {
        try {
            if (existsSync(this.changesFilePath)) {
                const data = readFileSync(this.changesFilePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading changes:', error);
        }
        return [];
    }

    /**
     * Save changes to persistent storage
     */
    private async saveChanges(): Promise<void> {
        try {
            // Ensure directory exists
            await fs.mkdir(path.dirname(this.changesFilePath), { recursive: true });

            // Write changes to file
            await fs.writeFile(
                this.changesFilePath,
                JSON.stringify(this.changes, null, 2),
                'utf8'
            );
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to save changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
                this.changesFilePath
            );
        }
    }

    /**
     * Generate a unique change ID
     */
    private generateChangeId(): string {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }

    /**
     * Clean up old changes beyond retention period
     * @param retentionDays Number of days to retain changes
     */
    protected async cleanupOldChanges(retentionDays: number): Promise<void> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        this.changes = this.changes.filter(change =>
            new Date(change.timestamp) >= cutoffDate
        );

        if (CHANGE_TRACKING_CONFIG.persistChanges) {
            await this.saveChanges();
        }
    }

    /**
     * Export changes to a file
     * @param exportPath Path to export file
     */
    protected async exportChanges(exportPath: string): Promise<void> {
        try {
            const exportData = {
                exportDate: new Date().toISOString(),
                changes: this.changes
            };
            await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), 'utf8');
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to export changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
                exportPath
            );
        }
    }

    /**
     * Import changes from a file
     * @param importPath Path to import file
     * @param merge Whether to merge with existing changes
     */
    protected async importChanges(importPath: string, merge = false): Promise<void> {
        try {
            const importData = JSON.parse(await fs.readFile(importPath, 'utf8'));

            if (!Array.isArray(importData.changes)) {
                throw new Error('Invalid import file format');
            }

            if (merge) {
                // Merge with existing changes, avoiding duplicates by ID
                const existingIds = new Set(this.changes.map(c => c.id));
                const newChanges = importData.changes.filter((c: Change) => !existingIds.has(c.id));
                this.changes.push(...newChanges);
            } else {
                // Replace existing changes
                this.changes = importData.changes;
            }

            if (CHANGE_TRACKING_CONFIG.persistChanges) {
                await this.saveChanges();
            }
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to import changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
                importPath
            );
        }
    }
}
