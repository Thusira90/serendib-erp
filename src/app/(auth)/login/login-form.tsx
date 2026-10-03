"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signInAction } from "./actions";
import { SgsMark } from "@/components/brand/logo";
import { Eye, EyeOff } from "lucide-react";

// Seeded demo accounts are a development convenience only.
const DEMO = process.env.NODE_ENV !== "production";

export function LoginForm({ callbackUrl, error }: { callbackUrl?: string; error?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(error ?? null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="lg:hidden mb-4"><SgsMark size={36} /></div>
        <CardTitle className="font-serif text-2xl">Sign in</CardTitle>
        <CardDescription>Serendib Gemstones ERP</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          action={(fd) =>
            start(async () => {
              setMessage(null);
              const res = await signInAction(fd, callbackUrl ?? "/");
              if (res?.error) setMessage(res.error);
            })
          }
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="you@serendib.lk" defaultValue={DEMO ? "admin@serendib.lk" : undefined} autoComplete="username" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                defaultValue={DEMO ? "password123" : undefined}
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {message && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {message}
            </div>
          )}
          <Button className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
          {DEMO && (
            <div className="text-xs text-muted-foreground">
              Demo accounts (password <span className="font-mono">password123</span>):
              <ul className="mt-1 space-y-0.5">
                <li>admin@serendib.lk — Administrator</li>
                <li>buyer@serendib.lk — Gem Buyer</li>
                <li>cutter@serendib.lk — Cutter</li>
                <li>sales@serendib.lk — Sales</li>
              </ul>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
