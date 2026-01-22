import * as vscode from 'vscode';
import { ReviewAnchor, ReviewThread } from './models';

export interface AnchoredThread {
    thread: ReviewThread;
    range?: vscode.Range;
    isOrphaned: boolean;
    confidence: number; // 0 to 1
}

export class AnchoringEngine {
    public static async anchorThread(document: vscode.TextDocument, thread: ReviewThread): Promise<AnchoredThread> {
        const text = document.getText();
        const { anchor } = thread;

        // 1. Fast path: check original offsets
        const potentialText = text.substring(anchor.startOffset, anchor.endOffset);
        if (potentialText === anchor.selectedText) {
            return {
                thread,
                range: new vscode.Range(
                    document.positionAt(anchor.startOffset),
                    document.positionAt(anchor.endOffset)
                ),
                isOrphaned: false,
                confidence: 1.0
            };
        }

        // 2. Search path: find all occurrences of selectedText
        const occurrences: number[] = [];
        let index = text.indexOf(anchor.selectedText);
        while (index !== -1) {
            occurrences.push(index);
            index = text.indexOf(anchor.selectedText, index + 1);
        }

        if (occurrences.length > 0) {
            let bestMatch = -1;
            let bestScore = -1;

            for (const offset of occurrences) {
                const score = this.calculateScore(text, offset, anchor);
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = offset;
                }
            }

            if (bestScore > 0.5) {
                return {
                    thread,
                    range: new vscode.Range(
                        document.positionAt(bestMatch),
                        document.positionAt(bestMatch + anchor.selectedText.length)
                    ),
                    isOrphaned: false,
                    confidence: bestScore
                };
            }
        }

        // 3. Context-based Logic (Robust fallback)
        const SEARCH_WINDOW = 5000;
        const rangeStart = Math.max(0, anchor.startOffset - SEARCH_WINDOW);
        const rangeEnd = Math.min(text.length, anchor.endOffset + SEARCH_WINDOW);
        const windowText = text.substring(rangeStart, rangeEnd);

        const findAllOffsets = (sub: string, region: string, baseOffset: number) => {
            if (!sub) {return [];}
            const results: number[] = [];
            let idx = region.indexOf(sub);
            while (idx !== -1) {
                results.push(baseOffset + idx);
                idx = region.indexOf(sub, idx + 1);
            }
            return results;
        };

        // Try exact context match first
        let pOffsets: number[];
        if (!anchor.prefixContext) {
            pOffsets = [rangeStart]; // Assume start of window/file if no prefix
        } else {
            pOffsets = findAllOffsets(anchor.prefixContext, windowText, rangeStart);
        }

        let sOffsets: number[];
        if (!anchor.suffixContext) {
            sOffsets = [rangeEnd]; // Assume end of window/file if no suffix
        } else {
            sOffsets = findAllOffsets(anchor.suffixContext, windowText, rangeStart);
        }

        let prefixLen = anchor.prefixContext.length;
        let contextScore = 1.0;

        // Fallback: partial context match if exact not found (only if context exists)
        if (anchor.prefixContext && pOffsets.length === 0 && anchor.prefixContext.length > 20) {
            const shortPrefix = anchor.prefixContext.slice(-20);
            pOffsets = findAllOffsets(shortPrefix, windowText, rangeStart);
            prefixLen = shortPrefix.length;
            contextScore *= 0.8;
        }
        if (anchor.suffixContext && sOffsets.length === 0 && anchor.suffixContext.length > 20) {
            const shortSuffix = anchor.suffixContext.slice(0, 20);
            sOffsets = findAllOffsets(shortSuffix, windowText, rangeStart);
            contextScore *= 0.8;
        }

        let bestContextFit = { start: -1, end: -1, score: -1 };

        // Check all pairs
        for (const pOff of pOffsets) {
            const currentStart = pOff + prefixLen;
            for (const sOff of sOffsets) {
                if (sOff >= currentStart) {
                    // Check content
                    const candidateText = text.substring(currentStart, sOff);

                    // Similarity of the content to the old content
                    // If the user CHANGED the text, this will be low.
                    // But if the contexts are strong, we should trust them.
                    const sim = this.similarity(candidateText, anchor.selectedText);

                    // Distance Factor: how far from original location?
                    const dist = Math.abs(currentStart - anchor.startOffset);
                    const distScore = Math.max(0, 1 - (dist / SEARCH_WINDOW)); // 0 to 1

                    // Total Score
                    // Weight context heavily (it's our anchor), similarity moderately, distance slightly
                    // If sim is high (~1), and contexts match, score is high.
                    // If sim is low (0), but contexts match, score is medium.
                    const totalScore = (contextScore * 0.4) + (sim * 0.4) + (distScore * 0.2);

                    if (totalScore > bestContextFit.score) {
                        bestContextFit = { start: currentStart, end: sOff, score: totalScore };
                    }
                }
            }
        }

        if (bestContextFit.score > 0.4) {
            return {
                thread,
                range: new vscode.Range(
                    document.positionAt(bestContextFit.start),
                    document.positionAt(bestContextFit.end)
                ),
                isOrphaned: false,
                confidence: bestContextFit.score
            };
        }

        // 4. Final Fail
        return {
            thread,
            isOrphaned: true,
            confidence: 0
        };
    }

    private static calculateScore(content: string, offset: number, anchor: ReviewAnchor): number {
        let score = 0;

        // Context fingerprints
        const prefix = content.substring(Math.max(0, offset - anchor.prefixContext.length), offset);
        const suffix = content.substring(offset + anchor.selectedText.length, offset + anchor.selectedText.length + anchor.suffixContext.length);

        if (prefix === anchor.prefixContext) {score += 0.4;}
        else {score += this.similarity(prefix, anchor.prefixContext) * 0.4;}

        if (suffix === anchor.suffixContext) {score += 0.4;}
        else {score += this.similarity(suffix, anchor.suffixContext) * 0.4;}

        // Proximity to original offset
        const distance = Math.abs(offset - anchor.startOffset);
        const maxDistance = content.length;
        score += (1 - distance / maxDistance) * 0.2;

        return score;
    }

    private static similarity(s1: string, s2: string): number {
        if (!s1 || !s2) {return 0;}
        let matches = 0;
        const minLen = Math.min(s1.length, s2.length);
        if (minLen === 0) {return 0;}

        // Simple character match similarity
        for (let i = 0; i < minLen; i++) {
            if (s1[s1.length - 1 - i] === s2[s2.length - 1 - i]) {
                matches++;
            }
        }
        return matches / minLen;
    }

    public static createAnchor(document: vscode.TextDocument, range: vscode.Range): ReviewAnchor {
        const startOffset = document.offsetAt(range.start);
        const endOffset = document.offsetAt(range.end);
        const selectedText = document.getText(range);

        const prefixContext = document.getText(new vscode.Range(
            document.positionAt(Math.max(0, startOffset - 50)),
            range.start
        ));
        const suffixContext = document.getText(new vscode.Range(
            range.end,
            document.positionAt(endOffset + 50)
        ));

        return {
            startOffset,
            endOffset,
            selectedText,
            prefixContext,
            suffixContext,
            originalRange: {
                startLine: range.start.line,
                startCharacter: range.start.character,
                endLine: range.end.line,
                endCharacter: range.end.character
            }
        };
    }
}
