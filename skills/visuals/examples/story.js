// Story frames: the same scenario as a short comic, one row per option, columns = moments in time.
// Best for "what actually happens to me when…" questions. Each frame: tiny props, one caption, the outcome highlighted.
scene('story', (K, s) => {
  const { C, F } = K;
  s.text(0, 0, 'What happens when your laptop sleeps?', { fs:28 });
  s.text(2, 40, 'same night, two setups for remote mail', { fs:16, c:C.GRAY });
  ['1 · evening, all fine', '2 · laptop closes', '3 · server needs mail'].forEach((c, i) => s.text(70 + i * 222, 80, c, { fs:16, c:C.GRAY }));
  const laptop = (id, x, y, sleep) => { s.box(id, x, y, 52, 32); s.line(x - 8, y + 38, [[0, 0], [68, 0]]); if (sleep) s.text(x + 6, y - 26, 'z z z', { fs:16, c:C.GRAY }); };
  const server = (id, x, y) => { s.box(id, x, y, 40, 48); s.line(x + 7, y + 15, [[0, 0], [26, 0]], { sw:1.5 }); s.line(x + 7, y + 30, [[0, 0], [26, 0]], { sw:1.5 }); };
  ['A', 'B'].forEach((k, r) => {
    const y0 = 108 + r * 196;
    s.text(8, y0 + 58, k, { fs:36, c:C.BLUE });
    for (let c = 0; c < 3; c++) {
      const x0 = 56 + c * 222, id = t => `${k}${c}${t}`;
      s.box(null, x0, y0, 210, 168, { sw:2.5 });
      laptop(id('l'), x0 + 28, y0 + 92, c > 0); server(id('s'), x0 + 146, y0 + 80);
      if (k === 'A') {
        s.oval(id('cloud'), x0 + 42, y0 + 10, 128, 44, { c:C.BLUE, label:'Cloud', fs:14 });
        if (c === 0) { s.link(id('cloud'), id('l'), { c:C.BLUE, sw:1.5 }); s.link(id('cloud'), id('s'), { c:C.BLUE, sw:1.5 }); s.text(x0 + 105, y0 + 140, 'each has own mail', { fs:15, c:C.GRAY, align:'center' }); }
        if (c === 1) s.text(x0 + 105, y0 + 140, 'nothing changes', { fs:15, c:C.GRAY, align:'center' });
        if (c === 2) { s.link(id('s'), id('cloud'), { c:C.BLUE, sw:2 }); s.highlight(x0 + 46, y0 + 134, 124, 26); s.text(x0 + 108, y0 + 136, 'still works ✓', { fs:18, c:C.GREEN, align:'center' }); }
      } else {
        s.text(x0 + 16, y0 + 14, ['laptop holds everything', 'the only copy is asleep', 'asks the laptop…'][c], { fs:15, c:C.GRAY });
        if (c === 0) s.link(id('s'), id('l'), { sw:2 });
        if (c === 2) { s.link(id('s'), id('l'), { c:C.RED, sw:2 }); s.highlight(x0 + 44, y0 + 134, 128, 26); s.text(x0 + 108, y0 + 136, 'no answer ✗', { fs:18, c:C.RED, align:'center' }); }
      }
    }
  });
});
