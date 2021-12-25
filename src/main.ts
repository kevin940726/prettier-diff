import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JSONWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CSSWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HTMLWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TSWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import prettier from 'prettier/standalone';
import parserBabel from 'prettier/parser-babel';
import parserHtml from 'prettier/parser-html';
import parserPostcss from 'prettier/parser-postcss';
import type { CursorOptions, CursorResult, Options } from 'prettier';
import GitHubTheme from 'monaco-themes/themes/GitHub.json';
import { getMany, setMany, set } from 'idb-keyval';
import './style.css';

// @ts-ignore
self.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string): Worker {
    if (label === 'json') {
      return new JSONWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new CSSWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new HTMLWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new TSWorker();
    }
    return new EditorWorker();
  },
};

const diffEditor = monaco.editor.createDiffEditor(
  document.getElementById('editor')!,
  {
    originalEditable: true,
    renderWhitespace: 'boundary',
    renderSideBySide: true,
    ignoreTrimWhitespace: false,
    renderOverviewRuler: false,
    formatOnPaste: true,
    formatOnType: true,
    fontSize: 15,
    inlayHints: { enabled: false },
    inlineSuggest: { enabled: false },
    lightbulb: { enabled: false },
    minimap: { enabled: false },
    quickSuggestions: false,
    snippetSuggestions: 'none',
  }
);

monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSuggestionDiagnostics: true,
});
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
  allowComments: true,
});
monaco.languages.css.cssDefaults.setOptions({
  validate: false,
});

const PRETTIER_OPTIONS = {
  endOfLine: 'auto' as 'auto',
};

function format(
  model: monaco.editor.ITextModel,
  options: CursorOptions | Options = {}
) {
  function isCursorOptions(
    options: CursorOptions | Options
  ): options is CursorOptions {
    return typeof (options as CursorOptions).cursorOffset !== 'undefined';
  }

  const value = model.getValue();
  const languageId = model.getLanguageId();

  let parser = 'babel-ts';
  if (languageId === 'json') {
    parser = 'json';
  } else if (languageId === 'html') {
    parser = 'html';
  } else if (languageId === 'css') {
    parser = 'css';
  }

  const prettierOptions = {
    parser,
    plugins: [parserBabel, parserHtml, parserPostcss],
    ...PRETTIER_OPTIONS,
    ...options,
  };

  return isCursorOptions(options)
    ? prettier.formatWithCursor(value, prettierOptions as CursorOptions)
    : prettier.format(value, prettierOptions);
}

const prettierFormattingEditProvider: monaco.languages.DocumentFormattingEditProvider =
  {
    displayName: 'prettier',
    provideDocumentFormattingEdits(model) {
      const formatted = format(model) as string;
      return [{ range: model.getFullModelRange(), text: formatted }];
    },
  };

monaco.languages.registerDocumentFormattingEditProvider(
  'javascript',
  prettierFormattingEditProvider
);
monaco.languages.registerDocumentFormattingEditProvider(
  'typescript',
  prettierFormattingEditProvider
);
monaco.languages.registerDocumentFormattingEditProvider(
  'json',
  prettierFormattingEditProvider
);
monaco.languages.registerDocumentFormattingEditProvider(
  'css',
  prettierFormattingEditProvider
);
monaco.languages.registerDocumentFormattingEditProvider(
  'html',
  prettierFormattingEditProvider
);

// @ts-ignore
monaco.editor.defineTheme('github', GitHubTheme);
monaco.editor.setTheme('github');

diffEditor.onDidUpdateDiff(function updateLineChanges() {
  const lineChanges = diffEditor.getLineChanges()!;
  let [addedLines, removedLines] = lineChanges.reduce(
    (acc, cur) => [
      acc[0] + cur.modifiedEndLineNumber - cur.modifiedStartLineNumber + 1,
      acc[1] + cur.originalEndLineNumber - cur.originalStartLineNumber + 1,
    ],
    [0, 0]
  );
  addedLines = Math.max(addedLines, 0);
  removedLines = Math.max(removedLines, 0);

  const lineChangesContainer = document.getElementById('line-changes')!;
  lineChangesContainer.querySelector(
    '.text-insert'
  )!.textContent = `+${addedLines}`;
  lineChangesContainer.querySelector(
    '.text-delete'
  )!.textContent = `-${removedLines}`;
});

function setupEditor(
  editor: monaco.editor.IStandaloneCodeEditor,
  placeholder: string
) {
  let hasFocus = false;

  editor.onDidChangeCursorPosition(function selectAllWhenFocusingOnPlaceholder(
    event
  ) {
    if (
      event.source !== 'mouse' ||
      event.reason !== monaco.editor.CursorChangeReason.Explicit ||
      editor.getValue() !== placeholder ||
      // Allow second focus to change the position
      hasFocus
    ) {
      return;
    }

    hasFocus = true;

    const fullRange = editor.getModel()!.getFullModelRange();
    editor.setSelection(fullRange);
  });

  editor.onDidBlurEditorWidget(() => {
    hasFocus = false;
  });

  editor.onDidBlurEditorWidget(() => {
    const position = editor.getPosition()!;
    const model = editor.getModel()!;
    const cursorOffset = model.getOffsetAt(position);

    const { formatted, cursorOffset: formattedCursorOffset } = format(model, {
      cursorOffset,
    }) as CursorResult;
    editor.setValue(formatted);
    const formattedPosition = model.getPositionAt(formattedCursorOffset);
    editor.setPosition(formattedPosition);
  });
}

const placeholderOriginalCode = `// Paste your original code here`;
const placeholderModifiedCode = `// Paste your modified code here`;

const originalEditor = diffEditor.getOriginalEditor();
const modifiedEditor = diffEditor.getModifiedEditor();

const selectLanguageElement = document.getElementById(
  'select-language'
) as HTMLSelectElement;

(async function init() {
  const [
    language = 'typescript',
    originalCode = placeholderOriginalCode,
    modifiedCode = placeholderModifiedCode,
  ] = await getMany(['language', 'originalCode', 'modifiedCode']);

  diffEditor.setModel({
    original: monaco.editor.createModel(originalCode, language),
    modified: monaco.editor.createModel(modifiedCode, language),
  });

  setupEditor(originalEditor, placeholderOriginalCode);
  setupEditor(modifiedEditor, placeholderModifiedCode);

  selectLanguageElement.value = language;
})();

diffEditor.onDidUpdateDiff(function syncToIDB() {
  const originalCode = originalEditor.getModel()!.getValue();
  const modifiedModel = modifiedEditor.getModel()!;
  const modifiedCode = modifiedModel.getValue();
  const language = modifiedModel.getLanguageId();

  setMany([
    ['language', language],
    ['originalCode', originalCode],
    ['modifiedCode', modifiedCode],
  ]);
});

selectLanguageElement.addEventListener('change', (event) => {
  const { value: languageId } = event.target as HTMLSelectElement;
  const originalModel = originalEditor.getModel()!;
  const modifiedModel = modifiedEditor.getModel()!;
  monaco.editor.setModelLanguage(originalModel, languageId);
  monaco.editor.setModelLanguage(modifiedModel, languageId);

  originalModel.setValue(format(originalModel) as string);
  modifiedModel.setValue(format(modifiedModel) as string);

  set('language', languageId);
});

for (const radio of Array.from(
  document.getElementsByName('diff-view')! as NodeListOf<HTMLInputElement>
)) {
  radio.addEventListener('change', function () {
    if (radio.checked) {
      diffEditor.updateOptions({
        renderSideBySide: radio.value === 'split',
      });
    }
  });
}

const diffNavigator = monaco.editor.createDiffNavigator(diffEditor, {
  followsCaret: true,
  ignoreCharChanges: false,
});

function nextDiff() {
  modifiedEditor.focus();
  if (diffNavigator.canNavigate()) {
    diffNavigator.next();
  }
}
function prevDiff() {
  modifiedEditor.focus();
  if (diffNavigator.canNavigate()) {
    diffNavigator.next();
  }
}

document.getElementById('next-diff')!.addEventListener('click', nextDiff);
document.getElementById('prev-diff')!.addEventListener('click', prevDiff);

document
  .getElementById('switch-original-with-modified')!
  .addEventListener('click', () => {
    const originalModel = originalEditor.getModel()!;
    const modifiedModel = modifiedEditor.getModel()!;

    diffEditor.setModel({
      original: modifiedModel,
      modified: originalModel,
    });
  });

/**
 * Debugging purpose
 */
// @ts-ignore
window.diffEditor = diffEditor;
// @ts-ignore
window.monaco = monaco;
