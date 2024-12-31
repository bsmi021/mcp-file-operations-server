import * as diff from 'diff';
import {
    PatchService,
    PatchOperation,
    PatchResult,
    WhitespaceConfig,
    NormalizedContent,
    FileOperationError,
    FileErrorCode,
    MergeStrategy,
    ConflictResolution
} from '../types/index.js';
import { DEFAULT_WHITESPACE_CONFIG } from '../config/defaults.js';
import { FileServiceImpl } from './FileService.js';

/**
 * Enhanced implementation of PatchService interface handling file patching operations
 * Follows SOLID principles and implements advanced patching strategies:
 * - Single Responsibility: Handles only patching operations
 * - Open/Closed: Extensible through inheritance and strategy patterns
 * - Liskov Substitution: Implements PatchService interface
 * - Interface Segregation: Focused patching methods
 * - Dependency Inversion: Depends on abstractions
 */
export class PatchServiceImpl implements PatchService {
    private fileService: FileServiceImpl;
    private readonly CHUNK_SIZE = 100; // Size of chunks for token-based diff
    private readonly SIMILARITY_THRESHOLD = 0.8; // Threshold for fuzzy matching

    constructor() {
        this.fileService = new FileServiceImpl();
    }

    /**
     * Apply a patch operation to a file with enhanced diff and merge capabilities
     * @param operation Patch operation details
     */
    async applyPatch(operation: PatchOperation): Promise<PatchResult> {
        try {
            // Create atomic operation context
            const context = await this.createAtomicContext(operation);

            try {
                const fileContent = await this.fileService.readFile(operation.filePath);
                const effectiveConfig = operation.whitespaceConfig || DEFAULT_WHITESPACE_CONFIG;
                const { normalized: content } = this.normalizeContent(fileContent, effectiveConfig);

                let newContent: string;
                let changesApplied = 0;
                let conflicts: string[] = [];

                switch (operation.type) {
                    case 'complete': {
                        if (!operation.content) {
                            throw new Error('Content is required for complete replacement');
                        }
                        const { normalized, conflicts: completeConflicts } = await this.handleCompleteReplacement(
                            content,
                            operation.content,
                            effectiveConfig,
                            operation.mergeStrategy
                        );
                        newContent = normalized;
                        changesApplied = 1;
                        conflicts = completeConflicts;
                        break;
                    }
                    case 'line': {
                        const { content: lineContent, changes: lineChanges, conflicts: lineConflicts } =
                            await this.handleLineOperation(content, operation, effectiveConfig);
                        newContent = lineContent;
                        changesApplied = lineChanges;
                        conflicts = lineConflicts;
                        break;
                    }
                    case 'block': {
                        if (!operation.search || !operation.replace) {
                            throw new Error('Search and replace are required for block replacement');
                        }
                        const { content: blockContent, changes: blockChanges, conflicts: blockConflicts } =
                            await this.handleBlockOperation(content, operation, effectiveConfig);
                        newContent = blockContent;
                        changesApplied = blockChanges;
                        conflicts = blockConflicts;
                        break;
                    }
                    case 'diff': {
                        if (!operation.diff) {
                            throw new Error('Diff content is required for diff patching');
                        }
                        const { content: diffContent, changes: diffChanges, conflicts: diffConflicts } =
                            await this.handleDiffOperation(content, operation);
                        newContent = diffContent;
                        changesApplied = diffChanges;
                        conflicts = diffConflicts;
                        break;
                    }
                    default:
                        throw new Error(`Unsupported patch type: ${operation.type}`);
                }

                // Verify changes before applying
                if (!await this.verifyChanges(content, newContent, operation)) {
                    throw new Error('Change verification failed');
                }

                // Only write if changes were made and there are no conflicts
                if (changesApplied > 0 && conflicts.length === 0) {
                    await this.fileService.writeFile(operation.filePath, newContent);
                    await this.commitAtomicOperation(context);
                } else if (conflicts.length > 0) {
                    await this.handleConflicts(context, conflicts, operation.conflictResolution);
                }

                return {
                    success: true,
                    filePath: operation.filePath,
                    type: operation.type,
                    changesApplied,
                    backupPath: context.backupPath,
                    originalContent: content.split('\n'),
                    newContent: newContent.split('\n'),
                    conflicts: conflicts.length > 0 ? conflicts : undefined
                };
            } catch (error) {
                await this.rollbackAtomicOperation(context);
                throw error;
            }
        } catch (error) {
            return {
                success: false,
                filePath: operation.filePath,
                type: operation.type,
                changesApplied: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Create context for atomic operation
     * @param operation Patch operation
     */
    private async createAtomicContext(operation: PatchOperation) {
        const context = {
            backupPath: undefined as string | undefined,
            tempPath: undefined as string | undefined
        };

        if (operation.createBackup) {
            context.backupPath = await this.createBackup(operation.filePath);
            context.tempPath = operation.filePath;
        }

        return context;
    }

    /**
     * Handle complete file replacement with merge support
     * @param original Original content
     * @param replacement Replacement content
     * @param config Whitespace configuration
     * @param strategy Merge strategy
     */
    private async handleCompleteReplacement(
        original: string,
        replacement: string,
        config: WhitespaceConfig,
        strategy?: MergeStrategy
    ): Promise<{ normalized: string; conflicts: string[] }> {
        const normalized = this.normalizeContent(replacement, config).normalized;

        if (!strategy || strategy === 'overwrite') {
            return { normalized, conflicts: [] };
        }

        // Implement three-way merge for complete replacement
        const base = await this.findCommonAncestor(original, normalized);
        return this.performThreeWayMerge(base, original, normalized);
    }

    /**
     * Handle line-based operations with token matching
     * @param content Original content
     * @param operation Patch operation
     * @param config Whitespace configuration
     */
    private async handleLineOperation(
        content: string,
        operation: PatchOperation,
        config: WhitespaceConfig
    ): Promise<{ content: string; changes: number; conflicts: string[] }> {
        const lines = content.split('\n');
        let changes = 0;
        const conflicts: string[] = [];

        if (operation.lineNumbers) {
            // Enhanced line number based replacement with validation
            for (const lineNum of operation.lineNumbers) {
                if (lineNum > 0 && lineNum <= lines.length) {
                    const originalLine = lines[lineNum - 1];
                    if (typeof operation.replace === 'string') {
                        if (await this.validateLineChange(originalLine, operation.replace)) {
                            lines[lineNum - 1] = operation.replace;
                            changes++;
                        } else {
                            conflicts.push(`Line ${lineNum}: Invalid change detected`);
                        }
                    } else {
                        if (await this.validateLineDeletion(originalLine)) {
                            lines.splice(lineNum - 1, 1);
                            changes++;
                        } else {
                            conflicts.push(`Line ${lineNum}: Cannot delete protected line`);
                        }
                    }
                }
            }
        } else if (operation.search || operation.searchPattern) {
            // Enhanced pattern based replacement with token matching
            const pattern = operation.searchPattern ||
                (operation.search ? this.createTokenPattern(operation.search, config) : null);

            if (!pattern) {
                throw new Error('Either search or searchPattern must be provided');
            }

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const normalizedLine = this.normalizeContent(line.toString(), config).normalized;
                if (this.matchesWithTokens(normalizedLine, pattern)) {
                    if (typeof operation.replace === 'string') {
                        if (await this.validateLineChange(line, operation.replace)) {
                            lines[i] = operation.replace;
                            changes++;
                        } else {
                            conflicts.push(`Line ${i + 1}: Invalid change detected`);
                        }
                    } else {
                        if (await this.validateLineDeletion(line)) {
                            lines.splice(i, 1);
                            i--; // Adjust index after removal
                            changes++;
                        } else {
                            conflicts.push(`Line ${i + 1}: Cannot delete protected line`);
                        }
                    }
                }
            }
        }

        return { content: lines.join('\n'), changes, conflicts };
    }

    /**
     * Handle block-based operations with improved matching
     * @param content Original content
     * @param operation Patch operation
     * @param config Whitespace configuration
     */
    private async handleBlockOperation(
        content: string,
        operation: PatchOperation,
        config: WhitespaceConfig
    ): Promise<{ content: string; changes: number; conflicts: string[] }> {
        if (!operation.search || !operation.replace) {
            throw new Error('Search and replace are required for block replacement');
        }

        const searchNormalized = this.normalizeContent(operation.search, config).normalized;
        const replaceNormalized = this.normalizeContent(operation.replace, config).normalized;

        // Create token-based pattern for block matching
        const pattern = this.createBlockTokenPattern(searchNormalized, config);
        const conflicts: string[] = [];

        // Use chunking for large blocks
        const chunks = this.splitIntoChunks(content, this.CHUNK_SIZE);
        let newContent = '';
        let changes = 0;

        for (const chunk of chunks) {
            if (this.matchesWithTokens(chunk, pattern)) {
                if (await this.validateBlockChange(chunk, replaceNormalized)) {
                    newContent += chunk.replace(pattern, replaceNormalized);
                    changes++;
                } else {
                    conflicts.push(`Block change validation failed`);
                    newContent += chunk;
                }
            } else {
                newContent += chunk;
            }
        }

        return { content: newContent, changes, conflicts };
    }

    /**
     * Handle diff-based operations with improved diff algorithm
     * @param content Original content
     * @param operation Patch operation
     */
    private async handleDiffOperation(
        content: string,
        operation: PatchOperation
    ): Promise<{ content: string; changes: number; conflicts: string[] }> {
        const conflicts: string[] = [];

        try {
            const patches = diff.parsePatch(operation.diff!);
            let newContent = content;
            let changes = 0;

            for (const patch of patches) {
                const patchResult = diff.applyPatch(newContent, patch);
                if (patchResult === false) {
                    conflicts.push(`Failed to apply patch: ${JSON.stringify(patch)}`);
                    continue;
                }

                if (await this.validateDiffChange(newContent, patchResult)) {
                    newContent = patchResult;
                    changes++;
                } else {
                    conflicts.push(`Diff change validation failed`);
                }
            }

            return { content: newContent, changes, conflicts };
        } catch (error) {
            throw new Error(`Failed to apply diff patch: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create a backup of a file with enhanced error handling
     * @param filePath Path to the file
     */
    public async createBackup(filePath: string): Promise<string> {
        const backupPath = `${filePath}.bak`;
        try {
            // Cast overwrite to allow true value
            await this.fileService.copyFile(filePath, backupPath, true as false);
            return backupPath;
        } catch (error) {
            throw new FileOperationError(
                'BACKUP_FAILED' as FileErrorCode,
                `Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
                filePath
            );
        }
    }

    /**
     * Normalize content with enhanced token handling
     * @param content Content to normalize
     * @param config Whitespace configuration
     */
    public normalizeContent(content: string, config: WhitespaceConfig = DEFAULT_WHITESPACE_CONFIG): NormalizedContent {
        const lines = content.split(/\r\n|\r|\n/);
        const lineEndings = content.includes('\r\n') ? '\r\n' :
            content.includes('\r') ? '\r' : '\n';

        const indentationMatch = content.match(/^[ \t]+/m);
        const indentation = (indentationMatch ? indentationMatch[0] : config.defaultIndentation) || '    ';

        let indentationSpaces = 0;
        let indentationTabs = 0;
        let trailingWhitespace = 0;
        let emptyLines = 0;
        let maxLineLength = 0;

        const processedLines = lines.map(line => {
            maxLineLength = Math.max(maxLineLength, line.length);
            if (line.trim().length === 0) emptyLines++;
            if (line.match(/[ \t]+$/)) trailingWhitespace++;

            const indent = line.match(/^[ \t]+/);
            if (indent) {
                indentationSpaces += (indent[0].match(/ /g) || []).length;
                indentationTabs += (indent[0].match(/\t/g) || []).length;
            }

            let processedLine = line;
            if (config.trimTrailingWhitespace) {
                processedLine = processedLine.replace(/[ \t]+$/, '');
            }
            if (!config.preserveIndentation) {
                processedLine = processedLine.replace(/^[ \t]+/, config.defaultIndentation || '    ');
            }
            return processedLine;
        });

        const normalized = processedLines.join(
            config.preserveLineEndings ? lineEndings : (config.defaultLineEnding || '\n')
        );

        const hash = Buffer.from(normalized).toString('base64');

        return {
            normalized,
            lineEndings,
            indentation,
            hash,
            stats: {
                indentationSpaces,
                indentationTabs,
                trailingWhitespace,
                emptyLines,
                maxLineLength
            }
        };
    }

    /**
     * Create a token-based pattern for matching
     * @param pattern Original pattern
     * @param config Whitespace configuration
     */
    private createTokenPattern(pattern: string, config: WhitespaceConfig): RegExp {
        const tokens = this.tokenize(pattern);
        let flexPattern = tokens.map(token => {
            // Escape regex special characters except those we want to keep flexible
            const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Make whitespace flexible based on config
            if (!config.preserveIndentation && /^\s+$/.test(token)) {
                return '\\s*';
            }
            if (config.normalizeWhitespace && /\s/.test(token)) {
                return escaped.replace(/\s+/g, '\\s+');
            }
            return escaped;
        }).join('');

        return new RegExp(flexPattern);
    }

    /**
     * Create a token-based pattern for matching blocks
     * @param pattern Original pattern
     * @param config Whitespace configuration
     */
    private createBlockTokenPattern(pattern: string, config: WhitespaceConfig): RegExp {
        const tokens = this.tokenize(pattern);
        let flexPattern = tokens.map(token => {
            const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Handle line endings
            if (!config.preserveLineEndings && /\r?\n/.test(token)) {
                return '\\r?\\n';
            }

            // Handle whitespace
            if (!config.preserveIndentation && /^\s+$/.test(token)) {
                return '\\s*';
            }
            if (config.normalizeWhitespace && /\s/.test(token)) {
                return escaped.replace(/\s+/g, '\\s+');
            }

            return escaped;
        }).join('');

        return new RegExp(flexPattern, 'gm');
    }

    /**
     * Split content into manageable chunks
     * @param content Content to split
     * @param size Chunk size
     */
    private splitIntoChunks(content: string, size: number): string[] {
        const chunks: string[] = [];
        let index = 0;
        while (index < content.length) {
            chunks.push(content.slice(index, index + size));
            index += size;
        }
        return chunks;
    }

    /**
     * Tokenize content for improved matching
     * @param content Content to tokenize
     */
    private tokenize(content: string): string[] {
        // Split into meaningful tokens (words, whitespace, symbols)
        return content.match(/\s+|\w+|[^\s\w]+/g) || [];
    }

    /**
     * Check if content matches pattern using token-based comparison
     * @param content Content to check
     * @param pattern Pattern to match against
     */
    private matchesWithTokens(content: string, pattern: RegExp): boolean {
        const contentTokens = this.tokenize(content);
        const patternStr = pattern.source;
        const patternTokens = this.tokenize(patternStr);

        // Use Levenshtein distance for fuzzy matching
        return this.calculateSimilarity(contentTokens, patternTokens) >= this.SIMILARITY_THRESHOLD;
    }

    /**
     * Calculate similarity between token arrays
     * @param tokens1 First token array
     * @param tokens2 Second token array
     */
    private calculateSimilarity(tokens1: string[], tokens2: string[]): number {
        const matrix: number[][] = [];

        // Initialize matrix
        for (let i = 0; i <= tokens1.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= tokens2.length; j++) {
            matrix[0][j] = j;
        }

        // Fill matrix
        for (let i = 1; i <= tokens1.length; i++) {
            for (let j = 1; j <= tokens2.length; j++) {
                if (tokens1[i - 1] === tokens2[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        const maxLength = Math.max(tokens1.length, tokens2.length);
        return 1 - matrix[tokens1.length][tokens2.length] / maxLength;
    }

    /**
     * Find common ancestor for three-way merge
     * @param content1 First content
     * @param content2 Second content
     */
    private async findCommonAncestor(content1: string, content2: string): Promise<string> {
        const tokens1 = this.tokenize(content1);
        const tokens2 = this.tokenize(content2);

        // Find longest common subsequence
        const lcs = this.findLCS(tokens1, tokens2);
        return lcs.join('');
    }

    /**
     * Find longest common subsequence
     * @param tokens1 First token array
     * @param tokens2 Second token array
     */
    private findLCS(tokens1: string[], tokens2: string[]): string[] {
        const matrix: number[][] = Array(tokens1.length + 1).fill(0)
            .map(() => Array(tokens2.length + 1).fill(0));

        // Fill LCS matrix
        for (let i = 1; i <= tokens1.length; i++) {
            for (let j = 1; j <= tokens2.length; j++) {
                if (tokens1[i - 1] === tokens2[j - 1]) {
                    matrix[i][j] = matrix[i - 1][j - 1] + 1;
                } else {
                    matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
                }
            }
        }

        // Reconstruct LCS
        const lcs: string[] = [];
        let i = tokens1.length;
        let j = tokens2.length;

        while (i > 0 && j > 0) {
            if (tokens1[i - 1] === tokens2[j - 1]) {
                lcs.unshift(tokens1[i - 1]);
                i--;
                j--;
            } else if (matrix[i - 1][j] > matrix[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }

        return lcs;
    }

    /**
     * Perform three-way merge
     * @param base Base content
     * @param current Current content
     * @param target Target content
     */
    private async performThreeWayMerge(
        base: string,
        current: string,
        target: string
    ): Promise<{ normalized: string; conflicts: string[] }> {
        const baseTokens = this.tokenize(base);
        const currentTokens = this.tokenize(current);
        const targetTokens = this.tokenize(target);

        const conflicts: string[] = [];
        const merged: string[] = [];

        let i = 0, j = 0, k = 0;
        while (i < baseTokens.length || j < currentTokens.length || k < targetTokens.length) {
            if (currentTokens[j] === targetTokens[k]) {
                merged.push(currentTokens[j]);
                i++; j++; k++;
            } else if (currentTokens[j] === baseTokens[i]) {
                merged.push(targetTokens[k]);
                i++; j++; k++;
            } else if (targetTokens[k] === baseTokens[i]) {
                merged.push(currentTokens[j]);
                i++; j++; k++;
            } else {
                // Conflict detected
                conflicts.push(`Conflict at position ${merged.length}`);
                merged.push(currentTokens[j] || targetTokens[k]);
                i++; j++; k++;
            }
        }

        return { normalized: merged.join(''), conflicts };
    }

    /**
     * Verify changes before applying
     * @param original Original content
     * @param modified Modified content
     * @param operation Patch operation
     */
    private async verifyChanges(
        original: string,
        modified: string,
        operation: PatchOperation
    ): Promise<boolean> {
        // Verify content hasn't been corrupted
        if (!this.isValidContent(modified)) {
            return false;
        }

        // Verify operation-specific constraints
        switch (operation.type) {
            case 'complete':
                return this.verifyCompleteReplacement(original, modified);
            case 'line':
                return this.verifyLineChanges(original, modified);
            case 'block':
                return this.verifyBlockChanges(original, modified);
            case 'diff':
                return this.verifyDiffChanges(original, modified);
            default:
                return false;
        }
    }

    /**
     * Verify complete replacement
     * @param original Original content
     * @param modified Modified content
     */
    private verifyCompleteReplacement(original: string, modified: string): boolean {
        // Ensure basic file structure is maintained and content hasn't regressed
        return this.hasValidStructure(modified) && modified.length >= original.length * 0.5;
    }

    /**
     * Verify line changes
     * @param original Original content
     * @param modified Modified content
     */
    private verifyLineChanges(original: string, modified: string): boolean {
        const originalLines = original.split('\n');
        const modifiedLines = modified.split('\n');

        // Verify line count hasn't changed unexpectedly
        return Math.abs(originalLines.length - modifiedLines.length) <=
            originalLines.filter(line => line.trim().length === 0).length;
    }

    /**
     * Verify block changes
     * @param original Original content
     * @param modified Modified content
     */
    private verifyBlockChanges(original: string, modified: string): boolean {
        // Verify block structure and ensure content similarity
        return this.hasValidBlockStructure(modified) &&
            this.calculateSimilarity(this.tokenize(original), this.tokenize(modified)) >= 0.3;
    }

    /**
     * Verify diff changes
     * @param original Original content
     * @param modified Modified content
     */
    private verifyDiffChanges(original: string, modified: string): boolean {
        // Verify diff hasn't corrupted content and maintains reasonable similarity
        return this.isValidContent(modified) &&
            this.hasValidStructure(modified) &&
            this.calculateSimilarity(this.tokenize(original), this.tokenize(modified)) >= 0.5;
    }

    /**
     * Check if content is valid
     * @param content Content to check
     */
    private isValidContent(content: string): boolean {
        // Basic validation
        return content.length > 0 && !content.includes('\0');
    }

    /**
     * Check if content has valid structure
     * @param content Content to check
     */
    private hasValidStructure(content: string): boolean {
        // Check basic file structure
        const lines = content.split('\n');
        return lines.every(line => line.length <= 10000); // Arbitrary max line length
    }

    /**
     * Check if content has valid block structure
     * @param content Content to check
     */
    private hasValidBlockStructure(content: string): boolean {
        // Check block structure (e.g., matching braces)
        const braces = content.match(/[{}]/g) || [];
        return braces.filter(b => b === '{').length === braces.filter(b => b === '}').length;
    }

    /**
     * Validate line change
     * @param original Original line
     * @param modified Modified line
     */
    private async validateLineChange(original: string, modified: string): Promise<boolean> {
        // Check for protected content
        if (original.includes('TODO') || original.includes('IMPORTANT')) {
            return false;
        }
        // Validate line-level changes
        return modified.length <= original.length * 2; // Arbitrary max growth factor
    }

    /**
     * Validate line deletion
     * @param line Line to delete
     */
    private async validateLineDeletion(line: string): Promise<boolean> {
        // Validate if line can be safely deleted
        return !line.includes('IMPORTANT') && !line.includes('TODO');
    }

    /**
     * Validate block change
     * @param original Original block
     * @param modified Modified block
     */
    private async validateBlockChange(original: string, modified: string): Promise<boolean> {
        // Validate block-level changes and content integrity
        return this.hasValidBlockStructure(modified) &&
            modified.length >= original.length * 0.5 &&
            modified.length <= original.length * 2;
    }

    /**
     * Validate diff change
     * @param original Original content
     * @param modified Modified content
     */
    private async validateDiffChange(original: string, modified: string): Promise<boolean> {
        // Validate diff-level changes and content integrity
        return this.isValidContent(modified) &&
            this.hasValidStructure(modified) &&
            this.calculateSimilarity(this.tokenize(original), this.tokenize(modified)) >= 0.3;
    }

    /**
     * Handle conflicts based on resolution strategy
     * @param context Atomic operation context
     * @param conflicts Detected conflicts
     * @param resolution Conflict resolution strategy
     */
    private async handleConflicts(
        context: { backupPath?: string; tempPath?: string },
        conflicts: string[],
        resolution?: ConflictResolution
    ): Promise<void> {
        switch (resolution) {
            case 'force':
                // Proceed despite conflicts
                await this.commitAtomicOperation(context);
                break;
            case 'revert':
                // Revert changes
                await this.rollbackAtomicOperation(context);
                break;
            default:
                // Default to revert
                await this.rollbackAtomicOperation(context);
                throw new Error(`Unresolved conflicts: ${conflicts.join(', ')}`);
        }
    }

    /**
     * Commit atomic operation
     * @param context Atomic operation context
     */
    private async commitAtomicOperation(
        context: { backupPath?: string; tempPath?: string }
    ): Promise<void> {
        if (context.backupPath) {
            await this.fileService.deleteFile(context.backupPath);
        }
    }

    /**
     * Rollback atomic operation
     * @param context Atomic operation context
     */
    private async rollbackAtomicOperation(
        context: { backupPath?: string; tempPath?: string }
    ): Promise<void> {
        if (context.backupPath && context.tempPath) {
            await this.restoreFromBackup(context.tempPath, context.backupPath);
        }
    }

    /**
     * Restore a file from its backup
     * @param filePath Original file path
     * @param backupPath Backup file path
     */
    protected async restoreFromBackup(filePath: string, backupPath: string): Promise<void> {
        try {
            // Cast overwrite to allow true value
            await this.fileService.copyFile(backupPath, filePath, true as false);
            await this.fileService.deleteFile(backupPath);
        } catch (error) {
            throw new FileOperationError(
                'OPERATION_FAILED' as FileErrorCode,
                `Failed to restore from backup: ${error instanceof Error ? error.message : 'Unknown error'}`,
                filePath
            );
        }
    }
}
