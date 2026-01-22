import * as assert from 'assert';
import * as vscode from 'vscode';
import { AnchoringEngine } from '../anchoring';
import { ReviewAnchor, ReviewThread } from '../models';

suite('Anchoring Engine Test Suite', () => {

    test('Anchor matches exact text', async () => {
        const document = await vscode.workspace.openTextDocument({ content: 'Hello World' });
        const anchor: ReviewAnchor = {
            startOffset: 0,
            endOffset: 5,
            selectedText: 'Hello',
            prefixContext: '',
            suffixContext: ' World',
            originalRange: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 5 }
        };
        const thread: ReviewThread = {
            id: '1', filePath: 'test', anchor, status: 'open',
            createdAt: '', updatedAt: '', messages: []
        };

        const result = await AnchoringEngine.anchorThread(document, thread);
        assert.strictEqual(result.isOrphaned, false);
        assert.strictEqual(result.confidence, 1.0);
        assert.strictEqual(document.getText(result.range), 'Hello');
    });

    test('Fuzzy match with shifted text', async () => {
        // Insert "Prefix " at start
        const document = await vscode.workspace.openTextDocument({ content: 'Prefix Hello World' });

        // Original anchor was at 0 for "Hello"
        const anchor: ReviewAnchor = {
            startOffset: 0,
            endOffset: 5,
            selectedText: 'Hello',
            prefixContext: '',
            suffixContext: ' World',
            originalRange: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 5 }
        };
        const thread: ReviewThread = {
            id: '2', filePath: 'test', anchor, status: 'open',
            createdAt: '', updatedAt: '', messages: []
        };

        const result = await AnchoringEngine.anchorThread(document, thread);

        // Should find "Hello" at offset 7
        assert.strictEqual(result.isOrphaned, false);
        // Confidence might be lower than 1 but high enough
        assert.ok(result.confidence > 0.8, `Confidence ${result.confidence} should be high`);
        assert.strictEqual(document.getText(result.range), 'Hello');
    });

    test('Fuzzy match with modified text', async () => {
        // "Hello World" -> "Hullo World"
        const document = await vscode.workspace.openTextDocument({ content: 'Hullo World' });

        const anchor: ReviewAnchor = {
            startOffset: 0,
            endOffset: 5,
            selectedText: 'Hello',
            prefixContext: '',
            suffixContext: ' World',
            originalRange: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 5 }
        };
        const thread: ReviewThread = {
            id: '3', filePath: 'test', anchor, status: 'open',
            createdAt: '', updatedAt: '', messages: []
        };

        const result = await AnchoringEngine.anchorThread(document, thread);

        // Should find "Hullo" because contexts match perfectly
        assert.strictEqual(result.isOrphaned, false);
        assert.strictEqual(document.getText(result.range), 'Hullo');
    });
});
