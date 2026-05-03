"use strict";

const path = require("node:path");
const vscode = require("vscode");
const { ensureMarginDataFile, readMarginData } = require("./store");
const COMMENT_CONTROLLER_ID = "margin";
const COMMENT_CONTROLLER_LABEL = "Margin";
const COMMENT_CONTEXT_VALUE = "margin.comment";
const THREAD_CONTEXT_VALUE_PREFIX = "margin.thread";
class CommentThreadProvider {
    workspaceRoot;
    controller;
    commentThreads = new Map();
    storedThreads = new Map();
    threadIds = new WeakMap();
    constructor(workspaceRoot){
        this.workspaceRoot = workspaceRoot;
        this.controller = vscode.comments.createCommentController(COMMENT_CONTROLLER_ID, COMMENT_CONTROLLER_LABEL);
    }
    async initialize() {
        await ensureMarginDataFile(this.workspaceRoot);
        await this.refresh();
    }
    async refresh() {
        const marginData = await readMarginData(this.workspaceRoot);
        const nextIds = new Set(marginData.threads.map((thread)=>thread.id));
        this.storedThreads.clear();
        for (const storedThread of marginData.threads){
            this.storedThreads.set(storedThread.id, storedThread);
            this.upsertThread(storedThread);
        }
        for (const [threadId, thread] of this.commentThreads){
            if (nextIds.has(threadId)) {
                continue;
            }
            thread.dispose();
            this.commentThreads.delete(threadId);
            this.storedThreads.delete(threadId);
        }
    }
    getCommentThread(threadId) {
        return this.commentThreads.get(threadId);
    }
    getStoredThread(threadId) {
        return this.storedThreads.get(threadId);
    }
    getThreadId(thread) {
        return this.threadIds.get(thread);
    }
    getThreadsForLocation(uri, lineNumber) {
        return Array.from(this.storedThreads.values()).filter((thread)=>{
            const threadPath = path.join(this.workspaceRoot, thread.file);
            return thread.line === lineNumber && path.normalize(threadPath) === path.normalize(uri.fsPath);
        });
    }
    dispose() {
        for (const thread of this.commentThreads.values()){
            thread.dispose();
        }
        this.commentThreads.clear();
        this.storedThreads.clear();
        this.controller.dispose();
    }
    upsertThread(storedThread) {
        const range = createThreadRange(storedThread.line);
        const comments = storedThread.comments.map((comment)=>createComment(comment));
        const uri = vscode.Uri.file(path.join(this.workspaceRoot, storedThread.file));
        const state = storedThread.resolved ? vscode.CommentThreadState.Resolved : vscode.CommentThreadState.Unresolved;
        const label = `${storedThread.file}:${storedThread.line}`;
        const existingThread = this.commentThreads.get(storedThread.id);
        if (existingThread) {
            if (existingThread.uri.fsPath !== uri.fsPath) {
                existingThread.dispose();
                this.commentThreads.delete(storedThread.id);
                this.createThread(storedThread, uri, range, comments, state, label);
                return;
            }
            existingThread.range = range;
            existingThread.comments = comments;
            existingThread.state = state;
            existingThread.label = label;
            existingThread.canReply = false;
            existingThread.contextValue = createThreadContextValue(storedThread);
            return;
        }
        this.createThread(storedThread, uri, range, comments, state, label);
    }
    createThread(storedThread, uri, range, comments, state, label) {
        const thread = this.controller.createCommentThread(uri, range, comments);
        thread.state = state;
        thread.label = label;
        thread.canReply = false;
        thread.contextValue = createThreadContextValue(storedThread);
        this.commentThreads.set(storedThread.id, thread);
        this.threadIds.set(thread, storedThread.id);
    }
}
function createThreadRange(lineNumber) {
    const zeroBasedLine = Math.max(lineNumber - 1, 0);
    return new vscode.Range(zeroBasedLine, 0, zeroBasedLine, 0);
}
function createComment(comment) {
    return {
        author: {
            name: comment.author
        },
        body: comment.text,
        contextValue: COMMENT_CONTEXT_VALUE,
        label: comment.timestamp,
        mode: vscode.CommentMode.Preview
    };
}
function createThreadContextValue(thread) {
    return `${THREAD_CONTEXT_VALUE_PREFIX}.${thread.resolved ? "resolved" : "unresolved"}`;
}

module.exports = { CommentThreadProvider };
