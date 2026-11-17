// 시연: expo-document-picker 대신 브라우저 파일 선택 창
import * as DocumentPicker from "@/demo/shims/documentPicker";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { Modal } from "@/components/PhoneModal";
import { Button, T, styles } from "@/real/components/ui";
import { colors } from "@/real/theme";
import { ApiError, api, errorText } from "./api/client";
import { deleteStatementCopy } from "./statementCache";
import { Field } from "./ui";
import type { StatementImport } from "./types";

/** 서버 한도(StatementImportController.MAX_BYTES)와 같다 */
const MAX_BYTES = 10 * 1024 * 1024;

type Picked = DocumentPicker.DocumentPickerAsset;

/** 저장 결과를 한 문장으로. 건너뛴 거래가 있으면 이유와 함께 덧붙인다. */
export function statementResultText(r: StatementImport) {
  const parts = [`거래내역서에서 거래 ${r.imported}건을 저장했어요`];
  if (r.duplicates > 0) parts.push(`이미 있는 ${r.duplicates}건은 건너뛰었어요`);
  if (r.afterBalance > 0)
    parts.push(`입력한 잔액 이후의 ${r.afterBalance}건은 넣지 않았어요`);
  return parts.join(". ");
}

function form(pdf: Picked, password: string) {
  const body = new FormData();
  if (pdf.file) body.append("file", pdf.file, pdf.name);
  else
    body.append("file", {
      uri: pdf.uri,
      name: pdf.name || "statement.pdf",
      type: pdf.mimeType ?? "application/pdf",
    } as unknown as Blob);
  if (password) body.append("password", password);
  return body;
}

/**
 * 거래내역서 PDF 등록: 파일을 고르면 바로 비밀번호 모달(숫자 키패드)을 띄우고, 올리면 서버가 읽어 모두 저장한다(policies §9).
 * 비밀번호가 틀리면 모달에 그대로 알리고, 그 밖의 실패는 onError로 화면에 보낸다.
 */
export function useStatementImport({
  onDone,
  onError,
}: {
  onDone: (result: StatementImport) => void;
  onError: (message?: string) => void;
}) {
  const [pdf, setPdf] = useState<Picked | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string>();

  /** 모달을 닫고 앱 캐시에 복사된 사본을 지운다 */
  const finish = (asset: Picked | null) => {
    if (asset && !asset.file) deleteStatementCopy(asset.uri);
    setPdf(null);
    setPassword("");
  };

  const start = async () => {
    onError(undefined);
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch {
      return onError("파일을 열지 못했어요. 다시 골라 주세요");
    }
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    if (asset.size != null && asset.size > MAX_BYTES) {
      finish(asset);
      return onError("10MB 이하 PDF만 올릴 수 있어요");
    }
    setPassword("");
    setModalError(undefined);
    setPdf(asset);
  };

  const close = () => {
    if (busy) return;
    finish(pdf);
  };

  const submit = async () => {
    if (!pdf || busy) return;
    setBusy(true);
    setModalError(undefined);
    try {
      const result = await api<StatementImport>(
        "/transactions/statement-import",
        { method: "POST", body: form(pdf, password), timeoutMs: 60000 },
      );
      finish(pdf);
      onDone(result);
    } catch (e) {
      if (e instanceof ApiError && e.code === "STATEMENT_PASSWORD") {
        setModalError(e.message);
        setPassword("");
      } else {
        finish(pdf);
        onError(errorText(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const modal = (
    <Modal
      visible={!!pdf}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.dim, styles.dimBg, { justifyContent: "center", padding: 28 }]}
      >
        <View style={styles.dialog} accessibilityViewIsModal>
          <T size={18} weight="700" accessibilityRole="header">
            PDF 비밀번호
          </T>
          <T
            size={14}
            color={colors.textSub}
            style={{ lineHeight: 21, marginTop: 10, marginBottom: 14 }}
          >
            거래내역서를 열 비밀번호를 입력해 주세요. 비밀번호는 파일을 여는
            데만 쓰고 저장하지 않아요
          </T>
          <Field
            label="비밀번호"
            hideLabel
            placeholder="비밀번호가 없으면 비워 두세요"
            value={password}
            onChangeText={(v) => {
              setModalError(undefined);
              setPassword(v.replace(/\D/g, ""));
            }}
            keyboardType="number-pad"
            inputMode="numeric"
            secureTextEntry
            autoFocus
            maxLength={64}
            editable={!busy}
            onSubmitEditing={submit}
          />
          {modalError && (
            <T
              size={14}
              color={colors.danger}
              style={{ marginTop: 8 }}
              accessibilityRole="alert"
            >
              {modalError}
            </T>
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 22 }}>
            <Button
              label="취소"
              variant="neutral"
              disabled={busy}
              style={{ flex: 1, height: 48 }}
              onPress={close}
            />
            <Button
              label={busy ? "읽는 중이에요" : "올리기"}
              disabled={busy}
              style={{ flex: 1, height: 48 }}
              onPress={submit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return { start, modal, busy };
}
