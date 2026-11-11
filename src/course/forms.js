import { createCourseApiAdapter } from './api-adapter.js';
import { createLocalCourseAdapter } from './local-adapter.js';
import libraryText from './business-prompt-library.md?raw';
for (const link of document.querySelectorAll('[data-library-download]')) {
  link.href = URL.createObjectURL(new Blob([libraryText], {type:'text/markdown;charset=utf-8'}));
}
for (const pre of document.querySelectorAll('.resource pre')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Copy';
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pre.textContent); button.textContent = 'Copied'; }
    catch { button.textContent = 'Select the text to copy'; }
  });
  pre.after(button);
}
const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
const adapter = local ? createLocalCourseAdapter() : createCourseApiAdapter();
for (const form of document.querySelectorAll('form[data-kind]')) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const status = form.querySelector('[role=status]');
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await adapter.submit({kind:form.dataset.kind,email:form.elements.email.value,courseUpdates:form.elements.courseUpdates?.checked === true});
      if (result.ok) {
        if (form.dataset.kind === 'library') document.querySelector('[data-library-download]')?.click();
        status.textContent = local
          ? `Local simulation saved. No real subscription created. Course-update choice: ${result.courseUpdates ? 'yes' : 'no'}.`
          : form.dataset.kind === 'waitlist'
            ? "You're on the waitlist. We'll email course updates, including dates when they're set. This isn't enrollment and no payment was taken."
            : `Your download should start now. If it doesn't, use the download link.${result.courseUpdates ? " You'll also get course updates." : ''}`;
      } else {
        status.textContent = result.code === 'consent-required' ? 'Choose course updates to join the waitlist.'
          : result.code === 'invalid-email' ? 'Enter a valid email address.'
          : result.code === 'rate_limited' ? 'Too many requests. Please wait and try again.'
          : `We couldn't submit your request. Please try again.${local ? ' Local simulation was not saved.' : ''}`;
      }
    } catch {
      status.textContent = `We couldn't submit your request. Please try again.${local ? ' Local simulation was not saved.' : ''}`;
    } finally { button.disabled = false; }
  });
}
