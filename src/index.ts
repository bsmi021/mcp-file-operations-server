#!/usr/bin/env node

import { FileOperationsServer } from './server.js';

/**
 * Main entry point for the File Operations MCP Server
 * Handles server initialization, error handling, and graceful shutdown
 */
async function main() {
    let server: FileOperationsServer | null = null;

    try {
        // Set up error handlers
        process.on('uncaughtException', (error) => {
            console.error('[Uncaught Exception]', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            console.error('[Unhandled Rejection]', reason);
            process.exit(1);
        });

        // Handle termination signals
        const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
        signals.forEach((signal) => {
            process.once(signal, async () => {
                console.error(`\nReceived ${signal}, shutting down...`);
                if (server) {
                    try {
                        await server.cleanup();
                    } catch (error) {
                        console.error('Error during cleanup:', error);
                    }
                }
                process.exit(0);
            });
        });

        // Initialize and run server
        server = new FileOperationsServer();
        await server.run();

    } catch (error) {
        console.error('[Fatal Error]', error);
        process.exit(1);
    }
}

// Start the server
main().catch((error) => {
    console.error('[Startup Error]', error);
    process.exit(1);
});
