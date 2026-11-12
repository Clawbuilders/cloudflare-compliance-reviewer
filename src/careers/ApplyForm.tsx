// DEMO for the ClawBuilders policy-as-code workshop. Maple Robotics is a fictional company.
// The Starter accessibility reviewer should flag this form. Do not merge.
import { useState } from "react";

export function ApplyForm({ role, onSubmit }: { role: string; onSubmit: (data: FormData) => void }) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <section className="apply">
      <img src="/brand/maple-robotics-team.jpg" className="apply-hero" />
      <h2>Apply for {role}</h2>

      <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }}>
        <input type="text" name="fullName" placeholder="Full name" />
        <input type="email" name="email" placeholder="Email" />

        <div className="upload" onClick={() => document.getElementById("resume")?.click()}>
          Upload your resume
        </div>
        <input id="resume" type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file && <span>{file.name}</span>}

        <a href="/careers/privacy" tabIndex={1}>How we use your application</a>

        <button type="submit" style={{ outline: "none" }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </form>
    </section>
  );
}
