// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QueueSwapPanel from '../QueueSwapPanel';
const fetchMock=vi.fn<typeof fetch>();
const entries=[{id:'entry-a',accountId:'a',displayName:'An',position:1,ready:false},{id:'entry-b',accountId:'b',displayName:'Bình',position:3,ready:true}];
const swap={id:'swap-1',senderId:'a',recipientId:'b',senderEntryId:'entry-a',recipientEntryId:'entry-b',expiresAt:'2026-11-25T12:10:00Z',status:'PENDING'};
function response(items:unknown[]=[]){return new Response(JSON.stringify({items,page:0,size:50,hasNext:false}),{status:200});}
function props(accountId='a'){return {buildingId:'building-a',accountId,entries,onRefresh:vi.fn().mockResolvedValue(undefined),onSessionExpired:vi.fn()};}
beforeEach(()=>{vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();fetchMock.mockImplementation(async()=>response());});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('offers only later waiting entries and previews two positions',async()=>{
 render(<QueueSwapPanel {...props()}/>);await waitFor(()=>expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false));
 expect(screen.queryByRole('option',{name:/An/})).toBeNull();fireEvent.change(screen.getByRole('combobox'),{target:{value:'entry-b'}});
 expect(screen.getByText(/Bạn ở vị trí 1/).textContent).toContain('vị trí 2');
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Gửi lời mời đổi lượt'})));
 expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/swaps',expect.objectContaining({method:'POST',body:JSON.stringify({recipientEntryId:'entry-b'})}));
});
it('recipient accepts while sender sees only cancel and cannot send a second request',async()=>{
 fetchMock.mockImplementation(async()=>response([swap]));const view=render(<QueueSwapPanel {...props()}/>);
 await screen.findByText('Bạn đã có một lời mời đang chờ.');expect(screen.queryByRole('button',{name:'Đồng ý đổi lượt'})).toBeNull();
 expect(screen.getByRole('button',{name:'Gửi lời mời đổi lượt'}).hasAttribute('disabled')).toBe(true);
 view.rerender(<QueueSwapPanel {...props('b')}/>);await screen.findByRole('button',{name:'Đồng ý đổi lượt'});
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Đồng ý đổi lượt'})));
 expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/swaps/swap-1/accept',expect.objectContaining({method:'POST'}));
});
it('keeps actions blocked after uncertain server failure until reloaded',async()=>{
 render(<QueueSwapPanel {...props()}/>);await waitFor(()=>expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false));
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'entry-b'}});fetchMock.mockResolvedValueOnce(new Response('{}',{status:409}));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Gửi lời mời đổi lượt'})));
 expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByRole('button',{name:'Gửi lời mời đổi lượt'}).hasAttribute('disabled')).toBe(true);
});
it('does not let an old response expire a newly selected scope',async()=>{
 let finish!:(r:Response)=>void;fetchMock.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const first=props();const view=render(<QueueSwapPanel {...first}/>);
 await waitFor(()=>expect(fetchMock).toHaveBeenCalled());const expired=vi.fn();view.rerender(<QueueSwapPanel {...props()} buildingId="building-b" onSessionExpired={expired}/>);
 await act(async()=>finish(new Response('{}',{status:401})));expect(first.onSessionExpired).not.toHaveBeenCalled();expect(expired).not.toHaveBeenCalled();
});
