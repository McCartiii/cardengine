// Just enough Markdown for AI answers: headings, bullet and numbered lists,
// paragraphs, and **bold**.
import React from "react";
import { StyleSheet, View } from "react-native";
import { color, space } from "../design/tokens";
import { font } from "../design/fonts";
import { Text } from "./primitives";

type Block =
  | { kind: "heading"; text: string }
  | { kind: "bullet"; text: string; marker: string }
  | { kind: "para"; text: string };

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "para", text: para.join(" ") });
    para = [];
  };
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: heading[1].replace(/\*\*/g, "") });
    } else if (bullet) {
      flush();
      blocks.push({ kind: "bullet", text: bullet[1], marker: "•" });
    } else if (numbered) {
      flush();
      blocks.push({ kind: "bullet", text: numbered[2], marker: `${numbered[1]}.` });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** Text with **bold** runs. */
function Inline({ text, tint }: { text: string; tint: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text variant="body" color={tint}>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <Text key={i} variant="bodyStrong" color={tint}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p.replace(/(^|\s)\*([^*]+)\*(?=\s|$|[.,!?])/g, "$1$2")
        )
      )}
    </Text>
  );
}

export function Markdown({ text, tint = color.text }: { text: string; tint?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <View style={{ gap: space.sm }}>
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          return (
            <Text key={i} style={[styles.heading, i > 0 && { marginTop: space.xs }]} color={tint}>
              {b.text}
            </Text>
          );
        }
        if (b.kind === "bullet") {
          return (
            <View key={i} style={styles.bullet}>
              <Text variant="bodyStrong" color={color.accent} style={styles.marker}>
                {b.marker}
              </Text>
              <View style={{ flex: 1 }}>
                <Inline text={b.text} tint={tint} />
              </View>
            </View>
          );
        }
        return <Inline key={i} text={b.text} tint={tint} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { fontFamily: font.bold, fontSize: 16, lineHeight: 21, letterSpacing: -0.3 },
  bullet: { flexDirection: "row", gap: 8 },
  marker: { minWidth: 14 },
});
