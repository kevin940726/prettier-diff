import * as monaco from 'monaco-editor';
import prettier from 'prettier/standalone';
import parserBabel from 'prettier/parser-babel';
import parserHtml from 'prettier/parser-html';
import parserPostcss from 'prettier/parser-postcss';
import type { CursorOptions, Options } from 'prettier';

const PRETTIER_OPTIONS = {
  endOfLine: 'auto' as 'auto',
};

function getPrettierOptions(languageId: string) {
  let parser = 'babel-ts';
  if (languageId === 'json') {
    parser = 'json';
  } else if (languageId === 'html') {
    parser = 'html';
  } else if (languageId === 'css') {
    parser = 'css';
  }

  return {
    parser,
    plugins: [parserBabel, parserHtml, parserPostcss],
    ...PRETTIER_OPTIONS,
  };
}

export function format(model: monaco.editor.ITextModel) {
  const value = model.getValue();
  const languageId = model.getLanguageId();

  const prettierOptions = getPrettierOptions(languageId);

  return prettier.format(value, prettierOptions);
}

export function formatWithCursor(
  model: monaco.editor.ITextModel,
  options: CursorOptions & Options
) {
  const value = model.getValue();
  const languageId = model.getLanguageId();

  const prettierOptions = getPrettierOptions(languageId);

  return prettier.formatWithCursor(value, {
    ...prettierOptions,
    ...options,
  });
}
