import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewThread } from './models';
import { StorageService, ReviewThreadWithRoot } from './storage';

type TreeItem = ReviewFileItem | ReviewThreadItem | ReviewMessageItem;

export class ReviewTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private filterStatus: 'all' | 'open' | 'resolved' = 'all';

    constructor(private storageService: StorageService) {
        this.storageService.onDidStorageChange(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setFilter(status: 'all' | 'open' | 'resolved') {
        this.filterStatus = status;
        this.refresh();
    }

    // Sort is now implicit: Files by path, Threads by location
    setSort(option: 'updatedAt' | 'file' | 'status') {
        this.refresh();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (element instanceof ReviewFileItem) {
            return element.children;
        }

        if (element instanceof ReviewThreadItem) {
            return element.thread.messages.map(m => new ReviewMessageItem(m, element.thread.id));
        }

        if (element instanceof ReviewMessageItem) {
            return [];
        }

        // Root
        let threads = await this.storageService.getThreads();

        // Filter
        if (this.filterStatus !== 'all') {
            threads = threads.filter(t => t.status === this.filterStatus);
        }

        if (threads.length === 0) {
            return [];
        }

        // Group by File
        const fileMap = new Map<string, ReviewThreadWithRoot[]>();

        for (const thread of threads) {
            // Unique key for file: rootUri.toString() + filePath
            const key = `${thread.rootUri.toString()}::${thread.filePath}`;
            if (!fileMap.has(key)) {
                fileMap.set(key, []);
            }
            fileMap.get(key)!.push(thread);
        }

        const files: ReviewFileItem[] = [];

        for (const [key, fileThreads] of fileMap.entries()) {
            // Sort threads by line number (startOffset)
            fileThreads.sort((a, b) => a.anchor.startOffset - b.anchor.startOffset);

            // Create File Item
            const sample = fileThreads[0];
            const resourceUri = vscode.Uri.joinPath(sample.rootUri, sample.filePath);

            const children = fileThreads.map(t => new ReviewThreadItem(t));
            files.push(new ReviewFileItem(resourceUri, children));
        }

        // Sort files by path
        files.sort((a, b) => a.resourceUri!.fsPath.localeCompare(b.resourceUri!.fsPath));

        return files;
    }
}

export class ReviewFileItem extends vscode.TreeItem {
    constructor(public readonly resourceUri: vscode.Uri, public readonly children: ReviewThreadItem[]) {
        super(resourceUri, vscode.TreeItemCollapsibleState.Expanded);
        this.description = `(${children.length})`;
        this.contextValue = 'file';
        this.tooltip = resourceUri.fsPath;
    }
}

export class ReviewThreadItem extends vscode.TreeItem {
    constructor(public readonly thread: ReviewThread) {
        // Label: First message summary
        super(thread.messages[0]?.body || 'Comment Thread', vscode.TreeItemCollapsibleState.Collapsed);

        // Description: Author • Status
        this.description = `${thread.messages[0]?.author || 'User'} • ${thread.status}`;

        const md = new vscode.MarkdownString();
        // Tooltip: Full thread preview
        md.appendMarkdown(`**${thread.messages[0]?.author || 'User'}** (${new Date(thread.updatedAt).toLocaleString()})\n\n`);
        md.appendMarkdown(`${thread.messages[0]?.body}\n\n`);
        if (thread.messages.length > 1) {
            md.appendMarkdown(`---\n*+${thread.messages.length - 1} replies*\n`);
        }
        md.isTrusted = true;
        this.tooltip = md;

        // Match package.json "viewItem == thread-open" / "thread-resolved"
        this.contextValue = thread.status === 'resolved' ? 'thread-resolved' : 'thread-open';

        if (thread.status === 'resolved') {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else if (thread.status === 'orphaned') {
            this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconFailed'));
        } else {
            this.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.blue'));
        }

        // Enable click to navigate
        this.command = {
            command: 'reviewComments.openThread',
            title: 'Open Thread',
            arguments: [thread]
        };
    }
}

export class ReviewMessageItem extends vscode.TreeItem {
    public readonly messageId: string;
    public readonly threadId: string;

    constructor(message: any, threadId: string) {
        // Label: Author
        super(message.author || 'User', vscode.TreeItemCollapsibleState.None);

        this.messageId = message.id;
        this.threadId = threadId;

        // Description: Truncated Body
        this.description = message.body;

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${message.author || 'User'}** (${new Date(message.createdAt).toLocaleString()})\n\n`);
        md.appendMarkdown(`${message.body}`);
        md.isTrusted = true;
        this.tooltip = md;

        this.contextValue = 'message';
        this.iconPath = new vscode.ThemeIcon('account');
    }
}
