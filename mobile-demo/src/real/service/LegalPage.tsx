import { Linking, View } from "react-native";
import { Card, T } from "@/real/components/ui";
import { Page } from "./ui";
import { colors } from "@/real/theme";
// The approved documents contain headings, lists, emphasis and tables only.
function Inline({ text }: { text: string }) {
  return (
    <T style={{ lineHeight: 23 }}>
      {text.split(/(\*\*.*?\*\*|https:\/\/[^\s]+)/g).map((part, i) =>
        part.startsWith("**") ? (
          <T key={i} weight="700">
            {part.slice(2, -2)}
          </T>
        ) : part.startsWith("https://") ? (
          <T
            key={i}
            color={colors.brand}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(part)}
          >
            {part}
          </T>
        ) : (
          part
        ),
      )}
    </T>
  );
}
export function LegalPage({ title, body }: { title: string; body: string }) {
  return (
    <Page title={title}>
      <T size={22} weight="800">
        텅장관리 {title}
      </T>
      {body.split(/\n\s*\n/).map((block, index) => {
        if (block.startsWith("|")) {
          const rows = block
            .split("\n")
            .filter((line) => !/^\|[-| ]+\|$/.test(line))
            .map((line) =>
              line
                .split("|")
                .slice(1, -1)
                .map((cell) => cell.trim()),
            );
          return (
            <Card key={index} style={{ padding: 12, gap: 0 }}>
              {rows.map((row, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                    borderBottomColor: colors.line,
                    backgroundColor: i === 0 ? colors.bg : "transparent",
                  }}
                >
                  {row.map((cell, j) => (
                    <View
                      key={j}
                      style={{ flex: j === 1 ? 2 : 1, minWidth: 0, padding: 8 }}
                    >
                      <Inline text={cell} />
                    </View>
                  ))}
                </View>
              ))}
            </Card>
          );
        }
        if (block.startsWith("## ")) {
          const [heading, ...lines] = block.split("\n");
          return (
            <View key={index} style={{ gap: 10, marginTop: 12 }}>
              <T size={17} weight="700" accessibilityRole="header">
                {heading.slice(3)}
              </T>
              {lines.map((line, i) => (
                <Inline key={i} text={line} />
              ))}
            </View>
          );
        }
        return (
          <View key={index} style={{ gap: 6 }}>
            {block.split("\n").map((line, i) => (
              <Inline key={i} text={line} />
            ))}
          </View>
        );
      })}
    </Page>
  );
}
