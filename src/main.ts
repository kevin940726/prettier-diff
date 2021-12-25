import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JSONWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CSSWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HTMLWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TSWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import GitHubTheme from 'monaco-themes/themes/GitHub.json';
import { getMany, setMany, set } from 'idb-keyval';
import './style.css';
import { format } from './prettier';
import DiffNavigator from './DiffNavigator';

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

/**
 * Disable some language diagnostics
 */
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

/**
 * Set up prettier formatting provider
 */
const prettierFormattingEditProvider: monaco.languages.DocumentFormattingEditProvider =
  {
    displayName: 'prettier',
    provideDocumentFormattingEdits(model) {
      const formatted = format(model);
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

/**
 * Register and configure default theme
 */
// @ts-ignore
monaco.editor.defineTheme('github', GitHubTheme);
monaco.editor.setTheme('github');

const diffEditor = monaco.editor.createDiffEditor(
  document.getElementById('editor')!,
  {
    ariaLabel: 'Prettier diff editor',
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

const diffNavigator = new DiffNavigator(diffEditor);

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

  editor.onDidBlurEditorWidget(function formatOnBlur() {
    editor.getAction('editor.action.formatDocument').run();
  });
}

const placeholderOriginalCode = `// Paste your original code here\n`;
const placeholderModifiedCode = `// Paste your modified code here\n`;

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

  originalEditor.getAction('editor.action.formatDocument').run();
  modifiedEditor.getAction('editor.action.formatDocument').run();

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

document
  .getElementById('next-diff')!
  .addEventListener('click', () => diffNavigator.next());
document
  .getElementById('prev-diff')!
  .addEventListener('click', () => diffNavigator.previous());

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

document.getElementById('reset-editor')!.addEventListener('click', () => {
  diffEditor.setModel({
    original: monaco.editor.createModel(placeholderOriginalCode, 'typescript'),
    modified: monaco.editor.createModel(placeholderModifiedCode, 'typescript'),
  });

  selectLanguageElement.value = 'typescript';
});

/**
 * Debugging purpose
 */
// @ts-ignore
window.diffEditor = diffEditor;
// @ts-ignore
window.monaco = monaco;
