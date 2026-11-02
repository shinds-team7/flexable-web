/**
 * 코스튬 캐릭터 한 칸(시연 웹판). play면 2초 영상을 소리 없이 반복하고, 아니면 첫 장면 정지 그림만 그린다.
 * 실제 앱은 expo-image·expo-video를 쓰지만, 시연은 웹 전용이라 RN Image와 <video>로 같은 화면을 그린다.
 */
import { useIsFocused } from "expo-router";
import { createElement, useState } from "react";
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useReducedMotion } from "@/real/components/ui";
import { outfitSource, outfitVideo } from "./outfits";

// 에셋 → 웹 주소. 웹 빌드에서는 영상 require가 주소 문자열이고, 번호이면 expo-video 웹 구현(resolveAssetSource.web)처럼 찾는다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const registry = require("@react-native/assets-registry/registry") as {
  getAssetByID(id: number):
    | { httpServerLocation: string; name: string; type?: string }
    | undefined;
};
function videoUrl(id: number | string): string | null {
  if (typeof id === "string") return id;
  const asset = registry.getAssetByID(id);
  if (!asset) return null;
  const type = asset.type ? `.${asset.type}` : "";
  const path = __DEV__
    ? `${asset.httpServerLocation}/${asset.name}${type}`
    : `${asset.httpServerLocation.replace(/\.\.\//g, "_")}/${asset.name}${type}`;
  const url = new URL(path, "https://expo.dev");
  return url.toString().replace(url.origin, "");
}

type Props = {
  outfitId: string | null;
  play?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function OutfitView({
  outfitId,
  play = true,
  style,
  accessibilityLabel,
}: Props) {
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const video = play && focused && !reduced ? outfitVideo(outfitId) : null;
  const src = video === null ? null : videoUrl(video);
  const poster = outfitSource(outfitId);
  const a11y = {
    accessible: true,
    accessibilityRole: "image" as const,
    accessibilityLabel,
  };
  if (src === null)
    return (
      <View style={style} {...a11y}>
        <Poster source={poster} />
      </View>
    );
  // 코스튬이 바뀌면 영상을 새로 만든다.
  return <LoopVideo key={src} src={src} poster={poster} style={style} a11y={a11y} />;
}

function Poster({ source }: { source: ImageSourcePropType }) {
  return (
    <Image
      source={source}
      style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
      resizeMode="contain"
    />
  );
}

function LoopVideo({
  src,
  poster,
  style,
  a11y,
}: {
  src: string;
  poster: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  a11y: object;
}) {
  const [shown, setShown] = useState(false);
  return (
    <View style={style} {...a11y}>
      {createElement("video", {
        src,
        autoPlay: true,
        loop: true,
        muted: true,
        playsInline: true,
        "aria-hidden": true,
        onPlaying: () => setShown(true),
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
        },
      })}
      {/* 영상이 준비되는 동안 빈 화면 대신 첫 장면을 보여 준다. */}
      {!shown && <Poster source={poster} />}
    </View>
  );
}
