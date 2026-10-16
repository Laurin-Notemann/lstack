// Architecture: zones = where things run, boxes = parts, arrows = only the connections that answer the question.
// Crowded diagrams use route:'square' (right angles through the gaps). Zone titles go where no arrow enters
// (titleAt:'bottom' for zones entered from the top), and targets sit deep enough that arrowheads land inside the zone.
scene('architecture', (K, s) => {
  const { C, F } = K;
  s.text(0, 0, 'Where the parts run', { fs:24 });
  s.text(2, 36, 'Mail, Calendar, Home on the laptop · Code also on the server · Drive in the cloud', { fs:14, c:C.GRAY });
  const node = (id, x, y, w, label, o = {}) => s.box(id, x, y, w, 36, { label, fs:14, ...o });
  s.zone('screens', 0, 70, 760, 66, 'your screens');
  node('desk', 170, 90, 150, 'desktop app'); node('web', 360, 90, 150, 'web'); node('phone', 550, 90, 150, 'phone app');
  s.zone('laptop', 0, 196, 360, 150, 'laptop · primary environment', { c:C.BLUE });
  node('cal', 16, 232, 155, 'Calendar engine', { c:C.BLUE, bg:C.BLUEF }); node('home', 189, 232, 155, 'Home', { c:C.BLUE, bg:C.BLUEF });
  node('mailw', 16, 288, 155, 'Mail worker', { c:C.BLUE, bg:C.BLUEF }); node('codeL', 189, 288, 155, 'Code server', { c:C.BLUE });
  s.zone('fleet', 400, 196, 360, 150, 'server · second environment', { c:C.INK });
  node('codeF', 416, 232, 155, 'Code server'); node('agents', 589, 232, 155, 'agents + tools');
  s.text(589, 288, 'own files, own threads', { fs:13, c:C.GRAY }); s.text(589, 306, 'no mail or calendar', { fs:13, c:C.GRAY });
  s.zone('prov', 0, 410, 187, 136, 'mail provider', { titleAt:'bottom' });
  node('gmail', 16, 446, 155, 'Gmail / IMAP');
  s.zone('cloud', 207, 410, 553, 136, 'cloud services', { c:C.ORS, titleAt:'bottom' });
  node('relay', 223, 446, 310, 'Code relay', { c:C.ORS }); node('drive', 549, 446, 92, 'Drive', { c:C.ORS, bg:C.ORF }); node('mrelay', 653, 446, 92, 'Mail relay', { c:C.ORS });
  s.text(378, 490, 'accounts, tunnel setup', { fs:12, c:C.ORS, align:'center' });
  s.text(595, 490, 'docs, sharing', { fs:12, c:C.ORS, align:'center' });
  s.text(699, 490, 'push', { fs:12, c:C.ORS, align:'center' });
  s.link('screens', 'laptop', { fromAt:0.22, toAt:0.47, c:C.GRAY });
  s.link('screens', 'fleet', { fromAt:0.78, toAt:0.53, c:C.GRAY });
  s.text(380, 158, 'pick an environment', { fs:13, c:C.GRAY, align:'center' });
  s.link('mailw', 'gmail', { c:C.BLUE, label:'the real mailbox', lc:C.BLUE, labelAt:0.62 });
  s.link('codeL', 'relay', { toAt:(266 - 223) / 310, c:C.ORS, label:'tunnel', labelAt:0.62 });
  s.link('codeF', 'relay', { toAt:(493 - 223) / 310, c:C.ORS, label:'tunnel', labelAt:0.62 });
}, { route:'square' });
