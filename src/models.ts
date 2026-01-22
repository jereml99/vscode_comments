
export interface ReviewStore {
    schemaVersion: number;
    threads: ReviewThread[];
}

export interface ReviewThread {
    id: string;
    filePath: string;
    anchor: ReviewAnchor;
    messages: ReviewMessage[];
    status: ThreadStatus;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
}

export type ThreadStatus = 'open' | 'resolved' | 'orphaned';

export interface ReviewMessage {
    id: string;
    author: string;
    body: string;
    createdAt: string;
}

export interface ReviewAnchor {
    startOffset: number;
    endOffset: number;
    selectedText: string;
    prefixContext: string;
    suffixContext: string;
    originalRange: {
        startLine: number;
        startCharacter: number;
        endLine: number;
        endCharacter: number;
    };
}
