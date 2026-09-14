"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signInAction } from "./actions";
import { SgsMark } from "@/components/brand/logo";

export function LoginForm({ callbackUrl, error }: { callbackUrl?: string; error?: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(error ?? null);

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
            <Input id="email" name="email" type="email" required placeholder="you@serendib.lk" defaultValue="admin@serendib.lk" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required defaultValue="password123" />
          </div>
          {message && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {message}
            </div>
          )}
          <Button className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
          <div className="text-xs text-muted-foreground">
            Demo accounts (password <span className="font-mono">password123</span>):
            <ul className="mt-1 space-y-0.5">
              <li>admin@serendib.lk — Administrator</li>
              <li>buyer@serendib.lk — Gem Buyer</li>
              <li>cutter@serendib.lk — Cutter</li>
              <li>sales@serendib.lk — Sales</li>
            </ul>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
