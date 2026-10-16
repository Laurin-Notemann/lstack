// User journey: numbered steps in reading order, grouped into stages; the step that hurts is coloured and called out.
scene('journey', (K, s) => {
  const { C, F } = K;
  s.text(0, 0, 'Your first payroll run', { fs:24 });
  s.text(2, 36, 'what a new HR admin does, in order', { fs:16, c:C.GRAY });
  const stages = [['set up once', C.BLUE], ['per employee', C.GREEN], ['every month', C.ORS]];
  const steps = [['Legal entity', 'the company that pays'], ['Payroll settings', 'proration, period start'], ['Pay types', 'salary, recurring, one-time'],
                 ['Employee profile', 'department, hours → FTE'], ['Pay values', 'amount + start date'], ['Time off + attendance', 'feeds hourly pay'],
                 ['Monthly breakdown', 'computed for you'], ['Payroll run', 'entity × group × month'], ['Approve → export', 'file for the tax advisor']];
  const HARD = 4;   // index of the confusing step
  stages.forEach(([name, c], si) => {
    const y = 80 + si * 132;
    s.text(0, y, name, { fs:16, c });
    for (let k = 0; k < 3; k++) {
      const i = si * 3 + k, x = 14 + k * 236, yy = y + 34, hard = i === HARD;
      s.box('st' + i, x, yy, 212, 62, { c:hard ? C.RED : c, sw:1.6, bg:hard ? C.REDF : 'transparent' });
      s.dot('n' + i, x, yy, { radius:11, sw:1.5, c:hard ? C.RED : c, label:String(i + 1), fs:12 });
      s.text(x + 20, yy + 10, steps[i][0], { fs:15 });
      s.text(x + 20, yy + 34, steps[i][1], { fs:12, c:C.GRAY });
      if (k > 0) s.link('st' + (i - 1), 'st' + i, { c, route:'square' });
    }
  });
  // wrap to the next stage (after all boxes exist)
  [0, 1].forEach(si => s.link('st' + (si * 3 + 2), 'st' + (si * 3 + 3), { from:'bottom', to:'top', at:80 + si * 132 + 113, c:C.GRAY, dash:true, sw:1.2 }));
  s.highlight(0, 482, 400, 28);
  s.text(8, 485, 'Step 5 is the one that confuses: no end dates.', { fs:16 });
});
