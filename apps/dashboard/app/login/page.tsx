"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../src/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/");
    });
    return () => listener.subscription.unsubscribe();
  }, [router]);

  async function sendCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email: email.trim(),
      });
      if (error) throw error;
      setSent(true);
      setMessage("Code wurde gesendet. Gib den 6-stelligen Code aus der E-Mail ein.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Code konnte nicht gesendet werden");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await getSupabaseBrowserClient().auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: "email",
      });
      if (error) throw error;
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Code ungültig");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Secure access</div>
          <h1>AI Dev Team Login</h1>
          <p className="subtitle">Passwordless E-Mail-OTP via Supabase. Project runs are isolated per authenticated user by Postgres RLS.</p>
        </div>
      </header>
      <section className="card" style={{ maxWidth: 620 }}>
        {!sent ? (
          <form className="form" onSubmit={sendCode}>
            <label className="field">
              <span>E-Mail</span>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" />
            </label>
            {message ? <div className="status">{message}</div> : null}
            <button className="button" disabled={loading || !email.trim()} type="submit">
              {loading ? "Sende…" : "Login-Code senden"}
            </button>
          </form>
        ) : (
          <form className="form" onSubmit={verifyCode}>
            <label className="field">
              <span>6-stelliger Code</span>
              <input inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={6} value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" />
            </label>
            {message ? <div className="status">{message}</div> : null}
            <button className="button" disabled={loading || token.length !== 6} type="submit">
              {loading ? "Prüfe…" : "Einloggen"}
            </button>
            <button className="button" type="button" onClick={() => { setSent(false); setToken(""); setMessage(null); }}>
              Andere E-Mail
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
