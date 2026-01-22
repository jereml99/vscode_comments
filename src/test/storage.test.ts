import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { StorageService, ReviewThreadWithRoot } from '../storage';
import { ReviewThread } from '../models';

suite('StorageService Test Suite', () => {
    let storageService: StorageService;

    suiteSetup(async () => {
        // Ensure we have a workspace
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            // If no workspace, some tests might fail or skip. 
            // We assume the test runner launches with a workspace.
        }
    });

    setup(() => {
        // Mock context (we don't strictly need it for these tests if we don't check subscriptions)
        const context = { subscriptions: [] } as any;
        storageService = new StorageService(context);
    });

    teardown(async () => {
        // Clean up: delete all threads
        const threads = await storageService.getThreads();
        for (const t of threads) {
            await storageService.deleteThread(t.id);
        }
    });

    test('Add and Get Thread', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { assert.ok(workspaceFolders, 'No workspace open'); return; }

        const thread: ReviewThread = {
            id: 'test-id-1',
            filePath: 'test.ts',
            anchor: {
                startOffset: 0, endOffset: 5, selectedText: 'const',
                prefixContext: '', suffixContext: '',
                originalRange: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 5 }
            },
            status: 'open',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            messages: [{ id: 'm1', author: 'tester', body: 'hello', createdAt: new Date().toISOString() }]
        };

        // Add thread to first root
        await storageService.addThread(thread, workspaceFolders[0].uri);

        const threads = await storageService.getThreads();
        assert.strictEqual(threads.length, 1);
        assert.strictEqual(threads[0].id, 'test-id-1');
        assert.strictEqual(threads[0].filePath, 'test.ts');
        // Check rootUri is attached
        assert.strictEqual(threads[0].rootUri.toString(), workspaceFolders[0].uri.toString());
    });

    test('Update Thread', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { assert.ok(workspaceFolders, 'No workspace open'); return; }

        const thread: ReviewThread = {
            id: 'test-id-2',
            filePath: 'test.ts',
            anchor: {
                startOffset: 0, endOffset: 0, selectedText: '',
                prefixContext: '', suffixContext: '',
                originalRange: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 }
            },
            status: 'open',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            messages: []
        };
        await storageService.addThread(thread, workspaceFolders[0].uri);

        // Modify status
        thread.status = 'resolved';
        await storageService.updateThread(thread);

        const threads = await storageService.getThreads();
        const updated = threads.find(t => t.id === 'test-id-2');
        assert.ok(updated);
        assert.strictEqual(updated?.status, 'resolved');
    });

    test('Delete Thread', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { assert.ok(workspaceFolders, 'No workspace open'); return; }

        const thread: ReviewThread = {
            id: 'test-id-3',
            filePath: 'test.ts',
            anchor: {
                startOffset: 0, endOffset: 0, selectedText: '',
                prefixContext: '', suffixContext: '',
                originalRange: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 0 }
            },
            status: 'open',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            messages: []
        };
        await storageService.addThread(thread, workspaceFolders[0].uri);

        await storageService.deleteThread('test-id-3');

        const threads = await storageService.getThreads();
        const found = threads.find(t => t.id === 'test-id-3');
        assert.strictEqual(found, undefined);
    });
});
