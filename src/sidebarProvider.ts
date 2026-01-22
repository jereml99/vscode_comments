import * as vscode from 'vscode';
import { ReviewThread, ThreadStatus } from './models';
import { StorageService } from './storage';

export class ReviewTreeDataProvider implements vscode.TreeDataProvider<ReviewThreadItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ReviewThreadItem | undefined | null | void> = new vscode.EventEmitter<ReviewThreadItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ReviewThreadItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private filterStatus: 'all' | 'open' | 'resolved' = 'all';
    private sortOption: 'updatedAt' | 'file' | 'status' = 'updatedAt';

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

    setSort(option: 'updatedAt' | 'file' | 'status') {
        this.sortOption = option;
        this.refresh();
    }

    getTreeItem(element: ReviewThreadItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ReviewThreadItem): Promise<ReviewThreadItem[]> {
        if (element) {
            return [];
        }

        let threads = await this.storageService.getThreads();

        // Filter
        if (this.filterStatus !== 'all') {
            threads = threads.filter(t => t.status === this.filterStatus);
        }

        // Sort
        threads.sort((a, b) => {
            if (this.sortOption === 'file') {
                // Secondary sort by root if available (to group files in same project)
                const rootA = (a as any).rootUri?.toString() || '';
                const rootB = (b as any).rootUri?.toString() || '';
                if (rootA !== rootB) {return rootA.localeCompare(rootB);}

                const fileComp = a.filePath.localeCompare(b.filePath);
                if (fileComp !== 0) {return fileComp;}
                // Tertiary sort by date
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            } else if (this.sortOption === 'status') {
                // Order: orphaned, open, resolved
                const score = (s: string) => {
                    if (s === 'orphaned') {return 0;}
                    if (s === 'open') {return 1;}
                    return 2;
                };
                const sA = score(a.status);
                const sB = score(b.status);
                if (sA !== sB) {return sA - sB;}

                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            } else {
                // Default: updatedAt desc
                return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            }
        });

        return threads.map(thread => new ReviewThreadItem(thread));
    }
}

export class ReviewThreadItem extends vscode.TreeItem {
    constructor(public readonly thread: ReviewThread) {
        super(thread.messages[0]?.body || 'Comment Thread', vscode.TreeItemCollapsibleState.None);

        this.description = `${thread.status} • ${thread.messages.length} msgs`;
        this.tooltip = `${thread.filePath}\n${thread.messages.map(m => `${m.author}: ${m.body}`).join('\n')}`;

        // Match package.json "viewItem == thread-open" / "thread-resolved"
        this.contextValue = thread.status === 'resolved' ? 'thread-resolved' : 'thread-open';

        if (thread.status === 'resolved') {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
        } else if (thread.status === 'orphaned') {
            this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'));
        } else {
            this.iconPath = new vscode.ThemeIcon('comment-discussion');
        }

        this.command = {
            command: 'reviewComments.openThread',
            title: 'Open Thread',
            arguments: [thread]
        };
    }
}
