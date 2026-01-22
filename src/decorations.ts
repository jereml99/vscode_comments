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
            if (isOrphaned || !range) { continue; }

            const decoration: vscode.DecorationOptions = {
                range,
                hoverMessage: this.createHoverMessage(thread)
            };

            if (thread.status === 'resolved') {
                // resolvedDecorations.push(decoration); // Disabled per user request
            } else {
                openDecorations.push(decoration);
            }
        }

        editor.setDecorations(this.openDecorationType, openDecorations);
        editor.setDecorations(this.resolvedDecorationType, resolvedDecorations);
    }

    private createHoverMessage(thread: any): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.isTrusted = true;
        md.supportHtml = true;
        md.supportThemeIcons = true;

        // Header
        md.appendMarkdown(`**Review Thread** (${thread.status})\n\n`);

        // Loop through all messages
        thread.messages.forEach((msg: any, index: number) => {
            const dateStr = new Date(msg.createdAt).toLocaleString();
            md.appendMarkdown(`**${msg.author || 'User'}** _${dateStr}_\n`);

            // Blockquote for message body
            md.appendMarkdown(`> ${msg.body.replace(/\n/g, '\n> ')}\n\n`);

            // Add spacing between messages if not last
            if (index < thread.messages.length - 1) {
                md.appendMarkdown(`---\n`);
            }
        });

        md.appendMarkdown(`---\n`);

        // Action Links
        const threadIdRef = encodeURIComponent(JSON.stringify([thread.id]));
        const lastMsg = thread.messages[thread.messages.length - 1];
        const textToCopy = lastMsg ? lastMsg.body : '';
        const copyArg = encodeURIComponent(JSON.stringify([textToCopy]));

        if (thread.status !== 'resolved') {
            md.appendMarkdown(`[$(reply) Reply](command:reviewComments.replyThread?${threadIdRef}) &nbsp;&nbsp; `);
            md.appendMarkdown(`[$(check) Resolve](command:reviewComments.resolveThread?${threadIdRef}) &nbsp;&nbsp; `);
        }

        md.appendMarkdown(`[$(copy) Copy](command:reviewComments.copyComment?${copyArg})`);

        return md;
    }

    public dispose() {
        this.openDecorationType.dispose();
        this.resolvedDecorationType.dispose();
    }
}
