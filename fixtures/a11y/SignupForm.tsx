// FIXTURE: deliberately inaccessible markup used to test the Starter reviewer. Never merged.
export function SignupForm({ onSave }: { onSave: () => void }) {
  return (
    <div>
      <img src="/hero.png" />
      <input type="text" name="email" />
      <div onClick={onSave} style={{ outline: "none" }}>Save</div>
      <button onClick={onSave}><svg width="16" height="16" /></button>
      <div tabIndex={3}>Skip me</div>
    </div>
  );
}
