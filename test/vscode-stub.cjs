const path = require("node:path");

const controllers = [];
const watchers = [];
const registeredCommands = new Map();
const informationMessages = [];
const warningMessages = [];
const errorMessages = [];
const configurationValues = new Map();

let isTrusted = true;
let workspaceFolders = [];
let activeTextEditor;

class Range {
  constructor(startLine, startCharacter, endLine, endCharacter) {
    this.start = { line: startLine, character: startCharacter };
    this.end = { line: endLine, character: endCharacter };
  }
}

class Uri {
  constructor(fsPath) {
    this.fsPath = path.normalize(fsPath);
    this.scheme = "file";
  }

  static file(fsPath) {
    return new Uri(fsPath);
  }
}

class Disposable {
  constructor(dispose) {
    this._dispose = dispose;
  }

  dispose() {
    this._dispose?.();
  }

  static from(...disposables) {
    return new Disposable(() => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    });
  }
}

class RelativePattern {
  constructor(base, pattern) {
    this.base = base;
    this.pattern = pattern;
  }
}

class FakeCommentThread {
  constructor(uri, range, comments) {
    this.uri = uri;
    this.range = range;
    this.comments = comments;
    this.canReply = true;
    this.contextValue = undefined;
    this.label = undefined;
    this.state = undefined;
    this.disposed = false;
  }

  dispose() {
    this.disposed = true;
  }
}

class FakeCommentController {
  constructor(id, label) {
    this.id = id;
    this.label = label;
    this.createdThreads = [];
    this.disposed = false;
  }

  createCommentThread(uri, range, comments) {
    const thread = new FakeCommentThread(uri, range, comments);
    this.createdThreads.push(thread);
    return thread;
  }

  dispose() {
    this.disposed = true;
  }
}

const comments = {
  createCommentController(id, label) {
    const controller = new FakeCommentController(id, label);
    controllers.push(controller);
    return controller;
  },
};

class FakeFileSystemWatcher {
  constructor(pattern) {
    this.pattern = pattern;
    this._changeListeners = [];
    this._createListeners = [];
    this._deleteListeners = [];
    this.disposed = false;
  }

  onDidChange(listener) {
    this._changeListeners.push(listener);
    return new Disposable(() => {
      this._changeListeners = this._changeListeners.filter((entry) => entry !== listener);
    });
  }

  onDidCreate(listener) {
    this._createListeners.push(listener);
    return new Disposable(() => {
      this._createListeners = this._createListeners.filter((entry) => entry !== listener);
    });
  }

  onDidDelete(listener) {
    this._deleteListeners.push(listener);
    return new Disposable(() => {
      this._deleteListeners = this._deleteListeners.filter((entry) => entry !== listener);
    });
  }

  __fireChange() {
    for (const listener of [...this._changeListeners]) {
      listener();
    }
  }

  __fireCreate() {
    for (const listener of [...this._createListeners]) {
      listener();
    }
  }

  __fireDelete() {
    for (const listener of [...this._deleteListeners]) {
      listener();
    }
  }

  dispose() {
    this.disposed = true;
    this._changeListeners = [];
    this._createListeners = [];
    this._deleteListeners = [];
  }
}

const workspace = {
  get isTrusted() {
    return isTrusted;
  },
  set isTrusted(value) {
    isTrusted = value;
  },
  get workspaceFolders() {
    return workspaceFolders;
  },
  set workspaceFolders(value) {
    workspaceFolders = value;
  },
  createFileSystemWatcher(pattern) {
    const watcher = new FakeFileSystemWatcher(pattern);
    watchers.push(watcher);
    return watcher;
  },
  getConfiguration(section) {
    return {
      get(key, defaultValue) {
        const fullKey = `${section}.${key}`;
        return configurationValues.has(fullKey) ? configurationValues.get(fullKey) : defaultValue;
      },
    };
  },
};

const window = {
  get activeTextEditor() {
    return activeTextEditor;
  },
  set activeTextEditor(value) {
    activeTextEditor = value;
  },
  showInformationMessage(message) {
    informationMessages.push(message);
    return Promise.resolve(undefined);
  },
  showWarningMessage(message) {
    warningMessages.push(message);
    return Promise.resolve(undefined);
  },
  showErrorMessage(message) {
    errorMessages.push(message);
    return Promise.resolve(undefined);
  },
  showInputBox() {
    return Promise.resolve(undefined);
  },
  showQuickPick() {
    return Promise.resolve(undefined);
  },
};

const commands = {
  registerCommand(command, callback) {
    registeredCommands.set(command, callback);
    return new Disposable(() => {
      registeredCommands.delete(command);
    });
  },
  async executeCommand(command, ...args) {
    const callback = registeredCommands.get(command);

    if (!callback) {
      throw new Error(`Command ${command} is not registered.`);
    }

    return callback(...args);
  },
};

const CommentThreadState = {
  Resolved: 0,
  Unresolved: 1,
};

const CommentMode = {
  Preview: 0,
};

function __getControllers() {
  return [...controllers];
}

function __getWatchers() {
  return [...watchers];
}

function __getRegisteredCommands() {
  return [...registeredCommands.keys()];
}

function __getMessages() {
  return {
    information: [...informationMessages],
    warning: [...warningMessages],
    error: [...errorMessages],
  };
}

function __setWorkspaceFolders(paths) {
  workspaceFolders = paths.map((fsPath, index) => ({
    index,
    name: path.basename(fsPath),
    uri: Uri.file(fsPath),
  }));
}

function __setTrusted(value) {
  isTrusted = value;
}

function __setConfiguration(key, value) {
  configurationValues.set(key, value);
}

function __reset() {
  controllers.length = 0;
  watchers.length = 0;
  registeredCommands.clear();
  informationMessages.length = 0;
  warningMessages.length = 0;
  errorMessages.length = 0;
  configurationValues.clear();
  isTrusted = true;
  workspaceFolders = [];
  activeTextEditor = undefined;
}

module.exports = {
  __getControllers,
  __getMessages,
  __getRegisteredCommands,
  __getWatchers,
  __reset,
  __setConfiguration,
  __setTrusted,
  __setWorkspaceFolders,
  commands,
  comments,
  CommentMode,
  CommentThreadState,
  Disposable,
  Range,
  RelativePattern,
  Uri,
  window,
  workspace,
};
