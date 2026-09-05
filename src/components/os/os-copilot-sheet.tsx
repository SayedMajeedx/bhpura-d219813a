import * as React from "react";
import {
  Mic,
  MicOff,
  Send,
  Sparkles,
  Bot,
  User,
  Package,
  Layers,
  TrendingUp,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  executeCopilotChat,
  type CopilotMessage,
  type CopilotResponse,
} from "@/lib/store-copilot.functions";
import { toast } from "sonner";

export interface OsCopilotSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  slug: string;
  lang?: "en" | "ar";
}

export function OsCopilotSheet({
  open,
  onOpenChange,
  brandId,
  slug,
  lang = "ar",
}: OsCopilotSheetProps) {
  const isAr = lang === "ar";
  const [inputMessage, setInputMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const recognitionRef = React.useRef<any>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const [messages, setMessages] = React.useState<CopilotMessage[]>([
    {
      role: "model",
      content: isAr
        ? "أهلاً بك! أنا مساعد متجرك الذكي ⚡\nأخبرني بما تريد فعله: إضافة منتج، معرفة الإحصائيات، أو استفسارات حول نمو المتجر."
        : "Welcome! I am your store AI copilot ⚡\nTell me what you'd like to do: add a product, view stats, or ask about store growth.",
    },
  ]);

  const [suggestedPrompts, setSuggestedPrompts] = React.useState<string[]>(
    isAr
      ? ["ملخص المتجر السريع", "أضف فستان حرير بسعر 45", "كيف أزيد مبيعات اليوم؟"]
      : ["Quick Store Summary", "Add Silk Dress for 45", "Tips to boost sales?"],
  );

  // Auto-scroll to bottom of chat
  React.useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // Setup Web Speech API for voice recording
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = isAr ? "ar-SA" : "en-US";

        recognition.onresult = (event: any) => {
          const transcript = event.results[0]?.[0]?.transcript;
          if (transcript) {
            setInputMessage((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
          setIsRecording(false);
        };

        recognition.onerror = () => {
          setIsRecording(false);
          toast.error(isAr ? "تعذر التعرف على الصوت" : "Speech recognition error");
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, [isAr]);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      toast.error(
        isAr
          ? "التسجيل الصوتي غير مدعوم في متصفحك الحالي"
          : "Voice recording not supported in this browser",
      );
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
        toast.info(isAr ? "تفضل بالتحدث..." : "Listening...");
      } catch {
        setIsRecording(false);
      }
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputMessage).trim();
    if (!text || loading) return;

    setInputMessage("");
    const newHistory: CopilotMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newHistory);
    setLoading(true);

    try {
      const res: CopilotResponse = await executeCopilotChat({
        data: {
          brandId,
          slug,
          history: newHistory,
          message: text,
          language: lang,
        },
      });

      setMessages((prev) => [...prev, { role: "model", content: res.reply }]);
      if (res.suggestedPrompts && res.suggestedPrompts.length > 0) {
        setSuggestedPrompts(res.suggestedPrompts);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          content: isAr
            ? "عذراً، حدث خطأ أثناء المعالجة. يرجى المحاولة مرة أخرى."
            : "Sorry, an error occurred while processing. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      {/* Copilot Drawer */}
      <div
        className={cn(
          "relative flex flex-col w-full sm:max-w-md h-full bg-card border-s border-border shadow-2xl transition-transform duration-300 animate-in slide-in-from-bottom sm:slide-in-from-right",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/80 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-md">
              <Sparkles className="size-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-foreground">
                  {isAr ? "كوبايلوت المتجر" : "Store AI Copilot"}
                </h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  {isAr ? "مجاني" : "Free"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isAr ? "مساعد تنفيذي فوري لمتجرك" : "Executive assistant for your store"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="size-8 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, idx) => {
            const isUser = m.role === "user";
            return (
              <div
                key={idx}
                className={cn(
                  "flex items-start gap-2.5 text-xs",
                  isUser ? "flex-row-reverse" : "flex-row",
                )}
              >
                <div
                  className={cn(
                    "size-7 rounded-full flex items-center justify-center shrink-0 shadow-xs",
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-gradient-to-tr from-violet-600 to-indigo-600 text-white",
                  )}
                >
                  {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                </div>
                <div
                  className={cn(
                    "p-3 rounded-2xl max-w-[82%] leading-relaxed whitespace-pre-wrap break-words shadow-2xs",
                    isUser
                      ? "bg-primary text-primary-foreground rounded-te-xs"
                      : "bg-muted/60 border border-border/60 text-foreground rounded-ts-xs",
                  )}
                >
                  {m.content}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground ps-9">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>{isAr ? "كوبايلوت يحلل وينفذ..." : "Copilot is working..."}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Pills */}
        {suggestedPrompts.length > 0 && !loading && (
          <div className="px-4 py-2 border-t border-border/40 bg-muted/10 flex flex-wrap gap-1.5">
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(prompt)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-border bg-background hover:bg-muted/80 text-foreground transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Input Bar with Speech API */}
        <div className="p-3 border-t border-border/80 bg-background/95">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <Button
              type="button"
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={toggleRecording}
              className={cn(
                "size-9 shrink-0 rounded-full transition-all",
                isRecording && "animate-pulse ring-2 ring-destructive",
              )}
              title={isAr ? "التحدث صوتياً" : "Speak via voice"}
            >
              {isRecording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </Button>
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                isAr
                  ? isRecording
                    ? "جارٍ الاستماع..."
                    : "اطلب أي شيء لمتجرك..."
                  : isRecording
                    ? "Listening..."
                    : "Ask anything about your store..."
              }
              className="h-9 text-xs rounded-full bg-muted/40"
              disabled={loading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputMessage.trim() || loading}
              className="size-9 shrink-0 rounded-full bg-primary text-primary-foreground"
            >
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
