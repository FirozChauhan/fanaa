import React from "react";
import { Box, Text } from "ink";

const CELL_COLORS = ["", "#6b4423", "#a4651f", "#d98e2b", "#ffc24b"]; // 0..4
const FILL = "\u2588"; // █
const EMPTY = "\u00b7";
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** GitHub-style contribution grid: last `weeks` weeks, warm amber ramp. */
export function Heatmap({
  counts,
  weeks = 26,
  now = new Date(),
}: {
  counts: Map<string, number>;
  weeks?: number;
  now?: Date;
}) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(today);
  const dow = (today.getDay() + 6) % 7; // Mon = 0
  end.setDate(today.getDate() - dow + 6); // end of this week (Saturday)
  const start = new Date(end);
  start.setDate(end.getDate() - (weeks - 1) * 7);

  const months: (string | null)[] = [];
  let prev = -1;
  for (let w = 0; w < weeks; w++) {
    const ws = new Date(start);
    ws.setDate(start.getDate() + w * 7);
    const m = ws.getMonth();
    months.push(m === prev ? null : MONTHS[m]);
    prev = m;
  }

  const todayKey = keyOf(today);

  return (
    <Box flexDirection="column">
      <Box paddingLeft={5}>
        {months.map((m, i) => (
          <Text key={i} color={m ? "#9a9a9a" : undefined} dimColor={!m}>
            {(m ?? " ").padEnd(2)}
          </Text>
        ))}
      </Box>
      {DAY_LABELS.map((label, r) => (
        <Box key={r}>
          <Text color="#777" dimColor>
            {label.padEnd(4)}
          </Text>
          {Array.from({ length: weeks }, (_, w) => {
            const d = new Date(start);
            d.setDate(start.getDate() + w * 7 + r);
            const k = keyOf(d);
            const n = counts.get(k) ?? 0;
            if (d > today) return <Text key={w}>{"  "}</Text>;
            if (k === todayKey && n > 0) {
              return (
                <Text key={w} color="#000" backgroundColor="#ffc24b">
                  {FILL + " "}
                </Text>
              );
            }
            if (n === 0) {
              return (
                <Text key={w} color="#444">
                  {EMPTY + " "}
                </Text>
              );
            }
            const level = Math.min(4, n);
            return (
              <Text key={w} color={CELL_COLORS[level]}>
                {FILL + " "}
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
