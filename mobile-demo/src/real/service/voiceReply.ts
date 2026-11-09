import { useCallback, useEffect, useState } from "react";
import { readStorage, writeStorage } from "./storage";

type SpeechApi = { speak: (text: string, o?: { language?: string }) => void; stop: () => Promise<void> | void };

/** 시연 웹은 음성 답변을 읽지 않는다(실제 앱은 휴대폰 음성 합성으로 읽는다). */
function load(): SpeechApi | null {
  return null;
}

let cached: SpeechApi | null | undefined;
function speech() {
  if (cached === undefined) cached = load();
  return cached;
}

export const VOICE_REPLY_KEY = "chatbot.voiceReply";

export function voiceReplyAvailable() {
  return !!speech();
}

export function speak(text: string) {
  const mod = speech();
  if (!mod) return;
  try {
    void mod.stop();
    mod.speak(text, { language: "ko-KR" });
  } catch {}
}

export function stopSpeaking() {
  try {
    void speech()?.stop();
  } catch {}
}

/**
 * 음성 답변 설정. null이면 아직 묻지 않은 것(AI 메이트에 처음 들어오면 선택 모달을 띄운다).
 * 기기에 저장하고 서버로 보내지 않는다.
 */
export function useVoiceReply() {
  const available = voiceReplyAvailable();
  const [on, setOn] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    readStorage(VOICE_REPLY_KEY)
      .then((v) => {
        if (!alive) return;
        setOn(v === "on" ? true : v === "off" ? false : null);
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
      stopSpeaking();
    };
  }, []);
  const set = useCallback((value: boolean) => {
    setOn(value);
    if (!value) stopSpeaking();
    writeStorage(VOICE_REPLY_KEY, value ? "on" : "off").catch(() => {});
  }, []);
  return {
    available,
    /** 아직 고르지 않았으면 선택 모달을 띄운다 */
    needsChoice: available && loaded && on === null,
    on: available && on === true,
    set,
  };
}
