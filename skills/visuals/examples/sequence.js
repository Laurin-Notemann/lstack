// Sequence over time: lanes = where things happen, dots = events in order, arrows = what caused what.
// Labels go on the side the arrows don't use (above / below / belowleft). A failed call: link(..., { stopAt }).
scene('sequence', (K, s) => {
  const { C } = K;
  s.text(0, 0, 'Why the clock-out never reached the server', { fs:24 });
  s.text(2, 36, 'one morning, in order · time runs left to right', { fs:16, c:C.GRAY });
  const lanes = { screen:['phone screen', 140], store:['phone storage', 230], server:['server', 320], office:['office view', 410] };
  for (const [n, y] of Object.values(lanes)) {
    s.text(0, y - 10, n, { fs:15, c:C.GRAY });
    s.line(130, y, [[0, 0], [640, 0]], { c:C.LIGHT, sw:1.5, dash:true, guide:true });
  }
  const ev = (id, n, x, lane, label, o = {}) => {
    const y = lanes[lane][1], lines = label.split('\n'), at = o.at || 'below', c = o.c || C.INK;
    s.dot(id, x, y, { radius:13, sw:1.5, label:String(n), fs:13, c, bg:o.bg || C.WHITE });
    lines.forEach((ln, i) => {
      if (at === 'below') s.text(x, y + 20 + i * 17, ln, { fs:14, c, align:'center' });
      else if (at === 'above') s.text(x, y - 20 - (lines.length - i) * 17, ln, { fs:14, c, align:'center' });
      else if (at === 'belowleft') s.text(x - 10, y + 14 + i * 17, ln, { fs:14, c, align:'right' });
    });
  };
  ev('tap', 1, 190, 'screen', 'taps Stop', { at:'above' });
  ev('pick', 2, 300, 'screen', 'picks “End\nand round off”', { at:'above' });
  ev('saved', 3, 420, 'store', 'clock-out\nsaved locally', { c:C.BLUE, bg:C.BLUEF, at:'belowleft' });
  ev('leave', 4, 530, 'screen', 'leaves\nthe app', { at:'above' });
  ev('stale', 5, 640, 'server', 'still says\n“clocked in”', { c:C.RED, at:'belowleft' });
  ev('open', 6, 740, 'office', 'shows an\nopen shift', { c:C.RED });
  s.link('tap', 'pick');
  s.link('pick', 'saved', { c:C.BLUE });
  s.link('saved', 'stale', { c:C.RED, dash:true, stopAt:0.6, label:'upload fails', lc:C.RED, labelAt:0.55, labelSide:'left' });
  s.link('stale', 'open', { c:C.RED });
  s.highlight(0, 486, 330, 30);
  s.text(8, 490, 'The tap worked. The upload didn’t.', { fs:18 });
  s.text(0, 528, 'The app had the clock-out the whole time; it never got to the server.', { fs:14, c:C.GRAY });
});
