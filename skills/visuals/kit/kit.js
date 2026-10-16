// Excalidraw scene kit: shapes by id, arrows connected by id (never hand-placed), and a lint that measures the
// exported geometry. Loaded by build.js into a headless page; scene files get (K, s) — see SKILL.md for the API.
window.Kit = function Kit(X, opt = {}) {
  const C = { INK:'#1e1e1e', GRAY:'#868e96', LIGHT:'#dee2e6', BLUE:'#1971c2', BLUEF:'#d0ebff', GREEN:'#2f9e44', GREENF:'#d3f9d8',
              RED:'#e03131', REDF:'#ffe3e3', YEL:'#ffec99', ORS:'#e8590c', ORF:'#ffe8cc', WHITE:'#ffffff' };
  const F = { HAND:5, NUN:6, CODE:8 };
  const ROUGH = opt.rough ?? 1;

  // Text size comes from Excalidraw itself, so layout math matches the export (fonts must be loaded first: warmup()).
  const measure = (text, fs = 16, ff = F.HAND) => {
    const [e] = X.convertToExcalidrawElements([{ type:'text', x:0, y:0, text, fontSize:fs, fontFamily:ff }]);
    return { w:e.width, h:e.height };
  };
  // Headless, Excalidraw measures text with a fallback font (~10% narrower than what it draws), so every layout ends up
  // with text wider than planned. Fix: export one text per family with all common glyphs and keep that SVG in the page;
  // its embedded @font-face rules make measuring use the real fonts.
  async function warmup() {
    const chars = Array.from({ length:95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '’‘“”…·•–—✓✗×→←↑↓€äöüÄÖÜß⌘›‹';
    const els = X.convertToExcalidrawElements([F.HAND, F.NUN, F.CODE].map((ff, i) => ({ type:'text', x:0, y:i * 30, text:chars, fontSize:16, fontFamily:ff })));
    const svg = await X.exportToSvg({ elements:els, appState:{ exportBackground:false }, files:null });
    svg.style.cssText = 'position:absolute;left:-99999px;top:0'; document.body.appendChild(svg);
    await document.fonts.ready; await new Promise(r => setTimeout(r, 1000));
    const probe = X.convertToExcalidrawElements([{ type:'text', x:0, y:0, text:'mail provider', fontSize:15, fontFamily:F.HAND }])[0].width;
    if (probe < 86) throw new Error(`fonts not active for measuring (width ${probe})`);
  }

  function scene(sopt = {}) {
    const els = [], shapes = {};
    const base = o => ({ strokeColor:o.c || C.INK, strokeWidth:o.sw || 2, roughness:o.rough ?? ROUGH, ...(o.dash ? { strokeStyle:'dashed' } : {}) });

    // Text: x is the left edge, or the centre with align:'center' (computed from the real width).
    function text(x, y, t, o = {}) {
      const fs = o.fs || 16, ff = o.ff || F.HAND, m = measure(t, fs, ff);
      const lx = o.align === 'center' ? x - m.w / 2 : o.align === 'right' ? x - m.w : x;
      // positions are already computed here; Excalidraw's own textAlign would shift centred text a second time
      els.push({ type:'text', x:lx, y, text:t, fontSize:fs, fontFamily:ff, strokeColor:o.c || C.INK, textAlign:'left' });
      return { x:lx, y, w:m.w, h:m.h };
    }
    // Box with an optional centred label. Registered by id so arrows can attach to it.
    let auto = 0;
    function box(id, x, y, w, h, o = {}) {
      id = id || `_b${auto++}`;   // id only needed when arrows attach to it
      shapes[id] = { kind:'rect', x, y, w, h };
      els.push({ type:'rectangle', id, x, y, width:w, height:h, ...base(o), backgroundColor:o.bg || 'transparent', fillStyle:'solid',
                 roundness:o.round ? { type:3 } : null, customData:{ planned:[w, h] },
                 ...(o.label ? { label:{ text:o.label, fontSize:o.fs || 15, fontFamily:o.ff || F.NUN, strokeColor:o.lc || o.c || C.INK } } : {}) });
      return shapes[id];
    }
    // Dashed area with its title in a reserved band at the top; arrows attach to its border like a box.
    function zone(id, x, y, w, h, title, o = {}) {
      box(id, x, y, w, h, { ...o, c:o.c || C.GRAY, sw:1.5, dash:true });
      if (title) text(x + 10, o.titleAt === 'bottom' ? y + h - 28 : y + 8, title, { fs:o.fs || 15, c:o.c || C.GRAY });
      shapes[id].kind = 'zone';
      return shapes[id];
    }
    // Ellipse/cloud-ish bubble; label drawn as separate centred text (a bound label would make Excalidraw resize it).
    function oval(id, x, y, w, h, o = {}) {
      id = id || `_o${auto++}`;
      shapes[id] = { kind:'oval', x, y, w, h };
      els.push({ type:'ellipse', id, x, y, width:w, height:h, ...base(o), backgroundColor:o.bg || 'transparent', fillStyle:'solid' });
      if (o.label) { const fs = o.fs || 15, ff = o.ff || F.HAND, m = measure(o.label, fs, ff); text(x + w / 2, y + h / 2 - m.h / 2, o.label, { fs, ff, c:o.lc || o.c || C.INK, align:'center' }); }
      return shapes[id];
    }
    // Small circle (timeline events). Optional number inside.
    function dot(id, cx, cy, o = {}) {
      const r = o.radius || 8;
      shapes[id] = { kind:'dot', x:cx - r, y:cy - r, w:2 * r, h:2 * r, cx, cy, r };
      els.push({ type:'ellipse', id, x:cx - r, y:cy - r, width:2 * r, height:2 * r, ...base(o), backgroundColor:o.bg || C.WHITE, fillStyle:'solid' });
      if (o.label) { const fs = o.fs || 12, m = measure(o.label, fs, F.NUN); text(cx, cy - m.h / 2, o.label, { fs, ff:F.NUN, c:o.c || C.INK, align:'center' }); }
      return shapes[id];
    }
    const line = (x, y, pts, o = {}) => els.push({ type:'line', x, y, points:pts, ...base(o), ...(o.guide ? { customData:{ guide:true } } : {}) });
    const highlight = (x, y, w, h) => els.push({ type:'rectangle', x, y, width:w, height:h, strokeColor:'transparent', backgroundColor:C.YEL,
                                                  fillStyle:'solid', strokeWidth:1, roughness:2, customData:{ highlight:true } });

    // Where an arrow leaves/enters a shape: middle of a side, or `at` (0..1) along it.
    function port(s, side, at = 0.5, gap = 0) {
      if (s.kind === 'dot') {
        const d = { right:[1,0], left:[-1,0], top:[0,-1], bottom:[0,1] }[side];
        return [s.cx + d[0] * (s.r + gap), s.cy + d[1] * (s.r + gap)];
      }
      if (side === 'right') return [s.x + s.w + gap, s.y + s.h * at];
      if (side === 'left') return [s.x - gap, s.y + s.h * at];
      if (side === 'top') return [s.x + s.w * at, s.y - gap];
      return [s.x + s.w * at, s.y + s.h + gap];
    }
    function autoSides(a, b) {
      const dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
      if (b.y >= a.y + a.h) return ['bottom', 'top'];
      if (b.y + b.h <= a.y) return ['top', 'bottom'];
      return dx > 0 ? ['right', 'left'] : ['left', 'right'];
    }
    // Point where the line from a shape's centre towards (tx,ty) leaves its outline, pushed out by gap.
    function edge(s, tx, ty, gap) {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2, dx = tx - cx, dy = ty - cy, L = Math.hypot(dx, dy) || 1;
      const t = s.kind === 'dot' ? s.r : s.kind === 'oval' ? L / Math.hypot(dx / (s.w / 2), dy / (s.h / 2)) : Math.min(dx ? (s.w / 2) / Math.abs(dx) : Infinity, dy ? (s.h / 2) / Math.abs(dy) : Infinity) * L;
      return [cx + dx / L * (t + gap), cy + dy / L * (t + gap)];
    }
    // Arrow between two shapes.
    //   route 'straight' (default): diagonal from outline to outline. stopAt:0..1 = the call never arrives (ends in ✗).
    //   route 'square': horizontal/vertical only; from/to: 'top'|'bottom'|'left'|'right', fromAt/toAt: 0..1 along that side,
    //     at: where the middle bend goes, via: explicit bend points. Giving from/to/via implies 'square'.
    //   label: beside the longest segment; labelSide 'left'|'right'|'above'|'below', labelAt 0..1; lc/lfs colour/size.
    //   c, sw, dash, head ('arrow'|'bar'|'dot'|'triangle'), both, noHead, startGap/endGap.
    function link(fromId, toId, o = {}) {
      const a = shapes[fromId], b = shapes[toId];
      if (!a || !b) throw new Error(`link ${fromId}->${toId}: unknown shape`);
      if ((o.route || sopt.route || opt.route || 'straight') === 'straight' && !o.via && !o.from && !o.to) {
        // diagonal: centre to centre, optionally aimed at a point along the target (toAt / fromAt as x or y offsets)
        const ac = [a.x + a.w / 2 + (o.fromDx || 0), a.y + a.h / 2], bc = [b.x + b.w / 2 + (o.toDx || 0), b.y + b.h / 2];
        const shift = (s, c, dx) => dx ? { ...s, x:s.x + dx } : s;
        const p0 = edge(shift(a, ac, o.fromDx), bc[0], bc[1], o.startGap ?? 2);
        let p1 = edge(shift(b, bc, o.toDx), ac[0], ac[1], o.endGap ?? 6);
        if (o.stopAt) {   // the call never arrives: stop part-way and draw a cross
          p1 = [p0[0] + (p1[0] - p0[0]) * o.stopAt, p0[1] + (p1[1] - p0[1]) * o.stopAt];
          const k = 7, c = o.c || C.INK;
          line(p1[0] - k, p1[1] - k, [[0, 0], [2 * k, 2 * k]], { c, sw:2.2, rough:0.6 }); line(p1[0] + k, p1[1] - k, [[0, 0], [-2 * k, 2 * k]], { c, sw:2.2, rough:0.6 });
          p1 = [p1[0] - (p1[0] - p0[0]) / Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 11, p1[1] - (p1[1] - p0[1]) / Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 11];
          o = { ...o, noHead:true };
        }
        return push([p0, p1], fromId, toId, o);
      }
      let [sa, sb] = autoSides(a, b); sa = o.from || sa; sb = o.to || sb;
      const p0 = port(a, sa, o.fromAt ?? 0.5, o.startGap ?? 2), p1 = port(b, sb, o.toAt ?? 0.5, o.endGap ?? 6);
      const horiz = s => s === 'left' || s === 'right';
      let pts;
      if (o.via) pts = [p0, ...o.via, p1];
      else if (horiz(sa) && horiz(sb)) {
        if (Math.abs(p0[1] - p1[1]) < 1) pts = [p0, p1];
        else { const mx = o.at ?? (p0[0] + p1[0]) / 2; pts = [p0, [mx, p0[1]], [mx, p1[1]], p1]; }
      } else if (!horiz(sa) && !horiz(sb)) {
        if (Math.abs(p0[0] - p1[0]) < 1) pts = [p0, p1];
        else { const my = o.at ?? (p0[1] + p1[1]) / 2; pts = [p0, [p0[0], my], [p1[0], my], p1]; }
      } else if (horiz(sa)) pts = [p0, [p1[0], p0[1]], p1];
      else pts = [p0, [p0[0], p1[1]], p1];
      return push(pts, fromId, toId, o);
    }
    function push(pts, fromId, toId, o) {
      const [x0, y0] = pts[0];
      els.push({ type:'arrow', x:x0, y:y0, points:pts.map(([x, y]) => [x - x0, y - y0]), ...base({ sw:1.6, ...o }),
                 startArrowhead:o.both ? 'arrow' : null, endArrowhead:o.noHead ? null : (o.head || 'arrow'),
                 customData:{ from:fromId, to:toId } });
      if (o.label) {
        let best = 0, bl = -1;
        for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (l > bl) { bl = l; best = i; } }
        const [q0, q1] = [pts[best], pts[best + 1]], mx = (q0[0] + q1[0]) / 2, my = (q0[1] + q1[1]) / 2;
        const fs = o.lfs || 13, m = measure(o.label, fs);
        const vertical = Math.abs(q0[0] - q1[0]) < 1, flat = Math.abs(q0[1] - q1[1]) < 1;
        if (!vertical && !flat) {
          const pos = o.labelAt ?? 0.5, px = q0[0] + (q1[0] - q0[0]) * pos, py = q0[1] + (q1[1] - q0[1]) * pos, L = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
          let nx = -(q1[1] - q0[1]) / L, ny = (q1[0] - q0[0]) / L; if ((o.labelSide === 'left') === (nx > 0)) { nx = -nx; ny = -ny; }
          const d = 8 + Math.abs(nx) * m.w / 2 + Math.abs(ny) * m.h / 2;
          text(px + nx * d, py + ny * d - m.h / 2, o.label, { fs, c:o.lc || o.c || C.INK, align:'center' });
          return;
        }
        const side = o.labelSide || (vertical ? 'right' : 'above');
        const lc = o.lc || o.c || C.INK, pos = o.labelAt ?? 0.5;
        const cx = q0[0] + (q1[0] - q0[0]) * pos, cy = q0[1] + (q1[1] - q0[1]) * pos;
        if (side === 'right') text(cx + 8, cy - m.h / 2, o.label, { fs, c:lc });
        else if (side === 'left') text(cx - 8, cy - m.h / 2, o.label, { fs, c:lc, align:'right' });
        else if (side === 'above') text(cx, cy - m.h - 5, o.label, { fs, c:lc, align:'center' });
        else text(cx, cy + 6, o.label, { fs, c:lc, align:'center' });
      }
    }
    const raw = el => els.push(el);   // any Excalidraw skeleton element, for what the helpers don't cover
    return { els, shapes, text, box, oval, zone, dot, line, highlight, link, port, raw };
  }

  // ---------- lint: geometry of the converted elements ----------
  function lint(elements, o = {}) {
    const W = o.column || 728, issues = [];
    const live = elements.filter(e => !e.isDeleted);
    const shapes = live.filter(e => (e.type === 'rectangle' || e.type === 'ellipse' || e.type === 'diamond') && !e.customData?.highlight && e.strokeColor !== 'transparent');
    const box = e => e.type === 'text' ? { x:e.x, y:e.y + e.fontSize * 0.12, w:e.width, h:e.height - e.fontSize * 0.24 } : { x:e.x, y:e.y, w:e.width, h:e.height };
    const inside = (a, b, p = 0) => a.x >= b.x - p && a.y >= b.y - p && a.x + a.w <= b.x + b.w + p && a.y + a.h <= b.y + b.h + p;
    const overlap = (a, b, p = 0) => a.x < b.x + b.w - p && b.x < a.x + a.w - p && a.y < b.y + b.h - p && b.y < a.y + a.h - p;
    // containers = shapes that hold another shape (zones, frames, windows): crossing them is fine, crossing their border with text is not
    const isContainer = s => shapes.some(t => t !== s && inside(box(t), box(s)) && t.width * t.height < s.width * s.height);
    const containers = new Set(shapes.filter(isContainer).map(s => s.id));
    const texts = live.filter(e => e.type === 'text');
    const free = texts.filter(t => !t.containerId);
    const label = t => JSON.stringify(t.text.replace(/\n/g, ' ').slice(0, 32));
    const name = s => { const l = texts.find(t => t.containerId === s.id); return l ? label(l) : `${s.type}@${Math.round(s.x)},${Math.round(s.y)}`; };
    const GUIDE = ['#dee2e6', '#ced4da', '#e9ecef'];
    const strokes = live.filter(e => (e.type === 'arrow' || e.type === 'line') && !e.customData?.guide && !GUIDE.includes(e.strokeColor));
    const guides = live.filter(e => e.type === 'line' && (e.customData?.guide || GUIDE.includes(e.strokeColor)));
    const segs = e => { const p = e.points.map(([x, y]) => [e.x + x, e.y + y]), r = []; for (let i = 0; i < p.length - 1; i++) r.push([p[i], p[i + 1]]); return r; };
    // segment vs rectangle (Liang-Barsky)
    const hits = ([[x0, y0], [x1, y1]], b) => {
      let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0;
      for (const [p, q] of [[-dx, x0 - b.x], [dx, b.x + b.w - x0], [-dy, y0 - b.y], [dy, b.y + b.h - y0]]) {
        if (p === 0) { if (q < 0) return false; } else { const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
      }
      return t1 - t0 > 1e-6;
    };
    const grow = (b, p) => ({ x:b.x - p, y:b.y - p, w:b.w + 2 * p, h:b.h + 2 * p });
    const add = (kind, msg, b) => issues.push({ kind, msg, box:b && { x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.w), h:Math.round(b.h) } });
    const near = (pt, s) => { const b = box(s), dx = Math.max(b.x - pt[0], 0, pt[0] - b.x - b.w), dy = Math.max(b.y - pt[1], 0, pt[1] - b.y - b.h);
                              const inn = pt[0] > b.x && pt[0] < b.x + b.w && pt[1] > b.y && pt[1] < b.y + b.h;
                              return inn ? Math.min(pt[0] - b.x, b.x + b.w - pt[0], pt[1] - b.y, b.y + b.h - pt[1]) : Math.hypot(dx, dy); };

    for (const e of strokes) {
      const ss = segs(e), pts = e.points.map(([x, y]) => [e.x + x, e.y + y]), ends = [pts[0], pts[pts.length - 1]];
      const kind = e.type === 'arrow' ? 'arrow' : 'line';
      // which shapes this stroke attaches to (declared, or the shape whose border is nearest an end)
      const own = new Set([e.customData?.from, e.customData?.to].filter(Boolean));
      if (e.type === 'arrow') {
        if (!e.customData?.to) ends.forEach((pt, i) => {
          const cand = shapes.filter(s => !containers.has(s.id) || own.has(s.id)).map(s => [s, near(pt, s)]).sort((a, b) => a[1] - b[1])[0];
          if (cand && cand[1] <= 12) own.add(cand[0].id);
          else if (i === 1 || e.startArrowhead) add('arrow-floats', `arrow ${i ? 'end' : 'start'} is not on any box (nearest ${cand ? Math.round(cand[1]) + 'px' : 'none'})`, { x:pt[0] - 6, y:pt[1] - 6, w:12, h:12 });
        });
      }
      for (const t of free) if (ss.some(sg => hits(sg, grow(box(t), 2)))) add(`${kind}-over-text`, `${kind} crosses text ${label(t)}`, box(t));
      if (e.type === 'arrow') {
        const end = pts[pts.length - 1], HEAD = e.endArrowhead ? 14 : 4;   // arrowheads/bars reach ~14px around the end point
        const ownShapes = shapes.filter(sh => own.has(sh.id)), dist = (b1, b2) => Math.hypot(Math.max(b2.x - b1.x - b1.w, 0, b1.x - b2.x - b2.w), Math.max(b2.y - b1.y - b1.h, 0, b1.y - b2.y - b2.h));
        // text that belongs to the target (inside it, or its caption right next to it) is expected near the head
        for (const t of free.filter(t => !ownShapes.some(sh => dist(box(t), box(sh)) < 10))) { const b = box(t), dx = Math.max(b.x - end[0], 0, end[0] - b.x - b.w), dy = Math.max(b.y - end[1], 0, end[1] - b.y - b.h);
          if (Math.hypot(dx, dy) < HEAD + 6 && !ss.some(sg => hits(sg, grow(b, 2)))) add('end-near-text', `arrow ends ${Math.round(Math.hypot(dx, dy))}px from text ${label(t)}`, { x:end[0] - 8, y:end[1] - 8, w:16, h:16 }); }
        for (const g of guides) for (const [[gx0, gy0], [gx1, gy1]] of segs(g)) {
          const L = Math.hypot(gx1 - gx0, gy1 - gy0) || 1, t = Math.max(0, Math.min(1, ((end[0] - gx0) * (gx1 - gx0) + (end[1] - gy0) * (gy1 - gy0)) / (L * L)));
          const d = Math.hypot(end[0] - gx0 - t * (gx1 - gx0), end[1] - gy0 - t * (gy1 - gy0));
          const onShape = shapes.some(sh => own.has(sh.id) && near(end, sh) < 10);
          if (d < HEAD + 3 && !onShape) add('end-on-guide', `arrow ends ${Math.round(d)}px from a lane/guide line`, { x:end[0] - 8, y:end[1] - 8, w:16, h:16 });
        }
      }
      if (e.type === 'arrow') {
        const len = ss.reduce((t, [a, b]) => t + Math.hypot(b[0] - a[0], b[1] - a[1]), 0), heads = !!e.endArrowhead + !!e.startArrowhead;
        if (heads && len < (heads === 2 ? 56 : 12)) add('arrow-too-short', `arrow is ${Math.round(len)}px long for ${heads} head(s); move the shapes apart or drop a head`, { x:pts[0][0] - 6, y:pts[0][1] - 6, w:12, h:12 });
      }
      if (e.type === 'arrow' && e.endArrowhead) {
        const [q0, q1] = ss[ss.length - 1], L = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) || 1, k = Math.min(1, 18 / L);
        const tail = [q1[0] - (q1[0] - q0[0]) * k, q1[1] - (q1[1] - q0[1]) * k], isIn = (p, b) => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h;
        for (const s of shapes) if (containers.has(s.id) && !own.has(s.id) && isIn(tail, box(s)) !== isIn(q1, box(s))) add('head-on-border', `arrowhead sits on the border of ${name(s)}; give the target more room inside`, { x:q1[0] - 10, y:q1[1] - 18, w:20, h:20 });
      }
      for (const s of shapes) {
        if (own.has(s.id) || containers.has(s.id)) continue;
        if (e.type === 'line' && pts.every(([x, y]) => x >= s.x - 1 && x <= s.x + s.width + 1 && y >= s.y - 1 && y <= s.y + s.height + 1)) continue;   // drawn on it (icon detail)
        if (ss.some(sg => hits(sg, grow(box(s), -3)))) add(`${kind}-through-box`, `${kind} runs through ${name(s)}`, box(s));
      }
      if (e.type === 'arrow') for (const f of strokes) {
        if (f === e || f.type !== 'arrow' || f.id < e.id) continue;
        for (const a of ss) for (const b of segs(f)) {
          const d = (a[1][0] - a[0][0]) * (b[1][1] - b[0][1]) - (a[1][1] - a[0][1]) * (b[1][0] - b[0][0]); if (Math.abs(d) < 1e-9) continue;
          const u = ((b[0][0] - a[0][0]) * (b[1][1] - b[0][1]) - (b[0][1] - a[0][1]) * (b[1][0] - b[0][0])) / d;
          const v = ((b[0][0] - a[0][0]) * (a[1][1] - a[0][1]) - (b[0][1] - a[0][1]) * (a[1][0] - a[0][0])) / d;
          if (u > 0.02 && u < 0.98 && v > 0.02 && v < 0.98) { const x = a[0][0] + u * (a[1][0] - a[0][0]), y = a[0][1] + u * (a[1][1] - a[0][1]); add('arrows-cross', 'two arrows cross', { x:x - 6, y:y - 6, w:12, h:12 }); }
        }
      }
    }
    for (const g of guides) for (const t of free.filter(t => !shapes.some(sh => !containers.has(sh.id) && inside(box(t), box(sh), 1)))) if (segs(g).some(sg => hits(sg, grow(box(t), 1)))) add('guide-over-text', `lane/guide line runs through text ${label(t)}`, box(t));
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++)
      if (overlap(box(free[i]), box(free[j]), 1)) add('text-over-text', `${label(free[i])} overlaps ${label(free[j])}`, box(free[i]));
    // text sitting on an opaque small shape (number in a badge) is covered by it; skip border checks for it
    const onBadge = t => shapes.some(sh => !containers.has(sh.id) && sh.backgroundColor !== 'transparent' && inside(box(t), box(sh), 1));
    for (const t of free.filter(t => !onBadge(t))) for (const s of shapes) {
      const tb = box(t), sb = box(s);
      if (overlap(tb, sb, 1) && !inside(tb, sb, 1)) add('text-on-border', `text ${label(t)} sticks out of ${name(s)}`, tb);
    }
    for (const s of shapes) if (!containers.has(s.id)) for (const z of shapes) {
      if (z !== s && containers.has(z.id) && overlap(box(s), box(z), 1) && !inside(box(s), box(z), 1)) add('box-on-border', `${name(s)} sticks out of ${name(z)}`, box(s));
    }
    for (const s of shapes) { const p = s.customData?.planned;
      if (p && (Math.abs(s.width - p[0]) > 1 || Math.abs(s.height - p[1]) > 1)) add('box-resized', `${name(s)} grew from ${p[0]}×${p[1]} to ${Math.round(s.width)}×${Math.round(s.height)} to fit its label`, box(s)); }
    for (const t of texts.filter(t => t.containerId)) {
      const s = live.find(e => e.id === t.containerId); if (s && (t.width > s.width - 8 || t.height > s.height - 4)) add('label-too-big', `label ${label(t)} does not fit its box`, box(s));
    }
    // size in the chat column
    const xs = live.flatMap(e => e.points ? e.points.map(([x]) => e.x + x) : [e.x, e.x + (e.width || 0)]), width = Math.max(...xs) - Math.min(...xs) + 24;
    const scale = Math.min(1, W / width), minFs = Math.min(...texts.map(t => t.fontSize));
    if (minFs * scale < 11) add('too-small', `smallest text renders at ${(minFs * scale).toFixed(1)}px in the ${W}px column (scale ${scale.toFixed(2)})`);
    // de-duplicate
    const seen = new Set();
    return { issues:issues.filter(i => { const k = i.kind + i.msg; if (seen.has(k)) return false; seen.add(k); return true; }), width:Math.round(width), scale:+scale.toFixed(2) };
  }

  // Red boxes over every issue, for looking at the problems instead of hunting for them.
  function marks(issues) {
    return X.convertToExcalidrawElements(issues.filter(i => i.box).map(i => ({ type:'rectangle', x:i.box.x - 3, y:i.box.y - 3, width:i.box.w + 6, height:i.box.h + 6,
      strokeColor:'#ff0000', backgroundColor:'transparent', strokeWidth:2, roughness:0 })));
  }

  async function exportScene(skel, o = {}) {
    const els = X.convertToExcalidrawElements(skel, { regenerateIds:false });
    const res = lint(els, o);
    const ex = async es => X.exportToSvg({ elements:es, appState:{ exportBackground:false, viewBackgroundColor:'#ffffff', exportPadding:12 }, files:null, exportPadding:12 });
    const svg = await ex(els), dbg = await ex([...els, ...marks(res.issues)]);
    return { svg:svg.outerHTML, debug:dbg.outerHTML, json:X.serializeAsJSON(els, { viewBackgroundColor:'#ffffff' }, {}, 'local'),
             w:svg.getAttribute('width'), h:svg.getAttribute('height'), lint:res };
  }
  return { C, F, measure, warmup, scene, lint, marks, exportScene };
};
