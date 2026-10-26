// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {PreferenceValuesSchema} from '../../shared/contracts/preferences';
import {defaultPreferences} from '../../server/services/preferences/utils/defaultPreferences';
import {PreferencesProvider,usePreferences} from '../features/settings/PreferencesProvider';
import {ApiError} from '../system/api/sendAPI';

const mock=vi.hoisted(()=>({get:vi.fn(),update:vi.fn()}));
vi.mock('../apis/preferences/GetPreferencesAPI',()=>({GetPreferencesAPI:mock.get}));
vi.mock('../apis/preferences/UpdatePreferencesAPI',()=>({UpdatePreferencesAPI:mock.update}));
const session={authenticated:true,principal:'owner' as const,instanceId:'87aaab31-564d-4843-b91d-251e1f00dcb8'};
const initial=defaultPreferences();const values=PreferenceValuesSchema.strip().parse(initial);
function Harness(){const {preferences,update}=usePreferences();return <><span>revision:{preferences?.revision}</span><button onClick={()=>{void update({...values,accentColor:'#123456'}).catch(()=>undefined);}}>first</button><button onClick={()=>{void update({...values,accentColor:'#abcdef'}).catch(()=>undefined);}}>second</button></>;}
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();mock.get.mockResolvedValue(initial);Object.defineProperty(window,'matchMedia',{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});});
afterEach(cleanup);
describe('preferences concurrency and uncertain delivery',()=>{
 it('serializes writes using the committed revision rather than captured render state',async()=>{
  let release:(value:unknown)=>void=()=>undefined;
  mock.update.mockImplementationOnce(()=>new Promise((resolve)=>{release=resolve;})).mockImplementationOnce((input)=>Promise.resolve({...input.values,revision:2,updatedAt:'2026-10-24T00:00:00.000Z'}));
  render(<PreferencesProvider session={session} localOnly={false}><Harness/></PreferencesProvider>);await screen.findByText('revision:0');
  fireEvent.click(screen.getByText('first'));fireEvent.click(screen.getByText('second'));await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(1));
  expect(mock.update.mock.calls[0]?.[0].baseRevision).toBe(0);
  release({...values,accentColor:'#123456',revision:1,updatedAt:'2026-10-24T00:00:00.000Z'});
  await screen.findByText('revision:2');expect(mock.update.mock.calls[1]?.[0].baseRevision).toBe(1);
 });
 it('retries an uncertain request with the same operation ID before confirming newer state',async()=>{
  mock.update.mockRejectedValueOnce(new ApiError(0,'NETWORK_ERROR','offline')).mockImplementationOnce((input)=>Promise.resolve({...input.values,revision:1,updatedAt:'2026-10-24T00:00:00.000Z'}));
  render(<PreferencesProvider session={session} localOnly={false}><Harness/></PreferencesProvider>);await screen.findByText('revision:0');
  fireEvent.click(screen.getByText('first'));await waitFor(()=>expect(mock.update).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText('first'));await screen.findByText('revision:1');expect(mock.update.mock.calls[1]?.[0]).toEqual(mock.update.mock.calls[0]?.[0]);
 });
});
