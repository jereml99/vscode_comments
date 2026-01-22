import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { CommandHandler } from '../commands';
import { StorageService } from '../storage';
import { ReviewThread } from '../models';

suite('CommandHandler Test Suite', () => {
    let storageService: StorageService;
    let commandHandler: CommandHandler;
    let showInputBoxStub: sinon.SinonStub;
    let showQuickPickStub: sinon.SinonStub;

    setup(() => {
        const context = { subscriptions: [] } as any;
        storageService = new StorageService(context);
        commandHandler = new CommandHandler(storageService);

        // Stub InputBox and QuickPick
        showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        showQuickPickStub = sinon.stub(vscode.window, 'showQuickPick');
    });

    teardown(async () => {
        showInputBoxStub.restore();
        showQuickPickStub.restore();

        // Cleanup storage
        const threads = await storageService.getThreads();
        for (const t of threads) {
            await storageService.deleteThread(t.id);
        }
    });

    test('Add Thread via Command', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { assert.ok(workspaceFolders, 'No workspace open'); return; }

        // Create file in workspace
        const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, 'test-add.ts');
        await vscode.workspace.fs.writeFile(uri, Buffer.from('const foo = "bar";'));

        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 5); // Select "const"

        // Mock input
        showInputBoxStub.resolves('Test Comment');

        // Execute
        await commandHandler.addThread();

        // Verify
        const threads = await storageService.getThreads();
        const added = threads.find(t => t.filePath === 'test-add.ts');
        assert.ok(added, 'Thread should be added');
        assert.strictEqual(added?.messages[0].body, 'Test Comment');
        assert.strictEqual(added?.anchor.selectedText, 'const');
    });

    test('Reply Thread via Command', async () => {
        // Setup existing thread
        const document = await vscode.workspace.openTextDocument({ content: 'Hello World' });
        await vscode.window.showTextDocument(document);

        // We need a workspace to save to
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { assert.ok(workspaceFolders, 'No workspace open'); return; }

        const thread: ReviewThread = {
            id: 'reply-test-id',
            filePath: 'test-reply.ts', // Dummy path
            anchor: {
                startOffset: 0, endOffset: 5, selectedText: 'Hello',
                prefixContext: '', suffixContext: '',
                originalRange: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 5 }
            },
            status: 'open',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            messages: [{ id: 'm1', author: 'tester', body: 'msg1', createdAt: new Date().toISOString() }]
        };
        await storageService.addThread(thread, workspaceFolders[0].uri);

        // Mock inputs
        // replyThread(undefined) -> shows QuickPick -> then InputBox
        showQuickPickStub.resolves({ thread });
        showInputBoxStub.resolves('Reply Message');

        // Execute
        await commandHandler.replyThread();

        // Verify
        const threads = await storageService.getThreads();
        const updated = threads.find(t => t.id === 'reply-test-id');
        assert.strictEqual(updated?.messages.length, 2);
        assert.strictEqual(updated?.messages[1].body, 'Reply Message');
    });

    test('Resolve Thread via Command', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { assert.ok(workspaceFolders, 'No workspace open'); return; }

        const thread: ReviewThread = {
            id: 'resolve-test-id',
            filePath: 'test-resolve.ts',
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

        // Execute
        await commandHandler.resolveThread('resolve-test-id');

        // Verify
        const threads = await storageService.getThreads();
        const updated = threads.find(t => t.id === 'resolve-test-id');
        assert.strictEqual(updated?.status, 'resolved');
    });
});
