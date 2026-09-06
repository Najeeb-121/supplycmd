import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { loginSchema, type LoginFormValues } from "@/schemas/auth";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onChange",
  });

  async function onSubmit(values: LoginFormValues) {
    setIsLoggingIn(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });

      if (error) {
        console.error("Supabase login error:", error);
        form.setError("password", { message: error.message });
        return;
      }

      let user;

      try {
        user = await getCurrentUser();
      } catch (error) {
        const apiError = error as {
          status?: number;
          data?: { error?: string };
        };

        const isUnlinkedSupabaseUser =
          apiError.status === 401 &&
          apiError.data?.error ===
          "Supabase user is not linked to a SupplyCMD account";

        if (!isUnlinkedSupabaseUser) {
          throw error;
        }

        const accessToken = data.session?.access_token;
        const companyName = data.user?.user_metadata?.companyName;
        const name = data.user?.user_metadata?.name;

        if (
          !accessToken ||
          typeof companyName !== "string" ||
          !companyName.trim() ||
          typeof name !== "string" ||
          !name.trim()
        ) {
          throw new Error(
            "Your signup profile is incomplete. Please create your account again."
          );
        }

        const provisionResponse = await fetch(
          "/api/auth/supabase/provision",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              companyName,
              name,
            }),
          }
        );

        if (!provisionResponse.ok) {
          const provisionError = await provisionResponse
            .json()
            .catch(() => null) as { error?: string } | null;

          throw new Error(
            provisionError?.error ?? "Unable to create SupplyCMD workspace"
          );
        }

        user = await getCurrentUser();
      }

      queryClient.setQueryData(getGetCurrentUserQueryKey(), user);
      setLocation("/");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to sign in";

      console.error("SupplyCMD login error:", error);
      form.setError("password", { message });
    } finally {
      setIsLoggingIn(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              SC
            </div>
            <span className="font-bold tracking-tight">SupplyCmd</span>
          </div>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Welcome back — sign in to your company's workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl><Input type="password" autoComplete="current-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoggingIn || !form.formState.isValid}>
                {isLoggingIn ? "Logging in..." : "Log in"}
              </Button>
            </form>
          </Form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            Don't have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline">Sign up</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}