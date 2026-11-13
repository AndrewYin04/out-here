// Uses an existing Playwright installation; does not add repository dependencies.
// node tools/muse-viewer/verify.cjs /absolute/path/to/playwright [chromium-executable]
const { chromium } = require(process.argv[2] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const folder = path.join(__dirname, 'screenshots');
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], warnings = [], states = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  try {
    await page.goto(process.env.MUSE_VIEWER_URL || 'http://127.0.0.1:8765/tools/muse-viewer/');
    await page.waitForSelector('body[data-ready="true"]', { timeout: 60000 });
    async function inspect() {
      return page.evaluate(() => {
        const v = window.museViewer;
        return { ...v.state, actions: [...v.actions].map(([name, a]) => ({ name, weight: a.getEffectiveWeight(), running: a.isRunning() })),
          museRotation: v.model.getObjectByName('Muse').rotation.toArray(),
          eyes: v.model.getObjectByName('Muse_EyeL').scale.toArray(),
          dots: v.model.getObjectByName('Muse_ThinkingDots').scale.toArray(),
          bubble: v.model.getObjectByName('Muse_SpeechBubble').scale.toArray() };
      });
    }
    async function checkEyeContact() {
      const pose = await page.evaluate(async () => {
        const THREE = await import('three');
        const v=window.museViewer, muse=v.model.getObjectByName('Muse');
        const face=new THREE.Vector3(0,.418,.102).applyMatrix4(muse.matrixWorld);
        const toCamera=v.camera.position.clone().sub(face).normalize();
        const forward=muse.getWorldDirection(new THREE.Vector3());
        const center=new THREE.Vector3(0,.275,0).applyMatrix4(muse.matrixWorld);
        const targetError=center.distanceTo(v.controls.target);
        const projected=center.clone().project(v.camera);
        return { facingDot:forward.dot(toCamera),targetError,screenCenter:[projected.x,projected.y],
          personPosition:v.model.getObjectByName('Person').position.toArray() };
      });
      assert(pose.facingDot>.9999, `Muse must face camera: ${JSON.stringify(pose)}`);
      assert(pose.targetError<.01, `Camera must target Muse: ${JSON.stringify(pose)}`);
      assert(Math.abs(pose.screenCenter[0])<.01 && Math.abs(pose.screenCenter[1])<.01);
      assert.deepEqual(pose.personPosition,[0,0,0]);
      return pose;
    }
    for (const muse of ['follow_back', 'thinking', 'talk_front']) {
      await page.locator(`[data-muse="${muse}"]`).click();
      await page.waitForTimeout(800);
      assert.equal(await page.locator(`[data-muse="${muse}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#bubble').isVisible(), muse === 'talk_front');
      const state = await inspect();
      assert.equal(state.muse, muse); assert.equal(state.person, 'person_idle');
      states.push(state);
      if(muse==='follow_back') {
        const anchor=await page.evaluate(()=>window.museViewer.model.getObjectByName('Muse').position.toArray());
        assert(Math.abs(anchor[0]+.35)<.001 && Math.abs(anchor[2]+.25)<.001);
        const dimensions=await page.evaluate(async()=>{
          const T=await import('three'),m=window.museViewer.model.getObjectByName('Muse');
          const bounds=new T.Box3(),inverse=m.matrixWorld.clone().invert();
          m.traverse(o=>{if(o.isMesh && !/Bubble|Dot/.test(o.name)) {
            o.geometry.computeBoundingBox();
            bounds.union(o.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld)));
          }});
          return bounds.getSize(new T.Vector3()).toArray();
        });
        assert(Math.abs(dimensions[0]-.38)<.02 && Math.abs(dimensions[1]-.55)<.008, `Muse dimensions: ${dimensions}`);
        const geometry=await page.evaluate(()=>{
          const v=window.museViewer, m=v.model.getObjectByName('Muse');
          return {headband:!!m.getObjectByName('Muse_Headband'),earcups:!!m.getObjectByName('Muse_EarcupL')&&!!m.getObjectByName('Muse_EarcupR'),
            clumps:m.getObjectByName('Muse_FurClumps')?.geometry.attributes.position.count,
            plaque:!!m.getObjectByName('Muse_Plaque'),fineStrands:!!m.getObjectByName('Muse_FineFur_DetailedOnly')};
        });
        assert(geometry.headband && geometry.earcups && geometry.clumps>100000);
        assert.equal(geometry.plaque,false);assert.equal(geometry.fineStrands,false);
      }
      if(muse==='talk_front') {
        await checkEyeContact();
        const advance=await page.evaluate(async()=>{
          const T=await import('three'),v=window.museViewer;
          const center=new T.Vector3(0,.275,0).applyMatrix4(v.model.getObjectByName('Muse').matrixWorld);
          return v.camera.position.distanceTo(new T.Vector3(-.35,1.1,-.25))-v.camera.position.distanceTo(center);
        });
        assert(Math.abs(advance-.4)<.01, `Talk advance must be 0.4 m: ${advance}`);
      }
      await page.screenshot({ path: path.join(folder, `${muse}.png`) });
    }
    for (const person of ['person_run', 'person_idle']) {
      await page.locator(`[data-person="${person}"]`).click();
      await page.waitForTimeout(800);
      const state = await inspect();
      assert.equal(state.person, person); assert.equal(state.muse, 'talk_front');
      states.push(state);
      await page.screenshot({ path: path.join(folder, `${person}.png`) });
    }
    const beforeOrbit = await page.evaluate(() => window.museViewer.camera.position.toArray());
    await page.mouse.move(900, 450); await page.mouse.down();
    await page.mouse.move(1150, 450, { steps: 20 }); await page.mouse.up();
    await page.waitForTimeout(500);
    assert.notDeepEqual(await page.evaluate(() => window.museViewer.camera.position.toArray()), beforeOrbit);
    await checkEyeContact();
    await page.screenshot({path:path.join(folder,'talk_front-orbit.png')});
    await page.locator('[data-muse="thinking"]').click();
    // Inspect the thinking face from +X, toward which the asset turns.
    await page.evaluate(() => {
      const v = window.museViewer;
      v.camera.position.set(3, 1.9, 0.4); v.controls.update();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(folder, 'thinking-face-inspection.png') });
    await page.locator('[data-muse="follow_back"]').click();
    await page.evaluate(() => {
      const v=window.museViewer;
      v.camera.position.set(-4,1.3,0); v.controls.update();
    });
    await page.waitForTimeout(800);
    await page.screenshot({path:path.join(folder,'follow-side-clearance.png')});
    await page.evaluate(() => {
      const v = window.museViewer;
      v.camera.position.set(-2.2, 1.9, -4.3); v.controls.target.set(-0.15, 1, 0); v.controls.update();
    });
    // Reusing actions during an unfinished fade must not leave old clips running.
    for (const muse of ['follow_back', 'thinking', 'follow_back', 'talk_front']) await page.locator(`[data-muse="${muse}"]`).click();
    await page.waitForTimeout(700);
    const rapid = await inspect();
    assert.equal(rapid.actions.find(a => a.name === 'talk_front').weight, 1);
    assert.equal(rapid.actions.find(a => a.name === 'person_idle').weight, 1);
    assert(rapid.actions.filter(a => ['follow_back', 'thinking'].includes(a.name)).every(a => !a.running));
    await page.locator('#demo').click();
    for (const expected of ['follow_back','thinking','talk_front','follow_back']) {
      await page.waitForFunction(expected=>window.museViewer.state.muse===expected,expected,{timeout:12000});
      assert.equal((await inspect()).muse, expected);
    }
    await page.locator('[data-person="person_run"]').click();
    assert.equal((await inspect()).autoDemo, true);
    await page.locator('[data-muse="thinking"]').click();
    assert.equal((await inspect()).autoDemo, false);
    await page.locator('[data-person="person_idle"]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(folder, 'mobile-thinking.png') });
    await page.locator('[data-muse="talk_front"]').click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(folder, 'mobile-talk_front.png') });
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.deepEqual(errors, []);
    await page.setViewportSize({width:1440,height:820});
    await page.goto(new URL('renders.html',page.url()).href);
    await page.waitForLoadState('networkidle');
    await page.screenshot({path:path.join(folder,'render-comparison.png')});
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(folder, 'verification.json'), JSON.stringify({ passed: true, errors, warnings, states, checks: ['All five buttons', 'Independent Muse/person playback', 'Muse 0.55 m height / 0.38 m width', 'Correct follow placement', 'Talk eye contact before and after orbiting', 'Camera targets and centers Muse', 'Person stays at origin', 'OrbitControls drag', 'Rapid crossfades', 'Auto demo timing and loop', 'Manual Muse selection stops demo', 'Mobile screenshots', 'Render comparison screenshot', 'No console errors'] }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, errors, warnings, states }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
