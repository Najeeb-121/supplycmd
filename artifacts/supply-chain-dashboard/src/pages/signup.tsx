import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { signupSchema, type SignupFormValues } from "@/schemas/auth";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { companyName: "", name: "", email: "", password: "" },
    mode: "onChange",
  });

  async function onSubmit(values: SignupFormValues) {
    setIsSigningUp(true);

    try {
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            companyName: values.companyName,
            name: values.name,
          },
        },
      });

      if (error) {
        form.setError("email", { message: error.message });
        return;
      }

      setConfirmationSent(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create account";

      form.setError("email", { message });
    } finally {
      setIsSigningUp(false);
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
          <CardTitle>Create your company's workspace</CardTitle>
          <CardDescription>Sets up a new, fully isolated company account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl><Input placeholder="e.g. Acme Manufacturing" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                    <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isSigningUp || confirmationSent || !form.formState.isValid}>
                {isSigningUp ? "Creating..." : confirmationSent ? "Confirmation Email Sent" : "Create Workspace"}
              </Button>
              {confirmationSent && (
                <p className="text-sm text-muted-foreground text-center">
                  Check your email and confirm your account, then return here and log in.
                </p>
              )}
            </form>
          </Form>
          <p className="text-sm text-muted-foreground text-center mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">Log in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
