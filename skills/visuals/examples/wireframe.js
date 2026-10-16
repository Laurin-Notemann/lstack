// Wireframes to compare two product structures: same moments, side by side, A vs B; realistic placeholder content,
// red = what B costs the user. Small UI text is accepted here (it's texture, the captions carry the point).
scene('wireframe', (K, s) => {
  const { C, F } = K;
  const small = (x, y, t, c, fs) => s.text(x, y, t, { fs:fs || 11, c:c || C.GRAY });
  s.text(0, 0, 'Shared shell vs. app inside a frame', { fs:24 });
  s.text(2, 36, 'same three moments, A next to B', { fs:16, c:C.GRAY });
  s.text(40, 72, 'A · shared shell', { fs:20, c:C.BLUE }); s.text(416, 72, 'B · app inside a frame', { fs:20, c:C.RED });
  const W = 360, H = 236;
  const win = (x, y, active) => {
    s.box(null, x, y, W, H); s.line(x, y + 20, [[0, 0], [W, 0]], { sw:1.2 });
    [0, 1, 2].forEach(i => s.oval(null, x + 10 + i * 12, y + 6, 7, 7, { sw:1, c:C.GRAY }));
    s.line(x + 44, y + 20, [[0, 0], [0, H - 20]], { sw:1.2 });
    ['Code', 'Mail', 'Cal', 'Drive'].forEach((a, i) => { const on = a === active;
      s.box(null, x + 6, y + 30 + i * 34, 32, 26, { sw:1, c:on ? C.BLUE : C.GRAY, bg:on ? C.BLUEF : 'transparent' });
      small(x + (a.length > 3 ? 8 : 11), y + 37 + i * 34, a, on ? C.BLUE : C.GRAY, 10); });
  };
  const sidebar = (x, y, items, title, c, h) => {
    s.line(x + 150, y + 20, [[0, 0], [0, (h || H) - 20]], { sw:1.2, c:c || C.INK });
    if (title) s.text(x + 52, y + 28, title, { fs:12, c:c || C.INK });
    items.forEach((t, i) => small(x + 54, y + (title ? 50 : 30) + i * 20, t, c || C.INK, 11));
  };
  const mailList = (x, y, ox) => {
    s.box(null, x + ox, y + 28, 120, 20, { sw:1, c:C.GRAY }); small(x + ox + 6, y + 32, 'Search mail  ⌘K');
    s.box(null, x + ox + 128, y + 28, 60, 20, { sw:1, c:C.BLUE, bg:C.BLUEF }); small(x + ox + 136, y + 32, 'Compose', C.BLUE);
    [['Acme Legal', 'Renewal contract v3'], ['Stripe', 'Invoice paid'], ['Sam', 'Re: design review'], ['GitHub', 'CI passed on #12'], ['Calendar', 'Kickoff, Thu 14:00']]
      .forEach(([a, b], i) => { const yy = y + 58 + i * 32; small(x + ox + 2, yy, a, C.INK, 11); small(x + ox + 2, yy + 14, b, C.GRAY, 10);
        s.line(x + ox, yy + 29, [[0, 0], [190, 0]], { sw:0.8, c:C.LIGHT, guide:true }); });
  };
  const files = (x, y, ox) => ['contract.pdf', 'invoice.pdf', 'design.png', 'notes.md', 'deck.pptx', 'photo.jpg'].forEach((f, i) => {
    const cx = x + ox + (i % 3) * 62, cy = y + 40 + Math.floor(i / 3) * 80; s.box(null, cx, cy, 54, 50, { sw:1, c:C.GRAY }); small(cx, cy + 56, f, C.GRAY, 9); });
  ['1 · open Mail', '2 · switch to Drive', '3 · open Settings'].forEach((rl, r) => {
    const y = 136 + r * (H + 58), xa = 40, xb = 416;
    s.text(xa, y - 24, rl, { fs:15, c:C.GRAY }); s.text(xb, y - 24, rl, { fs:15, c:C.GRAY });
    const cap = (x, t, c) => s.text(x, y + H + 4, t, { fs:13, c });
    if (r === 0) {
      for (const x of [xa, xb]) { win(x, y, 'Mail'); sidebar(x, y, ['Inbox  12', 'Starred', 'Sent', 'Drafts  2', 'Labels', 'Customers  4', 'Legal']); mailList(x, y, 158); }
      cap(xa, 'Mail fills the shell’s sidebar and page', C.GRAY); cap(xb, 'looks the same at first', C.GRAY);
    }
    if (r === 1) {
      win(xa, y, 'Drive'); sidebar(xa, y, ['My drive', 'Shared drives', 'Renewal', 'Recent', 'Trash']); files(xa, y, 162);
      win(xb, y, 'Drive'); s.box(null, xb + 52, y + 26, 300, 202, { sw:1.6, c:C.RED, dash:true });
      sidebar(xb + 12, y + 12, ['My drive', 'Shared', 'Recent'], 'Drive', C.RED, H - 30);
      s.box(null, xb + 62, y + 182, 92, 22, { sw:1, c:C.RED }); small(xb + 68, y + 186, 'sam@… · sign in', C.RED, 10); files(xb, y, 166);
      s.text(xb + 180, y + 196, 'loading… (flash)', { fs:13, c:C.RED });
      cap(xa, 'only the page changes, nothing reloads', C.GREEN); cap(xb, 'reloads · 2nd sidebar · own sign-in', C.RED);
    }
    if (r === 2) {
      win(xa, y, 'Mail'); sidebar(xa, y, []);
      [['App', ['General', 'Appearance', 'Account', 'Agents']], ['Mail', ['Mailboxes', 'Reading']], ['Drive', ['Drives']]].reduce((yy, [g, it]) => {
        small(xa + 54, y + yy, g.toUpperCase(), C.GRAY, 9); it.forEach((t, i) => small(xa + 60, y + yy + 14 + i * 16, t, t === 'Reading' ? C.BLUE : C.INK, 11));
        return yy + 18 + it.length * 16 + 6; }, 28);
      s.text(xa + 162, y + 30, 'Mail › Reading', { fs:13 });
      ['Reading pane', 'Mark as read', 'Translation'].forEach((t, i) => { small(xa + 162, y + 60 + i * 30, t, C.INK, 11); s.box(null, xa + 300, y + 56 + i * 30, 40, 18, { sw:1, c:C.GRAY }); });
      win(xb, y, 'Mail'); s.box(null, xb + 52, y + 26, 300, 202, { sw:1.6, c:C.RED, dash:true }); s.text(xb + 62, y + 36, 'Mail settings', { fs:13, c:C.RED });
      ['Accounts', 'Signatures', 'Reading', 'Labels'].forEach((t, i) => { s.box(null, xb + 62 + (i % 2) * 140, y + 66 + Math.floor(i / 2) * 60, 130, 48, { sw:1, c:C.RED });
        small(xb + 70 + (i % 2) * 140, y + 72 + Math.floor(i / 2) * 60, t, C.RED, 11); });
      cap(xa, 'one settings, grouped by app', C.GREEN); cap(xb, 'each app brings its own settings', C.RED);
    }
  });
}, { accept:{ 'too-small':'wireframe placeholder text; captions carry the point' } });
