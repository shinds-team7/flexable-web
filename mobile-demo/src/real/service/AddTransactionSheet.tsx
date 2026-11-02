import { router } from "expo-router";
import { Share, View } from "react-native";
import { Button, Sheet, T } from "@/real/components/ui";
import { useToast } from "@/real/components/Toast";
import {
  imageImportSupported,
  useImageImport,
} from "./receiptImport/useImageImport";
/** + 버튼이 여는 시트. 이미지에서 가져오기와 직접 입력 중 고른다. */
export function AddTransactionSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const imageImport = useImageImport();
  const toast = useToast();
  return (
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        title="거래 추가"
        subtitle="이미지는 기기에서만 읽고 서버에 올리지 않아요"
      >
        <View style={{ gap: 10 }}>
          <Button
            label={imageImport.busy ? "이미지 읽는 중…" : "이미지 업로드"}
            icon="image-outline"
            disabled={!imageImportSupported || imageImport.busy}
            onPress={() => {
              onClose();
              imageImport.start();
            }}
          />
          {/* 시연: 사진을 고르지 않고 예시 토스 거래내역 스크린샷을 읽은 결과를 보여 준다 */}
          <T size={13}>시연에서는 예시 거래내역 스크린샷을 읽어요</T>
          <Button
            label="직접 입력"
            variant="soft"
            icon="create-outline"
            onPress={() => {
              onClose();
              router.push("/transactions/new");
            }}
          />
        </View>
      </Sheet>
      <Sheet
        visible={!!imageImport.error}
        onClose={imageImport.clearError}
        title="이미지를 읽지 못했어요"
      >
        <View style={{ gap: 10 }}>
          <T>{imageImport.error}</T>
          {imageImport.diagnostic && (
            <>
              <T size={12} selectable>
                {imageImport.diagnostic.summary}
              </T>
              <Button
                label="문제 확인 정보 공유"
                variant="soft"
                onPress={() => {
                  const message = imageImport.diagnostic?.detail;
                  if (message)
                    Share.share({ message }).catch(() =>
                      toast("확인 정보를 공유하지 못했어요"),
                    );
                }}
              />
              <T size={12}>
                사진·이름·거래 금액은 제외하고 글자 배치와 확인 코드만 공유해요
              </T>
            </>
          )}
          <Button label="확인" onPress={imageImport.clearError} />
        </View>
      </Sheet>
    </>
  );
}
