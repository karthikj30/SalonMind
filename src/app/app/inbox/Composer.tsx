"use client";
import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, SendHorizontal, Smartphone } from "lucide-react";

type Action = (fd: FormData) => Promise<void>;

function Buttons({ reply, inbound }: { reply: Action; inbound: Action }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" formAction={inbound} disabled={pending} title="Test: send this as the customer (the AI concierge will answer)" aria-label="Send as customer (test)"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--wa-line)] bg-[var(--wa-in)] text-[var(--wa-meta)] transition hover:text-[var(--wa-send)] active:scale-95 disabled:opacity-60">
        <Smartphone className="h-5 w-5" />
      </button>
      <button type="submit" formAction={reply} disabled={pending} title="Reply as the salon (human takeover)" aria-label="Send reply"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--wa-send)] text-white shadow transition hover:brightness-110 active:scale-95 disabled:opacity-60">
        {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
      </button>
    </>
  );
}

/** WhatsApp-style composer: green button replies as the salon, phone button simulates the customer's next message. */
export function Composer({ handle, channel, clientId, name, reply, inbound }: { handle: string; channel: string; clientId: string; name: string; reply: Action; inbound: Action }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={reply} className="flex items-end gap-2 bg-[var(--wa-panel)] px-2 py-2 sm:px-3" onSubmit={() => setTimeout(() => { if (ta.current) ta.current.value = ""; }, 0)}>
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="name" value={name} />
      <textarea ref={ta} name="body" required rows={1} dir="auto" maxLength={2000} placeholder="Type a message"
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
        className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border-0 bg-[var(--wa-in)] px-4 py-2.5 text-[15px] text-[var(--wa-text)] placeholder:text-[var(--wa-meta)] focus:outline-none focus:ring-2 focus:ring-[#00a88466]" />
      <Buttons reply={reply} inbound={inbound} />
    </form>
  );
}
