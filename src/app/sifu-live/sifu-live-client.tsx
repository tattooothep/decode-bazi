"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BookOpenText,
  LoaderCircle,
  Mic,
  MicOff,
  RotateCcw,
  ScrollText,
  Send,
  Sparkles,
  UserRound,
  Volume2,
  VolumeX,
  Waves,
} from "lucide-react";

type Role = "user" | "sifu" | "system";
type LiveState = "ready" | "listening" | "thinking";
type Topic = "overview" | "career" | "wealth" | "love" | "timing";

type Message = {
  id: number;
  role: Role;
  text: string;
  topic?: Topic;
  time: string;
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
};

type SpeechRecognitionEventLike = {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const topicLabels: Record<Topic, { th: string; zh: string; hint: string }> = {
  overview: { th: "ภาพรวม", zh: "總覽", hint: "วันนี้ควรจับจังหวะอะไร" },
  career: { th: "งาน", zh: "事業", hint: "งานนี้ควรเดินหน้าหรือรอ" },
  wealth: { th: "เงิน", zh: "財", hint: "ช่วงนี้ควรระวังเงินเรื่องไหน" },
  love: { th: "รัก", zh: "情", hint: "ความสัมพันธ์นี้ควรคุยยังไง" },
  timing: { th: "ฤกษ์", zh: "擇日", hint: "วันไหนเหมาะกับเรื่องนี้" },
};

const quickPrompts = [
  "วันนี้ควรเน้นเรื่องอะไรเป็นอันดับแรก",
  "งานที่กำลังตัดสินใจควรเดินหน้าหรือชะลอ",
  "ช่วงนี้เงินรั่วจากจุดไหนมากที่สุด",
  "เรื่องความรักควรพูดตรงหรือรอจังหวะ",
];

const initialMessages: Message[] = [
  {
    id: 1,
    role: "sifu",
    topic: "overview",
    time: "สด",
    text:
      "สวัสดีครับ ถามเรื่องงาน เงิน ความรัก สุขภาพ หรือฤกษ์ที่ต้องตัดสินใจได้เลย ผมจะตอบให้เป็นขั้นตอนและบอกจุดที่ควรระวังตรง ๆ",
  },
];

function nowLabel() {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date());
}

function detectTopic(text: string, fallback: Topic): Topic {
  if (/งาน|อาชีพ|บริษัท|โปรเจกต์|ลูกค้า/.test(text)) return "career";
  if (/เงิน|รายได้|กำไร|ขาย|ลงทุน|หนี้/.test(text)) return "wealth";
  if (/รัก|คู่|แฟน|แต่ง|สัมพันธ์|ครอบครัว/.test(text)) return "love";
  if (/วัน|เวลา|ฤกษ์|ย้าย|เปิด|เซ็น|เดินทาง/.test(text)) return "timing";
  return fallback;
}

function buildSifuReply(question: string, topic: Topic) {
  const label = topicLabels[topic];
  const trimmed = question.trim();
  const base =
    topic === "career"
      ? "จังหวะงานตอนนี้ให้ดูที่ภาระจริงก่อนชื่อเสียง ถ้าต้องเลือก ให้เลือกทางที่มีขอบเขตงานชัดและวัดผลได้ภายใน 30 วัน"
      : topic === "wealth"
        ? "เรื่องเงินให้กันรั่วก่อนเร่งโต รายจ่ายเล็กที่เกิดซ้ำมีน้ำหนักกว่าการตัดสินใจใหญ่ครั้งเดียว"
        : topic === "love"
          ? "เรื่องความสัมพันธ์อย่าเปิดประเด็นหลายเรื่องพร้อมกัน ให้คุยทีละข้อและดูการกระทำหลังคุยมากกว่าคำรับปาก"
          : topic === "timing"
            ? "เรื่องฤกษ์ให้เริ่มจากเจตนาและความพร้อมของคนก่อน แล้วค่อยคัดวันเวลา อย่าใช้วันดีไปดันเรื่องที่เงื่อนไขยังไม่พร้อม"
            : "ภาพรวมให้จัดเรื่องเร่งกับเรื่องสำคัญแยกกัน วันนี้เหมาะกับการตัดสิ่งรบกวนก่อนค่อยตัดสินใจใหญ่";

  return `หมวด ${label.th} · ${label.zh}\n${base}\n\nคำถามของคุณคือ “${trimmed}”\nคำตอบสั้น: ทำได้ แต่ให้ตั้งเงื่อนไขสำเร็จให้ชัด 1 ข้อ และเงื่อนไขหยุด 1 ข้อก่อนเริ่ม`;
}

export default function SifuLiveClient() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [topic, setTopic] = useState<Topic>("overview");
  const [liveState, setLiveState] = useState<LiveState>("ready");
  const [voiceOn, setVoiceOn] = useState(true);
  const [supportsMic, setSupportsMic] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const statusText = useMemo(() => {
    if (liveState === "listening") return "กำลังฟัง";
    if (liveState === "thinking") return "ซินแสกำลังอ่านจังหวะ";
    return "พร้อมสนทนา";
  }, [liveState]);

  useEffect(() => {
    setSupportsMic(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, liveState]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "44px";
    node.style.height = `${Math.min(node.scrollHeight, 128)}px`;
  }, [input]);

  function speak(text: string) {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\n+/g, " "));
    utterance.lang = "th-TH";
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }

  function send(text = input) {
    const question = text.trim();
    if (!question || liveState === "thinking") return;
    const nextTopic = detectTopic(question, topic);
    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      text: question,
      topic: nextTopic,
      time: nowLabel(),
    };
    setTopic(nextTopic);
    setInput("");
    setInterim("");
    setMessages((current) => [...current, userMessage]);
    setLiveState("thinking");

    window.setTimeout(() => {
      const reply = buildSifuReply(question, nextTopic);
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: "sifu",
          text: reply,
          topic: nextTopic,
          time: nowLabel(),
        },
      ]);
      setLiveState("ready");
      speak(reply);
    }, 780);
  }

  function resetChat() {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
    setMessages(initialMessages);
    setInput("");
    setInterim("");
    setTopic("overview");
    setLiveState("ready");
  }

  function toggleListening() {
    if (liveState === "thinking") return;
    if (liveState === "listening") {
      recognitionRef.current?.stop();
      setLiveState("ready");
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setMessages((current) => [
        ...current,
        {
          id: Date.now(),
          role: "system",
          text: "เบราว์เซอร์นี้ยังไม่รองรับไมค์สด ใช้ช่องพิมพ์ก่อนได้",
          time: nowLabel(),
        },
      ]);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "th-TH";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText.trim()) {
        recognition.stop();
        setLiveState("ready");
        send(finalText);
      }
    };
    recognition.onerror = () => {
      setLiveState("ready");
      setInterim("");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setLiveState((current) => (current === "listening" ? "ready" : current));
    };
    recognitionRef.current = recognition;
    setInterim("");
    setLiveState("listening");
    recognition.start();
  }

  return (
    <main className="min-h-screen bg-[oklch(0.12_0.018_245)] text-[oklch(0.96_0.012_85)]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1440px] grid-rows-[auto_1fr] gap-0 px-4 py-4 sm:px-5 lg:px-6">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md border border-[var(--cinnabar)]/45 bg-[var(--cinnabar)]/15 zh text-xl text-[oklch(0.86_0.11_70)]">
              師
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate font-serif text-xl leading-tight sm:text-2xl">แชทสดกับซินแส</h1>
                <span className="hidden rounded-md border border-[oklch(0.62_0.12_175)]/50 px-2 py-0.5 text-[11px] text-[oklch(0.78_0.11_175)] sm:inline-flex">
                  LIVE
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-white/58">Decode · Personal AI Sinsae</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs text-white/68 sm:inline-flex">
              <Activity className="size-4 text-[oklch(0.78_0.11_175)]" />
              <span>{statusText}</span>
            </div>
            <button
              type="button"
              onClick={() => setVoiceOn((value) => !value)}
              className="grid size-10 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/75 transition hover:bg-white/[0.08]"
              aria-label={voiceOn ? "ปิดเสียงตอบ" : "เปิดเสียงตอบ"}
              title={voiceOn ? "ปิดเสียงตอบ" : "เปิดเสียงตอบ"}
            >
              {voiceOn ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            </button>
            <button
              type="button"
              onClick={resetChat}
              className="grid size-10 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-white/75 transition hover:bg-white/[0.08]"
              aria-label="เริ่มใหม่"
              title="เริ่มใหม่"
            >
              <RotateCcw className="size-5" />
            </button>
          </div>
        </header>

        <section className="grid min-h-0 grid-cols-1 gap-4 py-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-h-0 space-y-4 overflow-y-auto lg:pr-1">
            <section className="overflow-hidden rounded-md border border-white/10 bg-white/[0.05]">
              <div className="relative aspect-[16/10] bg-black">
                <video
                  className="h-full w-full object-cover opacity-88"
                  src="/assets/landing-v2/card-sifu-loop-v2.mp4"
                  poster="/assets/landing-v2/card-sifu-v2.webp"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(8,12,17,0.78))]" />
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="zh text-2xl text-[oklch(0.84_0.12_75)]">即時問師</div>
                      <div className="mt-1 text-sm text-white/78">ห้องสนทนาสด</div>
                    </div>
                    <div className="grid size-10 place-items-center rounded-md bg-black/45 text-[oklch(0.78_0.11_175)]">
                      <Waves className="size-5" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-white/82">
                <ScrollText className="size-4 text-[oklch(0.84_0.12_75)]" />
                <span>หัวข้อสนทนา</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(topicLabels) as Topic[]).map((key) => {
                  const active = key === topic;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTopic(key)}
                      className={[
                        "min-h-16 rounded-md border px-3 py-2 text-left transition",
                        active
                          ? "border-[var(--cinnabar)]/65 bg-[var(--cinnabar)]/16 text-white"
                          : "border-white/10 bg-black/10 text-white/68 hover:bg-white/[0.06]",
                      ].join(" ")}
                    >
                      <span className="block text-sm">{topicLabels[key].th}</span>
                      <span className="zh mt-1 block text-lg text-[oklch(0.82_0.11_72)]">{topicLabels[key].zh}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-md border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 flex items-center gap-2 text-sm text-white/82">
                <Sparkles className="size-4 text-[oklch(0.78_0.11_175)]" />
                <span>คำถามลัด</span>
              </div>
              <div className="space-y-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => send(prompt)}
                    className="w-full rounded-md border border-white/10 bg-black/10 px-3 py-2 text-left text-sm leading-snug text-white/72 transition hover:border-[oklch(0.62_0.12_175)]/50 hover:bg-white/[0.06]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section className="grid min-h-[680px] min-w-0 grid-rows-[auto_1fr_auto] overflow-hidden rounded-md border border-white/10 bg-[oklch(0.16_0.016_245)] shadow-2xl shadow-black/25">
            <div className="flex min-h-[68px] items-center justify-between gap-3 border-b border-white/10 px-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-md bg-[oklch(0.62_0.12_175)]/14 text-[oklch(0.78_0.11_175)]">
                  <UserRound className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-white">ซินแสส่วนตัว</div>
                  <div className="mt-0.5 text-xs text-white/55">{topicLabels[topic].hint}</div>
                </div>
              </div>
              <div className="flex h-8 items-center gap-2 rounded-md border border-white/10 bg-black/16 px-3 text-xs text-white/62">
                <span className={["size-2 rounded-full", liveState === "ready" ? "bg-[oklch(0.78_0.11_175)]" : "bg-[oklch(0.84_0.12_75)]"].join(" ")} />
                {statusText}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-4 py-5">
              <div className="mx-auto flex max-w-[840px] flex-col gap-4">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={[
                      "max-w-[min(760px,92%)] rounded-md border px-4 py-3 text-sm leading-relaxed shadow-sm",
                      message.role === "user"
                        ? "ml-auto border-[oklch(0.62_0.12_175)]/28 bg-[oklch(0.24_0.04_176)] text-white"
                        : message.role === "system"
                          ? "mx-auto border-white/12 bg-white/[0.035] text-center text-white/58"
                          : "mr-auto border-white/10 bg-white/[0.06] text-white/86",
                    ].join(" ")}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-white/42">
                      <span>{message.role === "user" ? "คุณ" : message.role === "system" ? "ระบบ" : "ซินแส"}</span>
                      <span>{message.time}</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words">{message.text}</div>
                  </article>
                ))}
                {interim && (
                  <div className="ml-auto max-w-[min(760px,92%)] rounded-md border border-[oklch(0.62_0.12_175)]/22 bg-[oklch(0.24_0.04_176)]/45 px-4 py-3 text-sm text-white/62">
                    {interim}
                  </div>
                )}
                {liveState === "thinking" && (
                  <div className="mr-auto inline-flex max-w-[260px] items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/68">
                    <LoaderCircle className="size-4 animate-spin text-[oklch(0.84_0.12_75)]" />
                    กำลังเรียบเรียงคำตอบ
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>

            <div className="border-t border-white/10 bg-black/18 p-3">
              <div className="mx-auto flex max-w-[880px] items-end gap-2">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={[
                    "grid size-12 shrink-0 place-items-center rounded-md border transition",
                    liveState === "listening"
                      ? "border-[var(--cinnabar)]/70 bg-[var(--cinnabar)]/20 text-[oklch(0.84_0.12_75)]"
                      : "border-white/10 bg-white/[0.05] text-white/75 hover:bg-white/[0.08]",
                    !supportsMic ? "opacity-70" : "",
                  ].join(" ")}
                  aria-label={liveState === "listening" ? "หยุดฟัง" : "เริ่มฟัง"}
                  title={liveState === "listening" ? "หยุดฟัง" : "เริ่มฟัง"}
                >
                  {liveState === "listening" ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  className="min-h-12 flex-1 resize-none rounded-md border border-white/10 bg-white/[0.05] px-4 py-3 text-sm leading-5 text-white outline-none transition placeholder:text-white/36 focus:border-[oklch(0.62_0.12_175)]/65"
                  placeholder="ถามซินแส..."
                />
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={!input.trim() || liveState === "thinking"}
                  className="grid size-12 shrink-0 place-items-center rounded-md border border-[var(--cinnabar)]/50 bg-[var(--cinnabar)]/18 text-[oklch(0.94_0.04_75)] transition hover:bg-[var(--cinnabar)]/25 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="ส่งคำถาม"
                  title="ส่งคำถาม"
                >
                  <Send className="size-5" />
                </button>
              </div>
              <div className="mx-auto mt-2 flex max-w-[880px] items-center justify-between gap-3 text-[11px] text-white/42">
                <span>{supportsMic ? "ไมค์พร้อม" : "ไมค์ขึ้นกับเบราว์เซอร์"}</span>
                <span className="inline-flex items-center gap-1">
                  <BookOpenText className="size-3.5" />
                  คัมภีร์
                </span>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
