import { useEffect, useRef, useState } from "react";

type Speech = any;

/** 시연 웹은 마이크를 쓰지 않는다. 음성 입력은 실제 앱(Android)에서만 켜지고, 시연에서는 마이크 버튼을 숨긴다. */
function loadSpeech(): Speech | null {
  return null;
}

let cached: Speech | null | undefined;
function speech() {
  if (cached === undefined) cached = loadSpeech();
  return cached;
}

/** 이 기기·브라우저에서 음성 입력을 쓸 수 있는지(마이크 버튼을 보일지) */
export function voiceInputAvailable() {
  return !!speech();
}

export type VoiceStatus = "idle" | "starting" | "listening";

/** 인식 실패를 사용자 문구로. aborted(사용자가 멈춤)는 안내하지 않는다 */
export function voiceErrorMessage(code: string): string | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
      return "마이크 권한이 없어 음성 입력을 쓸 수 없어요. 기기 설정에서 허용하거나 글자로 입력해 주세요";
    case "no-speech":
    case "speech-timeout":
    case "nomatch":
      return "말소리를 알아듣지 못했어요. 마이크를 다시 눌러 말해 주세요";
    case "network":
      return "음성 인식에 연결하지 못했어요. 인터넷 연결을 확인하거나 글자로 입력해 주세요";
    case "language-not-supported":
    case "service-not-allowed":
      return "이 기기에서는 한국어 음성 인식을 쓸 수 없어요. 글자로 입력해 주세요";
    case "busy":
      return "음성 인식이 다른 곳에서 쓰이고 있어요. 잠시 뒤 다시 눌러 주세요";
    default:
      return "음성 인식에 실패했어요. 다시 누르거나 글자로 입력해 주세요";
  }
}

/**
 * 마이크로 말한 내용을 글자로 받는다. onText는 인식 중(final=false)과 끝(final=true)에 지금까지 들은 문장을 준다.
 * 녹음은 저장하지 않고, 인식한 글자는 입력창에만 넣는다(보내기는 사용자가 누른다).
 */
export function useVoiceInput(onText: (text: string, final: boolean) => void) {
  const mod = speech();
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const handler = useRef(onText);
  useEffect(() => {
    handler.current = onText;
  }, [onText]);
  useEffect(() => {
    if (!mod) return;
    const subs = [
      mod.addListener("start", () => setStatus("listening")),
      mod.addListener("end", () => setStatus("idle")),
      mod.addListener("result", (e: { results: { transcript?: string }[]; isFinal: boolean }) => {
        const text = e.results[0]?.transcript ?? "";
        if (text) handler.current(text, e.isFinal);
      }),
      mod.addListener("nomatch", () => setNotice(voiceErrorMessage("nomatch"))),
      mod.addListener("error", (e: { error: string }) => {
        setStatus("idle");
        setNotice(voiceErrorMessage(e.error));
      }),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      // 화면을 떠나면 듣기를 끝낸다
      try {
        mod.abort();
      } catch {}
    };
  }, [mod]);
  const start = async () => {
    if (!mod || status !== "idle") return;
    setNotice(null);
    setStatus("starting");
    try {
      const permission = await mod.requestPermissionsAsync();
      if (!permission.granted) {
        setStatus("idle");
        setNotice(voiceErrorMessage("not-allowed"));
        return;
      }
      mod.start({ lang: "ko-KR", interimResults: true, continuous: false });
    } catch {
      setStatus("idle");
      setNotice(voiceErrorMessage("unknown"));
    }
  };
  const stop = () => {
    try {
      mod?.stop();
    } catch {
      setStatus("idle");
    }
  };
  return {
    available: !!mod,
    status,
    notice,
    clearNotice: () => setNotice(null),
    start,
    stop,
  };
}
