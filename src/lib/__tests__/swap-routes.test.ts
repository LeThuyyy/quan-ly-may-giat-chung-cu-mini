import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {callJavaWithSession} from '../java-bridge';
import {GET,POST} from '../../app/api/buildings/[id]/swaps/route';
import {POST as accept} from '../../app/api/buildings/[id]/swaps/[swapId]/accept/route';
vi.mock('../java-bridge',()=>({callJavaWithSession:vi.fn()}));
const bridge=vi.mocked(callJavaWithSession),id='11111111-1111-4111-8111-111111111111',child='22222222-2222-4222-8222-222222222222';
function request(body?:unknown,origin='http://localhost:3000'){return new NextRequest('http://localhost:3000/api/test',{method:'POST',headers:{Host:'localhost:3000',Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}
beforeEach(()=>{vi.resetAllMocks();bridge.mockResolvedValue({ok:true,status:200,data:{items:[]}});});
it('reads only the authenticated related list with bounded pagination and no cache',async()=>{const res=await GET(request(),{params:Promise.resolve({id})});expect(bridge).toHaveBeenCalledWith(undefined,'GET',`/api/buildings/${id}/swaps?page=0&size=50`);expect(res.headers.get('cache-control')).toContain('no-store');});
it('creates with allowlisted recipient ID only',async()=>{await POST(request({recipientEntryId:child,admin:true}),{params:Promise.resolve({id})});expect(bridge).toHaveBeenCalledWith(undefined,'POST',`/api/buildings/${id}/swaps`,{recipientEntryId:child});});
it('rejects wrong origin before contacting Java',async()=>{expect((await POST(request({recipientEntryId:child},'https://evil.example'),{params:Promise.resolve({id})})).status).toBe(403);expect(bridge).not.toHaveBeenCalled();});
it('rejects bad payload and bad action identifiers',async()=>{expect((await POST(request({recipientEntryId:'bad'}),{params:Promise.resolve({id})})).status).toBe(400);expect((await accept(request(),{params:Promise.resolve({id,swapId:'bad'})})).status).toBe(400);expect(bridge).not.toHaveBeenCalled();});
it('preserves a stale accept conflict',async()=>{bridge.mockResolvedValue({ok:false,status:409,error:'Hết hạn'});const res=await accept(request(),{params:Promise.resolve({id,swapId:child})});expect(res.status).toBe(409);expect(await res.json()).toEqual({error:'Hết hạn'});});
