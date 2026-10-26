// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {WorkspaceExtensionProps} from '../pages/Index';
const mock=vi.hoisted(()=>({status:vi.fn().mockResolvedValue({empty:true}),restore:vi.fn(),preview:vi.fn()}));
vi.mock('../apis/transfer/GetTransferStatusAPI',()=>({GetTransferStatusAPI:mock.status}));
vi.mock('../apis/transfer/RestoreBackupAPI',()=>({RestoreBackupAPI:mock.restore}));
vi.mock('../apis/transfer/PreviewMemosImportAPI',()=>({PreviewMemosImportAPI:mock.preview}));
import TransferFeature from '../features/transfer';
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('transfer tab ownership',()=>{
 it('permits reading status but rejects restore and import preparation without writer ownership',async()=>{
  const props:WorkspaceExtensionProps={session:{instanceId:'172a2e1d-ddd7-4540-85e5-2ace79393327',principal:'owner',authenticated:true},canWrite:false,localOnly:false,drafts:{},saveDraft:vi.fn(),recoverExternalDraft:vi.fn(),memos:[],save:vi.fn(),remove:vi.fn(),refresh:vi.fn(),notify:vi.fn(),select:vi.fn()};
  render(<TransferFeature {...props}/>);await waitFor(()=>expect(mock.status).toHaveBeenCalled());
  expect(screen.getByText('此标签页只读，可导出备份；恢复和导入请在编辑标签页进行。')).toBeTruthy();
  const source=screen.getByLabelText('Memos 备份文件');expect(source).toHaveProperty('disabled',true);
  fireEvent.change(source,{target:{files:[new File(['source'],'source.sqlite')]}});expect(mock.preview).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'验证并恢复完整包'})).toHaveProperty('disabled',true);expect(mock.restore).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'导出完整工作区'})).toHaveProperty('disabled',false);
 });
});
