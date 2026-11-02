import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/real/theme";
import { Button, Card, T } from "@/real/components/ui";
import { APP_VERSION, SUPPORT_EMAIL } from "@/real/service/config";
import { ErrorNotice, Page } from "@/real/service/ui";
export default function Support() {
  const [error, setError] = useState<unknown>();
  const [expanded, setExpanded] = useState<string | null>(null);
  const faq = [
    [
      "잔액이 실제와 달라요",
      "표시된 금액은 입력한 잔액·기록 기준 추정이에요. 마이 → 예산 설정 수정에서 실제 잔액과 기준 시각을 맞추고 빠진 거래를 기록해 주세요. 기준 시각 이전 거래는 이미 잔액에 반영된 것으로 봐요.",
    ],
    [
      "카테고리를 추가하고 싶어요",
      "거래 직접 기록 화면의 카테고리 마지막 칩에서 + 추가를 누르거나, 마이 → 카테고리 관리에서 추가할 수 있어요.",
    ],
    [
      "계정을 삭제하고 싶어요",
      '마이 → 계정 삭제에서 비밀번호를 입력해 주세요. 카카오·Google로 가입했다면 비밀번호 대신 확인 문구 "탈퇴"를 입력해요. 계정과 모든 기록이 즉시 삭제돼요. 이메일로 가입한 계정은 웹 /delete-account에서도 삭제할 수 있어요. 로그인할 수 없다면 지원 이메일로 요청해 주세요.',
    ],
    [
      "인터넷이 연결되지 않아요",
      "텅장관리는 인터넷 연결이 필요해요. 저장에 실패하면 입력한 내용은 화면에 남아 있어요. 연결 후 다시 시도해 주세요.",
    ],
  ];
  return (
    <Page title="고객지원">
      <Card style={{ gap: 12 }}>
        <T size={20} weight="800">
          도움이 필요하신가요?
        </T>
        <T>문의: {SUPPORT_EMAIL}</T>
        <Button
          label="이메일로 문의하기"
          onPress={() =>
            Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() =>
              setError(
                `메일 앱을 열 수 없어요. ${SUPPORT_EMAIL}로 문의해 주세요`,
              ),
            )
          }
        />
        <ErrorNotice error={error} />
      </Card>
      <T size={17} weight="700">
        자주 묻는 질문
      </T>
      {faq.map(([title, body]) => (
        <Card key={title} style={{ gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ expanded: expanded === title }}
            aria-expanded={expanded === title}
            onPress={() => setExpanded(expanded === title ? null : title)}
            style={{
              minHeight: 48,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <T weight="700" style={{ flex: 1 }}>
              {title}
            </T>
            <Ionicons
              name={expanded === title ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.textSub}
            />
          </Pressable>
          {expanded === title && (
            <View>
              <T style={{ lineHeight: 23 }}>{body}</T>
            </View>
          )}
        </Card>
      ))}
      <T>앱 버전 {APP_VERSION}</T>
    </Page>
  );
}
