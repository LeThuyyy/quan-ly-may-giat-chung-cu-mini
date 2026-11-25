// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useScopedActions } from '../use-scoped-actions';
function Probe({ refresh, expired }: { refresh: () => Promise<void>; expired: () => void }) {
 const action=useScopedActions(refresh,expired);
 async function run(){try{const response=await action.scopedFetch('/test',{method:'POST'});if(response.status===401)action.sessionExpired();else await action.refresh();}catch{/* scope aborted */}}
 return <button onClick={()=>void run()}>Run</button>;
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each([200,401])('aborts and ignores late mutation response %s after scope unmount',async(status)=>{
 let finish!:(response:Response)=>void;const fetch=vi.fn<typeof globalThis.fetch>().mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',fetch);
 const refresh=vi.fn().mockResolvedValue(undefined),expired=vi.fn();const view=render(<Probe refresh={refresh} expired={expired}/>);
 fireEvent.click(screen.getByRole('button',{name:'Run'}));await waitFor(()=>expect(fetch).toHaveBeenCalled());const signal=fetch.mock.calls[0][1]?.signal;
 view.unmount();expect(signal?.aborted).toBe(true);await act(async()=>finish(new Response(null,{status})));
 expect(refresh).not.toHaveBeenCalled();expect(expired).not.toHaveBeenCalled();
});
it('still invokes the current scope refresh on verified success',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(null,{status:200})));const refresh=vi.fn().mockResolvedValue(undefined);
 render(<Probe refresh={refresh} expired={vi.fn()}/>);await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Run'})));expect(refresh).toHaveBeenCalledOnce();
});
