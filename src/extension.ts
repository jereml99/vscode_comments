import * as vscode from 'vscode';
import * as path from 'path';
import { StorageService } from './storage';
import { CommandHandler } from './commands';
import { DecorationManager } from './decorations';
import { ReviewTreeDataProvider } from './sidebarProvider';
import { AnchoringEngine } from './anchoring';

export function activate(context: vscode.ExtensionContext) {
	console.log('Activating Git Review Comments extension...');

	const storageService = new StorageService(context);
	const commandHandler = new CommandHandler(storageService);
	const decorationManager = new DecorationManager();
	const treeDataProvider = new ReviewTreeDataProvider(storageService);

	// Register View
	vscode.window.createTreeView('review-comments-sidebar', {
		treeDataProvider: treeDataProvider
	});

	// Register Commands
	const getThreadId = (arg: any): string | undefined => {
		if (typeof arg === 'string') { return arg; } // From Markdown link
		if (arg instanceof ReviewTreeDataProvider) { return undefined; } // Should not happen but just in case
		if (arg && arg.thread && arg.thread.id) { return arg.thread.id; } // From TreeView context
		if (arg && arg.id) { return arg.id; } // From direct object
		return undefined;
	};

	const getThread = (arg: any) => {
		if (arg && arg.thread) { return arg.thread; }
		return arg;
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('reviewComments.addThread', () => commandHandler.addThread()),

		vscode.commands.registerCommand('reviewComments.replyThread', (arg) => {
			const threadId = getThreadId(arg);
			return commandHandler.replyThread(threadId);
		}),

		vscode.commands.registerCommand('reviewComments.resolveThread', (arg) => {
			const threadId = getThreadId(arg);
			if (threadId) { commandHandler.resolveThread(threadId); }
		}),

		vscode.commands.registerCommand('reviewComments.reopenThread', (arg) => {
			const threadId = getThreadId(arg);
			if (threadId) { commandHandler.reopenThread(threadId); }
		}),

		vscode.commands.registerCommand('reviewComments.reattachThread', (arg) => {
			const threadId = getThreadId(arg); // Usually undefined if from palette, but might accept id
			return commandHandler.reattachThread(threadId);
		}),

		vscode.commands.registerCommand('reviewComments.deleteThread', (arg) => {
			const threadId = getThreadId(arg);
			if (threadId) { commandHandler.deleteThread(threadId); }
		}),

		vscode.commands.registerCommand('reviewComments.deleteMessage', (arg) => {
			if (arg && arg.threadId && arg.messageId) {
				commandHandler.deleteMessage(arg.threadId, arg.messageId);
			}
		}),

		vscode.commands.registerCommand('reviewComments.editMessage', (arg) => {
			if (arg && arg.threadId && arg.messageId) {
				commandHandler.editMessage(arg.threadId, arg.messageId);
			}
		}),

		vscode.commands.registerCommand('reviewComments.openThread', (arg) => {
			const thread = getThread(arg);
			if (thread) { commandHandler.openThread(thread); }
		}),

		vscode.commands.registerCommand('reviewComments.refreshThreads', () => treeDataProvider.refresh()),

		vscode.commands.registerCommand('reviewComments.filterAll', () => treeDataProvider.setFilter('all')),
		vscode.commands.registerCommand('reviewComments.filterOpen', () => treeDataProvider.setFilter('open')),

		vscode.commands.registerCommand('reviewComments.filterResolved', () => treeDataProvider.setFilter('resolved')),

		vscode.commands.registerCommand('reviewComments.copyComment', async (text: string) => {
			if (text) {
				await vscode.env.clipboard.writeText(text);
				vscode.window.showInformationMessage('Comment copied to clipboard');
			}
		})
	);

	// Initial Load & Decorate
	const updateDecorations = async (editor: vscode.TextEditor) => {
		if (!editor) { return; }

		const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
		if (!folder) { return; }

		const relativePath = path.relative(folder.uri.fsPath, editor.document.uri.fsPath).split(path.sep).join('/');
		const threads = await storageService.getThreads();

		const fileThreads = threads.filter(t =>
			t.filePath === relativePath &&
			(t as any).rootUri?.toString() === folder.uri.toString()
		);

		const anchoredThreads = [];
		for (const thread of fileThreads) {
			const anchored = await AnchoringEngine.anchorThread(editor.document, thread);
			anchoredThreads.push(anchored);
		}
		decorationManager.updateDecorations(editor, anchoredThreads);
	};

	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) { updateDecorations(editor); }
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		const editor = vscode.window.activeTextEditor;
		if (editor && event.document === editor.document) {
			updateDecorations(editor);
		}
	}, null, context.subscriptions);

	// Reload decorations when storage changes (e.g. new comment added)
	storageService.onDidStorageChange(() => {
		const editor = vscode.window.activeTextEditor;
		if (editor) { updateDecorations(editor); }
	});

	// Initial run
	if (vscode.window.activeTextEditor) {
		updateDecorations(vscode.window.activeTextEditor);
	}
}

export function deactivate() { }
