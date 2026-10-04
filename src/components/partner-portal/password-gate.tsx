"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { SgsLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type UnlockResult = { ok: true } | { ok: false; error: string };

// Shown before anything about the deal is known: no partner name, no reference, no watermark.
export function PasswordGate({ action, onUnlocked }: {
  action: (password: string) => Promise<UnlockResult>;
  onUnlocked?: () => void;
}) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get("password");
    if (typeof password !== "string" || password.length === 0) {
      setError("Enter the password you were given.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const res = await action(password);
        if (res.ok) {
          (onUnlocked ?? (() => window.location.reload()))();
        } else {
          setError(res.error);
        }
      } catch {
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sgs-bone px-4 py-10">
      <Card className="w-full max-w-sm space-y-5 p-6">
        <SgsLogo size={36} />
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 font-serif text-2xl">
            <Lock className="h-5 w-5 text-sgs-purple-500" aria-hidden /> Password needed
          </h1>
          <p className="text-sm text-muted-foreground">This statement is private. Enter the password you were given to open it.</p>
        </div>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>Password</Label>
            <Input
              id={inputId}
              name="password"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              disabled={pending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${inputId}-error` : undefined}
              className="h-11 text-base"
            />
          </div>
          {error && (
            <p id={`${inputId}-error`} role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Checking..." : "Open statement"}
          </Button>
        </form>
        <p className="text-center text-[11px] text-muted-foreground">Serendib Gemstones. Access is logged.</p>
      </Card>
    </main>
  );
}
