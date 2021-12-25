import * as monaco from 'monaco-editor';

class DiffNavigator {
  private diffEditor: monaco.editor.IDiffEditor;
  private originalEditor: monaco.editor.ICodeEditor;
  private modifiedEditor: monaco.editor.ICodeEditor;
  private charChanges: monaco.editor.ICharChange[] = [];
  private index: number = -1;

  constructor(diffEditor: monaco.editor.IDiffEditor) {
    this.diffEditor = diffEditor;
    this.originalEditor = diffEditor.getOriginalEditor();
    this.modifiedEditor = diffEditor.getModifiedEditor();

    this.diffEditor.onDidUpdateDiff(() => {
      this.charChanges = diffEditor
        .getLineChanges()!
        .flatMap((lineChange) => lineChange.charChanges || []);
    });
  }

  canNavigate() {
    return this.charChanges.length > 0;
  }

  private move(delta: number) {
    if (!this.canNavigate()) {
      return;
    }

    this.index += delta;
    this.index %= this.charChanges.length;
    if (this.index < 0) {
      this.index += this.charChanges.length;
    }

    const charChange = this.charChanges[this.index];

    const noAdditions = [
      charChange.modifiedStartLineNumber,
      charChange.modifiedEndLineNumber,
      charChange.modifiedStartColumn,
      charChange.modifiedEndColumn,
    ].every((value) => value === 0);

    const range: monaco.Range = noAdditions
      ? new monaco.Range(
          charChange.originalStartLineNumber,
          charChange.originalStartColumn,
          charChange.originalEndLineNumber,
          charChange.originalEndColumn
        )
      : new monaco.Range(
          charChange.modifiedStartLineNumber,
          charChange.modifiedStartColumn,
          charChange.modifiedEndLineNumber,
          charChange.modifiedEndColumn
        );

    const editor = noAdditions ? this.originalEditor : this.modifiedEditor;

    try {
      editor.focus();
      editor.setPosition(range.getStartPosition());
      editor.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
    } catch (err) {}
  }

  next() {
    return this.move(1);
  }

  previous() {
    return this.move(-1);
  }
}

export default DiffNavigator;
