import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewStore, ReviewThread } from './models';

export interface ReviewThreadWithRoot extends ReviewThread {
    readonly rootUri: vscode.Uri;
}

export class StorageService {
    private static readonly FILE_NAME = '.review-comments.json';
    private _onDidStorageChange = new vscode.EventEmitter<void>();
    public readonly onDidStorageChange = this._onDidStorageChange.event;

    constructor(private context: vscode.ExtensionContext) {
        this.watchForChanges();
        vscode.workspace.onDidChangeWorkspaceFolders(() => this.watchForChanges());
    }

    private watchForChanges() {
        // Dispose old watchers if any? For simplicity in this step, we just add new ones or rely on the fact that we can just create a watcher for the glob '**/.review-comments.json'.
        // Actually, creating a watcher for each folder is safer.
        // For v1, let's generic watch.
        const watcher = vscode.workspace.createFileSystemWatcher(`**/${StorageService.FILE_NAME}`);
        watcher.onDidChange(() => this._onDidStorageChange.fire());
        watcher.onDidCreate(() => this._onDidStorageChange.fire());
        watcher.onDidDelete(() => this._onDidStorageChange.fire());
        this.context.subscriptions.push(watcher);
    }

    private getRootForUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
        return vscode.workspace.getWorkspaceFolder(uri);
    }

    private getStorageUri(folder: vscode.WorkspaceFolder): vscode.Uri {
        return vscode.Uri.joinPath(folder.uri, StorageService.FILE_NAME);
    }

    /**
     * Loads threads from ALL workspace folders.
     */
    public async getThreads(): Promise<ReviewThreadWithRoot[]> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {return [];}

        const allThreads: ReviewThreadWithRoot[] = [];

        for (const folder of folders) {
            const store = await this.loadFromFolder(folder);
            const threadsWithRoot = store.threads.map(t => ({
                ...t,
                rootUri: folder.uri
            }));
            allThreads.push(...threadsWithRoot);
        }

        return allThreads;
    }

    private async loadFromFolder(folder: vscode.WorkspaceFolder): Promise<ReviewStore> {
        const uri = this.getStorageUri(folder);
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            try {
                return JSON.parse(content.toString()) as ReviewStore;
            } catch (parseError) {
                vscode.window.showErrorMessage(`Failed to parse ${StorageService.FILE_NAME}. it may contain merge conflicts.`, 'Open File').then(choice => {
                    if (choice === 'Open File') {
                        vscode.window.showTextDocument(uri);
                    }
                });
                // Return empty so extension doesn't crash, but user knows something is wrong
                return { schemaVersion: 1, threads: [] };
            }
        } catch (e) {
            // File might not exist
            return { schemaVersion: 1, threads: [] };
        }
    }

    private async saveToFolder(folder: vscode.WorkspaceFolder, store: ReviewStore): Promise<void> {
        const uri = this.getStorageUri(folder);

        // Deterministic sorting
        store.threads.sort((a, b) => {
            if (a.filePath !== b.filePath) {return a.filePath.localeCompare(b.filePath);}
            if (a.createdAt !== b.createdAt) {return a.createdAt.localeCompare(b.createdAt);}
            return a.id.localeCompare(b.id);
        });

        for (const thread of store.threads) {
            thread.messages.sort((a, b) => {
                if (a.createdAt !== b.createdAt) {return a.createdAt.localeCompare(b.createdAt);}
                return a.id.localeCompare(b.id);
            });
        }

        const content = JSON.stringify(store, null, 2) + '\n';
        const data = Buffer.from(content, 'utf8');
        await vscode.workspace.fs.writeFile(uri, data);
    }

    public async addThread(thread: ReviewThread, contextUri: vscode.Uri): Promise<void> {
        const folder = this.getRootForUri(contextUri);
        if (!folder) {
            throw new Error('File is not part of any workspace folder');
        }

        const store = await this.loadFromFolder(folder);
        store.threads.push(thread);
        await this.saveToFolder(folder, store);
    }

    public async updateThread(thread: ReviewThread): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {return;}

        // We don't know which folder it is in easily unless we search or if ReviewThread had a root pointer.
        // But ReviewThread object passed here might be from the UI and lost the rootUri property if we are not careful.
        // For robustness, calculate where it SHOULD be if possible, or search.
        // But updating 'thread' might not have different filePath.
        // Let's search all roots for matching ID.

        // Optimization: if we have rootUri in the thread object (casted), use it.
        const threadWithRoot = thread as any;
        if (threadWithRoot.rootUri) {
            const folder = vscode.workspace.getWorkspaceFolder(threadWithRoot.rootUri);
            if (folder) {
                await this._updateThreadInFolder(folder, thread);
                return;
            }
        }

        // Fallback: search all
        for (const folder of folders) {
            const store = await this.loadFromFolder(folder);
            if (store.threads.some(t => t.id === thread.id)) {
                await this._updateThreadInFolder(folder, thread);
                return;
            }
        }
    }

    private async _updateThreadInFolder(folder: vscode.WorkspaceFolder, thread: ReviewThread) {
        const store = await this.loadFromFolder(folder);
        const index = store.threads.findIndex(t => t.id === thread.id);
        if (index !== -1) {
            // Strip the rootUri if it exists on the object before saving
            const { rootUri, ...cleanThread } = thread as any;
            store.threads[index] = cleanThread as ReviewThread;
            await this.saveToFolder(folder, store);
        }
    }

    public async deleteThread(threadId: string): Promise<void> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {return;}

        for (const folder of folders) {
            const store = await this.loadFromFolder(folder);
            const initialLength = store.threads.length;
            store.threads = store.threads.filter(t => t.id !== threadId);
            if (store.threads.length !== initialLength) {
                await this.saveToFolder(folder, store);
                return; // Assume ID is unique globally
            }
        }
    }
}
