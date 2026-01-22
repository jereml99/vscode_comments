# Git Review Comments Extension - Walkthrough

This extension allows you to add Overleaf-like inline review comments to your code, stored in a versioned JSON file (`.review-comments.json`) within your repository. This enables collaboration via Git without relying on external services.

## Features

- **Anchor to Text**: Comments are anchored to specific text ranges. If the text moves (e.g., new lines added), the comment follows it.
- **Robust Re-anchoring**: If the text is modified, the extension uses context (surrounding text) and fuzzy matching to find the best location.
- **Threaded Discussions**: Reply to comments, resolve threads, and reopen them.
- **Sidebar View**: View all threads in the current file or workspace, sorted by status, date, or file.
- **Multi-root Workspace Support**: Works seamlessly with multi-root workspaces, storing comments in the respective root folder.

## How to Use

### 1. Adding a Comment
1. Select text in any file.
2. Right-click and choose **Add Review Comment**, or run the command `Review Comments: Add Review Comment`.
3. Enter your comment text.

### 2. Viewing Comments
- Comments appear as **yellow highlights** in the editor.
- Hover over a highlight to see the discussion summary.
- Open the **Review Comments** sidebar (activity bar icon) to see a list of all threads.

### 3. Replying and Resolving
- In the sidebar or by hovering, click **Reply** to add more messages.
- Click **Resolve** (checkmark icon) to mark a thread as done. It will turn grey and visually recede.
- Resolved threads can be **Reopened** if needed.

### 4. Reattaching Orphaned Threads
If the anchored text is heavily modified or deleted, a thread might become **Orphaned** (warning icon).
1. Select the new text where the comment should be.
2. Run command `Review Comments: Reattach Review Comment` (or right-click context menu).
3. Select the orphaned thread from the list to reattach it to the new selection.

## Storage
Comments are stored in `.review-comments.json` in your workspace root. Commit this file to Git to share comments with your team.

## Troubleshooting
- **Orphaned Threads**: Use the "Reattach" command as described above.
- **Merge Conflicts**: If `.review-comments.json` has conflicts, resolve them like any JSON file. The extension tolerates minor formatting issues but invalid JSON will prevent loading.
