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
const adapter = createLocalCourseAdapter();
for (const form of document.querySelectorAll('form[data-kind]')) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const status = form.querySelector('[role=status]');
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const result = await adapter.submit({kind:form.dataset.kind,email:form.elements.email.value,courseUpdates:form.dataset.kind === 'waitlist' || form.elements.courseUpdates?.checked === true});
      status.textContent = result.ok
        ? `Local simulation saved. No email sent; no real subscription created.${result.courseUpdates ? ' Course-update choice: yes (simulation only).' : ' Course-update choice: no.'}`
        : result.code === 'invalid-email' ? 'Enter a valid email address to request the library.' : "We couldn't submit your request. Please try again. Local simulation was not saved.";
    } catch {
      status.textContent = "We couldn't submit your request. Please try again. Local simulation was not saved.";
    } finally { button.disabled = false; }
  });
}
