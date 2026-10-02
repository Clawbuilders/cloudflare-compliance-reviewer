// FIXTURE: deliberately non-compliant code used to test the Advanced committee. Never merged.
import OpenAI from "openai";

declare const posthog: { init(k: string): void };
declare const user: { email: string };
declare const resend: { emails: { send(o: object): Promise<void> } };

export async function onSignup() {
  posthog.init("phc_fixture_key");
  console.log(user.email);
  const client = new OpenAI();
  await fetch("https://collect.example-vendor.io/v1/events");
  await resend.emails.send({ to: user.email, subject: "Welcome", html: "<p>hi</p>" });
  const cardNumber = "5500005555555559";
  console.log(cardNumber);
  return client;
}
