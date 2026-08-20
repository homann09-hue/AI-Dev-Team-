"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "../../src/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const redirectTo = `${window.location.origin}/login`;
      const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setMessage("Login-Link wurde gesendet. Öffne die E-Mail auf diesem Gerät.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login fehlgeschlagen");
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
          <p className="subtitle">Passwordless login via Supabase. Project runs are isolated per authenticated user by Postgres RLS.</p>
        </div>
      </header>
      <section className="card" style={{ maxWidth: 620 }}>
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>E-Mail</span>
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" />
          </label>
          {message ? <div className="status">{message}</div> : null}
          <button className="button" disabled={loading || !email.trim()} type="submit">
            {loading ? "Sende…" : "Magic Link senden"}
          </button>
        </form>
      </section>
    </main>
  );
}
