import {expect,test} from '@playwright/test';

// Development-only, explicitly labelled simulation. No availability or agent transport is faked
// as a production service. Runs against the existing map renderer and chat.
test('labelled encounter sends no messages, meets, and releases the extra actor', async({page},info)=>{
  test.skip(process.env.E2E_DEV !== '1','The opt-in simulation is intentionally disabled in production. Run with E2E_DEV=1 against next dev.');
  let forbiddenCalls=0;
  page.on('request',r=>{if(r.method()==='POST' && /\/api\/(muse\/(plan|encounters)|invites|messages)/.test(r.url()))forbiddenCalls++;});
  await page.goto('/out-here?as=alex&view=3d&encounterDemo=1');
  await expect(page.getByTestId('world-3d')).toHaveAttribute('data-scene-ready','true',{timeout:20000});
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/friends')),page.getByTestId('muse-launcher').click()]);
  await expect(page.getByTestId('muse-state-label')).toContainText('Simulation only');
  await page.getByTestId('muse-input').fill('Is Maya free to get food?');await page.getByTestId('muse-send').click();
  const peers=async()=>await page.getByTestId('world-3d').count() ? Number(await page.getByTestId('world-3d').getAttribute('data-agent-peers')) : 0;
  await expect.poll(peers,{timeout:10000}).toBe(1);
  await page.waitForTimeout(1700);await page.screenshot({path:info.outputPath('meeting.png')});
  await expect(page.getByTestId('muse-msg-muse').last()).toContainText('No message was sent');
  await expect.poll(peers,{timeout:20000}).toBe(0);
  expect(forbiddenCalls).toBe(0);
  // Software WebGL can activate the existing low-FPS fallback. Its disposed scene
  // must release peers too; re-enter to exercise cancellation independently.
  if (!await page.getByTestId('world-3d').count()) {
    info.annotations.push({type:'performance',description:'Existing low-FPS map fallback activated in software WebGL.'});
    await page.getByRole('button',{name:'3D',exact:true}).click();
    await expect(page.getByTestId('world-3d')).toHaveAttribute('data-scene-ready','true',{timeout:20000});
  }
  await page.getByTestId('muse-input').fill('Is Maya free?');await page.getByTestId('muse-send').click();
  await expect.poll(peers).toBe(1);
  await page.getByTestId('muse-close').click();
  await expect.poll(peers,{timeout:10000}).toBe(0);
});
