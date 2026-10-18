import { post } from "../api.js";
import { setState } from "../store.js";
import { navigate } from "../router.js";
import { html, render, field, formValues, clearErrors, showErrors, setBusy, setFieldError, validate, required } from "../ui.js";


export async function page(ctx) {
  const root = ctx.root;
  let mode = "login";
  const draw = () => {
    const reg = mode === "register";
    render(root, html`<section class="auth-card" aria-labelledby="auth-title">
      <div class="brand" style="padding:0;margin-bottom:1rem"><span class="brand-mark" aria-hidden="true">₹</span><span>SmartBill</span></div>
      <h1 id="auth-title">${reg ? "Create your account" : "Sign in"}</h1>
      <p class="muted" style="margin:.25rem 0 1rem">${reg ? "Track what you owe, when it's due, and what's coming next." : "See what you need to pay and when."}</p>
      <div class="segmented" role="group" aria-label="Choose form" style="margin-bottom:1rem">
        <button type="button" data-mode="login" aria-pressed="${!reg}">Sign in</button><button type="button" data-mode="register" aria-pressed="${reg}">Create account</button></div>
      <form class="form" id="auth-form" novalidate>
        ${reg ? field({ id: "fullName", label: "Full name", required: true, attrs: 'autocomplete="name"' }) : ""}
        ${field({ id: "email", label: "Email", type: "email", required: true, attrs: 'autocomplete="email"' })}
        ${field({ id: "password", label: "Password", type: "password", required: true, help: reg ? "8 to 72 characters" : "", attrs: `autocomplete="${reg ? "new-password" : "current-password"}"` })}
        <div class="alert error" role="alert" data-form-error hidden></div>
        <button class="btn primary" type="submit">${reg ? "Create account" : "Sign in"}</button>
      </form></section>`);
    root.querySelector("input")?.focus();
  };
  root.addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (b && b.dataset.mode !== mode) { mode = b.dataset.mode; draw(); } });
  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target, reg = mode === "register";
    clearErrors(form);
    const v = formValues(form);
    const errs = validate(v, {
      ...(reg ? { fullName: required("Enter your name") } : {}),
      email: (x) => (/^\S+@\S+\.\S+$/.test(x) ? "" : "Enter a valid email address"),
      password: (x) => (!x ? "Enter your password" : reg && (x.length < 8 || x.length > 72) ? "Use 8 to 72 characters" : ""),
    });
    if (Object.keys(errs).length) { Object.entries(errs).forEach(([k, m]) => setFieldError(form, k, m)); form.querySelector('[aria-invalid="true"]').focus(); return; }
    const btn = form.querySelector('button[type="submit"]'); setBusy(btn, true);
    try {
      const user = await post(reg ? "/api/auth/register" : "/api/auth/login", reg ? { email: v.email, password: v.password, fullName: v.fullName } : { email: v.email, password: v.password });
      setState({ user }); navigate("/dashboard");
    } catch (err) { showErrors(form, err); } finally { setBusy(btn, false); }
  });
  draw();
}
