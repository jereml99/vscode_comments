import * as vscode from 'vscode';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { StorageService, ReviewThreadWithRoot } from './storage';
import { AnchoringEngine } from './anchoring';
import { ReviewThread, ReviewMessage } from './models';

export class CommandHandler {
    constructor(private storageService: StorageService) { }

    private getUserName(): string {
        return process.env['USER'] || process.env['USERNAME'] || 'User';
    }

    public async addThread() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {return;}

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select some text to comment on.');
            return;
        }

        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('File must be part of a workspace to add comments.');
            return;
        }

        const commentText = await vscode.window.showInputBox({ prompt: 'Enter your comment' });
        if (!commentText) {return;}

        const anchor = AnchoringEngine.createAnchor(editor.document, selection);
        // Calculate path relative to the specific root
        const relativePath = path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath).split(path.sep).join('/');

        const thread: ReviewThread = {
            id: uuidv4(),
            filePath: relativePath,
            anchor,
            status: 'open',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: this.getUserName(),
            messages: [{
                id: uuidv4(),
                author: this.getUserName(),
                createdAt: new Date().toISOString(),
                body: commentText
            }]
        };

        // Pass the document URI so StorageService knows which root to use
        await this.storageService.addThread(thread, editor.document.uri);
        vscode.window.showInformationMessage('Comment added.');
    }

    public async replyThread(threadId?: string) {
        const threads = await this.storageService.getThreads();
        let thread: ReviewThread | undefined;

        if (threadId) {
            thread = threads.find(t => t.id === threadId);
        } else {
            // Pick from quick pick if not provided
            const items = threads.map(t => ({ label: t.messages[0].body, thread: t }));
            const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select thread to reply to' });
            thread = picked?.thread;
        }

        if (!thread) {return;}

        const replyText = await vscode.window.showInputBox({ prompt: 'Enter your reply' });
        if (!replyText) {return;}

        const message: ReviewMessage = {
            id: uuidv4(),
            author: this.getUserName(),
            createdAt: new Date().toISOString(),
            body: replyText
        };

        thread.messages.push(message);
        thread.updatedAt = new Date().toISOString();
        await this.storageService.updateThread(thread);
    }

    public async resolveThread(threadId: string) {
        const threads = await this.storageService.getThreads();
        const thread = threads.find(t => t.id === threadId);
        if (thread) {
            thread.status = 'resolved';
            thread.updatedAt = new Date().toISOString();
            await this.storageService.updateThread(thread);
        }
    }

    public async reopenThread(threadId: string) {
        const threads = await this.storageService.getThreads();
        const thread = threads.find(t => t.id === threadId);
        if (thread) {
            thread.status = 'open';
            thread.updatedAt = new Date().toISOString();
            await this.storageService.updateThread(thread);
        }
    }

    public async openThread(thread: ReviewThread | string) {
        let threadObj: ReviewThread | undefined;

        if (typeof thread === 'string') {
            const threads = await this.storageService.getThreads();
            threadObj = threads.find(t => t.id === thread);
        } else {
            threadObj = thread;
        }

        if (!threadObj) {
            vscode.window.showErrorMessage('Thread could not be found.');
            return;
        }

        // thread might be ReviewThreadWithRoot (runtime)
        const rootUri = (threadObj as any).rootUri as vscode.Uri | undefined;
        let uri: vscode.Uri;

        if (rootUri) {
            uri = vscode.Uri.joinPath(rootUri, threadObj.filePath);
        } else {
            // Fallback: try to find the file in the first workspace folder or search?
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {return;}
            uri = vscode.Uri.joinPath(workspaceFolders[0].uri, threadObj.filePath);
        }

        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc);

            const anchored = await AnchoringEngine.anchorThread(doc, threadObj);
            if (anchored.range) {
                editor.selection = new vscode.Selection(anchored.range.start, anchored.range.end);
                editor.revealRange(anchored.range, vscode.TextEditorRevealType.InCenter);
            } else if (anchored.isOrphaned) {
                vscode.window.showWarningMessage('Thread is orphaned. Text might have been deleted.');
            }
        } catch (error) {
            console.error(error);
            vscode.window.showErrorMessage(`Could not open file: ${threadObj.filePath}`);
        }
    }
    public async reattachThread(threadId?: string) {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.selection.isEmpty) {
            vscode.window.showWarningMessage('Select new text to reattach the comment to.');
            return;
        }

        const threads = await this.storageService.getThreads();
        let thread: ReviewThread | undefined;

        if (threadId) {
            thread = threads.find(t => t.id === threadId);
        } else {
            const items = threads.map(t => ({
                label: t.messages[0].body,
                description: t.status,
                detail: t.filePath,
                thread: t
            }));
            // Sort: orphaned first
            items.sort((a, b) => {
                if (a.thread.status === 'orphaned' && b.thread.status !== 'orphaned') {return -1;}
                if (a.thread.status !== 'orphaned' && b.thread.status === 'orphaned') {return 1;}
                return 0;
            });

            const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select thread to reattach to current selection' });
            thread = picked?.thread;
        }

        if (!thread) {return;}

        // Update anchor
        const newAnchor = AnchoringEngine.createAnchor(editor.document, editor.selection);
        thread.anchor = newAnchor;

        // Update filePath in case it changed (e.g. rename or move)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (workspaceFolder) {
            const relativePath = path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath).split(path.sep).join('/');
            thread.filePath = relativePath;
        }

        if (thread.status === 'orphaned') {
            thread.status = 'open';
        }

        thread.updatedAt = new Date().toISOString();

        await this.storageService.updateThread(thread);
        vscode.window.showInformationMessage('Thread reattached.');
    }
}
