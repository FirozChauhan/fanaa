import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { EditorModel } from "./editorModel";
import { CUR_LINE_BG, FAINT } from "./util";

/**
 * The fanaa letter editor as a TUI view — runs INSIDE the Ink app, so it uses
 * the exact same input pipeline that already works in the user's terminal
 * (unlike a separate process, whose stdin can end up in a broken state).
 *
 * Keys: ctrl-s save · ctrl-c cancel (y/n) · ctrl-z undo · arrows · pgup/pgdn ·
 * ctrl-a/ctrl-e line start/end · backspace/delete · tab (2 spaces) · esc cancel
 */
export function EditorView({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const { stdout } = useStdout();
  const [model] = useState(() => new EditorModel(initial));
  const [, rerender] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const cols = stdout.columns ?? 80;
  const rows = stdout.rows ?? 24;
  const touch = () => rerender((n) => n + 1);

  useInput((input, key) => {
    if (confirming) {
      if (input === "y" || input === "Y") onCancel();
      else if (input === "n" || input === "N") setConfirming(false);
      return;
    }
    if (key.ctrl && input === "s") {
      if (model.text().trim()) onSave(model.text());
      return;
    }
    if (key.ctrl && input === "c") {
      if (model.dirty) setConfirming(true);
      else onCancel();
      return;
    }
    if (key.ctrl && input === "z") {
      model.undo();
      touch();
      return;
    }
    if (key.ctrl && input === "a") {
      model.gotoCol(0);
      touch();
      return;
    }
    if (key.ctrl && input === "e") {
      model.gotoCol(model.lines[model.row].length);
      touch();
      return;
    }
    if (key.upArrow) {
      model.move(-1, 0);
      touch();
      return;
    }
    if (key.downArrow) {
      model.move(1, 0);
      touch();
      return;
    }
    if (key.leftArrow) {
      model.move(0, -1);
      touch();
      return;
    }
    if (key.rightArrow) {
      model.move(0, 1);
      touch();
      return;
    }
    if (key.pageUp) {
      model.move(-Math.max(1, rows - 3), 0);
      touch();
      return;
    }
    if (key.pageDown) {
      model.move(Math.max(1, rows - 3), 0);
      touch();
      return;
    }
    if (key.backspace) {
      model.snapshot();
      model.backspace();
      touch();
      return;
    }
    if (key.delete) {
      model.snapshot();
      model.del();
      touch();
      return;
    }
    if (key.tab) {
      model.snapshot();
      model.insert("  ");
      touch();
      return;
    }
    if (key.return || input === "\n" || input === "\r") {
      model.snapshot();
      model.newline();
      touch();
      return;
    }
    if (key.escape) {
      if (model.dirty) setConfirming(true);
      else onCancel();
      return;
    }
    // Printable text (including pastes, which arrive as one string).
    if (input && !key.ctrl && !key.meta) {
      model.snapshot();
      for (const ch of input) {
        if (ch === "\n" || ch === "\r") model.newline();
        else if (ch === "\t") model.insert("  ");
        else model.insert(ch);
      }
      touch();
    }
  });

  const bodyRows = Math.max(1, rows - 1);
  const top = Math.min(
    Math.max(0, model.row - Math.floor(bodyRows / 2)),
    Math.max(0, model.lines.length - bodyRows),
  );
  const visible = model.lines.slice(top, top + bodyRows);

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((line, i) => {
          const r = top + i;
          const isCur = r === model.row;
          return (
            <Box key={r} width={cols}>
              <Text wrap="truncate" backgroundColor={isCur ? CUR_LINE_BG : undefined}>
                {line || " "}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Text
        wrap="truncate"
        backgroundColor={confirming ? "#a85632" : "#c98a3d"}
        color="black"
      >
        {confirming
          ? " discard changes? y/n"
          : ` fanaa${model.dirty ? " · unsaved" : ""} `}
        {" ".repeat(
          Math.max(
            1,
            cols -
              (confirming ? " discard changes? y/n".length : ` fanaa${model.dirty ? " · unsaved" : ""} `.length) -
              (confirming ? 0 : "ctrl-s save · ctrl-c cancel · ctrl-z undo".length),
          ),
        )}
        {confirming ? "" : "ctrl-s save · ctrl-c cancel · ctrl-z undo"}
      </Text>
    </Box>
  );
}
