import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {callJavaWithSession} from '../java-bridge';
import {GET} from '../../app/api/buildings/[id]/snapshot/route';
vi.mock('../java-bridge',()=>({callJavaWithSession:vi.fn()}));const bridge=vi.mocked(callJavaWithSession);const id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>vi.resetAllMocks());
it('forwards one authenticated snapshot read without user overrides and disables caching',async()=>{bridge.mockResolvedValue({ok:true,status:200,data:{serverNow:'now',building:{id}}});const req=new NextRequest(`http://localhost:3000/api/buildings/${id}/snapshot?accountId=other`,{headers:{Cookie:'laundry_session='+'a'.repeat(64)}});const res=await GET(req,{params:Promise.resolve({id})});expect(bridge).toHaveBeenCalledWith('a'.repeat(64),'GET',`/api/buildings/${id}/snapshot`);expect(res.headers.get('cache-control')).toBe('private, no-store');expect(await res.json()).toEqual({serverNow:'now',building:{id}});});
it('rejects malformed building identifier',async()=>{const res=await GET(new NextRequest('http://localhost:3000'),{params:Promise.resolve({id:'bad'})});expect(res.status).toBe(400);expect(bridge).not.toHaveBeenCalled();});
it('does not turn a permission failure into an empty snapshot',async()=>{bridge.mockResolvedValue({ok:false,status:403,error:'No access'});const res=await GET(new NextRequest('http://localhost:3000'),{params:Promise.resolve({id})});expect(res.status).toBe(403);expect(res.headers.get('cache-control')).toContain('no-store');});
