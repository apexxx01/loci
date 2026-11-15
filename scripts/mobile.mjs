// Phone-width screenshots of the landing page at a few scroll points.
export default async function run({ frame, page, workspaceRoot }) {
  const target = frame ?? page;
  await page.setViewportSize({ width: 390, height: 844 });
  await new Promise((r) => setTimeout(r, 1500));
  const out = [];
  for (const [i, name] of [[0, 'p0'], [1, 'p1'], [4, 'p4'], [7, 'p7']]) {
    await target.evaluate((idx) => {
      const l = document.querySelector('.landing');
      const s = l.querySelectorAll('section.s')[idx];
      l.scrollTop = s.offsetTop + (idx === 0 ? 0 : s.offsetHeight / 2 - l.clientHeight / 2);
    }, i);
    await new Promise((r) => setTimeout(r, 2600));
    await page.screenshot({ path: `${workspaceRoot}/artifacts/${name}.png` });
    out.push(name);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  console.log('__RESULT__' + JSON.stringify(out));
}
