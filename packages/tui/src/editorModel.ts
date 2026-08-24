/** Pure text-buffer model for the fanaa editor — no I/O, no ANSI, no React. */
export class EditorModel {
  lines: string[];
  row = 0;
  col = 0;
  private undoStack: { lines: string[]; row: number; col: number }[] = [];
  private readonly original: string;

  constructor(text: string, startAtEnd = false) {
    const t = text.replace(/\r\n/g, "\n");
    this.lines = t ? t.replace(/\n$/, "").split("\n") : [""];
    this.original = this.lines.join("\n");
    if (startAtEnd) {
      this.row = this.lines.length - 1;
      this.col = this.lines[this.row].length;
    }
  }

  get dirty(): boolean {
    return this.lines.join("\n") !== this.original;
  }

  /** The letter body, always newline-terminated. */
  text(): string {
    return this.lines.join("\n") + "\n";
  }

  snapshot(): void {
    this.undoStack.push({ lines: this.lines.slice(), row: this.row, col: this.col });
    if (this.undoStack.length > 100) this.undoStack.shift();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (s) {
      this.lines = s.lines;
      this.row = s.row;
      this.col = s.col;
    }
  }

  insert(s: string): void {
    const line = this.lines[this.row];
    this.lines[this.row] = line.slice(0, this.col) + s + line.slice(this.col);
    this.col += s.length;
  }

  backspace(): void {
    if (this.col === 0) {
      if (this.row === 0) return;
      const prev = this.lines[this.row - 1];
      this.col = prev.length;
      this.lines.splice(this.row - 1, 2, prev + this.lines[this.row]);
      this.row--;
    } else {
      const line = this.lines[this.row];
      this.lines[this.row] = line.slice(0, this.col - 1) + line.slice(this.col);
      this.col--;
    }
  }

  del(): void {
    const line = this.lines[this.row];
    if (this.col >= line.length) {
      if (this.row >= this.lines.length - 1) return;
      this.lines[this.row] = line + this.lines[this.row + 1];
      this.lines.splice(this.row + 1, 1);
    } else {
      this.lines[this.row] = line.slice(0, this.col) + line.slice(this.col + 1);
    }
  }

  newline(): void {
    const line = this.lines[this.row];
    this.lines.splice(this.row + 1, 0, line.slice(this.col));
    this.lines[this.row] = line.slice(0, this.col);
    this.row++;
    this.col = 0;
  }

  move(dr: number, dc: number): void {
    this.row = Math.max(0, Math.min(this.lines.length - 1, this.row + dr));
    this.col += dc;
    this.clampCol();
  }

  gotoCol(c: number): void {
    this.col = c;
    this.clampCol();
  }

  /** Jump to the start of the next (dir=1) or previous (dir=-1) word. */
  moveWord(dir: 1 | -1): void {
    if (dir > 0) {
      let line = this.lines[this.row];
      while (this.col < line.length && /\s/.test(line[this.col])) this.col++;
      while (this.col < line.length && !/\s/.test(line[this.col])) this.col++;
      while (this.col < line.length && /\s/.test(line[this.col])) this.col++;
      if (this.col >= line.length && this.row < this.lines.length - 1) {
        this.row++;
        this.col = 0;
      }
    } else {
      if (this.col === 0 && this.row > 0) {
        this.row--;
        this.col = this.lines[this.row].length;
        return;
      }
      const line = this.lines[this.row];
      while (this.col > 0 && /\s/.test(line[this.col - 1])) this.col--;
      while (this.col > 0 && !/\s/.test(line[this.col - 1])) this.col--;
    }
  }

  /** Delete one word: dir=-1 backwards (ctrl+backspace), dir=1 forwards (ctrl+delete). */
  deleteWord(dir: 1 | -1): void {
    if (dir < 0) {
      if (this.col === 0) {
        this.backspace(); // join with the previous line
        return;
      }
      const line = this.lines[this.row];
      let start = this.col;
      while (start > 0 && /\s/.test(line[start - 1])) start--;
      while (start > 0 && !/\s/.test(line[start - 1])) start--;
      this.lines[this.row] = line.slice(0, start) + line.slice(this.col);
      this.col = start;
    } else {
      const line = this.lines[this.row];
      let end = this.col;
      while (end < line.length && !/\s/.test(line[end])) end++;
      while (end < line.length && /\s/.test(line[end])) end++;
      this.lines[this.row] = line.slice(0, this.col) + line.slice(end);
    }
  }

  gotoDocStart(): void {
    this.row = 0;
    this.col = 0;
  }

  gotoDocEnd(): void {
    this.row = this.lines.length - 1;
    this.col = this.lines[this.row].length;
  }

  private clampCol(): void {
    const max = this.lines[this.row]?.length ?? 0;
    if (this.col < 0) this.col = 0;
    if (this.col > max) this.col = max;
  }
}
