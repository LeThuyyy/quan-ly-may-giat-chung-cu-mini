// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import QueueSwapPanel from '../QueueSwapPanel';
const fetchMock=vi.fn<typeof fetch>();
const entries=[{id:'entry-a',accountId:'a',displayName:'An',position:1,ready:false},{id:'entry-b',accountId:'b',displayName:'Bình',position:3,ready:true}];
const swap={id:'swap-1',senderId:'a',recipientId:'b',senderEntryId:'entry-a',recipientEntryId:'entry-b',expiresAt:'2026-11-25T12:10:00Z',status:'PENDING'};
function response(items:unknown[]=[],page=0,hasNext=false){return new Response(JSON.stringify({items,page,size:20,hasNext}),{status:200});}
function mockPages(items:unknown[]=[],actor='a'){fetchMock.mockImplementation(async url=>String(url).endsWith('/outgoing')?new Response(JSON.stringify(items.filter(item=>(item as typeof swap).senderId===actor))):response(items));}
function props(accountId='a'){return {buildingId:'building-a',accountId,entries,onRefresh:vi.fn().mockResolvedValue(undefined),onSessionExpired:vi.fn()};}
beforeEach(()=>{vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();mockPages();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('offers only later waiting entries and previews two positions',async()=>{
 render(<QueueSwapPanel {...props()}/>);await waitFor(()=>expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false));
 expect(screen.queryByRole('option',{name:/An/})).toBeNull();fireEvent.change(screen.getByRole('combobox'),{target:{value:'entry-b'}});
 expect(screen.getByText(/Bạn ở vị trí 1/).textContent).toContain('vị trí 2');
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Gửi lời mời đổi lượt'})));
 expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/swaps',expect.objectContaining({method:'POST',body:JSON.stringify({recipientEntryId:'entry-b'})}));
});
it('recipient accepts while sender sees only cancel and cannot send a second request',async()=>{
 mockPages([swap]);const view=render(<QueueSwapPanel {...props()}/>);
 await screen.findByText('Bạn đã có một lời mời đang chờ.');expect(screen.queryByRole('button',{name:'Đồng ý đổi lượt'})).toBeNull();
 expect(screen.getByRole('button',{name:'Gửi lời mời đổi lượt'}).hasAttribute('disabled')).toBe(true);
 mockPages([swap],'b');view.rerender(<QueueSwapPanel {...props('b')}/>);await screen.findByRole('button',{name:'Đồng ý đổi lượt'});
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Đồng ý đổi lượt'})));
 expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/swaps/swap-1/accept',expect.objectContaining({method:'POST'}));
});
it('keeps actions blocked after uncertain server failure until reloaded',async()=>{
 render(<QueueSwapPanel {...props()}/>);await waitFor(()=>expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false));
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'entry-b'}});fetchMock.mockResolvedValueOnce(new Response('{}',{status:409}));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Gửi lời mời đổi lượt'})));
 expect(screen.getByRole('alert')).toBeTruthy();expect(screen.getByRole('button',{name:'Gửi lời mời đổi lượt'}).hasAttribute('disabled')).toBe(true);
});
it('keeps an older outgoing request cancellable while browsing paginated history',async()=>{
 fetchMock.mockImplementation(async url=>{
  const path=String(url);
  if(path.endsWith('/outgoing'))return new Response(JSON.stringify([swap]));
  if(path.includes('/pending'))return response([],0,false);
  const page=path.includes('page=1')?1:0;
  return response([{...swap,id:'history-'+page,status:'REJECTED',senderId:'other'}],page,page===0);
 });
 render(<QueueSwapPanel {...props()}/>);await screen.findByText('Bạn đã có một lời mời đang chờ.');
 expect(screen.getByRole('button',{name:'Hủy lời mời'})).toBeTruthy();
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Lịch sử đổi lượt'})));
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Trang lời mời sau'})));
 expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/swaps?page=1&size=20',expect.anything());
 expect(screen.getByRole('button',{name:'Hủy lời mời'}).hasAttribute('disabled')).toBe(false);
 expect(screen.getByRole('button',{name:'Gửi lời mời đổi lượt'}).hasAttribute('disabled')).toBe(true);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Hủy lời mời'})));
 expect(fetchMock).toHaveBeenCalledWith('/api/buildings/building-a/swaps/swap-1/cancel',expect.objectContaining({method:'POST'}));
});
it('does not let an old response expire a newly selected scope',async()=>{
 let finish!:(r:Response)=>void;fetchMock.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const first=props();const view=render(<QueueSwapPanel {...first}/>);
 await waitFor(()=>expect(fetchMock).toHaveBeenCalled());const expired=vi.fn();view.rerender(<QueueSwapPanel {...props()} buildingId="building-b" onSessionExpired={expired}/>);
 await act(async()=>finish(new Response('{}',{status:401})));expect(first.onSessionExpired).not.toHaveBeenCalled();expect(expired).not.toHaveBeenCalled();
});
