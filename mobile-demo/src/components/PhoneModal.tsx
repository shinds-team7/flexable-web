/**
 * 시연 웹용 Modal. react-native-web의 Modal은 브라우저 창 전체에 뜨기 때문에 PC에서는 폰 틀(최대 440px)을 벗어나
 * 모바일 비율이 깨진다. 이 Modal은 폰 틀 안쪽에 같은 크기로 깔아서 모바일 화면 안에서만 열리게 한다.
 * 폰 틀(PhoneHostProvider)이 없으면 react-native의 Modal을 그대로 쓴다.
 */
import { createContext, useContext, type ReactNode } from "react";
import { Modal as RNModal, StyleSheet, View, type ModalProps } from "react-native";
import { createPortal } from "react-dom";

const PhoneHost = createContext<HTMLElement | null>(null);
export const PhoneHostProvider = PhoneHost.Provider;

export function Modal({ visible, children, ...rest }: ModalProps & { children?: ReactNode }) {
  const host = useContext(PhoneHost);
  if (!host) return <RNModal visible={visible} {...rest}>{children}</RNModal>;
  if (!visible) return null;
  return createPortal(
    <View style={styles.layer} accessibilityViewIsModal>
      {children}
    </View>,
    host,
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000 },
});
