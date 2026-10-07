// Sends the Send Feedback form (/feedback/) to the community Worker, with the page the visitor came from.
// A separate file because the site's Content Security Policy blocks inline scripts.
(() => {
  const form = document.getElementById('feedback');
  if (!form) return;
  const sent = document.getElementById('feedback-sent');
  const error = form.querySelector('.form-error');
  const button = form.querySelector('button[type=submit]');

  // The builder passes ?from=/#build; other pages are read from the referrer, which on our own site is the full address.
  let from = new URLSearchParams(location.search).get('from') || '';
  if (!from && document.referrer) {
    try {
      const r = new URL(document.referrer);
      if (r.origin === location.origin && r.pathname !== '/feedback/') from = r.pathname;
    } catch {}
  }
  if (!from.startsWith('/')) from = '';
  form.elements.page.value = from;
  if (from) {
    const back = sent.querySelector('.back-link');
    back.setAttribute('href', from);
    back.textContent = 'Back to Where You Were';
  }

  const show = (msg) => { error.textContent = msg; error.hidden = !msg; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = form.elements.message.value.trim();
    const email = form.elements.email.value.trim();
    if (message.length < 5) { show('Write a few more words so we know what you mean.'); form.elements.message.focus(); return; }
    if (email && !form.elements.email.checkValidity()) { show('That email address doesn\'t look right. You can also leave it blank.'); form.elements.email.focus(); return; }
    show('');
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const res = await fetch(`${form.dataset.api}/api/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, email, page: form.elements.page.value, website: form.elements.website.value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
      form.hidden = true;
      sent.hidden = false;
      sent.querySelector('h2').focus();
    } catch (err) {
      show(err instanceof TypeError ? 'We couldn\'t reach the server. Check your connection and try again.' : err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Send Feedback';
    }
  });
})();
