import * as vscode from 'vscode';
import { AnchoredThread } from './anchoring';

export class DecorationManager {
    private openDecorationType: vscode.TextEditorDecorationType;
    private resolvedDecorationType: vscode.TextEditorDecorationType;

    constructor() {
        this.openDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 0, 0.3)', // Yellow highlight
            border: '1px solid yellow',
            gutterIconPath: vscode.Uri.parse('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjMiIGZpbGw9InllbGxvdyIvPjwvc3ZnPg=='),
            gutterIconSize: 'contain'
        });

        this.resolvedDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(128, 128, 128, 0.1)', // Subtle grey
            border: '1px solid grey',
            opacity: '0.6'
        });
    }

    public updateDecorations(editor: vscode.TextEditor, anchoredThreads: AnchoredThread[]) {
        const openDecorations: vscode.DecorationOptions[] = [];
        const resolvedDecorations: vscode.DecorationOptions[] = [];

        for (const { thread, range, isOrphaned } of anchoredThreads) {
            if (isOrphaned || !range) {continue;}

            const decoration: vscode.DecorationOptions = {
                range,
                hoverMessage: this.createHoverMessage(thread)
            };

            if (thread.status === 'resolved') {
                resolvedDecorations.push(decoration);
            } else {
                openDecorations.push(decoration);
            }
        }

        editor.setDecorations(this.openDecorationType, openDecorations);
        editor.setDecorations(this.resolvedDecorationType, resolvedDecorations);
    }

    private createHoverMessage(thread: any): vscode.MarkdownString {
        const firstMsg = thread.messages[0];
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**Review Comment** (${thread.status})\n\n`);
        if (firstMsg) {
            md.appendMarkdown(`*${firstMsg.author}:* ${firstMsg.body}\n\n`);
        }
        md.appendMarkdown(`--- \n`);
        md.appendMarkdown(`${thread.messages.length} messages. [View Thread](command:reviewComments.openThread?${encodeURIComponent(JSON.stringify([thread.id]))})`);
        md.isTrusted = true;
        return md;
    }

    public dispose() {
        this.openDecorationType.dispose();
        this.resolvedDecorationType.dispose();
    }
}
