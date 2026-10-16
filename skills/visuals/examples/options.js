// Choice between options: the SAME skeleton drawn once per option; only what differs gets colour.
// Then a short table of the scenarios that decide it. Mark the recommendation, don't hide the others.
scene('options', (K, s) => {
  const { C, F } = K;
  s.text(0, 0, 'Remote mail: three ways, one skeleton', { fs:24 });
  s.text(2, 36, 'only where the token lives — and what breaks — changes', { fs:16, c:C.GRAY });
  const opts = [['A', 'account holds tokens', 'cloud', 'cloud'], ['B', 'laptop is home', 'relay', 'laptop'], ['C', 'each connects Google', 'not involved', 'each']];
  opts.forEach(([k, t, mid, tok], i) => {
    const ox = i * 250, rec = k === 'A', n = id => k + id;
    if (rec) s.highlight(ox - 4, 74, 196, 28);
    s.text(ox, 78, `${k} · ${t}`, { fs:16, c:rec ? C.BLUE : C.INK });
    const b = (id, x, y, w, label, hot, o = {}) => s.box(n(id), ox + x, y, w, 30, { label, fs:13, ff:F.NUN, c:hot ? C.BLUE : (o.c || C.INK), bg:hot ? C.BLUEF : 'transparent', ...o });
    b('g', 66, 122, 100, 'Google');
    b('m', 66, 186, 100, mid, tok === 'cloud', k === 'C' ? { c:C.GRAY, dash:true } : {});
    b('l', 0, 250, 92, 'laptop', tok === 'laptop'); b('s', 140, 250, 92, 'server');
    if (k === 'A') { s.link(n('g'), n('m'), { c:C.BLUE }); s.link(n('m'), n('l'), { c:C.BLUE }); s.link(n('m'), n('s'), { c:C.BLUE }); }
    if (k === 'B') { s.link(n('g'), n('l'), { from:'left', to:'top', toAt:0.25, c:C.BLUE });
                     s.link(n('s'), n('m'), { from:'top', to:'right' }); s.link(n('m'), n('l'), { from:'bottom', to:'top', toAt:0.75 }); }
    if (k === 'C') { s.link(n('g'), n('l'), { from:'left', to:'top', c:C.GRAY }); s.link(n('g'), n('s'), { from:'right', to:'top', c:C.GRAY });
                     s.text(ox + 46, 288, 'own token', { fs:12, ff:F.NUN, c:C.BLUE, align:'center' }); s.text(ox + 186, 288, 'own token', { fs:12, ff:F.NUN, c:C.BLUE, align:'center' }); }
  });
  const rows = [['laptop asleep', ['✓ works', '✗ stops', '✓ works']], ['adding a server', ['✓ automatic', '✓ nothing to set up', '✗ sign in again']], ['refresh token lives', ['cloud', 'home machine only', 'every machine']]];
  rows.forEach(([name, v], r) => {
    const y = 326 + r * 40;
    s.line(0, y - 8, [[0, 0], [740, 0]], { c:C.LIGHT, sw:1, guide:true });
    s.text(0, y + 2, name, { fs:14, c:C.GRAY });
    v.forEach((t, i) => s.text(150 + i * 200, y + 2, t, { fs:15, c:t.startsWith('✓') ? C.GREEN : t.startsWith('✗') ? C.RED : C.INK }));
  });
});
