/**
 * 서버 코스튬 id(docs/API.md "코인·코스튬") → 캐릭터 영상(16:9 반복 MP4)과 첫 장면(JPG).
 * 파일은 scripts/prepare-outfit-video.py로 만든다(docs/coin-plan.md "영상 파일 넣기").
 * 화면은 OutfitView로 그린다. 영상이 필요 없는 곳(목록 칸 등)만 outfitSource로 정지 그림을 쓴다.
 */
import type { ImageSourcePropType } from "react-native";

export const DEFAULT_OUTFIT_ID = "costume-lv1";

// 파일이 저장소에 들어오면 id마다 영상과 첫 장면을 함께 한 줄씩 추가한다(스크립트가 줄을 출력한다).
// require는 빌드할 때 파일이 있어야 해서 미리 적어 둘 수 없다.
const VIDEOS: Record<string, { video: number; poster: ImageSourcePropType }> = {
  "costume-lv1": {
    video: require("../../../assets/real/outfits/costume-lv1.mp4"),
    poster: require("../../../assets/real/outfits/costume-lv1.jpg"),
  },
  "costume-lv2": {
    video: require("../../../assets/real/outfits/costume-lv2.mp4"),
    poster: require("../../../assets/real/outfits/costume-lv2.jpg"),
  },
  "costume-lv3": {
    video: require("../../../assets/real/outfits/costume-lv3.mp4"),
    poster: require("../../../assets/real/outfits/costume-lv3.jpg"),
  },
  "costume-lv4": {
    video: require("../../../assets/real/outfits/costume-lv4.mp4"),
    poster: require("../../../assets/real/outfits/costume-lv4.jpg"),
  },
  "outfit-01": {
    video: require("../../../assets/real/outfits/outfit-01.mp4"),
    poster: require("../../../assets/real/outfits/outfit-01.jpg"),
  },
  "outfit-02": {
    video: require("../../../assets/real/outfits/outfit-02.mp4"),
    poster: require("../../../assets/real/outfits/outfit-02.jpg"),
  },
  "outfit-03": {
    video: require("../../../assets/real/outfits/outfit-03.mp4"),
    poster: require("../../../assets/real/outfits/outfit-03.jpg"),
  },
  "outfit-04": {
    video: require("../../../assets/real/outfits/outfit-04.mp4"),
    poster: require("../../../assets/real/outfits/outfit-04.jpg"),
  },
  "outfit-05": {
    video: require("../../../assets/real/outfits/outfit-05.mp4"),
    poster: require("../../../assets/real/outfits/outfit-05.jpg"),
  },
  "outfit-07": {
    video: require("../../../assets/real/outfits/outfit-07.mp4"),
    poster: require("../../../assets/real/outfits/outfit-07.jpg"),
  },
  "outfit-08": {
    video: require("../../../assets/real/outfits/outfit-08.mp4"),
    poster: require("../../../assets/real/outfits/outfit-08.jpg"),
  },
};

/** 정지 그림(첫 장면). null이면 기본 캐릭터. 영상이 아직 없는 id(앱보다 서버에 먼저 추가된 상품 포함)는 기본 캐릭터 그림 */
export function outfitSource(id: string | null): ImageSourcePropType {
  return (VIDEOS[id ?? DEFAULT_OUTFIT_ID] ?? VIDEOS[DEFAULT_OUTFIT_ID]).poster;
}

/** 반복 재생할 영상. 파일이 아직 없으면 null(OutfitView가 정지 그림을 그린다) */
export function outfitVideo(id: string | null): number | null {
  return VIDEOS[id ?? DEFAULT_OUTFIT_ID]?.video ?? null;
}

/** 진짜 영상 파일이 들어왔는지. false면 화면에 "준비 중" 표시를 붙인다 */
export function hasAnimation(id: string | null): boolean {
  return (id ?? DEFAULT_OUTFIT_ID) in VIDEOS;
}
