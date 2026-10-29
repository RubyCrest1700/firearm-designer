/**
 * The Privacy Policy (/privacy/) and Terms of Use (/terms/). The text is the owner-approved wording (2026-10-26),
 * copied exactly from the approved drafts' published bodies; their owner notes are never part of the site. Edit the
 * wording only with the owner's approval. Each page has its own effective date, set on merge day: the Privacy Policy
 * October 30, 2026 (section 5, when retention went live), the Terms October 26, 2026. Change a date only with a
 * change of that page's text the owner approves.
 *
 * The text is kept as simple Markdown and turned into HTML here, so it stays word for word what was approved:
 * headings (#, ##, ###), paragraphs, "- " lists, **bold**, one table, and dropinbuilds.com page addresses, which
 * become links to the same page on this site.
 */

/** Owner-approved wording (2026-10-26; section 5 2026-10-29). */
export const PRIVACY_MD = `# Drop-In Builds Privacy Policy

Effective: October 30, 2026

Drop-In Builds ("we", "us") runs dropinbuilds.com and share.dropinbuilds.com (the "site"). The site helps you plan firearm part builds and compare retailer prices. We don't sell anything and we don't run a store. The site is for adults 18 and over (see our Terms of Use at dropinbuilds.com/terms/).

This policy explains what information the site collects, why, who handles it for us, how long we keep it, and the choices you have.

## 1. The short version

- You can use the site without an account and without giving us your name or email address.
- Your saved builds are kept in your own browser. If you turn on price alerts, your saved builds and your email address are also sent to our database so we can email you.
- If you leave feedback, your message (and your email address, if you give one) is stored in our database and emailed to us.
- We don't sell personal information, and we don't use advertising trackers.
- We don't set cookies ourselves. Cloudflare may set a strictly necessary security cookie (__cf_bm) on share.dropinbuilds.com.
- There are no affiliate links on the site, and we earn no commission from retailers.

## 2. What we collect

### 2.1 Stored in your browser
The site keeps some information on your device. It is not sent to us unless you use one of the features described in sections 2.2 to 2.4.

Kept until you clear it (local storage):
- your saved builds (names, parts and the prices when you saved them), plus a backup copy if the saved list ever can't be read;
- the community builds you've voted for, so the vote buttons show correctly;
- if you signed up for price alerts, your alert email address and a random alert ID, so the site can show and manage your signup;
- a marker of which price-drop notices you've already seen.

Kept only for the current browser tab (session storage), and cleared when you close it:
- the build you're working on;
- your compare list.

You can delete all of this at any time by clearing the site's data in your browser settings.

### 2.2 Price alerts (optional)
If you sign up for price alert emails, we store in our database:
- your email address;
- every build saved in that browser (its name, platform and parts list) and the prices we last told you about. The site sends an updated list each time you change your saved builds;
- a random ID used to manage or cancel your alerts;
- a one-time confirmation code, stored only in scrambled (hashed) form and cleared once you confirm;
- the date you signed up and when we last emailed you;
- a hashed network identifier (see 2.5).

To enforce the daily signup limits, we also keep a separate signup record with a hashed network identifier and a hashed copy of your email address (never the readable address).

We send a confirmation email first, and you won't get price alerts until you confirm. If you don't confirm within 7 days, we delete the signup. If the confirmation email wasn't meant for you, its "Not you?" link cancels the signup.

### 2.3 Feedback (optional)
If you use the feedback form, we store your message, the site page you came from, the time you sent it, your email address if you choose to give one (so we can reply), and a hashed network identifier (see 2.5). Once a day, new feedback is emailed to our inbox, including your email address so we can reply.

### 2.4 Community builds, votes, retailer clicks and reports
If you post a build to the community page, we store its parts, the name and note you write, the time you posted it, and a hashed network identifier. The build, name and note are public, so please don't include personal information in them.

If you vote for a community build, click through to a retailer from one, or report one, we store a hashed network identifier with that action. This lets us count each action once per visitor and limit abuse. Reports are counted once per network, and a build reported from several networks is hidden automatically. These records contain no name or email address.

Share links for a build (dropinbuilds.com/?b=… and share.dropinbuilds.com/b/…) carry the parts list in the link itself. We don't store a copy of a build when you make one of these links.

### 2.5 Hashed network identifiers
We don't store your IP address. Instead we store a one-way hash: your IP address (or, for IPv6, the network part of it) combined with a secret value and scrambled. We use two kinds:
- a visitor hash, based on your IP address (for IPv6, its /64 network), used for votes, retailer clicks, daily limits on posting, feedback and alert signups;
- a network hash, based on the wider network your address belongs to (the first three parts of an IPv4 address, or the first 48 bits of an IPv6 address), used only for reports.

We use these hashes to count votes, clicks and reports once per visitor or network, to hide builds reported from several networks, and to limit spam and abuse. They can't be turned back into an IP address without the secret value, and we don't use them to identify you. We still treat them as personal information.

### 2.6 Analytics
We use Cloudflare Web Analytics to count page views on dropinbuilds.com. Cloudflare says it doesn't use cookies or local storage for this, and doesn't fingerprint visitors or track them across sites. Like any web request, it receives standard request information such as your IP address, browser type and the page you visited.

### 2.7 Hosting and request records
Every time you load a page or use a feature, your browser sends a request that includes your IP address, browser details and the address of the page or link requested. Links in our emails include a one-time code or alert ID in the address. Our hosting providers (section 4) receive these requests and may keep records of them for a limited time, under their own policies, to run and secure their services. Our own code doesn't write email addresses or IP addresses to its logs.

## 3. How we use information
We use information only to:
- send the confirmation email and the price alert emails you asked for;
- read your feedback and reply when you gave us an email address;
- show community builds and count votes and retailer clicks;
- prevent spam and abuse;
- keep the site running and fix problems.

We don't sell personal information, and we don't share it for advertising. We don't use it to build profiles of you.

Links to retailers carry a tag (utm_source=dropinbuilds) so the retailer can see the visit came from Drop-In Builds. These are not affiliate links, and we earn no commission. Once you're on a retailer's site, its own privacy policy applies.

## 4. Who handles it for us
We use these service providers to run the site. They handle data on our behalf, and their own privacy policies also apply:
- **Resend** sends our emails. It processes the email addresses and content of the confirmation and price alert emails, and of the daily feedback email to us (which includes feedback messages and any reply addresses). Resend may keep delivery records under its own policies.
- **Cloudflare** runs share.dropinbuilds.com and our database (Cloudflare Workers and D1), and provides our analytics. Cloudflare receives the requests described in section 2.7. Its database service keeps a rolling backup that lets us restore the database to an earlier point in time; this backup is kept for a limited time (currently up to 30 days) and can't be switched off.
- **GitHub** hosts the website pages (GitHub Pages). It receives your IP address and request details when you load a page, but it doesn't receive alert or feedback data.
- **Our email inbox**, where the daily feedback email arrives.

These providers may process data in the United States and other countries.

We may also disclose information if the law requires it, or to protect the site and its users from abuse.

## 5. How long we keep it
We delete the records below automatically, or remove the personal details from them, once they reach the age shown. This runs once a day, so a record can be kept a little longer than shown. You can also ask us to delete your data sooner (section 6).

| Data | Kept for |
|---|---|
| Unconfirmed price alert signups | Deleted automatically after 7 days |
| Confirmed price alerts (email address, watched builds) | Deleted from our database when you unsubscribe or turn off alerts |
| Record that an address unsubscribed or used "Not you?" (hashed, no readable address) | Deleted after 90 days |
| Signup limit records (hashed) | Deleted after 30 days |
| Feedback email address | Removed 30 days after the feedback is emailed to us; if it is never emailed, deleted with the message |
| Feedback message | Deleted 90 days after it is emailed to us, or 180 days after you sent it if it was never emailed |
| Hashed network identifiers on alert signups, feedback and community builds | Removed after 30 days |
| Retailer clicks on community builds | Deleted after 30 days (each build's click total stays, with no visitor data) |
| Votes on community builds | Kept until you remove your vote; votes are not removed automatically |
| Reports on community builds | Kept; reports are not removed automatically |
| Community builds, including hidden ones | Kept until we remove them |

Some copies sit outside these periods:
- Feedback emails in our inbox are kept until we delete them.
- Deleted database records can stay in Cloudflare's rolling backup for a limited time (section 4) before they're gone for good.
- Resend's delivery records and our hosting providers' request records are kept under their own policies.

We keep votes and reports so nobody can vote twice for, or re-report, the same build.

## 6. Your choices and requests
- **Unsubscribe:** every alert email has an unsubscribe link and supports one-click unsubscribe in email apps that offer it. You can also turn off alerts in My Builds on the site. Either way, your alert signup is deleted from our database.
- **Remove your vote:** press the vote button again to remove it.
- **Your browser data:** clear the site's data in your browser settings.
- **Ask about or delete your data:** send a request through the feedback form at dropinbuilds.com/feedback/ and include an email address so we can reply. Tell us what the request is about, for example the email address you used for alerts or the community build you posted. We may email that address to confirm the request comes from you. Votes, clicks, reports and hashes contain no name or email address, so we may not be able to find the ones that relate to you.
- **Remove a community build:** use the Report button on the build, or ask through the feedback form.

Depending on where you live, you may have more rights, such as to access, correct or delete your personal information, or to opt out of its sale or use for targeted advertising. We don't sell personal information or use it for targeted advertising. To make any request, use the feedback form as described above.

**Do Not Track:** the site doesn't track you across other websites, so it works the same whether or not your browser sends a Do Not Track signal.

## 7. Age
The site is for adults 18 and over. It is not directed to children, and we don't knowingly collect personal information from anyone under 13. If you believe a child has given us personal information, tell us through the feedback form and we'll delete it.

## 8. Security
We limit what we collect. We store IP-based identifiers, confirmation codes and unsubscribe records only in hashed form, and access to our systems is restricted. No method of storing or sending data is completely secure.

## 9. Changes to this policy
If we change this policy, we'll update the effective date at the top. If a change is significant, we'll also note it on the site.

## 10. Contact
Contact us through the feedback form at dropinbuilds.com/feedback/. To report a community build, use the Report button on the build.
`;

/** Owner-approved wording (2026-10-26). */
export const TERMS_MD = `# Drop-In Builds Terms of Use

Effective: October 26, 2026

These terms cover your use of dropinbuilds.com and share.dropinbuilds.com (the "site"), run by Drop-In Builds ("we", "us"). By using the site, you agree to these terms. If you don't agree, please don't use the site.

## 1. Who can use the site
The site is for adults 18 and over. By using it, you confirm that you are at least 18.

## 2. What the site is
Drop-In Builds is a planning and price-comparison tool. It helps you put together a list of parts and compare prices that retailers publish. We are not a store. We don't sell, ship or transfer firearms or parts, and we aren't part of any purchase. When you buy something, you buy it from the retailer, under the retailer's terms.

## 3. Information, not legal advice
The build planner, its compatibility checks, and the notices it shows (including notices about barrel length, stocks, braces, the National Firearms Act and parts that ship to a licensed dealer) are general information. They are not legal advice. They may be incomplete or out of date, and they don't cover every law that may apply to you.

You are responsible for following all federal, state and local laws that apply to buying, owning, building, carrying and transporting firearms and parts where you live. Laws change and vary by state and city. If you're not sure, ask a licensed firearms dealer (FFL) or a lawyer.

## 4. Fit, prices and availability
We work to keep part details, fit checks, weights, prices and stock status accurate, but we don't guarantee them. Prices are collected about once a day and can change at any time. Always confirm the price, availability and fit at the retailer before you buy.

Building or changing a firearm can be dangerous. If you're not sure how to assemble or fit a part, use a qualified gunsmith. You use the site's information at your own risk.

## 5. Retailer links
The site links to retailers and other sites we don't control, and we aren't responsible for their content, products, prices or policies. Retailer links carry a tag showing the visit came from Drop-In Builds. There are no affiliate links, and we earn no commission. A link doesn't mean a retailer endorses us, or that we endorse it.

## 6. Brand and product names
Brand names, product names and trademarks on the site belong to their owners. We use them only to identify the products listed. Their use doesn't mean those companies endorse or are connected with Drop-In Builds.

## 7. Content you post
You can post community builds (a parts list, a name and a note) and send feedback.
- **You keep ownership** of what you post.
- **You give us permission** to store, display, copy and share what you post, on the site and in share links and preview images, for as long as it's on the site. You can ask us to remove a community build at any time (section 9).
- **Feedback:** we may use your ideas and suggestions to improve the site, with no obligation to you.
- **Community builds are public.** Anyone can see the name, note and parts list.

You're responsible for what you post, and you confirm you have the right to post it.

## 8. What not to post or do
Don't post or send anything that:
- includes personal information about you or anyone else, such as names, addresses, phone numbers or email addresses;
- offers to buy, sell, trade or transfer firearms, parts or anything else;
- describes how to make illegal modifications, or encourages breaking the law;
- is unlawful, threatening, harassing, hateful, sexually explicit or misleading;
- copies someone else's copyrighted work or uses their trademarks in a way that could confuse people;
- is spam or advertising.

Also don't:
- interfere with the site or try to get around its limits, for example by vote or report manipulation, or by flooding the site with requests;
- collect data from the site with automated tools in a way that strains it or breaks these terms;
- pretend to be someone else.

## 9. Reporting and removal
- **Report button:** if a community build breaks these terms, press Report on it. A build reported from several networks is hidden automatically.
- **Feedback form:** to ask us to remove a build, including your own, or to tell us about content that infringes your copyright or trademark, use the feedback form at dropinbuilds.com/feedback/. Say which build or page you mean and why, and include an email address so we can reply.

We may hide or remove any content, or limit anyone's use of the site, at any time, including when we believe these terms have been broken.

## 10. Our content
The site's design, text and code belong to Drop-In Builds or its licensors. You may use the site for your own personal planning and share links to it. Don't copy or republish large parts of it without our permission.

## 11. No warranties
The site is provided "as is" and "as available", without warranties of any kind. We don't promise that it will be accurate, complete, always available or free of errors.

## 12. Limit of liability
To the fullest extent the law allows, Drop-In Builds is not liable for any loss or damage that comes from using the site or relying on its information, including purchases you make, parts that don't fit, price differences, or legal consequences of a build.

## 13. Changes
We may change the site or these terms at any time. If we change these terms, we'll update the effective date at the top. If you keep using the site after a change, you accept the new terms.

## 14. Privacy
Our Privacy Policy at dropinbuilds.com/privacy/ explains what information the site collects and how we use it.

## 15. Contact
Contact us through the feedback form at dropinbuilds.com/feedback/.
`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Bold, and our own page addresses (dropinbuilds.com/privacy/ and the like) as links. Share-link examples stay text. */
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<![\w.])dropinbuilds\.com\/(privacy|terms|feedback)\//g, '<a href="/$1/">dropinbuilds.com/$1/</a>');

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

/** Block syntax this converter doesn't handle: star or plus lists, numbered lists, quotes, deeper headings, rules, code. */
const UNSUPPORTED_BLOCK = /^(?:[*+] |\d+[.)] |>|#{4,}|#(?!#{0,2} )|-{3,}\s*$|```|~~~)/;

/** Refuses anything in a line the converter would otherwise pass through as text. */
function checkLine(line: string) {
  if (/^\s+\S/.test(line)) throw new Error(`legal text: leading whitespace at "${line}"`);
  if (UNSUPPORTED_BLOCK.test(line)) throw new Error(`legal text: unsupported Markdown at "${line}"`);
  if (/\[[^\]]*\]\([^)]*\)/.test(line)) throw new Error(`legal text: Markdown link at "${line}"`);
  if (/https?:\/\/(?:[\w-]+\.)*dropinbuilds\.com/i.test(line)) throw new Error(`legal text: full dropinbuilds.com address at "${line}" (write dropinbuilds.com/page/)`);
  if (/[*`]/.test(line.replace(/\*\*(.+?)\*\*/g, '$1'))) throw new Error(`legal text: stray * or \` at "${line}"`);
}

/** The Markdown subset above, as HTML. Throws on anything else, so a pasted change can't render wrongly unnoticed. */
export function legalHtml(md: string) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) if (line.trim()) checkLine(line);
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const h = line.match(/^(#{1,3}) (.+)$/);
    if (!line.trim()) { i++; continue; }
    if (UNSUPPORTED_BLOCK.test(line)) throw new Error(`legal text: unsupported Markdown at "${line}"`);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      for (; i < lines.length && lines[i].startsWith('- '); i++) items.push(`<li>${inline(lines[i].slice(2))}</li>`);
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      for (; i < lines.length && lines[i].startsWith('|'); i++) rows.push(cells(lines[i]));
      if (rows.length < 3 || !rows[1].every((c) => /^-+$/.test(c))) throw new Error(`legal text: bad table at "${line}"`);
      const [head, , ...body] = rows;
      for (const r of [rows[1], ...body]) if (r.length !== head.length) throw new Error(`legal text: a table row has ${r.length} cells, the header ${head.length} cells (want ${head.length} cells) at "${line}"`);
      out.push(`<div class="grid-wrap"><table class="legal-table"><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c, k) => (k ? `<td>${inline(c)}</td>` : `<th scope="row">${inline(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,3} |- |\|)/.test(lines[i]); i++) {
      if (UNSUPPORTED_BLOCK.test(lines[i])) throw new Error(`legal text: unsupported Markdown at "${lines[i]}"`);
      para.push(lines[i]);
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

/** The page's h1, from the text's first line. */
export const legalTitle = (md: string) => md.match(/^# (.+)$/m)![1];
