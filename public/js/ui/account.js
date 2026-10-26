const launcher = document.getElementById('account-open');
const dialog = document.getElementById('account-dialog');
const content = document.getElementById('account-content');
let user = null;
let busy = false;

async function request(action, body) {
  const response = await fetch(`/api/auth/${action}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Please try again.');
  return data;
}
function message(text, error = false) {
  const status = content.querySelector('[data-status]');
  if (status) { status.textContent = text; status.classList.toggle('is-error', error); }
}
function field(name, label, type = 'text', autocomplete = 'off') {
  const wrapper = document.createElement('label');
  wrapper.className = 'account-field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  Object.assign(input, { name, type, autocomplete, required: true });
  input.maxLength = type === 'password' ? 128 : name === 'name' ? 40 : 254;
  if (type === 'password' && autocomplete === 'new-password') input.minLength = 10;
  if (name === 'email') { input.autocapitalize = 'none'; input.spellcheck = false; }
  wrapper.append(span, input);
  return wrapper;
}
function recoveryScreen(code) {
  content.replaceChildren();
  const title = document.createElement('h2'); title.textContent = 'Keep your recovery key';
  const text = document.createElement('p'); text.className = 'account-intro';
  text.textContent = 'Save this key somewhere private. If you forget your password, it restores access to your account. We do not send password-reset emails.';
  const key = document.createElement('code'); key.className = 'account-recovery'; key.textContent = code;
  const save = document.createElement('button'); save.className = 'btn'; save.type = 'button'; save.textContent = 'Save recovery key';
  save.onclick = () => {
    const blob = new Blob([`Visulaserz recovery key\nAccount: ${user.email}\nKey: ${code}\n\nKeep this private. Use it at https://visulaserz.com to reset a forgotten password.\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'visulaserz-recovery-key.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const done = document.createElement('button'); done.className = 'btn btn-primary'; done.type = 'button'; done.textContent = 'Continue to the studio'; done.onclick = () => location.reload();
  const actions = document.createElement('div'); actions.className = 'account-actions'; actions.append(save, done);
  content.append(title, text, key, actions);
  launcher.textContent = user.name;
  launcher.onclick = () => open('profile');
  announce();
  done.focus();
}
function render(mode) {
  content.replaceChildren();
  const title = document.createElement('h2');
  const intro = document.createElement('p'); intro.className = 'account-intro';
  const heading = { login: 'Welcome back', register: 'Make it your studio', recover: 'Recover your account', profile: 'Your account', password: 'Change your password' };
  title.textContent = heading[mode];
  intro.textContent = mode === 'register' ? 'Keep your track list across devices. Audio is loaded temporarily while a track is selected.' : mode === 'login' ? 'Your track list, ready when you are.' : mode === 'recover' ? 'Enter the private recovery key you saved when you joined.' : user?.email || '';
  content.append(title, intro);
  if (mode === 'profile') {
    const name = document.createElement('p'); name.className = 'account-name'; name.textContent = user.name;
    const change = document.createElement('button'); change.type = 'button'; change.className = 'btn'; change.textContent = 'Change password'; change.onclick = () => render('password');
    const logout = document.createElement('button'); logout.type = 'button'; logout.className = 'btn'; logout.textContent = 'Sign out';
    logout.onclick = async () => { logout.disabled = true; try { await request('logout', {}); location.reload(); } catch (e) { message(e.message, true); logout.disabled = false; } };
    const actions = document.createElement('div'); actions.className = 'account-actions'; actions.append(change, logout);
    const status = document.createElement('p'); status.dataset.status = ''; status.role = 'status';
    content.append(name, actions, status); return;
  }
  const form = document.createElement('form'); form.className = 'account-form';
  if (mode === 'register') form.append(field('name', 'Your name', 'text', 'nickname'));
  if (mode !== 'password') form.append(field('email', 'Email', 'email', 'email'));
  if (mode === 'recover') form.append(field('recoveryCode', 'Recovery key', 'text', 'off'));
  if (mode === 'password') form.append(field('currentPassword', 'Current password', 'password', 'current-password'));
  form.append(field(['recover', 'password'].includes(mode) ? 'newPassword' : 'password', mode === 'login' ? 'Password' : 'New password · at least 10 characters', 'password', mode === 'login' ? 'current-password' : 'new-password'));
  const show = document.createElement('button'); show.className = 'account-link account-show'; show.type = 'button'; show.textContent = 'Show password';
  show.onclick = () => {
    const reveal = show.textContent === 'Show password';
    form.querySelectorAll('input[name*="assword"]').forEach(input => input.type = reveal ? 'text' : 'password');
    show.textContent = reveal ? 'Hide password' : 'Show password';
  };
  const status = document.createElement('p'); status.dataset.status = ''; status.className = 'account-status'; status.role = 'status'; status.setAttribute('aria-live', 'polite');
  const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'btn btn-primary';
  const submitText = { login: 'Sign in', register: 'Create account', recover: 'Reset password', password: 'Save new password' }[mode];
  submit.textContent = submitText;
  form.append(show, status, submit);
  form.onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    busy = true; submit.disabled = true; submit.textContent = 'Please wait…'; message('');
    try {
      const data = await request(mode, Object.fromEntries(new FormData(form)));
      user = data.user || user;
      if (data.recoveryCode) recoveryScreen(data.recoveryCode);
      else if (mode === 'password') { form.reset(); message('Password updated. Other devices have been signed out.'); }
      else location.reload();
    } catch (error) { message(error.message, true); }
    finally { busy = false; submit.disabled = false; submit.textContent = submitText; }
  };
  content.append(form);
  const links = document.createElement('div'); links.className = 'account-switches';
  for (const [target, label] of mode === 'login' ? [['register', 'New here? Create an account'], ['recover', 'Forgot your password?']] : mode === 'password' ? [['profile', 'Back to your account']] : [['login', 'Back to sign in']]) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'account-link'; button.textContent = label; button.onclick = () => { if (!busy) render(target); };
    links.append(button);
  }
  content.append(links);
  requestAnimationFrame(() => form.querySelector('input')?.focus());
}
function open(mode = user ? 'profile' : 'login') {
  render(mode);
  if (!dialog.open) dialog.showModal();
}
document.getElementById('account-close').onclick = () => { if (!busy) dialog.close(); };
dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
dialog.addEventListener('keydown', event => event.stopPropagation());
launcher.onclick = () => open();
// Whatever needs an account asks for it with this; { mode: 'register' } opens the sign-up form.
window.addEventListener('visulaserz:auth-required', event => { if (!user) open(event.detail?.mode === 'register' ? 'register' : 'login'); });
// The hosted site tells the page whether this visitor is a guest or a member (clip.js puts a credit
// on a guest's videos). The editions without accounts never say, so they never get one.
function announce() {
  document.documentElement.dataset.account = user ? 'member' : 'guest';
  window.dispatchEvent(new Event('visulaserz:account'));
}
try {
  const data = await request('me');
  if (data.enabled) {
    user = data.user;
    launcher.hidden = false;
    launcher.textContent = user ? user.name : 'Sign in / Join';
    announce();
    // Once a minute while the page is in view, so the admin desk can tell how many people are here.
    // Nothing is stored in the browser for it.
    const ping = () => { if (document.visibilityState === 'visible') fetch('/api/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', keepalive: true }).catch(() => {}); };
    setInterval(ping, 60000);
    document.addEventListener('visibilitychange', ping);
  }
} catch { /* The standalone and static editions do not require accounts. */ }
